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
import {
  buildPerTurnSummaries,
  computePrimaryTps,
  splitModelAndEffort,
  summarizeTurnsSpeed,
} from '../sidecars/agy_hud/backend/sqlite_metrics.mjs';
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
  assert.match(injectExpr, /本轮花费/);
  assert.match(injectExpr, /总计花费/);
  assert.doesNotMatch(injectExpr, />本轮输出</);
  assert.doesNotMatch(injectExpr, /agy-turn-item">缓存 /);
  assert.match(injectExpr, /data-agy-action="open-sidecar"/);
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

    await uninstallPlugin({
      targetDir,
      dataDir,
      desktopDir: path.join(tmpRoot, 'desktop'),
      applicationsDir: path.join(tmpRoot, 'Applications'),
      purgeData: true,
      silent: true,
    });
    assert.equal(fs.existsSync(targetDir), false);
    assert.equal(fs.existsSync(dataDir), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('sqlite_metrics computes stream TPS with fallback, splits model & effort, and aggregates per-turn totals', () => {
  // Normal stream TPS (>= 0.12s, <= 3000)
  const r1 = computePrimaryTps(1000, 5.0, 10.0);
  assert.equal(r1.displayTps, 200);
  assert.equal(r1.e2eTps, 100);

  // Too short stream (< 0.12s) falls back to e2eTps
  const r2 = computePrimaryTps(500, 0.05, 5.0);
  assert.equal(r2.displayTps, 100);

  // Spike (> 3000 tok/s) falls back to e2eTps
  const r3 = computePrimaryTps(1000, 0.2, 4.0);
  assert.equal(r3.displayTps, 250);

  assert.deepEqual(splitModelAndEffort('Gemini 4 Neon (High)'), {
    modelLabel: 'Gemini 4 Neon',
    effort: 'High',
  });
  assert.deepEqual(splitModelAndEffort('gemini-4-hydrogen-xhigh'), {
    modelLabel: 'Gemini 4 Hydrogen',
    effort: 'XHigh',
  });
  assert.deepEqual(splitModelAndEffort('claude-sonnet-4-6-medium'), {
    modelLabel: 'Claude Sonnet 4.6',
    effort: 'Medium',
  });

  // Aggregate multi-step calls within one user turn into total turn summary
  const turns = buildPerTurnSummaries(
    [
      {
        idx: 1,
        maxStepIdx: 3,
        modelName: 'Gemini 4 Neon (High)',
        inTok: 10000,
        cacheWrite: 0,
        cacheRead: 90000,
        outTok: 500,
        thinkTok: 200,
        respTok: 300,
        ttft: 2.0,
        stream: 2.5,
        totDur: 4.5,
      },
      {
        idx: 2,
        maxStepIdx: 6,
        modelName: 'Gemini 4 Neon (High)',
        inTok: 5000,
        cacheWrite: 0,
        cacheRead: 95000,
        outTok: 1500,
        thinkTok: 400,
        respTok: 1100,
        ttft: 3.0,
        stream: 7.5,
        totDur: 10.5,
      },
      {
        idx: 3,
        maxStepIdx: 12,
        modelName: 'Claude Sonnet 4.6 (Medium)',
        inTok: 2000,
        cacheWrite: 0,
        cacheRead: 18000,
        outTok: 400,
        thinkTok: 0,
        respTok: 400,
        ttft: 1.0,
        stream: 4.0,
        totDur: 5.0,
      },
    ],
    [0, 10],
  );

  assert.equal(turns.length, 2);
  assert.equal(turns[0].stepCount, 2);
  assert.equal(turns[0].modelLabel, 'Gemini 4 Neon');
  assert.equal(turns[0].effort, 'High');
  assert.equal(turns[0].totalTokens, 202000);
  assert.equal(turns[0].cacheHitPct, 92.5);
  assert.equal(turns[0].totalDurSec, 15);
  assert.equal(turns[0].tps, 200); // (500 + 1500) / (2.5 + 7.5)
  assert.ok(turns[0].totalCostUsd > 0);
  assert.equal(turns[1].modelLabel, 'Claude Sonnet 4.6');
  assert.equal(turns[1].effort, 'Medium');
  assert.equal(turns[1].tps, 100);

  // Live progressive turn speed: after call 1 -> 200 tok/s; after calls 1+2 in same turn -> composite 200 tok/s;
  // after turn 2 (100 tok/s) -> current turn = 100 tok/s, session mean across 2 turns = (200 + 100) / 2 = 150 tok/s
  const step1Only = buildPerTurnSummaries([
    { idx: 1, maxStepIdx: 3, modelName: 'Gemini 4 Neon (High)', inTok: 1000, cacheWrite: 0, cacheRead: 9000, outTok: 400, thinkTok: 0, respTok: 400, ttft: 2.0, stream: 2.0, totDur: 4.0 },
  ], [0]);
  assert.equal(summarizeTurnsSpeed(step1Only).latestTokPerSec, 200);
  assert.equal(summarizeTurnsSpeed(step1Only).lastTtftSec, 2);

  const step1And2 = buildPerTurnSummaries([
    { idx: 1, maxStepIdx: 3, modelName: 'Gemini 4 Neon (High)', inTok: 1000, cacheWrite: 0, cacheRead: 9000, outTok: 400, thinkTok: 0, respTok: 400, ttft: 2.0, stream: 2.0, totDur: 4.0 },
    { idx: 2, maxStepIdx: 6, modelName: 'Gemini 4 Neon (High)', inTok: 1000, cacheWrite: 0, cacheRead: 9000, outTok: 800, thinkTok: 0, respTok: 800, ttft: 4.0, stream: 8.0, totDur: 12.0 },
  ], [0]);
  // (400 + 800) / (2.0 + 8.0) = 120 tok/s, avg TTFT = (2.0 + 4.0) / 2 = 3.0s
  assert.equal(summarizeTurnsSpeed(step1And2).latestTokPerSec, 120);
  assert.equal(summarizeTurnsSpeed(step1And2).lastTtftSec, 3);
  assert.equal(summarizeTurnsSpeed(step1And2).avgTokPerSec, 120);

  const multiTurnSpeed = summarizeTurnsSpeed(turns);
  // Turn 1 = 200 tok/s (avg TTFT 2.5s), Turn 2 = 100 tok/s (avg TTFT 1.0s)
  assert.equal(multiTurnSpeed.latestTokPerSec, 100);
  assert.equal(multiTurnSpeed.lastTtftSec, 1);
  assert.equal(multiTurnSpeed.avgTokPerSec, 150);
  assert.equal(multiTurnSpeed.avgTtftSec, 1.75);
});
