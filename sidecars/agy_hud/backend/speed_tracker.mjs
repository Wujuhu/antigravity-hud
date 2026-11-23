/**
 * Lightweight generation speed tracker adapted from aishadiaodeqishui/agy-monitor
 * (backend/telemetry.mjs, MIT License).
 *
 * Reads the active conversation's transcript.jsonl and derives per-turn and
 * session-average output generation speeds (tok/s) without scanning the entire disk.
 */

import fs from 'node:fs';

const MIN_DURATION_SEC = 0.25;
const MAX_REASONABLE_DURATION_SEC = 600;
const MAX_REASONABLE_TOK_PER_SEC = 1200;

function parseTimestampMs(raw) {
  if (!raw || typeof raw !== 'string') return Number.NaN;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Compute live current-turn composite speed & cache hit rate and across-turn
 * session averages directly from parsed JSONL transcript steps (aligned with
 * SQLite per-turn semantics when the conversation DB is unavailable).
 */
export function computeSpeedMetricsFromSteps(steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      latestTokPerSec: null,
      avgTokPerSec: null,
      lastDurationSec: null,
      lastOutputTokens: 0,
      lastTurnCacheHitPct: null,
      avgCacheHitPct: null,
      upstreamModelId: '',
      sampleCount: 0,
    };
  }

  const hasUserBoundaries = steps.some((s) => s && s.type === 'USER_INPUT');
  const turns = [];
  let currentTurn = null;
  let lastOutputTokens = 0;
  let upstreamModelId = '';
  let sampleCount = 0;

  const startNewTurn = () => {
    const t = {
      validOutTok: 0,
      validDurationSec: 0,
      promptTok: 0,
      cacheReadTok: 0,
      hasData: false,
    };
    turns.push(t);
    return t;
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    if (step.type === 'USER_INPUT') {
      currentTurn = startNewTurn();
      continue;
    }

    if (step.type !== 'PLANNER_RESPONSE') continue;

    if (!hasUserBoundaries || !currentTurn) {
      currentTurn = startNewTurn();
    }

    if (typeof step.model === 'string' && step.model.trim()) {
      upstreamModelId = step.model.trim();
    }

    const inTok = Math.max(0, Number(step.input_tokens || 0));
    const cacheReadTok = Math.max(0, Number(step.cache_read_tokens || 0));
    const outTok = Math.max(0, Number(step.output_tokens || 0));
    if (outTok > 0) {
      lastOutputTokens = outTok;
    }
    if (inTok + cacheReadTok > 0) {
      currentTurn.promptTok += inTok + cacheReadTok;
      currentTurn.cacheReadTok += cacheReadTok;
      currentTurn.hasData = true;
    }

    // Prefer explicit duration if recorded; otherwise measure against the next logged step
    let durationSec = Number(step.duration_sec || step.latency_sec || 0);
    if (!(durationSec > 0)) {
      const startMs = parseTimestampMs(step.created_at);
      let endMs = Number.NaN;
      if (step.completed_at) {
        endMs = parseTimestampMs(step.completed_at);
      } else if (i + 1 < steps.length) {
        endMs = parseTimestampMs(steps[i + 1]?.created_at);
      }
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        durationSec = (endMs - startMs) / 1000;
      }
    }

    if (
      outTok >= 8 &&
      Number.isFinite(durationSec) &&
      durationSec >= MIN_DURATION_SEC &&
      durationSec <= MAX_REASONABLE_DURATION_SEC
    ) {
      const rate = outTok / durationSec;
      if (Number.isFinite(rate) && rate > 0 && rate <= MAX_REASONABLE_TOK_PER_SEC) {
        currentTurn.validOutTok += outTok;
        currentTurn.validDurationSec += durationSec;
        currentTurn.hasData = true;
        sampleCount += 1;
      }
    }
  }

  const activeTurns = turns
    .filter((t) => t.hasData)
    .map((t) => {
      const tps =
        t.validDurationSec > 0
          ? Math.round((t.validOutTok / t.validDurationSec) * 10) / 10
          : null;
      const cacheHitPct =
        t.promptTok > 0 ? Math.round((t.cacheReadTok / t.promptTok) * 1000) / 10 : null;
      return {
        tps,
        durationSec: t.validDurationSec > 0 ? Math.round(t.validDurationSec * 10) / 10 : null,
        cacheHitPct,
      };
    });

  const lastTurn = activeTurns.length > 0 ? activeTurns[activeTurns.length - 1] : null;
  const validTps = activeTurns.filter((t) => t.tps != null && t.tps > 0);
  const avgTokPerSec =
    validTps.length > 0
      ? Math.round((validTps.reduce((s, t) => s + t.tps, 0) / validTps.length) * 10) / 10
      : null;

  const validCache = activeTurns.filter((t) => t.cacheHitPct != null);
  const avgCacheHitPct =
    validCache.length > 0
      ? Math.round((validCache.reduce((s, t) => s + t.cacheHitPct, 0) / validCache.length) * 10) / 10
      : null;

  return {
    latestTokPerSec: lastTurn?.tps ?? null,
    avgTokPerSec,
    lastDurationSec: lastTurn?.durationSec ?? null,
    lastOutputTokens,
    lastTurnCacheHitPct: lastTurn?.cacheHitPct ?? null,
    avgCacheHitPct,
    upstreamModelId,
    sampleCount,
  };
}

const fileCache = new Map();

/**
 * Read a transcript.jsonl file with mtime+size caching and compute speed metrics.
 */
export function computeSpeedMetricsFromFile(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') {
    return computeSpeedMetricsFromSteps([]);
  }

  try {
    const stat = fs.statSync(transcriptPath);
    const sig = `${stat.mtimeMs}:${stat.size}`;
    const cached = fileCache.get(transcriptPath);
    if (cached && cached.sig === sig) {
      return cached.metrics;
    }

    const raw = fs.readFileSync(transcriptPath, 'utf8');
    const steps = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        steps.push(JSON.parse(trimmed));
      } catch {
        // Ignore partial trailing line while Antigravity is mid-write
      }
    }

    const metrics = computeSpeedMetricsFromSteps(steps);
    fileCache.set(transcriptPath, { sig, metrics });
    if (fileCache.size > 32) {
      const firstKey = fileCache.keys().next().value;
      fileCache.delete(firstKey);
    }
    return metrics;
  } catch {
    return computeSpeedMetricsFromSteps([]);
  }
}
