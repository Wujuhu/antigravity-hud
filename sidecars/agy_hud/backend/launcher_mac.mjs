/**
 * macOS lightweight wrapper .app bundle generator for AGY HUD.
 *
 * Creates `~/Applications/Antigravity (CDP).app` without modifying the signed
 * `/Applications/Antigravity.app` bundle, preserving Apple code signing,
 * Keychain state, and auto-updates.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CDP_PORT } from './config.mjs';

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
  bundleName = 'Antigravity (CDP)',
  bundleId = 'com.agyhud.antigravity-cdp-launcher',
  port = DEFAULT_CDP_PORT,
  hasIcon = false,
} = {}) {
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
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>${port}</string>
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
  const safeApp = String(targetAppPath || '/Applications/Antigravity.app').replace(/"/g, '\\"');
  return `#!/bin/bash
set -euo pipefail

PORT="${port}"
TARGET_APP="${safeApp}"

# If CDP endpoint is already alive, simply bring Antigravity to front
if curl -sf --max-time 1 "http://127.0.0.1:\${PORT}/json/version" >/dev/null 2>&1; then
  open -a "\${TARGET_APP}"
  exit 0
fi

# If Antigravity is running without the CDP port, prompt the user cleanly
if pgrep -x "Antigravity" >/dev/null 2>&1; then
  osascript -e 'display dialog "检测到 Antigravity 已在运行但未开启 CDP 调试端口。请先完全退出 (Cmd + Q) Antigravity，再双击本启动器重新打开。" buttons {"知道了"} default button "知道了" with title "AGY HUD (CDP 启动器)"' >/dev/null 2>&1 || true
  exit 0
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

export async function generateMacCdpLauncher({
  applicationsDir = path.join(os.homedir(), 'Applications'),
  bundleName = 'Antigravity (CDP)',
  port = DEFAULT_CDP_PORT,
  targetAppOverride = '',
} = {}) {
  const p = Number(port) || DEFAULT_CDP_PORT;
  const detected = targetAppOverride
    ? { appPath: targetAppOverride, found: fs.existsSync(targetAppOverride) }
    : findMacAntigravityApp();

  const bundleDir = path.join(applicationsDir, `${bundleName}.app`);
  const contentsDir = path.join(bundleDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');

  await fsp.mkdir(macosDir, { recursive: true });
  await fsp.mkdir(resourcesDir, { recursive: true });

  // Copy official app icon if found so the wrapper looks native in Dock / Spotlight
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

  return {
    platform: 'darwin',
    port: p,
    targetAppPath: detected.appPath,
    targetAppFound: detected.found,
    bundlePath: bundleDir,
    plistPath,
    scriptPath,
    hasIcon,
    manualCommand: `open -a "${detected.appPath}" --args --remote-debugging-port=${p}`,
  };
}
