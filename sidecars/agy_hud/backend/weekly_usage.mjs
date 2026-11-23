/**
 * Weekly token & API-equivalent cost estimator + cycle-aligned quota extrapolator.
 *
 * Supports:
 *   - Precise floating-point quota fraction accounting (`remainingFraction`)
 *   - Threshold >= 1% net quota change (`deltaUsed >= 0.01`)
 *   - Per-group cycle anchors that simultaneously handle scheduled natural resets,
 *     ad-hoc official manual resets, and partial quota top-ups.
 *
 * Model rate table adapted from ahmetdotsh/agy-usage (usage_reader.mjs, MIT License)
 * and aishadiaodeqishui/agy-monitor (telemetry.mjs, MIT License).
 */

import fs from 'node:fs';
import path from 'node:path';
import { findAppDataDirs } from './analyzer.mjs';
import {
  FIVE_HOURS_MS,
  SEVEN_DAYS_MS,
  anchorKeyFor,
} from './quota_anchors.mjs';

export const MIN_USED_FRACTION_FOR_EXTRAPOLATION = 0.01; // >= 1% net quota change triggers estimation
const MAX_USED_FRACTION_FOR_EXTRAPOLATION = 0.999;

// Standard (non-promotional) API-equivalent rates in USD per 1M tokens
export const RATE_TABLE = {
  'gemini-4-carbon': { inPerM: 4, outPerM: 20, crPerM: 0.2 },
  'gemini-4-argon': { inPerM: 4, outPerM: 20, crPerM: 0.2 },
  'gemini-4-neon': { inPerM: 2, outPerM: 12, crPerM: 0.1 },
  'gemini-4-hydrogen': { inPerM: 1.5, outPerM: 7.5, crPerM: 0.075 },
  'gemini-pro-orchestrator': { inPerM: 4, outPerM: 20, crPerM: 0.2 },
  'gemini-3.8-flash': { inPerM: 1.5, outPerM: 7.5, crPerM: 0.15 },
  'gemini-3.7-flash': { inPerM: 0.75, outPerM: 3.75, crPerM: 0.075 },
  'gemini-3.6-flash': { inPerM: 0.75, outPerM: 3.75, crPerM: 0.075 },
  'gemini-3.5-flash': { inPerM: 1.5, outPerM: 9, crPerM: 0.15 },
  'gemini-3.5-flash-lite': { inPerM: 0.3, outPerM: 2.5, crPerM: 0.03 },
  'gemini-3.1-pro': { inPerM: 2, outPerM: 12, crPerM: 0.2 },
  'gemini-2.5-pro': { inPerM: 1.25, outPerM: 10, crPerM: 0.125 },
  'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5, crPerM: 0.03 },
  'claude-opus-5-5': { inPerM: 4, outPerM: 20, crPerM: 0.2 },
  'claude-opus-5': { inPerM: 5, outPerM: 25, crPerM: 0.5 },
  'claude-opus-4-6': { inPerM: 5, outPerM: 25, crPerM: 0.5 },
  'claude-opus-4-5': { inPerM: 5, outPerM: 25, crPerM: 0.5 },
  'claude-opus-4': { inPerM: 15, outPerM: 75, crPerM: 1.5 },
  'claude-sonnet-5-5': { inPerM: 2, outPerM: 10, crPerM: 0.1 },
  'claude-sonnet-4-6': { inPerM: 3, outPerM: 15, crPerM: 0.3 },
  'claude-sonnet-4-5': { inPerM: 3, outPerM: 15, crPerM: 0.3 },
  'claude-sonnet-4': { inPerM: 3, outPerM: 15, crPerM: 0.3 },
  'claude-haiku-5-5': { inPerM: 0.1, outPerM: 0.5, crPerM: 0.01 },
  'claude-haiku-4-5': { inPerM: 1, outPerM: 5, crPerM: 0.1 },
  'gpt-oss-120b': { inPerM: 0.15, outPerM: 0.6, crPerM: 0.15 },
};

const DEFAULT_FALLBACK_RATE = { inPerM: 1.5, outPerM: 9.0, crPerM: 0.15 };
const EFFORT_SUFFIX_RE = /-(?:extra-low|low|medium|high|xhigh|max|extra|tiered|thinking|control|agent|customtools)$/i;

export function normalizeModelRateKey(rawModel = '') {
  let slug = String(rawModel || '')
    .trim()
    .toLowerCase()
    .replace(/^models\//, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, '-');
  if (slug.startsWith('claude-')) {
    slug = slug.replace(/\./g, '-');
  }
  if (!slug) return '';
  for (let i = 0; i < 3; i++) {
    const next = slug.replace(EFFORT_SUFFIX_RE, '');
    if (next === slug) break;
    slug = next;
  }
  return slug;
}

export function resolveModelRates(rawModel = '') {
  const slug = normalizeModelRateKey(rawModel);
  if (!slug) return DEFAULT_FALLBACK_RATE;
  if (RATE_TABLE[slug]) return RATE_TABLE[slug];

  for (const [key, rates] of Object.entries(RATE_TABLE)) {
    if (slug.startsWith(key) || slug.includes(key)) {
      return rates;
    }
  }

  if (slug.includes('argon') || slug.includes('carbon') || slug.includes('opus')) {
    return { inPerM: 4, outPerM: 20, crPerM: 0.2 };
  }
  if (slug.includes('sonnet')) return { inPerM: 3, outPerM: 15, crPerM: 0.3 };
  if (slug.includes('haiku')) return { inPerM: 1, outPerM: 5, crPerM: 0.1 };
  if (slug.includes('neon') || slug.includes('pro')) return { inPerM: 2, outPerM: 12, crPerM: 0.15 };
  if (slug.includes('flash-lite') || slug.includes('lite')) return { inPerM: 0.3, outPerM: 2.5, crPerM: 0.03 };
  if (slug.includes('flash') || slug.includes('hydrogen')) return { inPerM: 1.5, outPerM: 7.5, crPerM: 0.1 };
  if (slug.includes('gpt')) return { inPerM: 2.5, outPerM: 10, crPerM: 0.25 };
  return DEFAULT_FALLBACK_RATE;
}

export function classifyModelQuotaGroup(modelId = '') {
  const low = String(modelId || '').toLowerCase();
  if (low.includes('argon')) return 'argon';
  if (
    low.includes('claude') ||
    low.includes('gpt') ||
    low.includes('sonnet') ||
    low.includes('opus') ||
    low.includes('haiku') ||
    low.includes('o1') ||
    low.includes('o3') ||
    low.includes('o4')
  ) {
    return 'gpt_claude';
  }
  return 'gemini';
}

export function estimateTurnCostUsd(modelId, uncachedInput = 0, cacheRead = 0, output = 0) {
  const rates = resolveModelRates(modelId);
  const inTok = Math.max(0, Number(uncachedInput) || 0);
  const crTok = Math.max(0, Number(cacheRead) || 0);
  const outTok = Math.max(0, Number(output) || 0);

  const actualUsd = (inTok * rates.inPerM + crTok * rates.crPerM + outTok * rates.outPerM) / 1_000_000;
  const noCacheUsd = ((inTok + crTok) * rates.inPerM + outTok * rates.outPerM) / 1_000_000;
  const savedUsd = Math.max(0, noCacheUsd - actualUsd);

  return {
    costUsd: actualUsd,
    cacheSavedUsd: savedUsd,
  };
}

/**
 * Aggregate transcript steps using either a uniform cutoffMs or per-group cutoff timestamps.
 * `groupCutoffs` maps quota group key -> cycleStartMs (for cycle-aligned delta counting).
 */
export function aggregateWeeklySteps(steps = [], defaultCutoffMs = 0, groupCutoffs = null) {
  const groups = {
    gemini: { tokens: 0, uncachedInput: 0, cacheRead: 0, output: 0, costUsd: 0, cacheSavedUsd: 0, turns: 0 },
    gpt_claude: { tokens: 0, uncachedInput: 0, cacheRead: 0, output: 0, costUsd: 0, cacheSavedUsd: 0, turns: 0 },
    argon: { tokens: 0, uncachedInput: 0, cacheRead: 0, output: 0, costUsd: 0, cacheSavedUsd: 0, turns: 0 },
  };

  let totalTokens = 0;
  let totalUncachedInput = 0;
  let totalCacheRead = 0;
  let totalOutput = 0;
  let totalCostUsd = 0;
  let totalCacheSavedUsd = 0;
  let totalTurns = 0;

  for (const step of steps) {
    if (!step || step.type !== 'PLANNER_RESPONSE') continue;
    const ts = step.created_at ? Date.parse(step.created_at) : Number.NaN;

    const inTok = Math.max(0, Number(step.input_tokens || 0));
    const crTok = Math.max(0, Number(step.cache_read_tokens || 0));
    const outTok = Math.max(0, Number(step.output_tokens || 0));
    const turnTok = inTok + crTok + outTok;
    if (turnTok <= 0) continue;

    const modelId = typeof step.model === 'string' ? step.model : '';
    const grpKey = classifyModelQuotaGroup(modelId);
    const effectiveCutoff =
      groupCutoffs && Number.isFinite(Number(groupCutoffs[grpKey]))
        ? Number(groupCutoffs[grpKey])
        : defaultCutoffMs;

    if (effectiveCutoff > 0 && Number.isFinite(ts) && ts < effectiveCutoff) continue;

    const { costUsd, cacheSavedUsd } = estimateTurnCostUsd(modelId, inTok, crTok, outTok);

    const g = groups[grpKey];
    g.tokens += turnTok;
    g.uncachedInput += inTok;
    g.cacheRead += crTok;
    g.output += outTok;
    g.costUsd += costUsd;
    g.cacheSavedUsd += cacheSavedUsd;
    g.turns += 1;

    totalTokens += turnTok;
    totalUncachedInput += inTok;
    totalCacheRead += crTok;
    totalOutput += outTok;
    totalCostUsd += costUsd;
    totalCacheSavedUsd += cacheSavedUsd;
    totalTurns += 1;
  }

  for (const g of Object.values(groups)) {
    g.costUsd = Number(g.costUsd.toFixed(4));
    g.cacheSavedUsd = Number(g.cacheSavedUsd.toFixed(4));
  }

  return {
    totalTokens,
    totalUncachedInput,
    totalCacheRead,
    totalOutput,
    totalCostUsd: Number(totalCostUsd.toFixed(2)),
    totalCacheSavedUsd: Number(totalCacheSavedUsd.toFixed(2)),
    totalTurns,
    byGroup: groups,
  };
}

const fileStepsCache = new Map();
let cachedWeeklySnapshot = null;
let cachedWeeklySig = '';
let cachedWeeklyAtMs = 0;

function readTranscriptStepsCached(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const sig = `${stat.mtimeMs}:${stat.size}`;
    const hit = fileStepsCache.get(filePath);
    if (hit && hit.sig === sig) return hit.steps;

    const raw = fs.readFileSync(filePath, 'utf8');
    const steps = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('PLANNER_RESPONSE')) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && parsed.type === 'PLANNER_RESPONSE') {
          steps.push({
            type: 'PLANNER_RESPONSE',
            model: parsed.model || '',
            input_tokens: parsed.input_tokens || 0,
            cache_read_tokens: parsed.cache_read_tokens || 0,
            output_tokens: parsed.output_tokens || 0,
            created_at: parsed.created_at || '',
          });
        }
      } catch {
        // Ignore partial line while file is being appended
      }
    }
    fileStepsCache.set(filePath, { sig, steps });
    if (fileStepsCache.size > 400) {
      const oldestKey = fileStepsCache.keys().next().value;
      fileStepsCache.delete(oldestKey);
    }
    return steps;
  } catch {
    return [];
  }
}

function resolveWindowCutoffs(anchors = {}, quotaGroups = [], windowKind = 'weekly', nowMs = Date.now()) {
  const windowMs = windowKind === '5h' ? FIVE_HOURS_MS : SEVEN_DAYS_MS;
  const defaultCutoff = nowMs - windowMs;
  const cutoffs = {
    gemini: defaultCutoff,
    gpt_claude: defaultCutoff,
    argon: defaultCutoff,
  };

  for (const grp of quotaGroups || []) {
    const key = grp?.key;
    if (!key) continue;
    const ancKey = anchorKeyFor(key, windowKind);
    const anc = anchors?.[ancKey];
    if (anc && Number.isFinite(Number(anc.cycleStartMs)) && Number(anc.cycleStartMs) > 0) {
      cutoffs[key] = Number(anc.cycleStartMs);
      continue;
    }
    const bucket = windowKind === '5h' ? grp?.fiveHour : grp?.weekly;
    const resetMs =
      bucket && Number.isFinite(Number(bucket.resetTimeMs)) && Number(bucket.resetTimeMs) > 0
        ? Number(bucket.resetTimeMs)
        : bucket && Number.isFinite(Number(bucket.remainingMs)) && Number(bucket.remainingMs) > 0
          ? nowMs + Number(bucket.remainingMs)
          : null;
    if (resetMs !== null && resetMs - windowMs <= nowMs) {
      cutoffs[key] = resetMs - windowMs;
    }
  }

  return cutoffs;
}

export function resolveGroupCutoffs(anchors = {}, quotaGroups = [], nowMs = Date.now()) {
  return resolveWindowCutoffs(anchors, quotaGroups, 'weekly', nowMs);
}

export function resolveFiveHourCutoffs(anchors = {}, quotaGroups = [], nowMs = Date.now()) {
  return resolveWindowCutoffs(anchors, quotaGroups, '5h', nowMs);
}

/**
 * Scan local Antigravity brain directories once and independently aggregate
 * 5-hour and weekly consumption aligned to each bucket's own cycle anchor.
 */
export function scanWeeklyLocalUsage({
  appDataDirs = null,
  anchors = {},
  quotaGroups = [],
  nowMs = Date.now(),
  ttlMs = 60_000,
  force = false,
} = {}) {
  const groupCutoffs = resolveGroupCutoffs(anchors, quotaGroups, nowMs);
  const fiveHourCutoffs = resolveFiveHourCutoffs(anchors, quotaGroups, nowMs);
  const cutoffSig = JSON.stringify({ w: groupCutoffs, f: fiveHourCutoffs });
  if (!force && !appDataDirs && cachedWeeklySnapshot && cachedWeeklySig === cutoffSig && nowMs - cachedWeeklyAtMs < ttlMs) {
    return cachedWeeklySnapshot;
  }

  const dirs = Array.isArray(appDataDirs) ? appDataDirs : findAppDataDirs();
  const minCutoffMs = Math.min(
    nowMs - SEVEN_DAYS_MS,
    ...Object.values(groupCutoffs),
    ...Object.values(fiveHourCutoffs),
  );
  const collectedSteps = [];
  let scannedSessions = 0;

  for (const appData of dirs) {
    const brainDir = path.join(appData, 'brain');
    let entries = [];
    try {
      entries = fs.readdirSync(brainDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const transcriptPath = path.join(
        brainDir,
        entry.name,
        '.system_generated',
        'logs',
        'transcript.jsonl',
      );
      let stat;
      try {
        stat = fs.statSync(transcriptPath);
      } catch {
        continue;
      }
      if (stat.mtimeMs < minCutoffMs) continue;
      scannedSessions += 1;
      const fileSteps = readTranscriptStepsCached(transcriptPath);
      for (const s of fileSteps) collectedSteps.push(s);
    }
  }

  const agg = aggregateWeeklySteps(collectedSteps, nowMs - SEVEN_DAYS_MS, groupCutoffs);
  const agg5h = aggregateWeeklySteps(collectedSteps, nowMs - FIVE_HOURS_MS, fiveHourCutoffs);
  const result = {
    windowDays: 7,
    scannedSessions,
    scannedAtMs: nowMs,
    groupCutoffs,
    fiveHourCutoffs,
    byGroupFiveHour: agg5h.byGroup,
    ...agg,
  };

  if (!appDataDirs) {
    cachedWeeklySnapshot = result;
    cachedWeeklySig = cutoffSig;
    cachedWeeklyAtMs = nowMs;
  }
  return result;
}

function resolvePreciseFraction(wk) {
  if (!wk || typeof wk !== 'object') return null;
  if (wk.remainingFraction != null && Number.isFinite(Number(wk.remainingFraction))) {
    return Math.max(0, Math.min(1, Number(wk.remainingFraction)));
  }
  if (wk.remainingPctExact != null && Number.isFinite(Number(wk.remainingPctExact))) {
    return Math.max(0, Math.min(1, Number(wk.remainingPctExact) / 100));
  }
  if (wk.remainingPct != null && Number.isFinite(Number(wk.remainingPct))) {
    return Math.max(0, Math.min(1, Number(wk.remainingPct) / 100));
  }
  return null;
}

function computeBucketQuotaEstimate({ actual, bucket, anchor, windowKind }) {
  const currentFrac = resolvePreciseFraction(bucket);
  const anchorFrac =
    anchor && Number.isFinite(Number(anchor.anchorFraction))
      ? Math.max(0, Math.min(1, Number(anchor.anchorFraction)))
      : 1.0;

  const deltaUsedFrac =
    currentFrac !== null
      ? Math.max(0, Math.min(1, anchorFrac - currentFrac))
      : null;

  let estimatedTotalTokens = null;
  let estimatedTotalCostUsd = null;
  let confidence = 'insufficient';

  if (
    deltaUsedFrac !== null &&
    deltaUsedFrac >= MIN_USED_FRACTION_FOR_EXTRAPOLATION &&
    deltaUsedFrac <= MAX_USED_FRACTION_FOR_EXTRAPOLATION &&
    actual.tokens > 0
  ) {
    estimatedTotalTokens = Math.round(actual.tokens / deltaUsedFrac);
    estimatedTotalCostUsd = Number((actual.costUsd / deltaUsedFrac).toFixed(2));
    confidence = deltaUsedFrac >= 0.1 ? 'high' : deltaUsedFrac >= 0.03 ? 'medium' : 'low';
  }

  const deltaUsedPctExact =
    deltaUsedFrac !== null ? Number((deltaUsedFrac * 100).toFixed(1)) : null;

  return {
    window: windowKind,
    actualTokens: actual.tokens || 0,
    actualCostUsd: Number(Number(actual.costUsd || 0).toFixed(2)),
    remainingPct: currentFrac !== null ? Number((currentFrac * 100).toFixed(1)) : null,
    usedPct: deltaUsedPctExact,
    deltaUsedFraction: deltaUsedFrac !== null ? Number(deltaUsedFrac.toFixed(6)) : null,
    anchorFraction: anchorFrac,
    anchorReason: anchor?.reason || 'natural_window',
    estimatedTotalTokens,
    estimatedTotalCostUsd,
    confidence,
  };
}

/**
 * Combine cycle-aligned local consumption with high-precision floating-point
 * quota deltas (`deltaUsed = anchorFraction - currentFraction`) to extrapolate
 * estimated 5h and weekly token & USD capacity independently per group.
 *
 * Triggers whenever net quota change >= 1% (`deltaUsed >= 0.01`).
 */
export function buildWeeklyQuotaEstimates(weeklyUsage, quotaGroups = [], anchors = {}) {
  const byGroupWeekly = weeklyUsage?.byGroup || {};
  const byGroupFiveHour = weeklyUsage?.byGroupFiveHour || {};
  const groupEstimates = [];

  for (const grp of quotaGroups || []) {
    const emptyActual = { tokens: 0, costUsd: 0, cacheSavedUsd: 0, turns: 0 };
    const actualWeekly = byGroupWeekly[grp.key] || emptyActual;
    const actualFiveHour = byGroupFiveHour[grp.key] || emptyActual;

    const wkEst = computeBucketQuotaEstimate({
      actual: actualWeekly,
      bucket: grp.weekly,
      anchor: anchors?.[anchorKeyFor(grp.key, 'weekly')] || null,
      windowKind: 'weekly',
    });

    const hasFiveHour = Boolean(grp.fiveHour) || grp.key === 'gemini' || grp.key === 'gpt_claude';
    const fhEst = hasFiveHour
      ? computeBucketQuotaEstimate({
          actual: actualFiveHour,
          bucket: grp.fiveHour || null,
          anchor: anchors?.[anchorKeyFor(grp.key, '5h')] || null,
          windowKind: '5h',
        })
      : null;

    // Row order: Gemini -> [5h, weekly]; GPT&Claude -> [5h, weekly]; Argon -> [weekly]
    const rows = fhEst ? [fhEst, wkEst] : [wkEst];

    groupEstimates.push({
      key: grp.key,
      label: grp.label,
      actualTokens7d: wkEst.actualTokens,
      actualCostUsd7d: wkEst.actualCostUsd,
      weeklyRemainingPct: wkEst.remainingPct,
      weeklyUsedPct: wkEst.usedPct,
      deltaUsedFraction: wkEst.deltaUsedFraction,
      anchorFraction: wkEst.anchorFraction,
      anchorReason: wkEst.anchorReason,
      estimatedTotalTokens: wkEst.estimatedTotalTokens,
      estimatedTotalCostUsd: wkEst.estimatedTotalCostUsd,
      confidence: wkEst.confidence,
      fiveHourEstimate: fhEst,
      weeklyEstimate: wkEst,
      rows,
    });
  }

  const sumEstimatedTokens = groupEstimates.reduce(
    (sum, item) => sum + (item.estimatedTotalTokens || 0),
    0,
  );
  const sumEstimatedCostUsd = Number(
    groupEstimates
      .reduce((sum, item) => sum + (item.estimatedTotalCostUsd || 0), 0)
      .toFixed(2),
  );
  const hasExtrapolation = groupEstimates.some(
    (item) =>
      item.estimatedTotalTokens !== null ||
      (item.fiveHourEstimate && item.fiveHourEstimate.estimatedTotalTokens !== null),
  );

  return {
    windowDays: weeklyUsage?.windowDays || 7,
    scannedSessions: weeklyUsage?.scannedSessions || 0,
    actualTotalTokens7d: weeklyUsage?.totalTokens || 0,
    actualTotalCostUsd7d: weeklyUsage?.totalCostUsd || 0,
    actualCacheSavedUsd7d: weeklyUsage?.totalCacheSavedUsd || 0,
    hasExtrapolation,
    estimatedCombinedWeeklyTokens: hasExtrapolation ? sumEstimatedTokens : null,
    estimatedCombinedWeeklyCostUsd: hasExtrapolation ? sumEstimatedCostUsd : null,
    groups: groupEstimates,
  };
}
