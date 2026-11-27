/**
 * macOS lightweight wrapper .app bundle generator for AGY HUD.
 *
 * Installs `/Applications/Antigravity (HUD).app` (falling back to
 * `~/Applications/Antigravity (HUD).app` if `/Applications` is not writable)
 * and creates a Desktop shortcut pointing to it, without modifying the signed
 * `/Applications/Antigravity.app` bundle.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_CDP_PORT, normalizeCdpPort } from './config.mjs';

const execFileAsync = promisify(execFile);

export function findMacAntigravityApp(candidates = [
  '/Applications/Antigravity.app',
  path.join(os.homedir(), 'Applications', 'Antigravity.app'),
]) {
  for (const appPath of candidates) {
    try {
      if (fs.existsSync(appPath)) {
        return { appPath, found: true };
      }
    } catch {
      // ignore probe errors
    }
  }
  return { appPath: '/Applications/Antigravity.app', found: false };
}

export function buildMacInfoPlist({
  bundleName = 'Antigravity (HUD)',
  bundleId = 'com.agyhud.antigravity-cdp-launcher',
  port = DEFAULT_CDP_PORT,
  hasIcon = false,
} = {}) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const bundleVer = p === 0 ? 'auto' : String(p);
  const iconBlock = hasIcon
    ? '  <key>CFBundleIconFile</key>\n  <string>AppIcon</string>\n'
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${bundleName}</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${bundleName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.1.0</string>
  <key>CFBundleVersion</key>
  <string>${bundleVer}</string>
${iconBlock}  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

export function buildMacLauncherScript({
  targetAppPath = '/Applications/Antigravity.app',
  port = DEFAULT_CDP_PORT,
} = {}) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const safeApp = String(targetAppPath || '/Applications/Antigravity.app').replace(/"/g, '\\"');
  return `#!/bin/bash
set -euo pipefail

PORT="${p}"
TARGET_APP="${safeApp}"
ACTIVE_PORT_FILE="\${HOME}/Library/Application Support/Antigravity/DevToolsActivePort"

probe_cdp_port() {
  local cand="$1"
  [ -n "\${cand}" ] && [ "\${cand}" != "0" ] && curl -sf --max-time 1 "http://127.0.0.1:\${cand}/json/version" >/dev/null 2>&1
}

# If CDP endpoint is already alive (dynamic DevToolsActivePort or fixed port), bring Antigravity to front
if [ "\${PORT}" = "0" ]; then
  if [ -f "\${ACTIVE_PORT_FILE}" ]; then
    ACTIVE_PORT="$(head -n 1 "\${ACTIVE_PORT_FILE}" 2>/dev/null | tr -dc '0-9' || true)"
    if probe_cdp_port "\${ACTIVE_PORT}"; then
      open -a "\${TARGET_APP}"
      exit 0
    fi
  fi
else
  if probe_cdp_port "\${PORT}"; then
    open -a "\${TARGET_APP}"
    exit 0
  fi
fi

# If Antigravity is running without an active CDP port, prompt the user cleanly
if pgrep -x "Antigravity" >/dev/null 2>&1; then
  osascript -e 'display dialog "检测到 Antigravity 已在运行但未开启 CDP 调试端口。请先完全退出 (Cmd + Q) Antigravity，再双击本启动器重新打开。" buttons {"知道了"} default button "知道了" with title "AGY HUD"' >/dev/null 2>&1 || true
  exit 0
fi

# Clean stale DevToolsActivePort before fresh dynamic-port launch
if [ "\${PORT}" = "0" ] && [ -f "\${ACTIVE_PORT_FILE}" ]; then
  rm -f "\${ACTIVE_PORT_FILE}" 2>/dev/null || true
fi

open -a "\${TARGET_APP}" --args --remote-debugging-port="\${PORT}"
`;
}

function findIcnsInApp(appPath) {
  const resDir = path.join(appPath, 'Contents', 'Resources');
  try {
    if (!fs.existsSync(resDir)) return '';
    const entries = fs.readdirSync(resDir);
    const preferred = entries.find((f) => /^(electron|app|antigravity|icon).*\.icns$/i.test(f));
    if (preferred) return path.join(resDir, preferred);
    const anyIcns = entries.find((f) => /\.icns$/i.test(f));
    return anyIcns ? path.join(resDir, anyIcns) : '';
  } catch {
    return '';
  }
}

async function resolveWritableApplicationsDir(preferredDir) {
  if (preferredDir) return preferredDir;
  const rootApps = '/Applications';
  const userApps = path.join(os.homedir(), 'Applications');
  try {
    await fsp.access(rootApps, fs.constants.W_OK);
    return rootApps;
  } catch {
    return userApps;
  }
}

async function createMacDesktopShortcut({
  bundlePath,
  desktopDir,
  bundleName = 'Antigravity (HUD)',
  platform = process.platform,
  execFileImpl = execFileAsync,
}) {
  if (!desktopDir) return '';
  try {
    await fsp.mkdir(desktopDir, { recursive: true });
  } catch {
    return '';
  }

  // Clean up any existing or legacy shortcuts on Desktop first
  for (const oldName of [
    bundleName,
    `${bundleName}.app`,
    'Antigravity (CDP)',
    'Antigravity (CDP).app',
  ]) {
    const oldPath = path.join(desktopDir, oldName);
    await fsp.rm(oldPath, { recursive: true, force: true }).catch(() => {});
  }

  // Prefer native Finder alias on macOS so icon & LaunchServices behavior feel completely native
  if (platform === 'darwin') {
    const aliasPath = path.join(desktopDir, bundleName);
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const appleScript =
      `tell application "Finder"\n` +
      `  set targetFile to POSIX file "${esc(bundlePath)}" as alias\n` +
      `  set desktopFolder to POSIX file "${esc(desktopDir)}" as alias\n` +
      `  set newAlias to make new alias file to targetFile at desktopFolder\n` +
      `  set name of newAlias to "${esc(bundleName)}"\n` +
      `end tell`;
    try {
      await execFileImpl('osascript', ['-e', appleScript], { timeout: 10_000 });
      if (fs.existsSync(aliasPath)) return aliasPath;
      if (fs.existsSync(`${aliasPath}.app`)) return `${aliasPath}.app`;
    } catch {
      // Fall back to symlink if Finder automation is unavailable/denied
    }
  }

  // Reliable symlink fallback pointing directly to /Applications/Antigravity (HUD).app
  const linkPath = path.join(desktopDir, `${bundleName}.app`);
  try {
    await fsp.symlink(bundlePath, linkPath);
    return linkPath;
  } catch {
    return '';
  }
}

export function detectMacCdpLauncher({
  applicationsDir = '',
  desktopDir = path.join(os.homedir(), 'Desktop'),
  bundleName = 'Antigravity (HUD)',
  port = DEFAULT_CDP_PORT,
  targetAppOverride = '',
} = {}) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const detected = targetAppOverride
    ? { appPath: targetAppOverride, found: fs.existsSync(targetAppOverride) }
    : findMacAntigravityApp();

  const candidateDirs = applicationsDir
    ? [applicationsDir]
    : ['/Applications', path.join(os.homedir(), 'Applications')];

  let bundlePath = '';
  for (const dir of candidateDirs) {
    const cand = path.join(dir, `${bundleName}.app`);
    const scriptCand = path.join(cand, 'Contents', 'MacOS', 'launcher');
    try {
      if (fs.existsSync(cand) && fs.existsSync(scriptCand)) {
        bundlePath = cand;
        break;
      }
    } catch {
      // ignore probe errors
    }
  }

  let desktopShortcutPath = '';
  if (desktopDir) {
    for (const name of [bundleName, `${bundleName}.app`]) {
      const cand = path.join(desktopDir, name);
      try {
        if (fs.existsSync(cand)) {
          desktopShortcutPath = cand;
          break;
        }
      } catch {
        // ignore probe errors
      }
    }
  }

  return {
    platform: 'darwin',
    port: p,
    exists: Boolean(bundlePath),
    launcherPath: bundlePath,
    bundlePath,
    desktopShortcutPath,
    targetAppPath: detected.appPath,
    targetAppFound: detected.found,
    manualCommand: `open -a "${detected.appPath}" --args --remote-debugging-port=${p}`,
  };
}

export async function generateMacCdpLauncher({
  applicationsDir = '',
  desktopDir = path.join(os.homedir(), 'Desktop'),
  bundleName = 'Antigravity (HUD)',
  port = DEFAULT_CDP_PORT,
  targetAppOverride = '',
  skipDesktopShortcut = process.platform !== 'darwin',
  execFileImpl = execFileAsync,
} = {}) {
  const p = normalizeCdpPort(port, DEFAULT_CDP_PORT);
  const detected = targetAppOverride
    ? { appPath: targetAppOverride, found: fs.existsSync(targetAppOverride) }
    : findMacAntigravityApp();

  const resolvedAppsDir = await resolveWritableApplicationsDir(applicationsDir);
  const bundleDir = path.join(resolvedAppsDir, `${bundleName}.app`);
  const contentsDir = path.join(bundleDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');

  await fsp.mkdir(macosDir, { recursive: true });
  await fsp.mkdir(resourcesDir, { recursive: true });

  // Copy official app icon if found so the wrapper looks native in Dock / Spotlight / Desktop
  let hasIcon = false;
  if (detected.found) {
    const icnsPath = findIcnsInApp(detected.appPath);
    if (icnsPath) {
      try {
        await fsp.copyFile(icnsPath, path.join(resourcesDir, 'AppIcon.icns'));
        hasIcon = true;
      } catch {
        hasIcon = false;
      }
    }
  }

  const plistPath = path.join(contentsDir, 'Info.plist');
  const scriptPath = path.join(macosDir, 'launcher');

  await fsp.writeFile(
    plistPath,
    buildMacInfoPlist({ bundleName, port: p, hasIcon }),
    'utf8',
  );
  await fsp.writeFile(
    scriptPath,
    buildMacLauncherScript({ targetAppPath: detected.appPath, port: p }),
    { encoding: 'utf8', mode: 0o755 },
  );
  await fsp.chmod(scriptPath, 0o755).catch(() => {});

  // Touch bundle root so macOS Finder refreshes AppIcon.icns immediately
  const now = new Date();
  await fsp.utimes(bundleDir, now, now).catch(() => {});

  // Clean up legacy wrapper names in both target and ~/Applications
  const cleanupDirs = new Set([resolvedAppsDir, path.join(os.homedir(), 'Applications')]);
  for (const dir of cleanupDirs) {
    const legacyCdp = path.join(dir, 'Antigravity (CDP).app');
    if (legacyCdp !== bundleDir && fs.existsSync(legacyCdp)) {
      await fsp.rm(legacyCdp, { recursive: true, force: true }).catch(() => {});
    }
    // If we successfully installed to /Applications, also clean duplicate in ~/Applications
    if (resolvedAppsDir === '/Applications' && dir !== '/Applications') {
      const dupUserBundle = path.join(dir, `${bundleName}.app`);
      if (dupUserBundle !== bundleDir && fs.existsSync(dupUserBundle)) {
        await fsp.rm(dupUserBundle, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  let desktopShortcutPath = '';
  if (!skipDesktopShortcut) {
    desktopShortcutPath = await createMacDesktopShortcut({
      bundlePath: bundleDir,
      desktopDir,
      bundleName,
      execFileImpl,
    });
  }

  return {
    platform: 'darwin',
    port: p,
    targetAppPath: detected.appPath,
    targetAppFound: detected.found,
    bundlePath: bundleDir,
    desktopShortcutPath,
    plistPath,
    scriptPath,
    hasIcon,
    manualCommand: `open -a "${detected.appPath}" --args --remote-debugging-port=${p}`,
  };
}
