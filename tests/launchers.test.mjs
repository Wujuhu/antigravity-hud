import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildWindowsCmdContent,
  buildWindowsVbsContent,
  generateWindowsCdpLauncher,
} from '../sidecars/agy_hud/backend/launcher_win.mjs';
import {
  buildMacInfoPlist,
  buildMacLauncherScript,
  generateMacCdpLauncher,
} from '../sidecars/agy_hud/backend/launcher_mac.mjs';

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
