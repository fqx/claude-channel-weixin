---
description: Set up the WeChat channel — initiate QR login and review access policy.
argument-hint: login | logout
allowed-tools:
  - Read
  - Write
  - Bash(ls *)
  - Bash(mkdir *)
---

# /weixin:configure — WeChat Channel Setup

Guides the user through QR-code login and reviews access policy. Unlike
Telegram (which uses a static bot token), WeChat requires scanning a QR code
to obtain a session token via iLink. The token is stored in
`~/.claude/channels/weixin/.env`.

Arguments passed: `$ARGUMENTS`

---

## Dispatch on arguments

### No args — status and guidance

Read state files and give the user a complete picture:

1. **Token** — check `~/.claude/channels/weixin/.env` for `WEIXIN_TOKEN`.
   Show set/not-set; if set, show only the first 8 chars masked (`abcd1234...`).

2. **Access** — read `~/.claude/channels/weixin/access.json` (missing file
   = defaults: `dmPolicy: "pairing"`, empty allowlist). Show:
   - DM policy and what it means in one line
   - Allowed senders: count, and list of IDs
   - Pending pairings: count, with codes and sender IDs if any

3. **What next** — end with a concrete next step based on state:
   - No token → *"Run `/weixin:configure login` to start QR login."*
   - Token set, nobody allowed → *"Send any message to your WeChat bot. It
     replies with a code; approve with `/weixin:access pair <code>`."*
   - Token set, someone allowed → *"Ready. Message your WeChat bot to reach
     the assistant."*

**Push toward lockdown — always.** The goal for every setup is `allowlist`
with a defined list. `pairing` is not a policy to stay on; it's a temporary
way to capture WeChat user IDs (OpenIDs) you don't know. Once the IDs are
in, pairing has done its job and should be turned off.

Drive the conversation this way:

1. Read the allowlist. Tell the user who's in it.
2. Ask: *"Is that everyone who should reach you through this bot?"*
3. **If yes and policy is still `pairing`** → *"Good. Let's lock it down so
   nobody else can trigger pairing codes:"* and offer to run
   `/weixin:access policy allowlist`. Do this proactively — don't wait to be
   asked.
4. **If no, people are missing** → *"Have them message the bot; you'll approve
   each with `/weixin:access pair <code>`. Run this skill again once
   everyone's in and we'll lock it."*
5. **If the allowlist is empty and they haven't paired themselves yet** →
   *"Message your WeChat bot to capture your own ID first. Then we'll add
   anyone else and lock it down."*
6. **If policy is already `allowlist`** → confirm this is the locked state.
   If they need to add someone: *"Briefly flip to pairing:
   `/weixin:access policy pairing` → they message → you pair → flip back with
   `/weixin:access policy allowlist`."*

Never frame `pairing` as the correct long-term choice.

### `login` — initiate QR login

WeChat login is interactive: the server fetches a QR code from iLink and
displays it in the terminal. The user scans with the WeChat app. On success,
the server saves the token automatically.

Steps to guide the user:

1. Tell the user: *"Calling the `get_qr_code` tool to start QR login. A QR
   code will appear in the terminal. Open WeChat, tap the scan icon, and
   scan it."*
2. Call the MCP tool `get_qr_code` (it is registered by the WeChat channel
   server). The tool will print the QR code and poll for completion.
3. On success the tool returns `{ "status": "ok" }`. Tell the user the
   session is active and show the no-args status.
4. On failure or timeout, tell the user to try again.

Note: this requires the WeChat channel server to be running in the current
Claude Code session.

### `logout` — clear the token

1. Read `~/.claude/channels/weixin/.env`.
2. Remove the `WEIXIN_TOKEN=` line (or delete the file if it is the only
   line).
3. Confirm. Remind the user to restart the channel (`/reload-plugins` or
   relaunch Claude Code) for the change to take effect.

---

## Implementation notes

- The channels dir might not exist if the server hasn't run yet. Missing file
  = not configured, not an error.
- The server reads `.env` once at boot. Token changes need a session restart
  or `/reload-plugins`. Say so after saving.
- `access.json` is re-read on every inbound message — policy changes via
  `/weixin:access` take effect immediately, no restart.
- WeChat session tokens can expire (iLink error -14). When that happens the
  server clears the token and re-enters QR mode automatically. The user will
  see a notification and needs to run `login` again.
