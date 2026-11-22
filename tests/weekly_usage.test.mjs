import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateWeeklySteps,
  buildWeeklyQuotaEstimates,
  estimateTurnCostUsd,
  normalizeModelRateKey,
  resolveModelRates,
} from '../sidecars/agy_hud/backend/weekly_usage.mjs';

test('normalizeModelRateKey and resolveModelRates handle effort suffixes and model families', () => {
  assert.equal(normalizeModelRateKey('gemini-4-argon-high'), 'gemini-4-argon');
  assert.equal(normalizeModelRateKey('models/claude-sonnet-4-5-thinking'), 'claude-sonnet-4-5');
  assert.deepEqual(resolveModelRates('gemini-4-argon-xhigh'), { inPerM: 4, outPerM: 20, crPerM: 0.2 });
  assert.deepEqual(resolveModelRates('gemini-4-neon-high'), { inPerM: 2, outPerM: 12, crPerM: 0.1 });
});

test('estimateTurnCostUsd calculates actual cost and prompt cache savings accurately', () => {
  // gemini-4-argon: in=$4/1M, cr=$0.2/1M, out=$20/1M
  const { costUsd, cacheSavedUsd } = estimateTurnCostUsd('gemini-4-argon-high', 100_000, 900_000, 50_000);
  // actual = 0.4 + 0.18 + 1.0 = 1.58; without cache = 4.0 + 1.0 = 5.0; saved = 3.42
  assert.ok(Math.abs(costUsd - 1.58) < 1e-6);
  assert.ok(Math.abs(cacheSavedUsd - 3.42) < 1e-6);
});

test('aggregateWeeklySteps filters out steps older than 7 days and groups by quota bucket', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');
  const cutoff = now - 7 * 24 * 3600 * 1000;
  const steps = [
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-neon-high',
      input_tokens: 1_000_000,
      cache_read_tokens: 0,
      output_tokens: 0,
      created_at: '2026-11-10T00:00:00.000Z', // > 7d old, excluded
    },
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-neon-high',
      input_tokens: 1_000_000,
      cache_read_tokens: 0,
      output_tokens: 500_000,
      created_at: '2026-11-21T12:00:00.000Z', // gemini: 1.5M tok, $2 + $6 = $8
    },
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-argon-high',
      input_tokens: 500_000,
      cache_read_tokens: 0,
      output_tokens: 100_000,
      created_at: '2026-11-22T08:00:00.000Z', // argon: 600k tok, $2 + $2 = $4
    },
  ];

  const agg = aggregateWeeklySteps(steps, cutoff);
  assert.equal(agg.totalTokens, 2_100_000);
  assert.equal(agg.totalCostUsd, 12);
  assert.equal(agg.byGroup.gemini.tokens, 1_500_000);
  assert.equal(agg.byGroup.argon.tokens, 600_000);
});

test('buildWeeklyQuotaEstimates extrapolates when usedPct >= 5% and abstains when < 5%', () => {
  const weeklyUsage = {
    windowDays: 7,
    scannedSessions: 12,
    totalTokens: 10_000_000,
    totalCostUsd: 20,
    totalCacheSavedUsd: 15,
    byGroup: {
      gemini: { tokens: 8_000_000, costUsd: 16, cacheSavedUsd: 12, turns: 50 },
      gpt_claude: { tokens: 2_000_000, costUsd: 4, cacheSavedUsd: 3, turns: 10 },
    },
  };

  const est = buildWeeklyQuotaEstimates(weeklyUsage, [
    { key: 'gemini', label: 'Gemini', weekly: { remainingPct: 60 } }, // 40% used -> 20M tok / $40
    { key: 'gpt_claude', label: 'GPT&Claude', weekly: { remainingPct: 98 } }, // 2% used -> skip
  ]);

  assert.equal(est.hasExtrapolation, true);
  assert.equal(est.groups[0].estimatedTotalTokens, 20_000_000);
  assert.equal(est.groups[0].estimatedTotalCostUsd, 40);
  assert.equal(est.groups[1].estimatedTotalTokens, null);
  assert.equal(est.estimatedCombinedWeeklyTokens, 20_000_000);
  assert.equal(est.estimatedCombinedWeeklyCostUsd, 40);
});
