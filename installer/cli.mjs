#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const PLUGIN_SPEC = "weixin@fqx";
const PLUGIN_ID   = "weixin";
const MARKETPLACE = "fqx";

// Channels require Claude Code >= 2.1.80
const MIN_VERSION = [2, 1, 80];

// ── helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`\x1b[36m[claude-code-weixin]\x1b[0m ${msg}`);
}

function error(msg) {
  console.error(`\x1b[31m[claude-code-weixin]\x1b[0m ${msg}`);
}

function run(bin, args, { silent = true } = {}) {
  const stdio = silent ? ["pipe", "pipe", "pipe"] : "inherit";
  const result = spawnSync(bin, args, { stdio });
  if (result.status !== 0) {
    const err = new Error(`Command failed (exit ${result.status}): ${bin} ${args.join(" ")}`);
    err.stderr = silent ? (result.stderr || "").toString() : "";
    throw err;
  }
  return silent ? (result.stdout || "").toString().trim() : "";
}

function which(bin) {
  const result = spawnSync("which", [bin], { stdio: ["pipe", "pipe", "pipe"] });
  return result.status === 0 ? (result.stdout || "").toString().trim() : null;
}

function parseVersion(str) {
  const m = str.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function versionAtLeast(v, min) {
  for (let i = 0; i < 3; i++) {
    if (v[i] > min[i]) return true;
    if (v[i] < min[i]) return false;
  }
  return true;
}

// ── commands ─────────────────────────────────────────────────────────────────

function install() {
  // 1. Check claude is installed
  if (!which("claude")) {
    error("未找到 claude，请先安装 Claude Code：");
    console.log("  npm install -g @anthropic-ai/claude-code");
    console.log("  详见 https://docs.claude.ai/en/docs/claude-code/getting-started");
    process.exit(1);
  }

  // 2. Check minimum version (Channels require >= 2.1.80)
  try {
    const raw = run("claude", ["--version"]);
    const v = parseVersion(raw);
    if (v && !versionAtLeast(v, MIN_VERSION)) {
      error(`Claude Code 版本 ${v.join(".")} 过低，Channels 功能需要 v${MIN_VERSION.join(".")} 或更高版本`);
      console.log("  请先更新：");
      console.log("  claude update");
      process.exit(1);
    }
    log(`已找到本地安装的 Claude Code v${v ? v.join(".") : raw}`);
  } catch {
    log("已找到本地安装的 claude");
  }

  // 3. Install plugin
  log("正在安装微信插件...");
  try {
    const installOut = run("claude", ["plugins", "install", PLUGIN_SPEC]);
    if (installOut) log(installOut);
  } catch (installErr) {
    if (installErr.stderr && installErr.stderr.toLowerCase().includes("already")) {
      log("检测到本地已安装，正在更新...");
      try {
        const updateOut = run("claude", ["plugins", "update", PLUGIN_ID]);
        if (updateOut) log(updateOut);
      } catch (updateErr) {
        error("插件更新失败，请手动执行：");
        if (updateErr.stderr) console.error(updateErr.stderr);
        console.log(`  claude plugins update "${PLUGIN_ID}"`);
        process.exit(1);
      }
    } else {
      error("插件安装失败，请手动执行：");
      if (installErr.stderr) console.error(installErr.stderr);
      console.log(`  claude plugins install "${PLUGIN_SPEC}"`);
      process.exit(1);
    }
  }

  // 4. Launch Claude Code with the WeChat channel for initial QR pairing
  log("插件就绪，正在启动 Claude Code 进行微信扫码绑定...");
  console.log();
  console.log("  扫码成功后，后续每次启动请使用：");
  console.log(`  claude --channels plugin:${PLUGIN_ID}@${MARKETPLACE}`);
  console.log();

  try {
    run("claude", ["--channels", `plugin:${PLUGIN_ID}@${MARKETPLACE}`], { silent: false });
  } catch {
    console.log();
    error("首次连接未完成，可稍后手动重试：");
    console.log(`  claude --channels plugin:${PLUGIN_ID}@${MARKETPLACE}`);
  }
}

function help() {
  console.log(`
  用法: npx -y @fqx/claude-code-weixin-cli <命令>

  命令:
    install   安装微信插件并扫码连接 Claude Code
    help      显示帮助信息

  插件安装完成后启动方式：
    claude --channels plugin:${PLUGIN_ID}@${MARKETPLACE}

  要求：
    Claude Code >= 2.1.80（支持 Channels 功能）
    需要 claude.ai 账号登录
`);
}

// ── main ─────────────────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case "install":
    install();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  default:
    if (command) {
      error(`未知命令: ${command}`);
    }
    help();
    process.exit(command ? 1 : 0);
}
