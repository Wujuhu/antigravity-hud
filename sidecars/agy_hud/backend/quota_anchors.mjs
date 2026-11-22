/**
 * Quota Cycle Anchor store for accurate weekly token & cost extrapolation.
 *
 * State machine handles all real-world weekly quota lifecycles:
 *   1. Idle Full (`idleFull: true`): when remainingFraction >= 0.9999, countdown
 *      has not started yet; we stay idle without false reset triggers even if
 *      `resetTime` is empty or sliding.
 *   2. Cycle Activation (`idleFull -> active`): as soon as the user makes the first
 *      real consumption (< 0.9999), the countdown begins and `cycleStartMs` locks
 *      onto the exact activation moment (`resetTimeMs - 7d` when in range).
 *   3. Natural Reset vs. Official Early Manual Reset (even when resetTime shifts +7d).
 *   4. Official Partial Top-up (`remainingFraction` jumps upward without reaching 1.0).
 *
 * Background updates perform O(1) numeric comparisons only and never read
 * transcript files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './config.mjs';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FULL_THRESHOLD = 0.9999;
const NATURAL_RESET_SHIFT_MS = 60 * 60 * 1000; // > 1 hour jump in resetTime
const MANUAL_RESET_RISE_THRESHOLD = 0.005; // > 0.5% upward jump in remainingFraction
const PERSIST_DROP_DELTA = 0.002; // Persist monotonic progress only when moved >= 0.2%

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

function toResetTimeMs(bucket, nowMs) {
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

/**
 * Pure state transition: update anchor map from newly observed quota groups.
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
    const wk = grp?.weekly;
    if (!key || !wk) continue;

    const frac = toFiniteFraction(wk);
    if (frac === null) continue;
    const resetTimeMs = toResetTimeMs(wk, nowMs);
    const isFullNow = frac >= FULL_THRESHOLD;
    const prev = next[key] || null;

    // Case 0: Cold start (first time seeing this quota group)
    if (!prev) {
      if (isFullNow) {
        next[key] = {
          cycleStartMs: nowMs,
          resetTimeMs: null, // Countdown does not start until first consumption
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: true,
          reason: 'idle_full',
        };
      } else {
        const naturalStart =
          resetTimeMs !== null && resetTimeMs - SEVEN_DAYS_MS <= nowMs
            ? resetTimeMs - SEVEN_DAYS_MS
            : null;
        next[key] = {
          cycleStartMs: naturalStart ?? nowMs,
          resetTimeMs,
          anchorFraction: naturalStart !== null ? 1.0 : frac,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: false,
          reason: naturalStart !== null ? 'natural_window' : 'first_seen',
        };
      }
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Case 1: Currently full (countdown paused / waiting for first consumption)
    if (isFullNow) {
      if (prev.idleFull) {
        // Stay cleanly idle without false triggers or disk churn while user does nothing
        next[key] = {
          ...prev,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
        };
      } else {
        // Transitioned from active consumption back to full => reset occurred!
        const oldResetReached =
          prev.resetTimeMs !== null && nowMs >= prev.resetTimeMs - 60_000;
        next[key] = {
          cycleStartMs: nowMs,
          resetTimeMs: null, // Wait until first consumption activates the new countdown
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: true,
          reason: oldResetReached ? 'natural_reset' : 'manual_reset',
        };
        changed = true;
        shouldPersist = true;
      }
      continue;
    }

    // Case 2: Transitioning out of Idle Full on first real consumption!
    if (prev.idleFull) {
      const inferredStart = resetTimeMs !== null ? resetTimeMs - SEVEN_DAYS_MS : null;
      const enteredFullAt = Number(prev.cycleStartMs || 0);
      // Lock onto `resetTimeMs - 7d` if it falls cleanly after entering idle_full and <= now
      const cycleStartMs =
        inferredStart !== null &&
        inferredStart >= enteredFullAt - 60_000 &&
        inferredStart <= nowMs
          ? inferredStart
          : Math.max(enteredFullAt, Number(prev.lastObservedAtMs || enteredFullAt));

      next[key] = {
        cycleStartMs,
        resetTimeMs,
        anchorFraction: 1.0,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: 'cycle_activated',
      };
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Case 3: Active cycle — resetTime jumped forward > 1 hour (missed idle_full while offline)
    const resetTimeAdvanced =
      resetTimeMs !== null &&
      prev.resetTimeMs !== null &&
      resetTimeMs - prev.resetTimeMs > NATURAL_RESET_SHIFT_MS;

    if (resetTimeAdvanced) {
      const oldResetReached = nowMs >= prev.resetTimeMs - 60_000;
      const inferredStart = resetTimeMs - SEVEN_DAYS_MS;
      const prevObsMs = Number(prev.lastObservedAtMs || 0);

      if (oldResetReached) {
        // Scheduled natural reset occurred while offline, and user already started consuming
        // Note: because countdown starts on first consumption after reset, `resetTime - 7d`
        // may be later than `prev.resetTimeMs` — that exact moment is when the new cycle started!
        const cycleStartMs =
          inferredStart >= prev.resetTimeMs - 60_000 && inferredStart <= nowMs
            ? inferredStart
            : Math.max(prev.resetTimeMs - 60_000, Math.min(nowMs, inferredStart));
        next[key] = {
          cycleStartMs,
          resetTimeMs,
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: false,
          reason: 'natural_reset',
        };
      } else {
        // Official early manual reset that also pushed resetTime forward
        const cycleStartMs =
          inferredStart > prevObsMs && inferredStart <= nowMs
            ? inferredStart
            : nowMs;
        next[key] = {
          cycleStartMs,
          resetTimeMs,
          anchorFraction: frac >= 0.995 || inferredStart > prevObsMs ? 1.0 : frac,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          idleFull: false,
          reason: 'manual_reset',
        };
      }
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Case 4: Active cycle — official partial top-up (fraction jumped upward without reaching full)
    const isPartialTopUp = frac > Number(prev.lastFraction ?? 1) + MANUAL_RESET_RISE_THRESHOLD;
    if (isPartialTopUp) {
      next[key] = {
        cycleStartMs: nowMs,
        resetTimeMs: resetTimeMs ?? prev.resetTimeMs,
        anchorFraction: frac,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        idleFull: false,
        reason: 'partial_topup',
      };
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Case 5: Normal monotonic consumption inside current active cycle
    const drop = Number(prev.lastFraction ?? frac) - frac;
    const updatedReset = resetTimeMs !== null ? resetTimeMs : prev.resetTimeMs;
    if (drop >= PERSIST_DROP_DELTA || updatedReset !== prev.resetTimeMs) {
      shouldPersist = true;
    }
    if (frac !== prev.lastFraction || updatedReset !== prev.resetTimeMs) {
      changed = true;
    }
    next[key] = {
      ...prev,
      resetTimeMs: updatedReset,
      lastFraction: frac,
      lastObservedAtMs: nowMs,
      idleFull: false,
    };
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
