# 本地测试指南

推送到 GitHub 之前，按以下步骤在本地验证插件完整可用。

---

## 第一步：依赖和类型检查

```bash
cd /Users/fqx/Downloads/claude-code-weixin
bun install
bunx tsc --noEmit
```

无报错即可继续。

---

## 第二步：MCP 协议冒烟测试

不需要微信，直接验证 server.ts 能正常启动并响应 MCP 握手：

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}\n' \
  | bun server.ts 2>/tmp/weixin-server.log
```

stdout 应出现类似：

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"experimental":{"claude/channel":{}}},...}}
```

若 server.ts 启动失败，查看 stderr：

```bash
cat /tmp/weixin-server.log
```

---

## 第三步：在 Claude Code 中本地加载

`--plugin-dir` 只会加载 MCP server，Skills 不会被注册。需要把本地路径直接注册到 Claude Code 的插件列表（editable install）：

```bash
python3 - <<'EOF'
import json, datetime

path = "/Users/fqx/.claude/plugins/installed_plugins.json"
with open(path) as f:
    data = json.load(f)

now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
data["plugins"].pop("weixin@fqx", None)
data["plugins"]["weixin@fqx"] = [{
    "scope": "user",
    "installPath": "/Users/fqx/Downloads/claude-code-weixin",
    "version": "1.0.0",
    "installedAt": now,
    "lastUpdated": now
}]

with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("registered")
EOF
```

然后**普通启动** Claude Code（无需 `--plugin-dir`）：

```bash
claude
```

验证插件已加载：
- 工具列表中应出现 `weixin_reply`、`weixin_reply_media`、`get_qr_code`
- Skill 应响应 `/weixin:configure` 和 `/weixin:access`

> 注意：Claude Code 自动更新时可能覆盖 `installed_plugins.json`，重新运行上面的 python3 脚本即可。

---

## 第四步：微信扫码登录

在 Claude Code 会话内运行：

```
/weixin:configure login
```

终端会出现 QR 码。用微信扫码。扫码成功后，token 自动保存到 `~/.claude/channels/weixin/.env`。

验证 token 已写入：

```bash
ls -la ~/.claude/channels/weixin/.env
grep -c WEIXIN_TOKEN ~/.claude/channels/weixin/.env  # 应输出 1
```

---

## 第五步：端到端消息测试

**收消息：**

1. 用另一个微信账号发消息给你的微信 bot
2. Claude Code 应收到 channel notification，显示消息内容
3. 同时检查日志确认收到：

```bash
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log \
  | jq -r '[.time, ._meta.logLevelName, .["1"]] | join("  ")'
```

应出现类似 `inbound: from=<openid> types=TEXT` 的行。

**配对流程：**

消息来自未授权用户时，bot 会回复一个 6 位配对码。在 Claude Code 终端运行：

```
/weixin:access pair <code>
```

对方应收到确认消息，此后消息可正常投递。

**回复消息：**

Claude Code 收到消息后，让 Claude 直接回复，或手动触发 `weixin_reply` 工具：

```
回复刚才那条微信消息，说"测试成功"
```

微信端应能收到回复。

---

## 调试

**开启详细日志：**

```bash
OPENCLAW_LOG_LEVEL=DEBUG claude
```

**实时查看日志：**

```bash
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log \
  | jq -r '[.time, ._meta.logLevelName, .["1"]] | join("  ")'
```

**隔离测试（不影响生产状态）：**

```bash
WEIXIN_STATE_DIR=/tmp/weixin-test claude
```

使用独立的状态目录，token 和 access.json 都写到 `/tmp/weixin-test/`，不影响 `~/.claude/channels/weixin/`。

---

## 常见问题

| 现象 | 检查点 |
|------|--------|
| 工具列表没有 `weixin_reply` | `--plugin-dir` 路径是否正确；`bun install` 是否完成 |
| QR 码扫完没反应 | 查看日志是否有 `loginStatus: success`；网络是否能访问 `ilinkai.weixin.qq.com` |
| 收不到消息 | 日志是否有 `Monitor started`；token 是否有效（`errcode=-14` = session 过期，需重新登录） |
| 回复失败 | 日志是否有 `contextToken missing`（需先收到对方消息才能回复） |
| Session 过期 | 重新运行 `/weixin:configure login` 扫码 |

---

## 测试完成后

确认以下各项均正常后，再推送到 GitHub：

- [ ] `bunx tsc --noEmit` 无报错
- [ ] MCP 握手返回正确的 capability
- [ ] QR 登录成功，token 写入 `.env`
- [ ] 收到微信消息，Claude Code 显示 notification
- [ ] 配对流程正常
- [ ] `weixin_reply` 工具成功发出回复
