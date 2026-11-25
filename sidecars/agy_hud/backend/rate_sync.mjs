/**
 * Periodic remote model pricing synchronizer.
 *
 * Fetches up-to-date model pricing (including active promotional rates) from:
 *   - Source 2: Models.dev (`https://models.dev/api.json`) — primary direct-provider rates
 *   - Source 3: LiteLLM Cost Map (`https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`) — supplementary long-tail coverage
 *
 * Updates the live runtime rate table in `weekly_usage.mjs` directly (so both
 * new and previous conversations recalculate cleanly using the latest prices),
 * persists to `rates_cache.json`, and gracefully falls back to cached/built-in
 * rates if offline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './config.mjs';
import {
  normalizeModelRateKey,
  setRuntimeRates,
} from './weekly_usage.mjs';

export const MODELS_DEV_URL = 'https://models.dev/api.json';
export const LITELLM_RATES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
export const RATE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // Matches plugin update check interval (6h)

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REASONABLE_PRICE_PER_M = 500;
const DATE_SUFFIX_RE = /-(?:20\d{6}|20\d{2}-\d{2}-\d{2})$/;
const NON_CHAT_MODEL_RE =
  /(?:embedding|whisper|tts|audio|image|imagen|veo|lyria|moderation|transcribe|realtime|sora|dall-e|babbage|davinci|rerank)/i;

// Direct first-party providers in Models.dev whose pricing reflects canonical API rates
const MODELS_DEV_PRIMARY_PROVIDERS = ['google', 'anthropic', 'openai'];
// Open-weight providers in Models.dev used only to pick up open models like gpt-oss-120b
const MODELS_DEV_OPEN_WEIGHT_PROVIDERS = ['togetherai', 'fireworks-ai', 'openrouter'];

function roundRate(v) {
  return Number(Number(v).toFixed(4));
}

function sanitizeRateEntry(inRaw, outRaw, crRaw) {
  const inPerM = Number(inRaw);
  const outPerM = Number(outRaw);
  if (
    !Number.isFinite(inPerM) ||
    !Number.isFinite(outPerM) ||
    inPerM < 0 ||
    outPerM < 0 ||
    inPerM > MAX_REASONABLE_PRICE_PER_M ||
    outPerM > MAX_REASONABLE_PRICE_PER_M ||
    (inPerM === 0 && outPerM === 0)
  ) {
    return null;
  }

  let crPerM = Number(crRaw);
  if (!Number.isFinite(crPerM) || crPerM < 0 || crPerM > Math.max(inPerM * 1.5, 10)) {
    crPerM = inPerM * 0.1;
  }

  return {
    inPerM: roundRate(inPerM),
    outPerM: roundRate(outPerM),
    crPerM: roundRate(crPerM),
  };
}

function isRelevantChatModelKey(key) {
  if (!key || NON_CHAT_MODEL_RE.test(key)) return false;
  return (
    key.startsWith('gemini-') ||
    key.startsWith('claude-') ||
    key.startsWith('gpt-') ||
    /^o[134](?:-|$)/.test(key)
  );
}

function stripProviderPrefix(rawId = '') {
  const s = String(rawId || '').trim();
  const idx = s.lastIndexOf('/');
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function insertModelWithAlias(target, rawModelId, rate, { overwrite = true } = {}) {
  const slug = normalizeModelRateKey(stripProviderPrefix(rawModelId));
  if (!isRelevantChatModelKey(slug)) return;
  if (overwrite || !target[slug]) {
    target[slug] = rate;
  }
  const baseSlug = slug.replace(DATE_SUFFIX_RE, '');
  if (baseSlug && baseSlug !== slug && isRelevantChatModelKey(baseSlug) && !target[baseSlug]) {
    target[baseSlug] = rate;
  }
}

/**
 * Parse `https://models.dev/api.json` payload into normalized per-1M rate map.
 */
export function parseModelsDevPayload(payload) {
  const rates = {};
  if (!payload || typeof payload !== 'object') return rates;

  // 1. Primary first-party providers (google, anthropic, openai)
  for (const provKey of MODELS_DEV_PRIMARY_PROVIDERS) {
    const models = payload[provKey]?.models;
    if (!models || typeof models !== 'object') continue;
    for (const [modelId, meta] of Object.entries(models)) {
      const cost = meta?.cost;
      if (!cost || typeof cost !== 'object') continue;
      const entry = sanitizeRateEntry(cost.input, cost.output, cost.cache_read);
      if (!entry) continue;
      insertModelWithAlias(rates, modelId, entry, { overwrite: true });
    }
  }

  // 2. Open-weight models (e.g. gpt-oss-120b) from major serverless hosts if not already present
  for (const provKey of MODELS_DEV_OPEN_WEIGHT_PROVIDERS) {
    const models = payload[provKey]?.models;
    if (!models || typeof models !== 'object') continue;
    for (const [modelId, meta] of Object.entries(models)) {
      if (!/gpt-oss/i.test(modelId)) continue;
      const cost = meta?.cost;
      if (!cost || typeof cost !== 'object') continue;
      const entry = sanitizeRateEntry(cost.input, cost.output, cost.cache_read);
      if (!entry) continue;
      insertModelWithAlias(rates, modelId, entry, { overwrite: false });
    }
  }

  return rates;
}

/**
 * Parse LiteLLM `model_prices_and_context_window.json` payload (per-token USD)
 * into normalized per-1M rate map, ignoring cloud-reseller regional markups.
 */
export function parseLiteLlmPayload(payload) {
  const rates = {};
  if (!payload || typeof payload !== 'object') return rates;

  const ALLOWED_PREFIX_RE = /^(?:(?:gemini|google|anthropic|openai|together_ai\/openai)\/)?/i;
  const DISALLOWED_HOST_RE =
    /^(?:bedrock|vertex_ai|azure|cloudflare|databricks|deepinfra|replicate|sagemaker|snowflake|watsonx|perplexity|groq|cerebras|nebius|sambanova|openrouter)\//i;

  for (const [rawKey, meta] of Object.entries(payload)) {
    if (!meta || typeof meta !== 'object') continue;
    if (rawKey === 'sample_spec' || DISALLOWED_HOST_RE.test(rawKey)) continue;

    // Only accept bare canonical keys or direct first-party / together_ai open-weight prefixes
    const hasSlash = rawKey.includes('/');
    if (hasSlash && !/^(?:gemini|google|anthropic|openai|together_ai\/openai)\//i.test(rawKey)) {
      continue;
    }

    const bareName = rawKey.replace(ALLOWED_PREFIX_RE, '');
    if (bareName.includes('/')) continue;

    const inPerM =
      meta.input_cost_per_token != null ? Number(meta.input_cost_per_token) * 1_000_000 : Number.NaN;
    const outPerM =
      meta.output_cost_per_token != null ? Number(meta.output_cost_per_token) * 1_000_000 : Number.NaN;
    const crPerM =
      meta.cache_read_input_token_cost != null
        ? Number(meta.cache_read_input_token_cost) * 1_000_000
        : Number.NaN;

    const entry = sanitizeRateEntry(inPerM, outPerM, crPerM);
    if (!entry) continue;

    // Bare canonical keys take precedence over prefixed duplicates within LiteLLM
    insertModelWithAlias(rates, bareName, entry, { overwrite: !hasSlash });
  }

  return rates;
}

/**
 * Merge LiteLLM (supplementary base) + Models.dev (primary canonical override).
 */
export function mergeRemoteRateMaps({ litellmRates = {}, modelsDevRates = {} } = {}) {
  const merged = {
    ...litellmRates,
    ...modelsDevRates,
  };
  // Keep Antigravity's orchestrator alias aligned with gemini-4-carbon if refreshed
  if (merged['gemini-4-carbon'] && !merged['gemini-pro-orchestrator']) {
    merged['gemini-pro-orchestrator'] = { ...merged['gemini-4-carbon'] };
  }
  return merged;
}

async function fetchJsonWithTimeout(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AGY-HUD-RateSync',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Persistent disk-backed periodic rate synchronizer.
 */
export function createRateSyncStore(
  dataDir,
  {
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    modelsDevUrl = MODELS_DEV_URL,
    litellmUrl = LITELLM_RATES_URL,
    intervalMs = RATE_SYNC_INTERVAL_MS,
    timeoutMs = FETCH_TIMEOUT_MS,
  } = {},
) {
  const cacheFile = path.join(dataDir, 'rates_cache.json');
  let state = {
    ok: false,
    fetchedAtMs: 0,
    sources: [],
    modelCount: 0,
    rates: {},
    error: '',
  };
  let inFlight = null;

  function loadCachedSync() {
    try {
      if (fs.existsSync(cacheFile)) {
        const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.rates && typeof parsed.rates === 'object') {
          const count = Object.keys(parsed.rates).length;
          if (count > 0) {
            setRuntimeRates(parsed.rates);
            state = {
              ok: true,
              fetchedAtMs: Number(parsed.fetchedAtMs || 0),
              sources: Array.isArray(parsed.sources) ? parsed.sources : [],
              modelCount: count,
              rates: parsed.rates,
              error: '',
            };
          }
        }
      }
    } catch {
      // Ignore corrupted cache and fall back cleanly to built-in rates
    }
    return getStatus();
  }

  function getStatus() {
    return {
      ok: state.ok,
      fetchedAtMs: state.fetchedAtMs || null,
      sources: state.sources.slice(),
      modelCount: state.modelCount,
      error: state.error,
    };
  }

  async function syncRates({ force = false } = {}) {
    const currentNow = now();
    if (!force && state.fetchedAtMs > 0 && currentNow - state.fetchedAtMs < intervalMs) {
      return getStatus();
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const [modelsDevRes, litellmRes] = await Promise.allSettled([
          fetchJsonWithTimeout(modelsDevUrl, fetchImpl, timeoutMs).then(parseModelsDevPayload),
          fetchJsonWithTimeout(litellmUrl, fetchImpl, timeoutMs).then(parseLiteLlmPayload),
        ]);

        const modelsDevRates =
          modelsDevRes.status === 'fulfilled' ? modelsDevRes.value : {};
        const litellmRates =
          litellmRes.status === 'fulfilled' ? litellmRes.value : {};

        const succeededSources = [];
        if (Object.keys(modelsDevRates).length > 0) succeededSources.push('models.dev');
        if (Object.keys(litellmRates).length > 0) succeededSources.push('litellm');

        if (succeededSources.length === 0) {
          const errs = [];
          if (modelsDevRes.status === 'rejected') {
            errs.push(`models.dev: ${modelsDevRes.reason?.message || 'failed'}`);
          }
          if (litellmRes.status === 'rejected') {
            errs.push(`litellm: ${litellmRes.reason?.message || 'failed'}`);
          }
          state = {
            ...state,
            error: errs.join('; ') || '未获取到有效模型价格',
          };
          return getStatus();
        }

        const merged = mergeRemoteRateMaps({ litellmRates, modelsDevRates });
        setRuntimeRates(merged);

        const syncedAtMs = now();
        state = {
          ok: true,
          fetchedAtMs: syncedAtMs,
          sources: succeededSources,
          modelCount: Object.keys(merged).length,
          rates: merged,
          error: '',
        };

        await atomicWriteJson(cacheFile, {
          fetchedAtMs: syncedAtMs,
          sources: succeededSources,
          modelCount: state.modelCount,
          rates: merged,
        }).catch(() => {});

        return getStatus();
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return {
    cacheFile,
    loadCachedSync,
    syncRates,
    getStatus,
  };
}
