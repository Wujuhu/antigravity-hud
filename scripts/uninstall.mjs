#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from '../sidecars/agy_hud/backend/config.mjs';

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-hud');

export async function uninstallPlugin({
  targetDir = DEFAULT_PLUGIN_DIR,
  dataDir = resolveDataDir(),
  desktopDir = path.join(os.homedir(), 'Desktop'),
  applicationsDir = path.join(os.homedir(), 'Applications'),
  purgeData = false,
  silent = false,
} = {}) {
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  if (fs.existsSync(targetDir)) {
    await fsp.rm(targetDir, { recursive: true, force: true });
    log(`✓ 已移除插件目录: ${targetDir}`);
  } else {
    log(`- 未发现插件目录: ${targetDir}`);
  }

  if (purgeData && fs.existsSync(dataDir)) {
    await fsp.rm(dataDir, { recursive: true, force: true });
    log(`✓ 已清除用户配置与启动器数据: ${dataDir}`);
  } else {
    log(`- 已保留用户配置目录（如需彻底清理请加 --purge-data）: ${dataDir}`);
  }

  if (process.platform === 'darwin') {
    for (const appName of ['Antigravity (HUD).app', 'Antigravity (CDP).app']) {
      const macApp = path.join(applicationsDir, appName);
      if (purgeData && fs.existsSync(macApp)) {
        await fsp.rm(macApp, { recursive: true, force: true });
        log(`✓ 已移除 macOS 启动器: ${macApp}`);
      }
    }
  } else if (process.platform === 'win32') {
    for (const lnkName of ['Antigravity (HUD).lnk', 'Antigravity (CDP).lnk']) {
      const deskLnk = path.join(desktopDir, lnkName);
      if (purgeData && fs.existsSync(deskLnk)) {
        await fsp.rm(deskLnk, { force: true });
        log(`✓ 已移除桌面快捷方式: ${deskLnk}`);
      }
    }
  }

  return { removedPlugin: true, purgedData: Boolean(purgeData) };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const purgeData = process.argv.includes('--purge-data');
  uninstallPlugin({ purgeData }).catch((err) => {
    console.error('[AGY HUD] 卸载失败:', err.message || err);
    process.exitCode = 1;
  });
}
