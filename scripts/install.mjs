#!/usr/bin/env node
/**
 * Cross-platform zero-dependency installer for AGY HUD.
 *
 * - Verifies Node.js >= 22.5.0
 * - Copies plugin files to ~/.gemini/config/plugins/agy-hud
 * - Preserves existing user settings in ~/.gemini/antigravity/plugin_data/agy-hud
 * - Generates the OS-appropriate CDP launcher:
 *     Windows: Desktop `Antigravity (HUD).lnk` (+ silent .vbs/.cmd)
 *     macOS:   `/Applications/Antigravity (HUD).app` + Desktop shortcut
 * - Never touches Antigravity app.asar or ~/.gemini/config/config.json
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CDP_PORT,
  LEGACY_DEFAULT_CDP_PORT,
  createConfigStore,
  normalizeCdpPort,
  resolveDataDir,
} from '../sidecars/agy_hud/backend/config.mjs';
import { validateRepoSlug } from '../sidecars/agy_hud/backend/updater.mjs';
import { generateWindowsCdpLauncher } from '../sidecars/agy_hud/backend/launcher_win.mjs';
import { generateMacCdpLauncher } from '../sidecars/agy_hud/backend/launcher_mac.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-hud');

function detectGitHubRepoSlug(repoDir) {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    const m = remote.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/i);
    return m ? validateRepoSlug(m[1]) : '';
  } catch {
    return '';
  }
}

export function checkNodeVersion(versionStr = process.versions.node) {
  const [major = 0, minor = 0] = String(versionStr || '0.0.0')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const ok = major > 22 || (major === 22 && minor >= 5);
  return { ok, current: versionStr, required: '22.5.0' };
}

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

export async function installPlugin({
  sourceRoot = REPO_ROOT,
  targetDir = DEFAULT_PLUGIN_DIR,
  dataDir = resolveDataDir(),
  cdpPort = null,
  repoSlug = '',
  skipLauncher = false,
  silent = false,
} = {}) {
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  const ver = checkNodeVersion();
  if (!ver.ok) {
    throw new Error(
      `需要 Node.js >= ${ver.required}（当前 v${ver.current}）。请先升级 Node.js 后重试。`,
    );
  }

  log('');
  log('========================================================');
  log('  AGY HUD — Antigravity 极简输入栏遥测插件安装程序');
  log('========================================================');
  log(`[1/4] Node.js v${ver.current} 环境检查通过`);

  const filesToCopy = [
    'plugin.json',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'assets',
    'sidecars',
  ];

  await fsp.mkdir(targetDir, { recursive: true });
  for (const rel of filesToCopy) {
    const src = path.join(sourceRoot, rel);
    const dest = path.join(targetDir, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`缺少必需源文件: ${rel}`);
    }
    await copyRecursive(src, dest);
  }
  log(`[2/4] 插件文件已同步至: ${targetDir}`);

  const store = createConfigStore(dataDir);
  const currentCfg = store.get();
  // Auto-migrate legacy fixed default 9229 -> dynamic port 0 unless user explicitly passed --port
  const effectivePort =
    cdpPort !== null && cdpPort !== undefined
      ? normalizeCdpPort(cdpPort, DEFAULT_CDP_PORT)
      : currentCfg.cdpPort === LEGACY_DEFAULT_CDP_PORT
        ? DEFAULT_CDP_PORT
        : normalizeCdpPort(currentCfg.cdpPort, DEFAULT_CDP_PORT);
  const detectedSlug = validateRepoSlug(repoSlug) || currentCfg.updateRepoSlug || detectGitHubRepoSlug(sourceRoot);
  const savedCfg = await store.save({
    cdpPort: effectivePort,
    ...(detectedSlug ? { updateRepoSlug: detectedSlug } : {}),
  });
  log(`[3/4] 配置文件已就绪（保留既有自定义排序）: ${store.configFile}`);

  let launcher = null;
  if (!skipLauncher) {
    if (process.platform === 'win32') {
      launcher = await generateWindowsCdpLauncher({
        dataDir,
        port: savedCfg.cdpPort,
      });
      log(`[4/4] 已生成 Windows CDP 快捷方式: ${launcher.lnkPath}`);
    } else if (process.platform === 'darwin') {
      launcher = await generateMacCdpLauncher({
        port: savedCfg.cdpPort,
      });
      log(`[4/4] 已生成 macOS 启动器: ${launcher.bundlePath}`);
      if (launcher.desktopShortcutPath) {
        log(`      已创建桌面快捷方式: ${launcher.desktopShortcutPath}`);
      }
    } else {
      launcher = {
        platform: process.platform,
        port: savedCfg.cdpPort,
        manualCommand: `antigravity --remote-debugging-port=${savedCfg.cdpPort}`,
      };
      log(`[4/4] Linux 请使用以下命令启动 CDP 模式: ${launcher.manualCommand}`);
    }
  } else {
    log('[4/4] 已按参数跳过 CDP 启动器生成');
  }

  log('');
  log('安装完成！接下来只需 1 步即可生效：');
  log('  彻底退出 Antigravity（Windows 退出右下角托盘 / macOS 按 Cmd+Q），再通过刚生成的启动器重新打开即可。');
  log('');

  return { targetDir, configFile: store.configFile, config: savedCfg, launcher };
}

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--skip-launcher') opts.skipLauncher = true;
    else if (arg === '--port' && argv[i + 1]) opts.cdpPort = Number(argv[++i]);
    else if (arg === '--repo' && argv[i + 1]) opts.repoSlug = argv[++i];
    else if (arg === '--target' && argv[i + 1]) opts.targetDir = path.resolve(argv[++i]);
  }
  return opts;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  installPlugin(parseCliArgs(process.argv.slice(2))).catch((err) => {
    console.error('[AGY HUD] 安装失败:', err.message || err);
    process.exitCode = 1;
  });
}
