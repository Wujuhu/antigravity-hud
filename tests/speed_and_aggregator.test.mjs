import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSpeedMetricsFromSteps } from '../sidecars/agy_hud/backend/speed_tracker.mjs';
import {
  assembleHudSnapshot,
  buildBreakdownCategories,
  matchModelToQuotaGroupKey,
} from '../sidecars/agy_hud/backend/telemetry_aggregator.mjs';

test('computeSpeedMetricsFromSteps computes per-turn and average tok/s accurately', () => {
  const steps = [
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-neon-high',
      output_tokens: 400,
      created_at: '2026-11-22T10:00:00.000Z',
    },
    {
      type: 'GENERIC',
      created_at: '2026-11-22T10:00:02.000Z', // 2s -> 200 tok/s
    },
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-neon-high',
      output_tokens: 600,
      created_at: '2026-11-22T10:00:10.000Z',
      completed_at: '2026-11-22T10:00:12.000Z', // 2s -> 300 tok/s
    },
  ];

  const metrics = computeSpeedMetricsFromSteps(steps);
  assert.equal(metrics.latestTokPerSec, 300);
  assert.equal(metrics.avgTokPerSec, 250);
  assert.equal(metrics.lastOutputTokens, 600);
  assert.equal(metrics.upstreamModelId, 'gemini-4-neon-high');
  assert.equal(metrics.sampleCount, 2);
});

test('matchModelToQuotaGroupKey maps Gemini, Claude/GPT, and Argon correctly', () => {
  assert.equal(matchModelToQuotaGroupKey('gemini-4-argon-high'), 'argon');
  assert.equal(matchModelToQuotaGroupKey('claude-sonnet-4-5'), 'gpt_claude');
  assert.equal(matchModelToQuotaGroupKey('gpt-5.2'), 'gpt_claude');
  assert.equal(matchModelToQuotaGroupKey('gemini-4-neon-high'), 'gemini');
});

test('assembleHudSnapshot merges breakdown, cache ratios, manual cap override, and active quota group', () => {
  const breakdown = buildBreakdownCategories(
    {
      systemPrompt: 8000,
      systemTools: 2000,
      rulesFiles: 3000,
      skills: 2000,
      messages: 15000,
      agentReplies: 20000,
      toolCallOutputs: 40000,
      agentThinking: 10000,
    },
    100000,
  );
  assert.equal(breakdown.length, 5);
  assert.equal(breakdown.find((c) => c.key === 'tools').pct, 40);

  const snap = assembleHudSnapshot({
    contextSnap: {
      found: true,
      conversationId: 'conv-123',
      model: { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon' },
      contextLimit: 512000,
      usedTokens: 128000,
      cache: {
        cacheHitRatio: 88.5,
        sessionCacheHitRatio: 79.2,
        cachedTokens: 100000,
        lastPromptTokens: 113000,
        cumulativeInputTokens: 300000,
        cumulativeOutputTokens: 20000,
      },
      categories: { systemPrompt: 12800, messages: 50000, toolCallOutputs: 65200 },
    },
    speedMetrics: {
      latestTokPerSec: 180.5,
      avgTokPerSec: 150.2,
      lastOutputTokens: 900,
      upstreamModelId: 'gemini-4-argon-high',
    },
    quotaSummary: {
      ok: true,
      available: true,
      groups: [
        { key: 'gemini', label: 'Gemini', fiveHour: { remainingPct: 90, remainingMs: 3600000 } },
        { key: 'argon', label: 'Argon', fiveHour: { remainingPct: 64, remainingMs: 1800000 } },
      ],
    },
    config: { windowCapMode: 256000 },
  });

  assert.equal(snap.context.contextLimit, 256000);
  assert.equal(snap.context.limitSource, 'manual');
  assert.equal(snap.context.usedPercent, 50);
  assert.equal(snap.cache.lastHitPct, 88.5);
  assert.equal(snap.cache.sessionHitPct, 79.2);
  assert.equal(snap.cache.cumulativeTotalTokens, 320000);
  assert.equal(snap.quota.activeGroupKey, 'argon');
  assert.equal(snap.quota.activeFiveHourPct, 64);
});
