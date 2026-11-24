import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildWindowsCmdContent,
  buildWindowsVbsContent,
  detectWindowsCdpLauncher,
  generateWindowsCdpLauncher,
} from '../sidecars/agy_hud/backend/launcher_win.mjs';
import {
  buildMacInfoPlist,
  buildMacLauncherScript,
  detectMacCdpLauncher,
  generateMacCdpLauncher,
} from '../sidecars/agy_hud/backend/launcher_mac.mjs';
import { createLauncherReconciler } from '../sidecars/agy_hud/backend/launcher_check.mjs';

test('Windows launcher builders include --remote-debugging-port and zero-console wscript invocation', () => {
  const vbs = buildWindowsVbsContent('C:\\Apps\\Antigravity.exe', 9229);
  assert.match(vbs, /--remote-debugging-port=9229/);
  assert.match(vbs, /WScript\.Shell/);

  const cmd = buildWindowsCmdContent('C:\\data\\launch.vbs', 'C:\\Apps\\Antigravity.exe', 9229);
  assert.match(cmd, /wscript\.exe \/\/Nologo/);
});

test('generateWindowsCdpLauncher writes .vbs and .cmd artifacts cleanly (offline skipWscript)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-win-'));
  try {
    const res = await generateWindowsCdpLauncher({
      dataDir: tmpDir,
      port: 9331,
      exePathOverride: 'C:\\Mock\\Antigravity.exe',
      skipWscript: true,
    });
    assert.equal(res.port, 9331);
    assert.equal(fs.existsSync(res.vbsPath), true);
    assert.equal(fs.existsSync(res.cmdPath), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('generateMacCdpLauncher creates valid .app bundle with Info.plist and executable script', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-mac-'));
  const fakeAppsDir = path.join(tmpDir, 'Applications');
  const fakeDesktopDir = path.join(tmpDir, 'Desktop');
  try {
    const res = await generateMacCdpLauncher({
      applicationsDir: fakeAppsDir,
      desktopDir: fakeDesktopDir,
      port: 9229,
      targetAppOverride: '/Applications/Antigravity.app',
      skipDesktopShortcut: true,
    });

    assert.equal(fs.existsSync(res.bundlePath), true);
    assert.equal(fs.existsSync(res.plistPath), true);
    assert.equal(fs.existsSync(res.scriptPath), true);
    assert.equal(res.bundlePath, path.join(fakeAppsDir, 'Antigravity (HUD).app'));

    const plist = fs.readFileSync(res.plistPath, 'utf8');
    assert.match(plist, /<key>CFBundleExecutable<\/key>\s*<string>launcher<\/string>/);
    assert.match(plist, /<key>LSUIElement<\/key>\s*<true\/>/);

    const script = fs.readFileSync(res.scriptPath, 'utf8');
    assert.match(script, /^#!\/bin\/bash/);
    assert.match(script, /PORT="9229"/);
    assert.match(script, /--remote-debugging-port="\$\{PORT\}"/);

    // Also test standalone builders directly
    assert.match(buildMacInfoPlist({ hasIcon: true }), /AppIcon/);
    assert.match(buildMacLauncherScript({ port: 9555 }), /PORT="9555"/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('detectWindowsCdpLauncher and detectMacCdpLauncher accurately distinguish existing vs deleted launchers', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-detect-'));
  const desktopDir = path.join(tmpDir, 'Desktop');
  const dataDir = path.join(tmpDir, 'data');
  const appsDir = path.join(tmpDir, 'Applications');
  fs.mkdirSync(desktopDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'launchers'), { recursive: true });

  try {
    // Windows: even if dataDir backup exists, deleting Desktop shortcut reports exists=false
    fs.writeFileSync(path.join(dataDir, 'launchers', 'Antigravity (HUD).lnk'), 'backup');
    const winMissing = detectWindowsCdpLauncher({ dataDir, desktopDir, port: 9229 });
    assert.equal(winMissing.exists, false);
    assert.equal(winMissing.launcherPath, path.join(desktopDir, 'Antigravity (HUD).lnk'));

    // Creating Desktop shortcut reports exists=true with full path
    const desktopLnk = path.join(desktopDir, 'Antigravity (HUD).lnk');
    fs.writeFileSync(desktopLnk, 'lnk');
    const winPresent = detectWindowsCdpLauncher({ dataDir, desktopDir, port: 9229 });
    assert.equal(winPresent.exists, true);
    assert.equal(winPresent.launcherPath, desktopLnk);

    // macOS: missing before generation, present after generation
    const macMissing = detectMacCdpLauncher({ applicationsDir: appsDir, desktopDir, port: 9229 });
    assert.equal(macMissing.exists, false);

    const macGen = await generateMacCdpLauncher({
      applicationsDir: appsDir,
      desktopDir,
      port: 9229,
      targetAppOverride: '/Applications/Antigravity.app',
      skipDesktopShortcut: true,
    });
    const macPresent = detectMacCdpLauncher({ applicationsDir: appsDir, desktopDir, port: 9229 });
    assert.equal(macPresent.exists, true);
    assert.equal(macPresent.launcherPath, macGen.bundlePath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createLauncherReconciler skips generation when launcher exists and auto-regenerates once when deleted', async () => {
  let existsOnDisk = true;
  let generateCount = 0;
  const fullPath = 'C:\\Users\\Demo\\Desktop\\Antigravity (HUD).lnk';

  const reconciler = createLauncherReconciler({
    platform: 'win32',
    detectImpl: () => ({
      platform: 'win32',
      exists: existsOnDisk,
      launcherPath: fullPath,
      manualCommand: '"Antigravity.exe" --remote-debugging-port=9229',
    }),
    generateImpl: async () => {
      generateCount += 1;
      existsOnDisk = true;
      return {
        platform: 'win32',
        lnkPath: fullPath,
        manualCommand: '"Antigravity.exe" --remote-debugging-port=9229',
      };
    },
  });

  // 1. Healthy CDP: never checks or generates
  const sConnected = await reconciler.reconcile({ connected: true, cdpEnabled: true, port: 9229 });
  assert.equal(sConnected.status, 'connected');
  assert.equal(generateCount, 0);

  // 2. Abnormal CDP while launcher still exists (user opened via official icon): do NOT regenerate
  const sExisting = await reconciler.reconcile({ connected: false, cdpEnabled: true, port: 9229 });
  assert.equal(sExisting.status, 'existing');
  assert.equal(sExisting.autoGenerated, false);
  assert.equal(sExisting.launcherPath, fullPath);
  assert.equal(generateCount, 0);

  // 3. Launcher deleted during abnormal CDP: auto-regenerate once and report full path
  existsOnDisk = false;
  const sRegen = await reconciler.reconcile({ connected: false, cdpEnabled: true, port: 9229 });
  assert.equal(sRegen.status, 'auto_regenerated');
  assert.equal(sRegen.autoGenerated, true);
  assert.equal(sRegen.launcherPath, fullPath);
  assert.equal(generateCount, 1);

  // 4. Subsequent polling during same outage preserves auto_regenerated state without regenerating again
  const sRegenPoll = await reconciler.reconcile({ connected: false, cdpEnabled: true, port: 9229 });
  assert.equal(sRegenPoll.status, 'auto_regenerated');
  assert.equal(sRegenPoll.launcherPath, fullPath);
  assert.equal(generateCount, 1);

  // 5. After CDP recovers and later drops again with launcher intact -> returns 'existing'
  await reconciler.reconcile({ connected: true, cdpEnabled: true, port: 9229 });
  const sNextOutage = await reconciler.reconcile({ connected: false, cdpEnabled: true, port: 9229 });
  assert.equal(sNextOutage.status, 'existing');
  assert.equal(sNextOutage.autoGenerated, false);
  assert.equal(generateCount, 1);
});
