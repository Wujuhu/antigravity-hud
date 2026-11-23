import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIVE_HOURS_MS,
  SEVEN_DAYS_MS,
  anchorKeyFor,
  updateAnchorsFromQuotaGroups,
} from '../sidecars/agy_hud/backend/quota_anchors.mjs';
import {
  aggregateWeeklySteps,
  buildWeeklyQuotaEstimates,
  estimateTurnCostUsd,
  normalizeModelRateKey,
  resolveFiveHourCutoffs,
  resolveGroupCutoffs,
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

  // 2. Official manual full reset -> enters idleFull (countdown does not start until first consumption)
  const now2 = Date.parse('2026-11-22T12:00:00.000Z');
  const step2 = updateAnchorsFromQuotaGroups(
    step1.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 1.0, resetTimeMs: null } }],
    now2,
  );
  assert.equal(step2.anchors.gemini.idleFull, true);
  assert.equal(step2.anchors.gemini.resetTimeMs, null);
  assert.equal(step2.anchors.gemini.reason, 'manual_reset');

  // 2b. User stays idle for 2 days at 100% (even with a sliding/empty resetTime) -> no false disk write
  const now2Idle = Date.parse('2026-11-24T12:00:00.000Z');
  const step2Idle = updateAnchorsFromQuotaGroups(
    step2.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 1.0, resetTimeMs: now2Idle + SEVEN_DAYS_MS } }],
    now2Idle,
  );
  assert.equal(step2Idle.anchors.gemini.idleFull, true);
  assert.equal(step2Idle.shouldPersist, false);

  // 2c. User finally makes first real consumption at 14:00 -> countdown activates (14:00 + 7d)
  const activateAt = Date.parse('2026-11-24T14:00:00.000Z');
  const activatedReset = activateAt + SEVEN_DAYS_MS;
  const step2Active = updateAnchorsFromQuotaGroups(
    step2Idle.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.98, resetTimeMs: activatedReset } }],
    activateAt + 30_000,
  );
  assert.equal(step2Active.anchors.gemini.idleFull, false);
  assert.equal(step2Active.anchors.gemini.reason, 'cycle_activated');
  assert.equal(step2Active.anchors.gemini.cycleStartMs, activateAt);
  assert.equal(step2Active.anchors.gemini.anchorFraction, 1.0);
  assert.equal(step2Active.anchors.gemini.resetTimeMs, activatedReset);

  // 2d. Minor upward bounce (e.g. +2% when 5h quota resets while weekly did NOT reset)
  // must NOT wipe cycleStartMs or anchorFraction!
  const step2Bounce = updateAnchorsFromQuotaGroups(
    step2Active.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.99, resetTimeMs: activatedReset } }],
    activateAt + 5 * 3600_000,
  );
  assert.equal(step2Bounce.anchors.gemini.cycleStartMs, activateAt);
  assert.equal(step2Bounce.anchors.gemini.anchorFraction, 1.0);
  assert.equal(step2Bounce.anchors.gemini.reason, 'cycle_activated');

  // 2e. Legacy v1 false partial_topup anchor auto-heals back to natural_window
  const legacyFalseTopUp = {
    gemini: {
      cycleStartMs: activateAt + 4 * 3600_000,
      resetTimeMs: activatedReset,
      anchorFraction: 0.556,
      lastFraction: 0.547,
      lastObservedAtMs: activateAt + 5 * 3600_000,
      idleFull: false,
      reason: 'partial_topup',
    },
  };
  const healed = updateAnchorsFromQuotaGroups(
    legacyFalseTopUp,
    [{ key: 'gemini', weekly: { remainingFraction: 0.545, resetTimeMs: activatedReset } }],
    activateAt + 6 * 3600_000,
  );
  assert.equal(healed.anchors.gemini.reason, 'natural_window');
  assert.equal(healed.anchors.gemini.cycleStartMs, activateAt);
  assert.equal(healed.anchors.gemini.anchorFraction, 1.0);
  assert.equal(healed.anchors.gemini.v, 2);

  // 3. Partial consumption (0.98 -> 0.20), then official major partial top-up (0.20 -> 0.70, +50% >= 20%)
  const now3 = Date.parse('2026-11-25T12:00:00.000Z');
  const step3a = updateAnchorsFromQuotaGroups(
    step2Active.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.2, resetTimeMs: activatedReset } }],
    now3,
  );
  const now4 = Date.parse('2026-11-25T13:00:00.000Z');
  const step3b = updateAnchorsFromQuotaGroups(
    step3a.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.7, resetTimeMs: activatedReset } }],
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
    [{ key: 'gemini', label: 'Gemini', weekly: { remainingFraction: 0.55, resetTimeMs: activatedReset } }],
    step3b.anchors,
  );
  assert.equal(estAfterTopUp.groups[0].weeklyUsedPct, 15);
  assert.equal(estAfterTopUp.groups[0].estimatedTotalTokens, 20_000_000);
  assert.equal(estAfterTopUp.groups[0].estimatedTotalCostUsd, 40);

  // 4. Official early manual reset while offline (user already consumed 2% before we observed)
  const now4b = Date.parse('2026-11-26T10:00:00.000Z'); // still 5 days before activatedReset (12-01)
  const extendedResetFromNow = now4b - 120_000 + SEVEN_DAYS_MS;
  const step3c = updateAnchorsFromQuotaGroups(
    step3b.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.98, resetTimeMs: extendedResetFromNow } }],
    now4b,
  );
  assert.equal(step3c.anchors.gemini.reason, 'manual_reset');
  assert.equal(step3c.anchors.gemini.cycleStartMs, now4b - 120_000);
  assert.equal(step3c.anchors.gemini.anchorFraction, 1.0);

  // 5. Scheduled natural reset while offline, followed by 3 hours idle and then first consumption
  const firstUseAfterNatural = extendedResetFromNow + 3 * 3600_000;
  const reset2 = firstUseAfterNatural + SEVEN_DAYS_MS;
  const now5 = firstUseAfterNatural + 60_000;
  const step4 = updateAnchorsFromQuotaGroups(
    step3c.anchors,
    [{ key: 'gemini', weekly: { remainingFraction: 0.98, resetTimeMs: reset2 } }],
    now5,
  );
  assert.equal(step4.anchors.gemini.cycleStartMs, firstUseAfterNatural);
  assert.equal(step4.anchors.gemini.anchorFraction, 1.0);
  assert.equal(step4.anchors.gemini.reason, 'natural_reset');
});

test('5h and weekly anchors stay strictly isolated so neither reset can affect the other', () => {
  const t0 = Date.parse('2026-11-23T08:00:00.000Z');
  const wkReset0 = t0 + 5 * 24 * 3600_000;
  const fhReset0 = t0 + 2 * 3600_000;

  // 1. Initial observation with both 5h and weekly active
  const s1 = updateAnchorsFromQuotaGroups(
    {},
    [
      {
        key: 'gemini',
        fiveHour: { remainingFraction: 0.70, resetTimeMs: fhReset0 },
        weekly: { remainingFraction: 0.50, resetTimeMs: wkReset0 },
      },
      {
        key: 'argon',
        fiveHour: null,
        weekly: { remainingFraction: 0.90, resetTimeMs: wkReset0 },
      },
    ],
    t0,
  );
  const wkKey = anchorKeyFor('gemini', 'weekly');
  const fhKey = anchorKeyFor('gemini', '5h');
  assert.equal(wkKey, 'gemini');
  assert.equal(fhKey, 'gemini:5h');
  assert.equal(s1.anchors[wkKey].cycleStartMs, wkReset0 - SEVEN_DAYS_MS);
  assert.equal(s1.anchors[fhKey].cycleStartMs, fhReset0 - FIVE_HOURS_MS);
  assert.equal(s1.anchors['argon:5h'], undefined);

  // 2. 5h bucket resets to 100% and re-activates, while weekly has a minor +1.5% bounce
  const t1 = fhReset0 + 5 * 60_000;
  const s2 = updateAnchorsFromQuotaGroups(
    s1.anchors,
    [
      {
        key: 'gemini',
        fiveHour: { remainingFraction: 1.0, resetTimeMs: null },
        weekly: { remainingFraction: 0.515, resetTimeMs: wkReset0 },
      },
    ],
    t1,
  );
  assert.equal(s2.anchors[fhKey].idleFull, true);
  assert.equal(s2.anchors[fhKey].reason, 'natural_reset');
  // Weekly anchor MUST remain completely untouched!
  assert.equal(s2.anchors[wkKey].cycleStartMs, wkReset0 - SEVEN_DAYS_MS);
  assert.equal(s2.anchors[wkKey].anchorFraction, 1.0);
  assert.equal(s2.anchors[wkKey].reason, 'natural_window');

  // 2b. First 5h consumption starts new 5h cycle without touching weekly cycle
  const t2 = t1 + 10 * 60_000;
  const fhReset1 = t2 + FIVE_HOURS_MS;
  const s3 = updateAnchorsFromQuotaGroups(
    s2.anchors,
    [
      {
        key: 'gemini',
        fiveHour: { remainingFraction: 0.95, resetTimeMs: fhReset1 },
        weekly: { remainingFraction: 0.49, resetTimeMs: wkReset0 },
      },
    ],
    t2 + 15_000,
  );
  assert.equal(s3.anchors[fhKey].cycleStartMs, t2);
  assert.equal(s3.anchors[fhKey].reason, 'cycle_activated');
  assert.equal(s3.anchors[wkKey].cycleStartMs, wkReset0 - SEVEN_DAYS_MS);
  assert.equal(s3.anchors[wkKey].anchorFraction, 1.0);

  // 3. Weekly bucket undergoes an official early manual reset -> 5h anchor MUST remain untouched!
  const t3 = t2 + 30 * 60_000;
  const s4 = updateAnchorsFromQuotaGroups(
    s3.anchors,
    [
      {
        key: 'gemini',
        fiveHour: { remainingFraction: 0.90, resetTimeMs: fhReset1 },
        weekly: { remainingFraction: 1.0, resetTimeMs: null },
      },
    ],
    t3,
  );
  assert.equal(s4.anchors[wkKey].idleFull, true);
  assert.equal(s4.anchors[wkKey].reason, 'manual_reset');
  assert.equal(s4.anchors[fhKey].cycleStartMs, t2);
  assert.equal(s4.anchors[fhKey].anchorFraction, 1.0);
  assert.equal(s4.anchors[fhKey].lastFraction, 0.9);

  // Verify independent cutoff resolvers
  const wkCutoffs = resolveGroupCutoffs(s3.anchors, [{ key: 'gemini' }], t2 + 60_000);
  const fhCutoffs = resolveFiveHourCutoffs(s3.anchors, [{ key: 'gemini' }], t2 + 60_000);
  assert.equal(wkCutoffs.gemini, wkReset0 - SEVEN_DAYS_MS);
  assert.equal(fhCutoffs.gemini, t2);
});

test('buildWeeklyQuotaEstimates outputs 5 independent rows in order: Gemini(5h,wk), GPT&Claude(5h,wk), Argon(wk)', () => {
  const weeklyUsage = {
    windowDays: 7,
    scannedSessions: 6,
    totalTokens: 25_000_000,
    totalCostUsd: 50,
    totalCacheSavedUsd: 20,
    byGroup: {
      gemini: { tokens: 20_000_000, costUsd: 40, cacheSavedUsd: 15, turns: 100 },
      gpt_claude: { tokens: 4_000_000, costUsd: 8, cacheSavedUsd: 4, turns: 20 },
      argon: { tokens: 1_000_000, costUsd: 2, cacheSavedUsd: 1, turns: 5 },
    },
    byGroupFiveHour: {
      gemini: { tokens: 2_000_000, costUsd: 4, cacheSavedUsd: 2, turns: 12 },
      gpt_claude: { tokens: 200_000, costUsd: 0.5, cacheSavedUsd: 0.1, turns: 2 },
      argon: { tokens: 0, costUsd: 0, cacheSavedUsd: 0, turns: 0 },
    },
  };

  const quotaGroups = [
    {
      key: 'gemini',
      label: 'Gemini',
      fiveHour: { remainingFraction: 0.90 }, // 10% used -> 2M / 0.10 = 20M, $4 / 0.10 = $40
      weekly: { remainingFraction: 0.60 }, // 40% used -> 20M / 0.40 = 50M, $40 / 0.40 = $100
    },
    {
      key: 'gpt_claude',
      label: 'GPT&Claude',
      fiveHour: { remainingFraction: 0.995 }, // 0.5% used (< 1%) -> null estimate, usedPct 0.5
      weekly: { remainingFraction: 0.90 }, // 10% used -> 4M / 0.10 = 40M, $8 / 0.10 = $80
    },
    {
      key: 'argon',
      label: 'Argon',
      fiveHour: null,
      weekly: { remainingFraction: 0.95 }, // 5% used -> 1M / 0.05 = 20M, $2 / 0.05 = $40
    },
  ];

  const est = buildWeeklyQuotaEstimates(weeklyUsage, quotaGroups, {});
  assert.equal(est.groups.length, 3);

  // Gemini: [5h, weekly]
  assert.equal(est.groups[0].rows.length, 2);
  assert.equal(est.groups[0].rows[0].window, '5h');
  assert.equal(est.groups[0].rows[0].actualTokens, 2_000_000);
  assert.equal(est.groups[0].rows[0].estimatedTotalTokens, 20_000_000);
  assert.equal(est.groups[0].rows[0].estimatedTotalCostUsd, 40);
  assert.equal(est.groups[0].rows[1].window, 'weekly');
  assert.equal(est.groups[0].rows[1].actualTokens, 20_000_000);
  assert.equal(est.groups[0].rows[1].estimatedTotalTokens, 50_000_000);
  assert.equal(est.groups[0].rows[1].estimatedTotalCostUsd, 100);

  // GPT&Claude: [5h (<1%), weekly]
  assert.equal(est.groups[1].rows.length, 2);
  assert.equal(est.groups[1].rows[0].window, '5h');
  assert.equal(est.groups[1].rows[0].usedPct, 0.5);
  assert.equal(est.groups[1].rows[0].estimatedTotalTokens, null);
  assert.equal(est.groups[1].rows[1].window, 'weekly');
  assert.equal(est.groups[1].rows[1].estimatedTotalTokens, 40_000_000);
  assert.equal(est.groups[1].rows[1].estimatedTotalCostUsd, 80);

  // Argon: [weekly]
  assert.equal(est.groups[2].rows.length, 1);
  assert.equal(est.groups[2].rows[0].window, 'weekly');
  assert.equal(est.groups[2].rows[0].estimatedTotalTokens, 20_000_000);
  assert.equal(est.groups[2].rows[0].estimatedTotalCostUsd, 40);
});

test('buildWeeklyQuotaEstimates enforces canonical order, keeps Argon weekly-only, and returns null weekly totals when only 5h extrapolates', () => {
  const nowMs = Date.parse('2026-11-23T12:00:00.000Z');
  const fhResetIso = new Date(nowMs + 3 * 3600_000).toISOString();
  const fhCutoffs = resolveFiveHourCutoffs(
    {},
    [{ key: 'gemini', fiveHour: { resetTime: fhResetIso } }],
    nowMs,
  );
  assert.equal(fhCutoffs.gemini, Date.parse(fhResetIso) - FIVE_HOURS_MS);

  const weeklyUsage = {
    windowDays: 7,
    scannedSessions: 2,
    totalTokens: 1_000_000,
    totalCostUsd: 2,
    totalCacheSavedUsd: 0.5,
    byGroup: {
      gemini: { tokens: 1_000_000, costUsd: 2, cacheSavedUsd: 0.5, turns: 4 },
    },
    byGroupFiveHour: {
      gemini: { tokens: 1_000_000, costUsd: 2, cacheSavedUsd: 0.5, turns: 4 },
    },
  };

  // Deliberately unsorted input + Argon mistakenly carrying a fiveHour object;
  // only Gemini 5h >= 1% used while all weekly buckets are < 1% used.
  const est = buildWeeklyQuotaEstimates(
    weeklyUsage,
    [
      {
        key: 'argon',
        label: 'Argon',
        fiveHour: { remainingFraction: 0.8 },
        weekly: { remainingFraction: 0.998 },
      },
      {
        key: 'gpt_claude',
        label: 'GPT&Claude',
        fiveHour: { remainingFraction: 1.0 },
        weekly: { remainingFraction: 1.0 },
      },
      {
        key: 'gemini',
        label: 'Gemini',
        fiveHour: { remainingFraction: 0.90 }, // 10% used -> 5h extrapolates
        weekly: { remainingFraction: 0.995 }, // 0.5% used -> weekly does NOT extrapolate
      },
    ],
    {},
  );

  assert.deepEqual(
    est.groups.map((g) => g.key),
    ['gemini', 'gpt_claude', 'argon'],
  );
  assert.equal(est.groups[2].rows.length, 1);
  assert.equal(est.groups[2].fiveHourEstimate, null);
  assert.equal(est.hasExtrapolation, true);
  assert.equal(est.estimatedCombinedWeeklyTokens, null);
  assert.equal(est.estimatedCombinedWeeklyCostUsd, null);
});
