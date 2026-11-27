import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyPluginUpdate,
  checkForUpdates,
  compareSemver,
  isAllowedDownloadUrl,
  validateRepoSlug,
} from '../sidecars/agy_hud/backend/updater.mjs';
import {
  ensureLauncherSyncedToCurrentVersion,
  readLauncherSyncState,
  syncInstalledLauncher,
} from '../sidecars/agy_hud/backend/sync_launcher.mjs';
import { createConfigStore } from '../sidecars/agy_hud/backend/config.mjs';

test('validateRepoSlug accepts valid GitHub slugs/URLs and rejects unsafe inputs', () => {
  assert.equal(validateRepoSlug('alice/agy-hud'), 'alice/agy-hud');
  assert.equal(validateRepoSlug('https://github.com/alice/agy-hud.git'), 'alice/agy-hud');
  assert.equal(validateRepoSlug('not a repo'), '');
  assert.equal(validateRepoSlug('../evil/path'), '');
});

test('compareSemver orders semantic versions accurately', () => {
  assert.equal(compareSemver('1.1.0', '1.0.0'), 1);
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.2', '1.2.0'), -1);
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
});

test('isAllowedDownloadUrl enforces HTTPS GitHub host allowlist', () => {
  assert.equal(isAllowedDownloadUrl('https://github.com/alice/agy-hud/releases/download/v1.1.0/agy-hud.zip'), true);
  assert.equal(isAllowedDownloadUrl('https://api.github.com/repos/alice/agy-hud/zipball/v1.1.0'), true);
  assert.equal(isAllowedDownloadUrl('http://github.com/alice/agy-hud/archive.zip'), false);
  assert.equal(isAllowedDownloadUrl('https://evil.example.com/release.zip'), false);
});

test('checkForUpdates detects newer GitHub release via mocked fetch', async () => {
  const unconfigured = await checkForUpdates({ repoSlug: '', currentVersion: '1.0.0' });
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.hasUpdate, false);

  const res = await checkForUpdates({
    repoSlug: 'alice/agy-hud',
    currentVersion: '1.0.0',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.2.0',
        html_url: 'https://github.com/alice/agy-hud/releases/tag/v1.2.0',
        body: 'Added weekly estimate and auto update',
        assets: [
          {
            name: 'agy-hud-v1.2.0.zip',
            browser_download_url: 'https://github.com/alice/agy-hud/releases/download/v1.2.0/agy-hud-v1.2.0.zip',
          },
        ],
      }),
    }),
  });

  assert.equal(res.ok, true);
  assert.equal(res.hasUpdate, true);
  assert.equal(res.latestVersion, '1.2.0');
  assert.match(res.downloadUrl, /agy-hud-v1\.2\.0\.zip$/);
});

test('update and startup launcher sync migrates 9229 -> 0 and refreshes Windows & macOS launchers', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-sync-'));
  const dataDir = path.join(tmpRoot, 'data');
  const pluginDir = path.join(tmpRoot, 'plugin');
  const desktopDir = path.join(tmpRoot, 'Desktop');
  const appsDir = path.join(tmpRoot, 'Applications');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(desktopDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ version: '1.1.1' }), 'utf8');

  try {
    await createConfigStore(dataDir).save({ cdpPort: 9229 });

    const winRes = await syncInstalledLauncher({
      dataDir,
      pluginDir,
      platform: 'win32',
      desktopDir,
      skipWscript: true,
    });
    assert.equal(winRes.port, 0);
    assert.equal(createConfigStore(dataDir).get().cdpPort, 0);
    assert.equal(readLauncherSyncState(dataDir).version, '1.1.1');

    const skipRes = await ensureLauncherSyncedToCurrentVersion({
      dataDir,
      pluginDir,
      currentVersion: '1.1.1',
      platform: 'win32',
      desktopDir,
      skipWscript: true,
    });
    assert.equal(skipRes.skipped, true);

    const macRes = await ensureLauncherSyncedToCurrentVersion({
      dataDir,
      pluginDir,
      currentVersion: '1.1.2',
      platform: 'darwin',
      desktopDir,
      applicationsDir: appsDir,
      skipDesktopShortcut: true,
    });
    assert.equal(macRes.skipped, false);
    assert.match(fs.readFileSync(macRes.launcher.scriptPath, 'utf8'), /PORT="0"/);

    let syncedVersion = '';
    const updRes = await applyPluginUpdate({
      downloadUrl: 'https://github.com/Wujuhu/antigravity-hud/releases/download/v1.1.1/agy-hud-v1.1.1.zip',
      targetPluginDir: pluginDir,
      dataDir,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.alloc(256, 0x50).buffer,
      }),
      execFileImpl: async (_cmd, args) => {
        const destIdx = args.indexOf('-C') >= 0 ? args.indexOf('-C') + 1 : args.indexOf('-d') + 1;
        const root = path.join(args[destIdx], 'agy-hud');
        fs.mkdirSync(path.join(root, 'sidecars', 'agy_hud', 'backend'), { recursive: true });
        fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ version: '1.1.1' }), 'utf8');
        fs.writeFileSync(path.join(root, 'sidecars', 'agy_hud', 'main.mjs'), '// ok\n', 'utf8');
        return { stdout: '', stderr: '' };
      },
      syncLauncherImpl: async ({ newVersion }) => {
        syncedVersion = newVersion;
        return { ok: true, launcherPath: 'Antigravity (HUD).lnk' };
      },
    });
    assert.equal(updRes.launcherSynced, true);
    assert.equal(syncedVersion, '1.1.1');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
