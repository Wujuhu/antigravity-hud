/**
 * Read-only SQLite conversation telemetry reader (nanosecond stream TPS & per-turn summaries).
 *
 * Protobuf field decoding and stream-TPS logic adapted from:
 *   nkjDSLcvanv/antigravity-codex-theme (core/daemon/protobuf.mjs & sqlite-metrics.mjs, MIT License)
 *
 * Uses Node.js 22+ built-in `node:sqlite` with zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { estimateTurnCostUsd, getRateTableVersion } from './weekly_usage.mjs';

export const MIN_STREAM_DUR_SEC = 0.12;
export const MAX_SANITY_STREAM_TPS = 3000;

export function parseProto(buf) {
  let i = 0;
  const out = new Map();
  if (!buf || typeof buf.length !== 'number') return out;
  while (i < buf.length) {
    let tag = 0;
    let shift = 0;
    while (i < buf.length) {
      const b = buf[i++];
      tag |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fn = tag >>> 3;
    const wt = tag & 7;
    if (fn <= 0 || fn > 10000) break;
    if (wt === 0) {
      let val = 0;
      let s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        val += (b & 0x7f) * Math.pow(2, s);
        if (!(b & 0x80)) break;
        s += 7;
      }
      out.set(fn, val);
    } else if (wt === 2) {
      let len = 0;
      let s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        len |= (b & 0x7f) << s;
        if (!(b & 0x80)) break;
        s += 7;
      }
      if (len < 0 || i + len > buf.length) break;
      out.set(fn, buf.subarray(i, i + len));
      i += len;
    } else if (wt === 1) {
      if (i + 8 > buf.length) break;
      out.set(fn, buf.subarray(i, i + 8));
      i += 8;
    } else if (wt === 5) {
      if (i + 4 > buf.length) break;
      out.set(fn, buf.subarray(i, i + 4));
      i += 4;
    } else {
      break;
    }
  }
  return out;
}

export function extractMaxStepIdx(raw) {
  if (typeof raw === 'number') return raw >= 0 ? raw : -1;
  if (!raw || typeof raw.length !== 'number' || raw.length === 0) return -1;
  let i = 0;
  let maxVal = -1;
  while (i < raw.length) {
    let val = 0;
    let s = 0;
    while (i < raw.length) {
      const b = raw[i++];
      val += (b & 0x7f) * Math.pow(2, s);
      if (!(b & 0x80)) break;
      s += 7;
    }
    if (val > maxVal) maxVal = val;
  }
  return maxVal;
}

export function parseGenMetadataRow(row) {
  const top = parseProto(row.data);
  const chat = top.has(1) ? parseProto(top.get(1)) : new Map();
  const usage = chat.has(4) ? parseProto(chat.get(4)) : new Map();
  const chatStart = chat.has(9) ? parseProto(chat.get(9)) : new Map();
  const ctxMeta = chatStart.has(10) ? parseProto(chatStart.get(10)) : new Map();
  const ttftMap = chat.has(11) ? parseProto(chat.get(11)) : new Map();
  const streamMap = chat.has(12) ? parseProto(chat.get(12)) : new Map();
  const planner = top.has(3) ? parseProto(top.get(3)) : new Map();

  const inTok = usage.get(2) || 0;
  const outTok = usage.get(3) || 0;
  const cacheWrite = usage.get(4) || 0;
  const cacheRead = usage.get(5) || 0;
  const maxCtx = ctxMeta.get(4) || 0;
  const maxStepIdx = extractMaxStepIdx(top.get(2));
  const thinkTok = usage.get(9) || 0;
  const respTok = usage.get(10) || 0;
  const ttft = (ttftMap.get(1) || 0) + (ttftMap.get(2) || 0) / 1e9;
  const stream = (streamMap.get(1) || 0) + (streamMap.get(2) || 0) / 1e9;
  const modelName =
    (chat.has(21) ? Buffer.from(chat.get(21)).toString('utf8').trim() : '') ||
    (chat.has(19) ? Buffer.from(chat.get(19)).toString('utf8').trim() : '') ||
    (planner.has(28) ? Buffer.from(planner.get(28)).toString('utf8').trim() : '');

  return {
    idx: row.idx,
    inTok,
    outTok,
    cacheWrite,
    cacheRead,
    ctx: inTok + cacheWrite + cacheRead,
    maxCtx,
    maxStepIdx,
    modelName,
    thinkTok,
    respTok,
    ttft,
    stream,
    totDur: ttft + stream,
  };
}

/**
 * Compute primary display TPS matching antigravity-codex-theme's streamTps logic:
 *   streamTps = outTok / stream (when stream >= 0.12s)
 *   if 0 < streamTps <= 3000 -> use streamTps, else fallback to e2eTps = outTok / totDur
 */
export function computePrimaryTps(outTok, streamSec, totDurSec) {
  const out = Number(outTok || 0);
  const stream = Number(streamSec || 0);
  const tot = Number(totDurSec || 0);
  if (!(out > 0)) return { displayTps: null, streamTps: null, e2eTps: null };

  const streamTps = stream >= MIN_STREAM_DUR_SEC ? out / stream : 0;
  const e2eTps = tot > 0 ? out / tot : 0;
  const rawDisplay =
    streamTps > 0 && streamTps <= MAX_SANITY_STREAM_TPS ? streamTps : e2eTps;

  return {
    displayTps: rawDisplay > 0 ? Math.round(rawDisplay * 10) / 10 : null,
    streamTps: streamTps > 0 ? Math.round(streamTps * 10) / 10 : null,
    e2eTps: e2eTps > 0 ? Math.round(e2eTps * 10) / 10 : null,
  };
}

/**
 * Split a raw model name/slug into Title Case base name + normalized effort label.
 * e.g. "Gemini 4 Neon (High)" -> { modelLabel: "Gemini 4 Neon", effort: "High" }
 *      "gemini-4-hydrogen-xhigh" -> { modelLabel: "Gemini 4 Hydrogen", effort: "XHigh" }
 *      "claude-sonnet-4-6-high" -> { modelLabel: "Claude Sonnet 4.6", effort: "High" }
 */
export function splitModelAndEffort(rawModel = '') {
  const raw = String(rawModel || '').trim();
  if (!raw) return { modelLabel: '', effort: '' };

  let effort = '';
  let base = raw;

  const parenMatch = base.match(/\s*\((extra[- ]?low|low|medium|high|xhigh|tiered)\)\s*$/i);
  if (parenMatch) {
    effort = parenMatch[1];
    base = base.slice(0, parenMatch.index).trim();
  } else {
    const slugEffortMatch = base.match(/-(?:tiered-)?(extra-low|low|medium|high|xhigh|tiered)$/i);
    if (slugEffortMatch) {
      effort = slugEffortMatch[1];
      base = base.slice(0, slugEffortMatch.index).trim();
    }
  }

  let effortLabel = '';
  if (effort) {
    const lowEff = effort.toLowerCase().replace(/\s+/g, '-');
    if (lowEff === 'xhigh') effortLabel = 'XHigh';
    else if (lowEff === 'extra-low') effortLabel = 'Extra Low';
    else if (lowEff === 'high') effortLabel = 'High';
    else if (lowEff === 'medium') effortLabel = 'Medium';
    else if (lowEff === 'low') effortLabel = 'Low';
    else if (lowEff === 'tiered') effortLabel = 'Tiered';
    else effortLabel = effort.charAt(0).toUpperCase() + effort.slice(1);
  }

  // Format clean Title Case modelLabel
  let modelLabel = base;
  if (!base.includes(' ') || /^[a-z0-9]+-[a-z0-9-]+$/i.test(base)) {
    const slug = base.toLowerCase().replace(/-tiered$/i, '');
    if (slug === 'gemini-pro-orchestrator') modelLabel = 'Orchestrator Carbon';
    else if (slug === 'gemini-pro-orchestrator-argon') modelLabel = 'Orchestrator Argon';
    else if (slug === 'gemini-flash-worker-agy') modelLabel = 'Gemini Flash Worker';
    else {
      const claudeMatch = slug.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
      if (claudeMatch) {
        const tier = claudeMatch[1].charAt(0).toUpperCase() + claudeMatch[1].slice(1);
        const ver = claudeMatch[3] ? `${claudeMatch[2]}.${claudeMatch[3]}` : claudeMatch[2];
        modelLabel = `Claude ${tier} ${ver}`;
      } else if (slug.startsWith('gpt-oss-')) {
        modelLabel = slug.replace(/^gpt-oss-/, 'GPT-OSS ').toUpperCase();
      } else if (slug.startsWith('gpt-')) {
        modelLabel =
          'GPT-' +
          slug
            .slice(4)
            .split('-')
            .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
            .join(' ');
      } else {
        modelLabel = slug
          .split('-')
          .filter(Boolean)
          .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
          .join(' ');
      }
    }
  } else {
    // Already spaced text like "Gemini 4 Neon" — ensure Title Case on lowercase words
    modelLabel = base
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => (/^[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(' ');
  }

  return { modelLabel, effort: effortLabel };
}

function findOwnerTurnIndex(userStepIdxs, stepIdx) {
  if (!userStepIdxs.length || stepIdx < 0) return 0;
  let lo = 0;
  let hi = userStepIdxs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (userStepIdxs[mid] <= stepIdx) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? ans : 0;
}

/**
 * Group parsed gen_metadata rows into per-user-turn total summaries.
 */
export function buildPerTurnSummaries(validItems = [], userStepIdxs = []) {
  if (!Array.isArray(validItems) || validItems.length === 0) return [];

  const buckets = new Map();
  const hasStepIndices = validItems.some((it) => it.maxStepIdx >= 0);

  for (const item of validItems) {
    const turnIdx =
      hasStepIndices && userStepIdxs.length > 0 && item.maxStepIdx >= 0
        ? findOwnerTurnIndex(userStepIdxs, item.maxStepIdx)
        : 0;

    let acc = buckets.get(turnIdx);
    if (!acc) {
      const startStepIdx = userStepIdxs[turnIdx] ?? 0;
      const nextUserStepIdx =
        turnIdx + 1 < userStepIdxs.length ? userStepIdxs[turnIdx + 1] - 1 : -1;
      acc = {
        turnIndex: turnIdx,
        startStepIdx,
        endStepIdx: nextUserStepIdx,
        minGenIdx: item.idx,
        maxGenIdx: item.idx,
        maxSeenStepIdx: item.maxStepIdx,
        stepCount: 0,
        rawModel: '',
        inTok: 0,
        cacheWrite: 0,
        cacheRead: 0,
        outTok: 0,
        thinkTok: 0,
        respTok: 0,
        ttftSec: 0,
        ttftCount: 0,
        streamSec: 0,
        totalDurSec: 0,
        totalCostUsd: 0,
        cacheSavedUsd: 0,
      };
      buckets.set(turnIdx, acc);
    }

    acc.stepCount += 1;
    if (item.idx < acc.minGenIdx) acc.minGenIdx = item.idx;
    if (item.idx > acc.maxGenIdx) acc.maxGenIdx = item.idx;
    if (item.maxStepIdx > acc.maxSeenStepIdx) acc.maxSeenStepIdx = item.maxStepIdx;
    if (item.modelName) acc.rawModel = item.modelName;

    acc.inTok += item.inTok;
    acc.cacheWrite += item.cacheWrite;
    acc.cacheRead += item.cacheRead;
    acc.outTok += item.outTok;
    acc.thinkTok += item.thinkTok;
    acc.respTok += item.respTok;
    if (item.ttft > 0) {
      acc.ttftSec += item.ttft;
      acc.ttftCount += 1;
    }
    acc.streamSec += item.stream;
    acc.totalDurSec += item.totDur;

    const cost = estimateTurnCostUsd(
      item.modelName || acc.rawModel,
      item.inTok + item.cacheWrite,
      item.cacheRead,
      item.outTok,
    );
    acc.totalCostUsd += cost.costUsd;
    acc.cacheSavedUsd += cost.cacheSavedUsd;
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .map((acc) => {
      const promptTokens = acc.inTok + acc.cacheWrite + acc.cacheRead;
      const totalTokens = promptTokens + acc.outTok;
      const cacheHitPct =
        promptTokens > 0 ? Math.round((acc.cacheRead / promptTokens) * 1000) / 10 : null;
      const { displayTps, streamTps, e2eTps } = computePrimaryTps(
        acc.outTok,
        acc.streamSec,
        acc.totalDurSec,
      );
      const { modelLabel, effort } = splitModelAndEffort(acc.rawModel);
      const avgTtftSec =
        acc.ttftCount > 0 ? Math.round((acc.ttftSec / acc.ttftCount) * 100) / 100 : null;
      return {
        turnIndex: acc.turnIndex,
        startStepIdx: acc.startStepIdx,
        endStepIdx: acc.endStepIdx,
        minGenIdx: acc.minGenIdx,
        maxGenIdx: acc.maxGenIdx,
        stepCount: acc.stepCount,
        rawModel: acc.rawModel,
        modelLabel,
        effort,
        promptTokens,
        cacheReadTokens: acc.cacheRead,
        outputTokens: acc.outTok,
        totalTokens,
        cacheHitPct,
        totalDurSec: Math.round(acc.totalDurSec * 10) / 10,
        streamDurSec: Math.round(acc.streamSec * 10) / 10,
        ttftSec: Math.round(acc.ttftSec * 10) / 10,
        avgTtftSec,
        tps: displayTps != null ? Math.round(displayTps) : null,
        tpsExact: displayTps,
        streamTps,
        e2eTps,
        totalCostUsd: Math.round(acc.totalCostUsd * 10000) / 10000,
      };
    });
}

function averageRounded(items, selector, decimals = 1, requirePositive = false) {
  let sum = 0;
  let count = 0;
  for (const item of items) {
    const raw = selector(item);
    if (raw == null) continue;
    const val = Number(raw);
    if (!Number.isFinite(val)) continue;
    if (requirePositive && !(val > 0)) continue;
    sum += val;
    count += 1;
  }
  if (count === 0) return null;
  const factor = 10 ** decimals;
  return Math.round((sum / count) * factor) / factor;
}

/**
 * Derive live current-turn composite speed & cache hit rate (updated as each LLM
 * call in the turn finishes) and across-turn session arithmetic means over all turns.
 */
export function summarizeTurnsMetrics(turns = []) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return {
      latestTokPerSec: null,
      latestStreamTokPerSec: null,
      latestE2eTokPerSec: null,
      avgTokPerSec: null,
      lastDurationSec: null,
      lastStreamSec: null,
      lastTtftSec: null,
      avgTtftSec: null,
      lastTurnCacheHitPct: null,
      avgCacheHitPct: null,
    };
  }

  const lastTurn = turns[turns.length - 1];
  const avgTokPerSec = averageRounded(turns, (t) => t?.tpsExact, 1, true);
  const avgTtftSec = averageRounded(turns, (t) => t?.avgTtftSec, 2, true);
  const avgCacheHitPct = averageRounded(turns, (t) => t?.cacheHitPct, 1, false);

  return {
    latestTokPerSec: lastTurn?.tpsExact ?? null,
    latestStreamTokPerSec: lastTurn?.streamTps ?? null,
    latestE2eTokPerSec: lastTurn?.e2eTps ?? null,
    avgTokPerSec,
    lastDurationSec: lastTurn?.totalDurSec > 0 ? lastTurn.totalDurSec : null,
    lastStreamSec: lastTurn?.streamDurSec > 0 ? lastTurn.streamDurSec : null,
    lastTtftSec: lastTurn?.avgTtftSec ?? null,
    avgTtftSec,
    lastTurnCacheHitPct:
      lastTurn?.cacheHitPct != null && Number.isFinite(Number(lastTurn.cacheHitPct))
        ? Number(lastTurn.cacheHitPct)
        : null,
    avgCacheHitPct,
  };
}

// Backward-compatible alias
export const summarizeTurnsSpeed = summarizeTurnsMetrics;

const dbMetricsCache = new Map();
const MAX_CACHE_ENTRIES = 24;

function getDbFileSignature(dbPath) {
  try {
    const st = fs.statSync(dbPath, { throwIfNoEntry: false });
    if (!st) return null;
    const wst = fs.statSync(`${dbPath}-wal`, { throwIfNoEntry: false });
    const walSig = wst ? `${wst.mtimeMs}:${wst.size}` : '0:0';
    return `${st.mtimeMs}:${st.size}|${walSig}|r:${getRateTableVersion()}`;
  } catch {
    return null;
  }
}

/**
 * Read nanosecond-accurate generation speed & per-turn totals from Antigravity's
 * conversation SQLite database (`<appData>/conversations/<convId>.db`).
 */
export function readConversationSqliteMetrics(appData, convId) {
  if (!appData || !convId) return null;
  const dbPath = path.join(appData, 'conversations', `${convId}.db`);
  const sig = getDbFileSignature(dbPath);
  if (!sig) return null;

  const hit = dbMetricsCache.get(dbPath);
  if (hit && hit.sig === sig) {
    return hit.result;
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true, timeout: 200 });
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name),
    );
    if (!tables.has('gen_metadata')) {
      return null;
    }

    const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
    const userStepIdxs = tables.has('steps')
      ? db
          .prepare('SELECT idx FROM steps WHERE step_type = 14 ORDER BY idx ASC')
          .all()
          .map((r) => r.idx)
      : [];

    const validItems = [];
    let sumOut = 0;
    let sumStream = 0;
    let sumTotDur = 0;
    let sumTtft = 0;
    let ttftCount = 0;
    let latestModelName = '';

    for (let i = 0; i < rows.length; i++) {
      const p = parseGenMetadataRow(rows[i]);
      if (p.modelName) latestModelName = p.modelName;
      if (p.ctx > 0 || p.outTok > 0) {
        validItems.push(p);
        sumOut += p.outTok;
        sumStream += p.stream;
        sumTotDur += p.totDur;
        if (p.ttft > 0) {
          sumTtft += p.ttft;
          ttftCount += 1;
        }
      }
    }

    if (validItems.length === 0) {
      return null;
    }

    const last = validItems[validItems.length - 1];
    const fallbackLastRate = computePrimaryTps(last.outTok, last.stream, last.totDur);
    const fallbackAvgRate = computePrimaryTps(sumOut, sumStream, sumTotDur);
    const fallbackAvgTtftSec = ttftCount > 0 ? Math.round((sumTtft / ttftCount) * 100) / 100 : null;
    const turns = buildPerTurnSummaries(validItems, userStepIdxs);
    const turnSpeed = summarizeTurnsMetrics(turns);
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const sessionTotalTokens = turns.reduce((sum, t) => sum + Number(t.totalTokens || 0), 0);
    const sessionTotalCostUsd = Math.round(
      turns.reduce((sum, t) => sum + Number(t.totalCostUsd || 0), 0) * 10000,
    ) / 10000;

    const result = {
      source: 'sqlite',
      latestTokPerSec: turnSpeed.latestTokPerSec ?? fallbackLastRate.displayTps,
      latestStreamTokPerSec: turnSpeed.latestStreamTokPerSec ?? fallbackLastRate.streamTps,
      latestE2eTokPerSec: turnSpeed.latestE2eTokPerSec ?? fallbackLastRate.e2eTps,
      avgTokPerSec: turnSpeed.avgTokPerSec ?? fallbackAvgRate.displayTps,
      lastDurationSec: turnSpeed.lastDurationSec ?? (last.totDur > 0 ? Math.round(last.totDur * 10) / 10 : null),
      lastStreamSec: turnSpeed.lastStreamSec ?? (last.stream > 0 ? Math.round(last.stream * 10) / 10 : null),
      lastTtftSec: turnSpeed.lastTtftSec ?? (last.ttft > 0 ? Math.round(last.ttft * 100) / 100 : null),
      avgTtftSec: turnSpeed.avgTtftSec ?? fallbackAvgTtftSec,
      lastTurnCacheHitPct: turnSpeed.lastTurnCacheHitPct,
      avgCacheHitPct: turnSpeed.avgCacheHitPct,
      lastOutputTokens: last.outTok,
      lastTurnTokens: lastTurn ? lastTurn.totalTokens : last.ctx + last.outTok,
      lastTurnCostUsd: lastTurn ? lastTurn.totalCostUsd : 0,
      sessionTotalTokens,
      sessionTotalCostUsd,
      upstreamModelId: last.modelName || latestModelName || '',
      sampleCount: validItems.length,
      turns,
    };

    dbMetricsCache.set(dbPath, { sig, result });
    if (dbMetricsCache.size > MAX_CACHE_ENTRIES) {
      const oldest = dbMetricsCache.keys().next().value;
      if (oldest) dbMetricsCache.delete(oldest);
    }
    return result;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}
