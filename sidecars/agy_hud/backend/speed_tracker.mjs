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
 * Compute generation speed metrics directly from parsed JSONL transcript steps.
 */
export function computeSpeedMetricsFromSteps(steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      latestTokPerSec: null,
      avgTokPerSec: null,
      lastDurationSec: null,
      lastOutputTokens: 0,
      upstreamModelId: '',
      sampleCount: 0,
    };
  }

  let latestTokPerSec = null;
  let lastDurationSec = null;
  let lastOutputTokens = 0;
  let upstreamModelId = '';
  let totalValidOutput = 0;
  let totalValidDurationSec = 0;
  let sampleCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || step.type !== 'PLANNER_RESPONSE') continue;

    if (typeof step.model === 'string' && step.model.trim()) {
      upstreamModelId = step.model.trim();
    }

    const outTok = Number(step.output_tokens || 0);
    if (outTok > 0) {
      lastOutputTokens = outTok;
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
        latestTokPerSec = Math.round(rate * 10) / 10;
        lastDurationSec = Math.round(durationSec * 10) / 10;
        totalValidOutput += outTok;
        totalValidDurationSec += durationSec;
        sampleCount += 1;
      }
    }
  }

  const avgTokPerSec =
    totalValidDurationSec > 0
      ? Math.round((totalValidOutput / totalValidDurationSec) * 10) / 10
      : null;

  return {
    latestTokPerSec,
    avgTokPerSec,
    lastDurationSec,
    lastOutputTokens,
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
