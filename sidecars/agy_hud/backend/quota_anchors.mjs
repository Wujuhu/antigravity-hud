/**
 * Quota Cycle Anchor store for accurate weekly token & cost extrapolation.
 *
 * Tracks per-group weekly quota anchors so both:
 *   1. Scheduled natural resets (`resetTimeMs` advances by > 1 hour)
 *   2. Ad-hoc / manual provider resets or partial top-ups (`remainingFraction` jumps upward)
 * cleanly start a new measurement window without mixing prior-cycle local logs.
 *
 * Background updates perform O(1) numeric comparisons only and never read
 * transcript files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './config.mjs';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NATURAL_RESET_SHIFT_MS = 60 * 60 * 1000; // > 1 hour jump in resetTime => natural reset
const MANUAL_RESET_RISE_THRESHOLD = 0.005; // > 0.5% upward jump in remainingFraction => manual reset/top-up
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
    const prev = next[key] || null;

    if (!prev) {
      // Cold start: if resetTime implies a natural 7-day cycle already in progress and not full, align to resetTime - 7d
      const naturalStart =
        resetTimeMs !== null && resetTimeMs - SEVEN_DAYS_MS <= nowMs
          ? resetTimeMs - SEVEN_DAYS_MS
          : null;
      const isFullNow = frac >= 0.9999;

      next[key] = {
        cycleStartMs: isFullNow ? nowMs : (naturalStart ?? nowMs),
        resetTimeMs,
        anchorFraction: isFullNow ? frac : (naturalStart !== null ? 1.0 : frac),
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        reason: isFullNow ? 'first_seen_full' : (naturalStart !== null ? 'natural_window' : 'first_seen'),
      };
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Rule 1: Reset time jumped forward > 1 hour
    // Distinguish scheduled natural reset (old resetTime already reached) vs.
    // official early manual reset that also extends resetTime by a week.
    const resetTimeAdvanced =
      resetTimeMs !== null &&
      prev.resetTimeMs !== null &&
      resetTimeMs - prev.resetTimeMs > NATURAL_RESET_SHIFT_MS;

    if (resetTimeAdvanced) {
      const oldResetReached = nowMs >= prev.resetTimeMs - 60_000;
      const inferredStart = resetTimeMs - SEVEN_DAYS_MS;
      const prevObsMs = Number(prev.lastObservedAtMs || 0);

      if (oldResetReached) {
        // Scheduled natural weekly reset
        const cycleStartMs = Math.max(
          prev.resetTimeMs - 60_000,
          Math.min(nowMs, inferredStart),
        );
        next[key] = {
          cycleStartMs,
          resetTimeMs,
          anchorFraction: 1.0,
          lastFraction: frac,
          lastObservedAtMs: nowMs,
          reason: 'natural_reset',
        };
      } else {
        // Official early manual reset that also pushed resetTime forward:
        // Only trust `resetTime - 7d` if it falls cleanly in (prevObsMs, nowMs];
        // otherwise anchor at `nowMs` so pre-reset usage is never mixed in.
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
          reason: 'manual_reset',
        };
      }
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Rule 2: Official manual reset or partial top-up (remainingFraction rose noticeably)
    const isManualResetOrTopUp = frac > Number(prev.lastFraction ?? 1) + MANUAL_RESET_RISE_THRESHOLD;

    if (isManualResetOrTopUp) {
      next[key] = {
        cycleStartMs: nowMs,
        resetTimeMs: resetTimeMs ?? prev.resetTimeMs,
        anchorFraction: frac,
        lastFraction: frac,
        lastObservedAtMs: nowMs,
        reason: frac >= 0.995 ? 'manual_reset' : 'partial_topup',
      };
      changed = true;
      shouldPersist = true;
      continue;
    }

    // Rule 3: Normal monotonic consumption inside current cycle
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
