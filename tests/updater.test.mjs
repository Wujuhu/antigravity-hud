import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkForUpdates,
  compareSemver,
  isAllowedDownloadUrl,
  validateRepoSlug,
} from '../sidecars/agy_hud/backend/updater.mjs';

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
