import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDefaultConfig } from '../sidecars/agy_hud/backend/config.mjs';
import { assembleHudSnapshot } from '../sidecars/agy_hud/backend/telemetry_aggregator.mjs';
import {
  HUD_POPOVER_ID,
  HUD_ROOT_ID,
  buildHudInjectExpression,
  buildHudRemoveExpression,
} from '../sidecars/agy_hud/hud/hud_runtime.mjs';
import { isAntigravityAppTarget } from '../sidecars/agy_hud/backend/cdp_bridge.mjs';
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
    },
  });

  const injectExpr = buildHudInjectExpression(snap, cfg);
  const removeExpr = buildHudRemoveExpression();

  assert.doesNotThrow(() => new Function(injectExpr));
  assert.doesNotThrow(() => new Function(removeExpr));
  assert.match(injectExpr, new RegExp(HUD_ROOT_ID));
  assert.match(injectExpr, new RegExp(HUD_POPOVER_ID));
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
      type: 'page',
      title: 'DevTools',
      url: 'devtools://devtools/bundled/inspector.html',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/3',
    }),
    false,
  );
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
