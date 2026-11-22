import {
  ID_RE,
  analyzeConversation,
  listRecentConversations,
  resolveConversationAppData,
} from './analyzer.mjs';
import { computeSpeedMetricsFromFile } from './speed_tracker.mjs';
import {
  buildWeeklyQuotaEstimates,
  scanWeeklyLocalUsage,
} from './weekly_usage.mjs';

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
 * Collapse fine-grained analyzer buckets into 5 clean UI breakdown categories.
 */
export function buildBreakdownCategories(categories = {}, totalUsed = 0) {
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

  const items = [
    { key: 'system', label: '系统底座', tokens: systemBase, color: '#38bdf8' },
    { key: 'rules', label: '规则/技能', tokens: rulesAndSkills, color: '#a78bfa' },
    { key: 'history', label: '对话历史', tokens: conversationHistory, color: '#34d399' },
    { key: 'tools', label: '工具输出', tokens: toolOutputs, color: '#fbbf24' },
    { key: 'thinking', label: '思考过程', tokens: thinking, color: '#f472b6' },
  ];

  const denom = Math.max(
    1,
    totalUsed || items.reduce((sum, item) => sum + item.tokens, 0),
  );

  return items.map((item) => ({
    ...item,
    pct: Math.round((item.tokens / denom) * 1000) / 10,
  }));
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

  // Determine effective context window limit
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
  const modelLabel = contextSnap?.model?.label || modelId || '待会话开始';

  const breakdown = buildBreakdownCategories(contextSnap?.categories || {}, usedTokens);

  const cache = contextSnap?.cache || {};
  const cumulativeTotalTokens =
    Number(cache.cumulativeInputTokens || 0) + Number(cache.cumulativeOutputTokens || 0);

  const groups = Array.isArray(quotaSummary?.groups) ? quotaSummary.groups : [];
  const activeGroupKey = matchModelToQuotaGroupKey(modelId);
  const activeGroup =
    groups.find((g) => g.key === activeGroupKey) ||
    groups[0] ||
    null;

  const normalizedQuotaGroups = groups.map((g) => ({
    key: g.key,
    label: g.label,
    isActive: activeGroup ? g.key === activeGroup.key : false,
    fiveHour: g.fiveHour
      ? {
          remainingPct: g.fiveHour.remainingPct,
          remainingMs: g.fiveHour.remainingMs,
          resetTime: g.fiveHour.resetTime,
          isFull: Boolean(g.fiveHour.isFull),
        }
      : null,
    weekly: g.weekly
      ? {
          remainingPct: g.weekly.remainingPct,
          remainingMs: g.weekly.remainingMs,
          resetTime: g.weekly.resetTime,
          isFull: Boolean(g.weekly.isFull),
        }
      : null,
  }));

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
      latestTokPerSec: speedMetrics?.latestTokPerSec ?? null,
      avgTokPerSec: speedMetrics?.avgTokPerSec ?? null,
      lastDurationSec: speedMetrics?.lastDurationSec ?? null,
      lastOutputTokens: speedMetrics?.lastOutputTokens ?? Number(cache.lastOutputTokens || 0),
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
      available: Boolean(quotaSummary?.available && groups.length > 0),
      stale: Boolean(quotaSummary?.stale),
      fetchedAtMs: quotaSummary?.fetchedAtMs || null,
      error: quotaSummary?.error || '',
      activeGroupKey: activeGroup?.key || activeGroupKey,
      activeGroupLabel: activeGroup?.label || '',
      activeFiveHourPct: activeGroup?.fiveHour?.remainingPct ?? null,
      activeFiveHourRemainingMs: activeGroup?.fiveHour?.remainingMs ?? null,
      activeWeeklyPct: activeGroup?.weekly?.remainingPct ?? null,
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
  workspaceUris = [],
  quotaClient = null,
  config = {},
  forceQuota = false,
  includeWeeklyEstimate = false,
} = {}) {
  const requested = typeof conversationId === 'string' ? conversationId.trim() : '';
  const convId =
    (requested && ID_RE.test(requested) ? requested : '') ||
    listRecentConversations(1)[0]?.id ||
    '';

  let contextSnap = null;
  let speedMetrics = null;

  if (convId) {
    const appData = resolveConversationAppData(convId);
    if (appData) {
      contextSnap = await analyzeConversation(appData, convId, { workspaceUris });
      if (contextSnap?.found && contextSnap?.transcriptStats?.path) {
        speedMetrics = computeSpeedMetricsFromFile(contextSnap.transcriptStats.path);
      }
    }
  }

  let quotaSummary = null;
  if (quotaClient && typeof quotaClient.getQuotaSummary === 'function') {
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
