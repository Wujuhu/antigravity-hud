/**
 * Quota Cycle Anchor store for accurate 5-hour & weekly token/cost extrapolation.
 *
 * 5h and weekly anchors are tracked under strictly isolated keys (`<group>:5h`
 * vs `<group>`) with independent cycle durations (5h vs 7d) so resetting one
 * bucket can NEVER pollute or reset the other bucket's baseline.
 *
 * State machine per bucket handles all real-world quota lifecycles:
 *   1. Idle Full (`idleFull: true`): when remainingFraction >= 0.9999, countdown
 *      has not started yet; we stay idle without false reset triggers even if
 *      `resetTime` is empty or sliding.
 *   2. Cycle Activation (`idleFull -> active`): on first real consumption (< 0.9999),
 *      `cycleStartMs` locks onto the exact activation moment (`resetTimeMs - windowMs`).
 *   3. Natural Reset vs. Official Early Manual Reset (when resetTime jumps forward).
 *   4. Major Official Partial Top-up (>= +20% jump without reaching 1.0).
 *
 * Background updates perform O(1) numeric comparisons only and never read
 * transcript files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './config.mjs';

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const ANCHOR_SCHEMA_VERSION = 3;
const FULL_THRESHOLD = 0.9999;
const START_DRIFT_HEAL_MS = 5 * 60 * 1000; // Heal full-anchor cycleStartMs drifting > 5m behind resetTime - window
const WEEKLY_RESET_SHIFT_MS = 60 * 60 * 1000; // > 1 hour jump in weekly resetTime
const FIVE_HOUR_RESET_SHIFT_MS = 15 * 60 * 1000; // > 15 min jump in 5h resetTime
// Only treat a large (>= 20%) upward jump without resetTime shift as an official manual top-up;
// smaller bounces (e.g. 0.5%-10% during 5h bucket resets or backend pre-charge reconciliation)
// must NOT wipe the current cycle baseline.
const MANUAL_RESET_RISE_THRESHOLD = 0.20;
const PERSIST_DROP_DELTA = 0.002; // Persist monotonic progress only when moved >= 0.2%

export function anchorKeyFor(groupKey, windowKind = 'weekly') {
  const k = typeof groupKey === 'string' ? groupKey.trim() : '';
  if (!k) return '';
  return windowKind === '5h' ? `${k}:5h` : k;
}

function toFiniteFraction(bucket) {
  if (!bucket || typeof bucket !== 'object') return null;
  if (Number.isFinite(Number(bucket.remainingFraction))) {
    return Math.max(0, Math.min(1, Number(bucket.remainingFraction)));
  }
  if (Number.isFinite(Number(bucket.remainingPctExact))) {
    return Math.max(0, Math.min(1, Number(bucket.remainingPctExact) / 100));
  }
  if (Number.isFinite(Number(bucket.remainingPct))) {
    return Math.max(0, Math.min(1, Number(bucket.remainingPct) / 100));
  }
  return null;
}

export function toResetTimeMs(bucket, nowMs = Date.now()) {
  if (!bucket || typeof bucket !== 'object') return null;
  if (Number.isFinite(Number(bucket.resetTimeMs)) && Number(bucket.resetTimeMs) > 0) {
    return Number(bucket.resetTimeMs);
  }
  if (typeof bucket.resetTime === 'string' && bucket.resetTime.trim()) {
    const parsed = Date.parse(bucket.resetTime);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (Number.isFinite(Number(bucket.remainingMs)) && Number(bucket.remainingMs) > 0) {
    return nowMs + Number(bucket.remainingMs);
  }
  return null;
}

function updateSingleBucketAnchor({
  prev,
  bucket,
  windowMs,
  resetShiftMs,
  nowMs,
}) {
  const frac = toFiniteFraction(bucket);
  if (frac === null) {
    return { anchor: prev, changed: false, shouldPersist: false };
  }
  const resetTimeMs = toResetTimeMs(bucket, nowMs);
  const isFullNow = frac >= FULL_THRESHOLD;

  // Case 0: Cold start (first time seeing this bucket)
  if (!prev) {
    if (isFullNow) {
      return {
        anchor: {
          v: ANCHOR_SCHEMA_VERSION,
          cycleStartMs: nowMs,
          resetTimeMs: null,
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: true,
          reason: 'idle_full',
        },
        changed: true,
        shouldPersist: true,
      };
    }
    const naturalStart =
      resetTimeMs !== null && resetTimeMs - windowMs <= nowMs
        ? resetTimeMs - windowMs
        : null;
    return {
      anchor: {
        v: ANCHOR_SCHEMA_VERSION,
        cycleStartMs: naturalStart ?? nowMs,
        resetTimeMs,
        anchorFraction: naturalStart !== null ? 1.0 : frac,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: naturalStart !== null ? 'natural_window' : 'first_seen',
      },
      changed: true,
      shouldPersist: true,
    };
  }

  // Migration self-heal #1: recover v1 anchors falsely truncated to `partial_topup`
  // by the legacy 0.5% rise threshold while the actual window never reset.
  if (
    !isFullNow &&
    prev.reason === 'partial_topup' &&
    Number(prev.v || 1) < 2 &&
    resetTimeMs !== null &&
    resetTimeMs - windowMs <= nowMs &&
    (prev.resetTimeMs === null || Math.abs(resetTimeMs - prev.resetTimeMs) <= resetShiftMs)
  ) {
    return {
      anchor: {
        v: ANCHOR_SCHEMA_VERSION,
        cycleStartMs: resetTimeMs - windowMs,
        resetTimeMs,
        anchorFraction: 1.0,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: 'natural_window',
      },
      changed: true,
      shouldPersist: true,
    };
  }

  // Migration self-heal #2: recover v1/v2 full-baseline anchors whose `cycleStartMs`
  // was truncated later than the true cycle start (`resetTimeMs - windowMs`) after a
  // transient `idleFull` observation, causing early-cycle local usage to be dropped.
  if (
    !isFullNow &&
    !prev.idleFull &&
    Number(prev.v || 1) < ANCHOR_SCHEMA_VERSION &&
    Number(prev.anchorFraction ?? 1) >= FULL_THRESHOLD &&
    prev.reason !== 'partial_topup' &&
    resetTimeMs !== null
  ) {
    const inferredStart = resetTimeMs - windowMs;
    const prevStart = Number(prev.cycleStartMs || 0);
    if (inferredStart <= nowMs && prevStart > inferredStart + START_DRIFT_HEAL_MS) {
      return {
        anchor: {
          v: ANCHOR_SCHEMA_VERSION,
          cycleStartMs: inferredStart,
          resetTimeMs,
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: false,
          reason: 'natural_window',
        },
        changed: true,
        shouldPersist: true,
      };
    }
  }

  // Case 1: Currently full (countdown paused / waiting for first consumption)
  if (isFullNow) {
    if (prev.idleFull) {
      return {
        anchor: {
          ...prev,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
        },
        changed: false,
        shouldPersist: false,
      };
    }
    const oldResetReached =
      prev.resetTimeMs !== null && nowMs >= prev.resetTimeMs - 60_000;
    return {
      anchor: {
        v: ANCHOR_SCHEMA_VERSION,
        cycleStartMs: nowMs,
        resetTimeMs: null,
        anchorFraction: 1.0,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: true,
        reason: oldResetReached ? 'natural_reset' : 'manual_reset',
      },
      changed: true,
      shouldPersist: true,
    };
  }

  // Case 2: Transitioning out of Idle Full on first real consumption.
  // Always align to the authoritative server cycle start (`resetTimeMs - windowMs`)
  // whenever available so local numerator and quota denominator share the exact same
  // origin even if `idleFull` was entered late or triggered by a transient 1.0 reading.
  if (prev.idleFull) {
    const inferredStart = resetTimeMs !== null ? resetTimeMs - windowMs : null;
    const enteredFullAt = Number(prev.cycleStartMs || 0);
    const cycleStartMs =
      inferredStart !== null && inferredStart <= nowMs
        ? inferredStart
        : Math.max(enteredFullAt, Number(prev.lastObservedAtMs || enteredFullAt));
    return {
      anchor: {
        v: ANCHOR_SCHEMA_VERSION,
        cycleStartMs,
        resetTimeMs,
        anchorFraction: 1.0,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: 'cycle_activated',
      },
      changed: true,
      shouldPersist: true,
    };
  }

  // Case 3: Active cycle — resetTime jumped forward (missed idle_full while offline)
  const resetTimeAdvanced =
    resetTimeMs !== null &&
    prev.resetTimeMs !== null &&
    resetTimeMs - prev.resetTimeMs > resetShiftMs;

  if (resetTimeAdvanced) {
    const oldResetReached = nowMs >= prev.resetTimeMs - 60_000;
    const inferredStart = resetTimeMs - windowMs;
    const prevObsMs = Number(prev.lastObservedAtMs || 0);

    if (oldResetReached) {
      const cycleStartMs =
        inferredStart >= prev.resetTimeMs - 60_000 && inferredStart <= nowMs
          ? inferredStart
          : Math.max(prev.resetTimeMs - 60_000, Math.min(nowMs, inferredStart));
      return {
        anchor: {
          v: ANCHOR_SCHEMA_VERSION,
          cycleStartMs,
          resetTimeMs,
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: false,
          reason: 'natural_reset',
        },
        changed: true,
        shouldPersist: true,
      };
    }

    const cycleStartMs =
      inferredStart > prevObsMs && inferredStart <= nowMs ? inferredStart : nowMs;
    return {
      anchor: {
        v: ANCHOR_SCHEMA_VERSION,
        cycleStartMs,
        resetTimeMs,
        anchorFraction: frac >= 0.995 || inferredStart > prevObsMs ? 1.0 : frac,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: 'manual_reset',
      },
      changed: true,
      shouldPersist: true,
    };
  }

  // Case 4: Active cycle — official major partial top-up (>= 20% upward jump without reaching full)
  const isPartialTopUp = frac > Number(prev.lastFraction ?? 1) + MANUAL_RESET_RISE_THRESHOLD;
  if (isPartialTopUp) {
    return {
      anchor: {
        v: ANCHOR_SCHEMA_VERSION,
        cycleStartMs: nowMs,
        resetTimeMs: resetTimeMs ?? prev.resetTimeMs,
        anchorFraction: frac,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: 'partial_topup',
      },
      changed: true,
      shouldPersist: true,
    };
  }

  // Case 5: Normal consumption inside current active cycle (tolerates minor non-reset rebounds)
  const drop = Number(prev.lastFraction ?? frac) - frac;
  const updatedReset = resetTimeMs !== null ? resetTimeMs : prev.resetTimeMs;
  const inferredNaturalStart = updatedReset !== null ? updatedReset - windowMs : null;
  const shouldAlignNaturalStart =
    Number(prev.anchorFraction ?? 1) >= FULL_THRESHOLD &&
    (prev.reason === 'cycle_activated' || prev.reason === 'natural_window') &&
    inferredNaturalStart !== null &&
    inferredNaturalStart <= nowMs &&
    Number(prev.cycleStartMs || 0) > inferredNaturalStart + START_DRIFT_HEAL_MS;
  const nextCycleStartMs = shouldAlignNaturalStart ? inferredNaturalStart : prev.cycleStartMs;
  const shouldPersist =
    drop >= PERSIST_DROP_DELTA ||
    updatedReset !== prev.resetTimeMs ||
    shouldAlignNaturalStart ||
    Number(prev.v || 1) < ANCHOR_SCHEMA_VERSION;
  const changed =
    frac !== prev.lastFraction ||
    updatedReset !== prev.resetTimeMs ||
    shouldAlignNaturalStart;

  return {
    anchor: {
      ...prev,
      v: ANCHOR_SCHEMA_VERSION,
      cycleStartMs: nextCycleStartMs,
      resetTimeMs: updatedReset,
      lastFraction: frac,
      lastObservedAtMs: nowMs,
      idleFull: false,
    },
    changed,
    shouldPersist,
  };
}

/**
 * Pure state transition: independently update weekly and 5h anchors from observed quota groups.
 * Returns `{ anchors, changed, shouldPersist }`.
 */
export function updateAnchorsFromQuotaGroups(currentAnchors = {}, quotaGroups = [], nowMs = Date.now()) {
  const next = {};
  for (const [k, v] of Object.entries(currentAnchors || {})) {
    if (v && typeof v === 'object') next[k] = { ...v };
  }

  let changed = false;
  let shouldPersist = false;

  for (const grp of quotaGroups || []) {
    const key = typeof grp?.key === 'string' ? grp.key : '';
    if (!key) continue;

    // 1. Weekly bucket anchor (stored under `<key>`)
    if (grp.weekly) {
      const wkKey = anchorKeyFor(key, 'weekly');
      const res = updateSingleBucketAnchor({
        prev: next[wkKey] || null,
        bucket: grp.weekly,
        windowMs: SEVEN_DAYS_MS,
        resetShiftMs: WEEKLY_RESET_SHIFT_MS,
        nowMs,
      });
      if (res.anchor) next[wkKey] = res.anchor;
      if (res.changed) changed = true;
      if (res.shouldPersist) shouldPersist = true;
    }

    // 2. 5-hour bucket anchor (stored strictly independently under `<key>:5h`)
    if (grp.fiveHour) {
      const fhKey = anchorKeyFor(key, '5h');
      const res = updateSingleBucketAnchor({
        prev: next[fhKey] || null,
        bucket: grp.fiveHour,
        windowMs: FIVE_HOURS_MS,
        resetShiftMs: FIVE_HOUR_RESET_SHIFT_MS,
        nowMs,
      });
      if (res.anchor) next[fhKey] = res.anchor;
      if (res.changed) changed = true;
      if (res.shouldPersist) shouldPersist = true;
    }
  }

  return { anchors: next, changed, shouldPersist };
}

/**
 * Persistent disk-backed anchor store.
 */
export function createQuotaAnchorStore(dataDir) {
  const anchorFile = path.join(dataDir, 'quota_anchors.json');
  let anchors = null;

  function loadSync() {
    if (anchors !== null) return anchors;
    try {
      if (fs.existsSync(anchorFile)) {
        const parsed = JSON.parse(fs.readFileSync(anchorFile, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          anchors = parsed;
          return anchors;
        }
      }
    } catch {
      // Ignore corrupted anchor file and rebuild cleanly
    }
    anchors = {};
    return anchors;
  }

  function observe(quotaGroups = [], nowMs = Date.now()) {
    const current = loadSync();
    const res = updateAnchorsFromQuotaGroups(current, quotaGroups, nowMs);
    anchors = res.anchors;
    if (res.shouldPersist) {
      atomicWriteJson(anchorFile, anchors).catch(() => {});
    }
    return anchors;
  }

  async function resetAll() {
    anchors = {};
    await atomicWriteJson(anchorFile, anchors);
    return anchors;
  }

  return {
    anchorFile,
    getAll: loadSync,
    observe,
    resetAll,
  };
}
