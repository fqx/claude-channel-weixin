# claude-channel-weixin

WeChat channel plugin for Claude Code. Lets Claude Code receive and reply to WeChat messages via Tencent's iLink service.

Based on `@tencent-weixin/openclaw-weixin` (MIT License, Copyright 2026 Tencent Inc.).

---

## Requirements

- Claude Code >= 2.1.80
- [Bun](https://bun.sh) runtime
- A WeChat account that supports iLink Bot (企业微信 or iLink-enabled personal account)

---

## Installation

### Option A: one-liner (recommended)

```bash
npx -y @fqx/claude-code-weixin-cli install
```

This installs the plugin and launches Claude Code for initial QR login.

### Option B: manual

**1. Register the marketplace and install the plugin**

```bash
claude plugins marketplace add https://raw.githubusercontent.com/fqx/claude-channel-weixin/main/marketplace.json
claude plugins install weixin@fqx
```

**2. Launch Claude Code with the WeChat channel**

```bash
claude --channels plugin:weixin@fqx
```

**3. Log in via QR code**

Inside Claude Code, run:

```
/weixin:configure login
```

A QR code will appear in the terminal. Scan it with WeChat. Once scanned, the session token is saved automatically.

---

## Pairing (allow a WeChat user to reach you)

The channel uses a pairing flow to authorize users. By default, any WeChat user who messages your bot gets a 6-character code, which you approve in your terminal.

**On WeChat:** the user sends any message to the bot. The bot replies with a code, e.g. `a3f9b2`.

**In your Claude Code terminal:**

```
/weixin:access pair a3f9b2
```

The user is added to your allowlist and receives a confirmation message on WeChat.

**Manage the allowlist:**

```
/weixin:access               # show current status
/weixin:access allow <id>    # add a user ID directly
/weixin:access remove <id>   # remove a user
/weixin:access deny <code>   # reject a pending pairing
/weixin:access policy allowlist   # lock down (no new pairings)
/weixin:access policy pairing     # re-open pairing
/weixin:access policy disabled    # block all incoming messages
```

---

## Day-to-day usage

After initial setup, launch with:

```bash
claude --channels plugin:weixin@fqx
```

WeChat messages from authorized users will appear as channel notifications in Claude Code. Use the `weixin_reply` tool (called automatically by Claude) to respond.

---

## Re-login

WeChat iLink sessions can expire. When that happens the channel clears the token and re-enters QR mode automatically. You'll see a notice in the terminal. Re-login with:

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
| `.env` | `WEIXIN_TOKEN=<iLink session token>` (chmod 600) |
| `access.json` | DM policy, allowlist, pending pairings |
| `approved/<openid>` | Signals the server to send a pairing confirmation |
| `accounts/` | Per-account credential files |

Override the state directory with `WEIXIN_STATE_DIR=/custom/path`.

---

## License

MIT License — Copyright (c) 2026 Tencent Inc., Copyright (c) 2026 fqx
