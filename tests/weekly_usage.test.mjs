import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEVEN_DAYS_MS,
  updateAnchorsFromQuotaGroups,
} from '../sidecars/agy_hud/backend/quota_anchors.mjs';
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
  const { costUsd, cacheSavedUsd } = estimateTurnCostUsd('gemini-4-argon-high', 100_000, 900_000, 50_000);
  assert.ok(Math.abs(costUsd - 1.58) < 1e-6);
  assert.ok(Math.abs(cacheSavedUsd - 3.42) < 1e-6);
});

test('aggregateWeeklySteps supports per-group cycleStartMs cutoffs cleanly', () => {
  const t1 = Date.parse('2026-11-20T00:00:00.000Z');
  const t2 = Date.parse('2026-11-22T08:00:00.000Z');
  const manualResetAt = Date.parse('2026-11-22T06:00:00.000Z');

  const steps = [
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-neon-high',
      input_tokens: 1_000_000,
      cache_read_tokens: 0,
      output_tokens: 500_000,
      created_at: new Date(t1).toISOString(), // before gemini manual reset -> excluded
    },
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-neon-high',
      input_tokens: 500_000,
      cache_read_tokens: 0,
      output_tokens: 250_000,
      created_at: new Date(t2).toISOString(), // after gemini manual reset -> included (750k, $4)
    },
    {
      type: 'PLANNER_RESPONSE',
      model: 'gemini-4-argon-high',
      input_tokens: 500_000,
      cache_read_tokens: 0,
      output_tokens: 100_000,
      created_at: new Date(t1).toISOString(), // argon did NOT reset -> included (600k, $4)
    },
  ];

  const agg = aggregateWeeklySteps(steps, 0, {
    gemini: manualResetAt,
    argon: Date.parse('2026-11-18T00:00:00.000Z'),
  });
  assert.equal(agg.byGroup.gemini.tokens, 750_000);
  assert.equal(agg.byGroup.gemini.costUsd, 4);
  assert.equal(agg.byGroup.argon.tokens, 600_000);
  assert.equal(agg.totalTokens, 1_350_000);
});

test('buildWeeklyQuotaEstimates triggers at >= 1% net change using exact floating-point remainingFraction', () => {
  const weeklyUsage = {
    windowDays: 7,
    scannedSessions: 4,
    totalTokens: 1_800_000,
    totalCostUsd: 3.6,
    totalCacheSavedUsd: 2.0,
    byGroup: {
      gemini: { tokens: 1_500_000, costUsd: 3.0, cacheSavedUsd: 1.5, turns: 10 },
      argon: { tokens: 300_000, costUsd: 0.6, cacheSavedUsd: 0.5, turns: 2 },
    },
  };

  // gemini: 1.5% exact delta (remainingFraction = 0.985) => 1.5M / 0.015 = 100M tok, $3 / 0.015 = $200
  // argon: 0.6% exact delta (remainingFraction = 0.994) => < 1%, skip extrapolation
  const est = buildWeeklyQuotaEstimates(weeklyUsage, [
    { key: 'gemini', label: 'Gemini', weekly: { remainingFraction: 0.985, remainingPct: 99 } },
    { key: 'argon', label: 'Argon', weekly: { remainingFraction: 0.994, remainingPct: 99 } },
  ]);

  assert.equal(est.hasExtrapolation, true);
  assert.equal(est.groups[0].weeklyUsedPct, 1.5);
  assert.equal(est.groups[0].estimatedTotalTokens, 100_000_000);
  assert.equal(est.groups[0].estimatedTotalCostUsd, 200);
  assert.equal(est.groups[1].estimatedTotalTokens, null);
});

test('quota anchors simultaneously handle natural resets, official manual resets, and partial top-ups', () => {
  const now1 = Date.parse('2026-11-22T10:00:00.000Z');
  const reset1 = Date.parse('2026-11-26T10:00:00.000Z');

  // 1. Initial observation mid-cycle (remaining = 0.40)
  const step1 = updateAnchorsFromQuotaGroups(
    {},
    [{ key: 'gemini', weekly: { remainingFraction: 0.4, resetTimeMs: reset1 } }],
    now1,
  );
  assert.equal(step1.anchors.gemini.cycleStartMs, reset1 - SEVEN_DAYS_MS);
  assert.equal(step1.anchors.gemini.anchorFraction, 1.0);
  assert.equal(step1.anchors.gemini.reason, 'natural_window');

  // 2. Official manual full reset (resetTime unchanged, fraction jumps 0.40 -> 1.0)
  const now2 = Date.parse('2026-11-22T12:00:00.000Z');
  const step2 = updateAnchorsFromQuotaGroups(
    step1.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 1.0, resetTimeMs: reset1 } }],
    now2,
  );
  assert.equal(step2.anchors.gemini.cycleStartMs, now2);
  assert.equal(step2.anchors.gemini.anchorFraction, 1.0);
  assert.equal(step2.anchors.gemini.reason, 'manual_reset');

  // 3. Partial consumption (1.0 -> 0.20), then official partial top-up (0.20 -> 0.70)
  const now3 = Date.parse('2026-11-23T12:00:00.000Z');
  const step3a = updateAnchorsFromQuotaGroups(
    step2.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.2, resetTimeMs: reset1 } }],
    now3,
  );
  const now4 = Date.parse('2026-11-23T13:00:00.000Z');
  const step3b = updateAnchorsFromQuotaGroups(
    step3a.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.7, resetTimeMs: reset1 } }],
    now4,
  );
  assert.equal(step3b.anchors.gemini.cycleStartMs, now4);
  assert.equal(step3b.anchors.gemini.anchorFraction, 0.7);
  assert.equal(step3b.anchors.gemini.reason, 'partial_topup');

  // Consume from 0.70 -> 0.55 (deltaUsed = 0.15) with 3M tokens / $6 -> full weekly = 20M / $40
  const estAfterTopUp = buildWeeklyQuotaEstimates(
    {
      windowDays: 7,
      scannedSessions: 2,
      totalTokens: 3_000_000,
      totalCostUsd: 6,
      totalCacheSavedUsd: 1,
      byGroup: { gemini: { tokens: 3_000_000, costUsd: 6, cacheSavedUsd: 1, turns: 5 } },
    },
    [{ key: 'gemini', label: 'Gemini', weekly: { remainingFraction: 0.55, resetTimeMs: reset1 } }],
    step3b.anchors,
  );
  assert.equal(estAfterTopUp.groups[0].weeklyUsedPct, 15);
  assert.equal(estAfterTopUp.groups[0].estimatedTotalTokens, 20_000_000);
  assert.equal(estAfterTopUp.groups[0].estimatedTotalCostUsd, 40);

  // 4. Scheduled natural reset (resetTime advances by +7 days)
  const reset2 = reset1 + SEVEN_DAYS_MS;
  const now5 = reset1 + 600_000; // 10 minutes after natural reset
  const step4 = updateAnchorsFromQuotaGroups(
    step3b.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.98, resetTimeMs: reset2 } }],
    now5,
  );
  assert.equal(step4.anchors.gemini.cycleStartMs, reset1);
  assert.equal(step4.anchors.gemini.anchorFraction, 1.0);
  assert.equal(step4.anchors.gemini.reason, 'natural_reset');
});
