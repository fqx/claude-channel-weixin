# claude-channel-weixin

WeChat channel plugin for Claude Code. Lets Claude Code receive and reply to WeChat messages via Tencent's iLink service.

Based on `@tencent-weixin/openclaw-weixin` (MIT License, Copyright 2026 Tencent Inc.).

---

## Requirements

- [Claude Code](https://claude.ai/code) >= 2.1.80
- [Bun](https://bun.sh) runtime
- A WeChat account that supports iLink Bot

---

## Installation

**1. Add the marketplace**

```bash
claude plugins marketplace add https://github.com/fqx/claude-channel-weixin
```

**2. Install the plugin**

```bash
claude plugins install weixin@fqx
```

**3. Launch Claude Code with the WeChat channel**

```bash
claude --dangerously-load-development-channels plugin:weixin@fqx
```

> `--dangerously-load-development-channels` is required for plugins from third-party marketplaces. It acknowledges the prompt injection risk that comes with receiving external messages.

**4. Log in via QR code**

Inside Claude Code, run:

```
/weixin:configure login
```

A QR code will appear. Scan it with WeChat. Once scanned, the session token is saved and the channel starts listening for messages.

---

## Authorize a WeChat user (pairing)

By default, the channel is in pairing mode: any WeChat user who messages your bot gets a 6-character code to give you.

**On WeChat:** the user sends any message to the bot. The bot replies with a code, e.g. `a3f9b2`.

**In your Claude Code terminal:**

```
/weixin:access pair a3f9b2
```

The user is added to your allowlist and receives a confirmation on WeChat. Claude will now respond to their messages automatically.

Once everyone who needs access has been paired, lock it down:

```
/weixin:access policy allowlist
```

This prevents anyone new from triggering pairing codes.

---

## Access management

```
/weixin:access                    # show current status
/weixin:access pair <code>        # approve a pending pairing
/weixin:access deny <code>        # reject a pending pairing
/weixin:access allow <openid>     # add a user directly
/weixin:access remove <openid>    # remove a user
/weixin:access policy pairing     # open pairing (default)
/weixin:access policy allowlist   # lock down — allowlist only
/weixin:access policy disabled    # block all incoming messages
```

---

## Day-to-day usage

```bash
claude --dangerously-load-development-channels plugin:weixin@fqx
```

WeChat messages from authorized users arrive as channel notifications. Claude responds automatically and uses `weixin_reply` to send the reply back via WeChat.

---

## Re-login

WeChat iLink sessions can expire. When that happens, the channel clears the token and notifies you. Re-login with:

```
/weixin:configure login
```

To log out manually:

```
/weixin:configure logout
```

---

## State files

All state is stored in `~/.claude/channels/weixin/`:

| File | Contents |
|------|----------|
| `.env` | `WEIXIN_TOKEN=<iLink session token>` (mode 600) |
| `access.json` | DM policy, allowlist, pending pairings |
| `approved/<openid>` | Written by `/weixin:access pair` to trigger confirmation |
| `accounts/` | Per-account credential files |

Override the state directory: `WEIXIN_STATE_DIR=/custom/path`.

---

## License

MIT License — Copyright (c) 2026 Tencent Inc., Copyright (c) 2026 fqx
