import {
  ID_RE,
  analyzeConversation,
  listRecentConversations,
  resolveConversationAppData,
} from './analyzer.mjs';
import { computeSpeedMetricsFromFile } from './speed_tracker.mjs';
import { readConversationSqliteMetrics } from './sqlite_metrics.mjs';
import {
  buildWeeklyQuotaEstimates,
  estimateTurnCostUsd,
  scanWeeklyLocalUsage,
} from './weekly_usage.mjs';

/**
 * Format a raw model slug or label into clean Title Case without thinking effort suffixes.
 * e.g. "gemini-4-neon-high" -> "Gemini 4 Neon", "claude-sonnet-4-6-high" -> "Claude Sonnet 4.6"
 */
export function formatCleanModelName(rawModel = '') {
  const raw = String(rawModel || '').trim();
  if (!raw) return '';

  let s = raw
    .replace(/\s*\((?:extra[- ]?low|low|medium|high|xhigh|tiered)\)\s*$/i, '')
    .trim();

  // If already human-readable with spaces (and not slug-like)
  if (s.includes(' ') && !/^[a-z0-9]+-[a-z0-9-]+$/i.test(s)) {
    return s;
  }

  const slug = s
    .toLowerCase()
    .replace(/-(?:tiered-)?(?:extra-low|low|medium|high|xhigh|tiered)$/i, '')
    .replace(/-tiered$/i, '');

  if (slug === 'gemini-pro-orchestrator') return 'Orchestrator Carbon';
  if (slug === 'gemini-pro-orchestrator-argon') return 'Orchestrator Argon';
  if (slug === 'gemini-flash-worker-agy') return 'Gemini Flash Worker';

  const claudeMatch = slug.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (claudeMatch) {
    const tier = claudeMatch[1].charAt(0).toUpperCase() + claudeMatch[1].slice(1);
    const ver = claudeMatch[3] ? `${claudeMatch[2]}.${claudeMatch[3]}` : claudeMatch[2];
    return `Claude ${tier} ${ver}`;
  }

  if (slug.startsWith('gpt-oss-')) {
    return slug.replace(/^gpt-oss-/, 'GPT-OSS ').toUpperCase();
  }
  if (slug.startsWith('gpt-')) {
    return 'GPT-' + slug.slice(4).split('-').map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
  }

  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * Match a model ID string to one of the normalized quota group keys.
 */
export function matchModelToQuotaGroupKey(modelId = '') {
  const low = String(modelId || '').toLowerCase();
  if (!low) return 'gemini';
  if (low.includes('argon')) return 'argon';
  if (
    low.includes('claude') ||
    low.includes('gpt') ||
    low.includes('o1') ||
    low.includes('o3') ||
    low.includes('o4') ||
    low.includes('sonnet') ||
    low.includes('opus') ||
    low.includes('haiku')
  ) {
    return 'gpt_claude';
  }
  return 'gemini';
}

/**
 * Collapse fine-grained analyzer buckets into 5 clean UI breakdown categories
 * using restrained, low-saturation Antigravity-native tones.
 */
export function buildBreakdownCategories(categories = {}, totalUsed = 0, contextLimit = 0) {
  const systemBase =
    (categories.systemPrompt || 0) +
    (categories.systemTools || 0) +
    (categories.systemMessages || 0) +
    (categories.mcpTools || 0) +
    (categories.mcpInstructions || 0) +
    (categories.checkpointBuffer || 0);

  const rulesAndSkills =
    (categories.rulesFiles || 0) +
    (categories.skills || 0) +
    (categories.customAgents || 0);

  const conversationHistory =
    (categories.messages || 0) + (categories.agentReplies || 0);

  const toolOutputs =
    (categories.toolCallArgs || 0) + (categories.toolCallOutputs || 0);

  const thinking = categories.agentThinking || 0;

  // Muted Google / Antigravity-inspired palette
  const items = [
    { key: 'system', label: '系统', tokens: systemBase, color: '#6e9be8' },
    { key: 'rules', label: '规则', tokens: rulesAndSkills, color: '#9b87d6' },
    { key: 'history', label: '对话', tokens: conversationHistory, color: '#5fb49c' },
    { key: 'tools', label: '工具', tokens: toolOutputs, color: '#d4a359' },
    { key: 'thinking', label: '思考', tokens: thinking, color: '#c87d99' },
  ];

  const usedDenom = Math.max(
    1,
    totalUsed || items.reduce((sum, item) => sum + item.tokens, 0),
  );
  const capDenom = contextLimit > 0 ? contextLimit : usedDenom;

  return items.map((item) => ({
    ...item,
    pct: Math.round((item.tokens / usedDenom) * 1000) / 10,
    windowPct: Math.min(100, Math.round((item.tokens / capDenom) * 1000) / 10),
  }));
}

function formatBucketLabel(b) {
  if (!b) return '';
  if (b.window === '5h') return '5h';
  if (b.window === 'weekly') return '周';
  const raw = String(b.rawWindow || b.displayName || b.window || '').trim();
  if (/day|24h|daily/i.test(raw)) return '日';
  if (/month|30d/i.test(raw)) return '月';
  return raw ? raw.slice(0, 6) : '额度';
}

function normalizeGroupBuckets(g) {
  const out = [];
  const rawBuckets = Array.isArray(g.buckets) && g.buckets.length > 0 ? g.buckets : null;

  const mapBucket = (b, fallbackWindow, fallbackLabel) => {
    const win = b.window || fallbackWindow;
    return {
      window: win,
      label: formatBucketLabel({ ...b, window: win }) || fallbackLabel,
      remainingFraction:
        b.remainingFraction != null && Number.isFinite(Number(b.remainingFraction))
          ? Number(b.remainingFraction)
          : b.remainingPctExact != null && Number.isFinite(Number(b.remainingPctExact))
            ? Number(b.remainingPctExact) / 100
            : b.remainingPct != null && Number.isFinite(Number(b.remainingPct))
              ? Number(b.remainingPct) / 100
              : null,
      remainingPct: b.remainingPct ?? null,
      remainingPctExact:
        b.remainingPctExact != null && Number.isFinite(Number(b.remainingPctExact))
          ? Number(b.remainingPctExact)
          : b.remainingFraction != null && Number.isFinite(Number(b.remainingFraction))
            ? Math.round(Number(b.remainingFraction) * 1000) / 10
            : b.remainingPct ?? null,
      remainingMs: b.remainingMs ?? null,
      resetTime: b.resetTime || '',
      resetTimeMs: b.resetTimeMs ?? (b.resetTime ? (Number.isFinite(Date.parse(b.resetTime)) ? Date.parse(b.resetTime) : null) : null),
      isFull: Boolean(b.isFull),
    };
  };

  if (rawBuckets) {
    for (const b of rawBuckets) {
      if (!b || b.disabled) continue;
      out.push(mapBucket(b, 'other', '额度'));
    }
  } else {
    if (g.fiveHour) {
      out.push(mapBucket(g.fiveHour, '5h', '5h'));
    }
    if (g.weekly) {
      out.push(mapBucket(g.weekly, 'weekly', '周'));
    }
  }

  // Sort consistently: 5h -> daily -> weekly -> other
  const order = { '5h': 0, daily: 1, weekly: 2, other: 3 };
  out.sort((a, b) => (order[a.window] ?? 3) - (order[b.window] ?? 3));
  return out;
}

/**
 * Assemble a unified HUD snapshot from context analysis, speed tracking, and quota summary.
 */
export function assembleHudSnapshot({
  contextSnap = null,
  speedMetrics = null,
  quotaSummary = null,
  weeklyUsage = null,
  config = {},
  nowMs = Date.now(),
} = {}) {
  const hasContext = Boolean(contextSnap && contextSnap.found);

  let contextLimit = hasContext ? Number(contextSnap.contextLimit || 0) : 0;
  let limitSource = hasContext ? contextSnap.limitSource || 'antigravity' : 'default';

  if (config?.windowCapMode && config.windowCapMode !== 'auto') {
    const manualCap = Number(config.windowCapMode);
    if (Number.isFinite(manualCap) && manualCap > 0) {
      contextLimit = manualCap;
      limitSource = 'manual';
    }
  } else if (!(contextLimit > 0)) {
    contextLimit = 512000;
    limitSource = 'fallback';
  }

  const usedTokens = hasContext ? Number(contextSnap.usedTokens || 0) : 0;
  const usedPercent =
    contextLimit > 0
      ? Math.min(100, Math.round((usedTokens / contextLimit) * 1000) / 10)
      : 0;
  const freeTokens = Math.max(0, contextLimit - usedTokens);

  const modelId =
    (speedMetrics?.upstreamModelId && String(speedMetrics.upstreamModelId).trim()) ||
    contextSnap?.model?.id ||
    '';
  const modelLabel =
    formatCleanModelName(modelId) ||
    formatCleanModelName(contextSnap?.model?.label) ||
    '待会话开始';

  const breakdown = buildBreakdownCategories(contextSnap?.categories || {}, usedTokens, contextLimit);

  const cache = contextSnap?.cache || {};
  const cumulativeTotalTokens =
    Number(cache.cumulativeInputTokens || 0) + Number(cache.cumulativeOutputTokens || 0);

  // Compute per-turn spend and total session spend (prefer SQLite exact per-turn sums, else fallback)
  const fallbackLastPrompt = Number(cache.lastPromptTokens || 0);
  const fallbackLastCached = Number(cache.cachedTokens || 0);
  const fallbackLastOut = Number(cache.lastOutputTokens || speedMetrics?.lastOutputTokens || 0);
  const fallbackLastUncached = Math.max(0, fallbackLastPrompt - fallbackLastCached);
  const fallbackLastTokens = fallbackLastPrompt + fallbackLastOut;
  const fallbackLastCost = estimateTurnCostUsd(
    modelId,
    fallbackLastUncached,
    fallbackLastCached,
    fallbackLastOut,
  ).costUsd;

  const fallbackCumIn = Number(cache.cumulativeInputTokens || 0);
  const fallbackCumCached = Number(cache.cumulativeCachedTokens || 0);
  const fallbackCumOut = Number(cache.cumulativeOutputTokens || 0);
  const fallbackCumUncached = Math.max(0, fallbackCumIn - fallbackCumCached);
  const fallbackSessionCost = estimateTurnCostUsd(
    modelId,
    fallbackCumUncached,
    fallbackCumCached,
    fallbackCumOut,
  ).costUsd;

  const lastTurnTokens =
    speedMetrics?.lastTurnTokens != null ? Number(speedMetrics.lastTurnTokens) : fallbackLastTokens;
  const lastTurnCostUsd =
    speedMetrics?.lastTurnCostUsd != null
      ? Number(speedMetrics.lastTurnCostUsd)
      : Math.round(fallbackLastCost * 10000) / 10000;
  const sessionTotalTokens =
    speedMetrics?.sessionTotalTokens != null && Number(speedMetrics.sessionTotalTokens) > 0
      ? Number(speedMetrics.sessionTotalTokens)
      : cumulativeTotalTokens;
  const sessionTotalCostUsd =
    speedMetrics?.sessionTotalCostUsd != null && Number(speedMetrics.sessionTotalTokens || 0) > 0
      ? Number(speedMetrics.sessionTotalCostUsd)
      : Math.round(fallbackSessionCost * 10000) / 10000;

  const groups = Array.isArray(quotaSummary?.groups) ? quotaSummary.groups : [];
  const activeGroupKey = matchModelToQuotaGroupKey(modelId);
  const activeGroup =
    groups.find((g) => g.key === activeGroupKey) ||
    groups[0] ||
    null;

  const normalizedQuotaGroups = groups.map((g) => {
    const buckets = normalizeGroupBuckets(g);
    const fh = buckets.find((b) => b.window === '5h') || null;
    const wk = buckets.find((b) => b.window === 'weekly') || null;
    return {
      key: g.key,
      label: g.label,
      isActive: activeGroup ? g.key === activeGroup.key : false,
      fiveHour: fh,
      weekly: wk,
      buckets,
    };
  });

  const activeNormalized =
    normalizedQuotaGroups.find((g) => g.isActive) ||
    normalizedQuotaGroups[0] ||
    null;
  // Pick primary bucket for pill display (prefer 5h, else first available bucket for Pro/Free tiers)
  const primaryBucket =
    activeNormalized?.fiveHour ||
    activeNormalized?.buckets?.[0] ||
    null;

  const weeklyEstimate = weeklyUsage
    ? buildWeeklyQuotaEstimates(weeklyUsage, normalizedQuotaGroups)
    : null;

  return {
    updatedAtMs: nowMs,
    found: hasContext,
    conversationId: contextSnap?.conversationId || null,
    model: {
      id: modelId,
      label: modelLabel,
    },
    context: {
      usedTokens,
      contextLimit,
      freeTokens,
      usedPercent,
      limitSource,
      breakdown,
      compactionCount: contextSnap?.compaction?.count || 0,
      compactionSavedTokens: contextSnap?.compaction?.totalSavedTokens || 0,
    },
    speed: {
      source: speedMetrics?.source || 'transcript',
      latestTokPerSec: speedMetrics?.latestTokPerSec ?? null,
      latestE2eTokPerSec: speedMetrics?.latestE2eTokPerSec ?? null,
      avgTokPerSec: speedMetrics?.avgTokPerSec ?? null,
      lastDurationSec: speedMetrics?.lastDurationSec ?? null,
      lastStreamSec: speedMetrics?.lastStreamSec ?? null,
      lastTtftSec: speedMetrics?.lastTtftSec ?? null,
      avgTtftSec: speedMetrics?.avgTtftSec ?? null,
      lastOutputTokens: speedMetrics?.lastOutputTokens ?? Number(cache.lastOutputTokens || 0),
    },
    turns: Array.isArray(speedMetrics?.turns) ? speedMetrics.turns : [],
    spend: {
      lastTurnTokens,
      lastTurnCostUsd,
      sessionTotalTokens,
      sessionTotalCostUsd,
    },
    cache: {
      lastHitPct: Number.isFinite(Number(cache.cacheHitRatio)) ? Number(cache.cacheHitRatio) : null,
      lastCachedTokens: Number(cache.cachedTokens || 0),
      lastPromptTokens: Number(cache.lastPromptTokens || 0),
      sessionHitPct: Number.isFinite(Number(cache.sessionCacheHitRatio))
        ? Number(cache.sessionCacheHitRatio)
        : null,
      cumulativeInputTokens: Number(cache.cumulativeInputTokens || 0),
      cumulativeCachedTokens: Number(cache.cumulativeCachedTokens || 0),
      cumulativeOutputTokens: Number(cache.cumulativeOutputTokens || 0),
      cumulativeTotalTokens,
    },
    quota: {
      ok: Boolean(quotaSummary?.ok),
      available: Boolean(quotaSummary?.available && normalizedQuotaGroups.length > 0),
      stale: Boolean(quotaSummary?.stale),
      fetchedAtMs: quotaSummary?.fetchedAtMs || null,
      error: quotaSummary?.error || '',
      activeGroupKey: activeNormalized?.key || activeGroupKey,
      activeGroupLabel: activeNormalized?.label || '',
      primaryBucketLabel: primaryBucket?.label || '',
      activeFiveHourPct: primaryBucket?.remainingPct ?? null,
      activeFiveHourRemainingMs: primaryBucket?.remainingMs ?? null,
      activeWeeklyPct: activeNormalized?.weekly?.remainingPct ?? null,
      activeWeeklyRemainingMs: activeNormalized?.weekly?.remainingMs ?? null,
      groups: normalizedQuotaGroups,
    },
    weeklyEstimate,
  };
}

/**
 * Collect live telemetry for the active or most recent Antigravity conversation.
 */
export async function collectLiveSnapshot({
  conversationId = '',
  allowFallbackRecent = true,
  workspaceUris = [],
  quotaClient = null,
  quotaSummaryOverride = null,
  config = {},
  forceQuota = false,
  includeWeeklyEstimate = false,
} = {}) {
  const requested = typeof conversationId === 'string' ? conversationId.trim() : '';
  const convId =
    (requested && ID_RE.test(requested) ? requested : '') ||
    (allowFallbackRecent ? listRecentConversations(1)[0]?.id || '' : '');

  let contextSnap = null;
  let speedMetrics = null;

  if (convId) {
    const appData = resolveConversationAppData(convId);
    if (appData) {
      contextSnap = await analyzeConversation(appData, convId, { workspaceUris });
      // Prefer nanosecond-accurate SQLite gen_metadata stream TPS & per-turn totals;
      // fall back cleanly to transcript.jsonl estimation if DB is unavailable.
      speedMetrics = readConversationSqliteMetrics(appData, convId);
      if (!speedMetrics && contextSnap?.found && contextSnap?.transcriptStats?.path) {
        speedMetrics = computeSpeedMetricsFromFile(contextSnap.transcriptStats.path);
      }
    }
  }

  let quotaSummary = quotaSummaryOverride;
  if (!quotaSummary && quotaClient && typeof quotaClient.getQuotaSummary === 'function') {
    try {
      quotaSummary = await quotaClient.getQuotaSummary({ force: forceQuota });
    } catch {
      quotaSummary = null;
    }
  }

  // Only scan 7-day local transcripts on demand (when sidecar panel is open)
  const weeklyUsage = includeWeeklyEstimate
    ? scanWeeklyLocalUsage({ force: forceQuota })
    : null;

  return assembleHudSnapshot({
    contextSnap,
    speedMetrics,
    quotaSummary,
    weeklyUsage,
    config,
  });
}
