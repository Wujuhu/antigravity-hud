/**
 * Cross-platform launcher synchronizer run after plugin updates (or on first
 * startup after an upgrade from an older version) so both the plugin body AND
 * the Windows (.lnk/.vbs/.cmd) / macOS (.app + Desktop shortcut) launchers stay
 * fully in sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CDP_PORT,
  LEGACY_DEFAULT_CDP_PORT,
  atomicWriteJson,
  createConfigStore,
  normalizeCdpPort,
  resolveDataDir,
} from './config.mjs';
import { generateWindowsCdpLauncher } from './launcher_win.mjs';
import { generateMacCdpLauncher } from './launcher_mac.mjs';
import { readInstalledVersion } from './updater.mjs';

const STATE_FILE_NAME = 'launcher_state.json';

export function readLauncherSyncState(dataDir) {
  if (!dataDir) return null;
  const statePath = path.join(dataDir, STATE_FILE_NAME);
  try {
    if (!fs.existsSync(statePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeLauncherSyncState(dataDir, state = {}) {
  if (!dataDir) return;
  const statePath = path.join(dataDir, STATE_FILE_NAME);
  await atomicWriteJson(statePath, {
    version: String(state.version || ''),
    port: normalizeCdpPort(state.port, DEFAULT_CDP_PORT),
    platform: String(state.platform || process.platform),
    launcherPath: String(state.launcherPath || ''),
    syncedAtMs: Number(state.syncedAtMs || Date.now()),
  });
}

/**
 * Migrate legacy default fixed port 9229 -> dynamic port 0 (preserving any
 * user-customized non-9229 port) and regenerate the platform's HUD launcher.
 */
export async function syncInstalledLauncher({
  dataDir = resolveDataDir(),
  pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  platform = process.platform,
  desktopDir,
  applicationsDir = '',
  versionOverride = '',
  skipWscript = false,
  skipDesktopShortcut,
} = {}) {
  const store = createConfigStore(dataDir);
  const currentCfg = store.get();
  const effectivePort =
    currentCfg.cdpPort === LEGACY_DEFAULT_CDP_PORT
      ? DEFAULT_CDP_PORT
      : normalizeCdpPort(currentCfg.cdpPort, DEFAULT_CDP_PORT);

  if (effectivePort !== currentCfg.cdpPort) {
    await store.save({ cdpPort: effectivePort });
  }

  let launcher = null;
  let launcherPath = '';
  if (platform === 'win32') {
    launcher = await generateWindowsCdpLauncher({
      dataDir,
      ...(desktopDir ? { desktopDir } : {}),
      port: effectivePort,
      skipWscript,
    });
    launcherPath = launcher.lnkPath || launcher.cmdPath || '';
  } else if (platform === 'darwin') {
    launcher = await generateMacCdpLauncher({
      ...(applicationsDir ? { applicationsDir } : {}),
      ...(desktopDir ? { desktopDir } : {}),
      port: effectivePort,
      ...(typeof skipDesktopShortcut === 'boolean' ? { skipDesktopShortcut } : {}),
    });
    launcherPath = launcher.bundlePath || '';
  } else {
    launcher = {
      platform,
      port: effectivePort,
      manualCommand: `antigravity --remote-debugging-port=${effectivePort}`,
    };
  }

  const version = versionOverride || readInstalledVersion(pluginDir);
  await writeLauncherSyncState(dataDir, {
    version,
    port: effectivePort,
    platform,
    launcherPath,
    syncedAtMs: Date.now(),
  });

  return {
    ok: true,
    version,
    port: effectivePort,
    platform,
    launcherPath,
    launcher,
  };
}

/**
 * Ensure the platform launcher has been synced at least once for `currentVersion`.
 * Covers users upgrading from older versions whose updater did not yet sync launchers.
 */
export async function ensureLauncherSyncedToCurrentVersion({
  dataDir = resolveDataDir(),
  pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  currentVersion = '',
  platform = process.platform,
  desktopDir,
  applicationsDir = '',
  skipWscript = false,
  skipDesktopShortcut,
} = {}) {
  const version = currentVersion || readInstalledVersion(pluginDir);
  const prev = readLauncherSyncState(dataDir);
  if (prev && prev.version === version && prev.platform === platform) {
    return { skipped: true, version, prev };
  }
  const res = await syncInstalledLauncher({
    dataDir,
    pluginDir,
    platform,
    desktopDir,
    applicationsDir,
    versionOverride: version,
    skipWscript,
    skipDesktopShortcut,
  });
  return { skipped: false, ...res };
}

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--data-dir' && argv[i + 1]) opts.dataDir = argv[++i];
    else if (arg === '--plugin-dir' && argv[i + 1]) opts.pluginDir = argv[++i];
    else if (arg === '--version' && argv[i + 1]) opts.versionOverride = argv[++i];
  }
  return opts;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const opts = parseCliArgs(process.argv.slice(2));
  syncInstalledLauncher(opts)
    .then((res) => {
      process.stdout.write(JSON.stringify(res) + '\n');
    })
    .catch((err) => {
      process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
      process.exitCode = 1;
    });
}
