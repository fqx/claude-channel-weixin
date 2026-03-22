import { getUpdates } from "../api/api.js";
import { WeixinConfigManager } from "../api/config-cache.js";
import { SESSION_EXPIRED_ERRCODE, pauseSession, getRemainingPauseMs } from "../api/session-guard.js";
import { weixinMessageToMsgContext, setContextToken, isMediaItem } from "../messaging/inbound.js";
import type { WeixinMsgContext, WeixinInboundMediaOpts } from "../messaging/inbound.js";
import { downloadMediaFromItem } from "../media/media-download.js";
import { MessageItemType } from "../api/types.js";
import { getSyncBufFilePath, loadGetUpdatesBuf, saveGetUpdatesBuf } from "../storage/sync-buf.js";
import { logger } from "../util/logger.js";
import type { Logger } from "../util/logger.js";
import { redactBody } from "../util/redact.js";

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const BACKOFF_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

type SaveMediaFn = (
  buffer: Buffer,
  contentType?: string,
  subdir?: string,
  maxBytes?: number,
  originalFilename?: string,
) => Promise<{ path: string }>;

export type MonitorWeixinOpts = {
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  accountId: string;
  abortSignal?: AbortSignal;
  longPollTimeoutMs?: number;
  saveMedia?: SaveMediaFn;
};

/**
 * Long-poll loop: getUpdates -> normalize -> notify callback.
 * Runs until the abort signal fires.
 */
export async function monitorWeixinProvider(
  opts: MonitorWeixinOpts,
  notify: (ctx: WeixinMsgContext) => void,
): Promise<void> {
  const { baseUrl, cdnBaseUrl, token, accountId, abortSignal, longPollTimeoutMs } = opts;
  const aLog: Logger = logger.withAccount(accountId);

  aLog.info(`Monitor started: baseUrl=${baseUrl} timeoutMs=${longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS}`);
  process.stderr.write(`weixin channel: monitor started (${baseUrl}, account=${accountId})\n`);

  const syncFilePath = getSyncBufFilePath(accountId);
  const previousGetUpdatesBuf = loadGetUpdatesBuf(syncFilePath);
  let getUpdatesBuf = previousGetUpdatesBuf ?? "";

  const configManager = new WeixinConfigManager({ baseUrl, token }, () => {});

  let nextTimeoutMs = longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS;
  let consecutiveFailures = 0;

  while (!abortSignal?.aborted) {
    try {
      const resp = await getUpdates({
        baseUrl,
        token,
        get_updates_buf: getUpdatesBuf,
        timeoutMs: nextTimeoutMs,
      });

      if (resp.longpolling_timeout_ms != null && resp.longpolling_timeout_ms > 0) {
        nextTimeoutMs = resp.longpolling_timeout_ms;
      }

      const isApiError =
        (resp.ret !== undefined && resp.ret !== 0) ||
        (resp.errcode !== undefined && resp.errcode !== 0);

      if (isApiError) {
        const isSessionExpired =
          resp.errcode === SESSION_EXPIRED_ERRCODE || resp.ret === SESSION_EXPIRED_ERRCODE;

        if (isSessionExpired) {
          pauseSession(accountId);
          const pauseMs = getRemainingPauseMs(accountId);
          aLog.error(`session expired (errcode=${resp.errcode}), pausing ${Math.ceil(pauseMs / 60_000)} min`);
          process.stderr.write(
            `weixin channel: session expired — re-login with /weixin:configure login\n`,
          );
          consecutiveFailures = 0;
          await sleep(pauseMs, abortSignal);
          continue;
        }

        consecutiveFailures += 1;
        aLog.error(
          `getUpdates failed: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}) ${redactBody(JSON.stringify(resp))}`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0;
          await sleep(BACKOFF_DELAY_MS, abortSignal);
        } else {
          await sleep(RETRY_DELAY_MS, abortSignal);
        }
        continue;
      }

      consecutiveFailures = 0;

      if (resp.get_updates_buf != null && resp.get_updates_buf !== "") {
        saveGetUpdatesBuf(syncFilePath, resp.get_updates_buf);
        getUpdatesBuf = resp.get_updates_buf;
      }

      for (const msg of resp.msgs ?? []) {
        aLog.info(`inbound: from=${msg.from_user_id} types=${msg.item_list?.map(i => i.type).join(",") ?? "none"}`);

        // Cache context_token — required for all outbound replies to this user.
        if (msg.context_token && msg.from_user_id) {
          setContextToken(accountId, msg.from_user_id, msg.context_token);
        }

        // Fetch per-user config (typingTicket) in the background — don't block delivery.
        void configManager.getForUser(msg.from_user_id ?? "", msg.context_token);

        const mediaOpts: WeixinInboundMediaOpts = {};
        if (opts.saveMedia) {
          // Log when an image/video/file item lacks encrypt_query_param (download will be skipped).
          for (const item of msg.item_list ?? []) {
            if (
              (item.type === MessageItemType.IMAGE && !item.image_item?.media?.encrypt_query_param) ||
              (item.type === MessageItemType.VIDEO && !item.video_item?.media?.encrypt_query_param) ||
              (item.type === MessageItemType.FILE && !item.file_item?.media?.encrypt_query_param)
            ) {
              aLog.warn(
                `inbound media item type=${item.type} has no encrypt_query_param — download skipped. raw=${JSON.stringify(item).slice(0, 200)}`,
              );
            }
          }
          const mainMediaItem =
            msg.item_list?.find(
              (i) => i.type === MessageItemType.IMAGE && i.image_item?.media?.encrypt_query_param,
            ) ??
            msg.item_list?.find(
              (i) => i.type === MessageItemType.VIDEO && i.video_item?.media?.encrypt_query_param,
            ) ??
            msg.item_list?.find(
              (i) => i.type === MessageItemType.FILE && i.file_item?.media?.encrypt_query_param,
            ) ??
            msg.item_list?.find(
              (i) =>
                i.type === MessageItemType.VOICE &&
                i.voice_item?.media?.encrypt_query_param &&
                !i.voice_item.text,
            );
          const refMediaItem = !mainMediaItem
            ? msg.item_list?.find(
                (i) =>
                  i.type === MessageItemType.TEXT &&
                  i.ref_msg?.message_item &&
                  isMediaItem(i.ref_msg.message_item!),
              )?.ref_msg?.message_item
            : undefined;
          const mediaItem = mainMediaItem ?? refMediaItem;
          if (mediaItem) {
            const downloaded = await downloadMediaFromItem(mediaItem, {
              cdnBaseUrl,
              saveMedia: opts.saveMedia,
              log: (m) => aLog.info(m),
              errLog: (m) => aLog.error(m),
              label: "inbound",
            });
            Object.assign(mediaOpts, downloaded);
          }
        }

        const ctx = weixinMessageToMsgContext(msg, accountId, mediaOpts);
        notify(ctx);
      }
    } catch (err) {
      if (abortSignal?.aborted) {
        aLog.info(`Monitor stopped (aborted)`);
        return;
      }
      consecutiveFailures += 1;
      aLog.error(`getUpdates exception (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${String(err)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
        await sleep(BACKOFF_DELAY_MS, abortSignal);
      } else {
        await sleep(RETRY_DELAY_MS, abortSignal);
      }
    }
  }

  aLog.info(`Monitor ended`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}
