import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDefaultConfig } from '../sidecars/agy_hud/backend/config.mjs';
import {
  assembleHudSnapshot,
  formatCleanModelName,
} from '../sidecars/agy_hud/backend/telemetry_aggregator.mjs';
import {
  HUD_POPOVER_ID,
  HUD_ROOT_ID,
  buildHudInjectExpression,
  buildHudRemoveExpression,
} from '../sidecars/agy_hud/hud/hud_runtime.mjs';
import {
  extractConversationIdFromUrl,
  isAntigravityAppTarget,
} from '../sidecars/agy_hud/backend/cdp_bridge.mjs';
import { installPlugin } from '../scripts/install.mjs';
import { uninstallPlugin } from '../scripts/uninstall.mjs';

test('HUD inject and remove expressions parse cleanly as valid JavaScript', () => {
  const cfg = createDefaultConfig();
  cfg.pillItems = [
    { id: 'quota', enabled: true },
    { id: 'speed', enabled: true },
    { id: 'context', enabled: true },
  ];
  const snap = assembleHudSnapshot({
    contextSnap: {
      found: true,
      model: { id: '<script>alert(1)</script>' },
      contextLimit: 512000,
      usedTokens: 51200,
      compaction: { count: 2, totalSavedTokens: 48000 },
    },
  });

  const injectExpr = buildHudInjectExpression(snap, cfg);
  const removeExpr = buildHudRemoveExpression();

  assert.doesNotThrow(() => new Function(injectExpr));
  assert.doesNotThrow(() => new Function(removeExpr));
  assert.match(injectExpr, new RegExp(HUD_ROOT_ID));
  assert.match(injectExpr, new RegExp(HUD_POPOVER_ID));
  assert.match(injectExpr, /"compactionCount":2/);
  assert.match(injectExpr, /压缩 /);
  assert.match(injectExpr, /sidecar:\/\/agy-hud\/agy_hud\//);
  // Ensure custom order is embedded in payload
  assert.ok(injectExpr.indexOf('"id":"quota"') < injectExpr.indexOf('"id":"context"'));
});

test('isAntigravityAppTarget filters DevTools and AGY HUD sidecar while allowing host targets', () => {
  assert.equal(
    isAntigravityAppTarget({
      type: 'page',
      title: 'Antigravity',
      url: 'file:///Applications/Antigravity.app/index.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/1',
    }),
    true,
  );
  assert.equal(
    isAntigravityAppTarget({
      type: 'page',
      title: 'AGY HUD',
      url: 'http://127.0.0.1:47821/',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/2',
    }),
    false,
  );
  assert.equal(
    isAntigravityAppTarget({
      type: 'iframe',
      title: 'plugin://agy-hud--agy_hud-1757/',
      url: 'plugin://agy-hud--agy_hud-1757/?token=abc',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/4',
    }),
    false,
  );
  assert.equal(
    extractConversationIdFromUrl(
      'https://127.0.0.1:14626/c/f3462d83-e5ba-42d0-8339-c69c10bef587?project=12973ce6-3375-48d0-b7c9-fdc2cc7ab053',
    ),
    'f3462d83-e5ba-42d0-8339-c69c10bef587',
  );
  assert.equal(extractConversationIdFromUrl('https://127.0.0.1:14626/'), '');
  assert.equal(formatCleanModelName('gemini-4-neon-high'), 'Gemini 4 Neon');
  assert.equal(formatCleanModelName('claude-sonnet-4-6-high'), 'Claude Sonnet 4.6');
  assert.equal(formatCleanModelName('gpt-oss-120b-medium'), 'GPT-OSS 120B');
});

test('installPlugin and uninstallPlugin work cleanly in an isolated temp directory', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-inst-'));
  const targetDir = path.join(tmpRoot, 'plugin');
  const dataDir = path.join(tmpRoot, 'data');

  try {
    const res = await installPlugin({
      targetDir,
      dataDir,
      cdpPort: 9444,
      skipLauncher: true,
      silent: true,
    });
    assert.equal(fs.existsSync(path.join(targetDir, 'plugin.json')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'sidecars', 'agy_hud', 'main.mjs')), true);
    assert.equal(fs.existsSync(res.configFile), true);
    assert.equal(res.config.cdpPort, 9444);

    await uninstallPlugin({ targetDir, dataDir, purgeData: true, silent: true });
    assert.equal(fs.existsSync(targetDir), false);
    assert.equal(fs.existsSync(dataDir), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
