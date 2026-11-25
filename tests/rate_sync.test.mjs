import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  LITELLM_RATES_URL,
  MODELS_DEV_URL,
  RATE_SYNC_INTERVAL_MS,
  createRateSyncStore,
  mergeRemoteRateMaps,
  parseLiteLlmPayload,
  parseModelsDevPayload,
} from '../sidecars/agy_hud/backend/rate_sync.mjs';
import {
  clearRuntimeRates,
  estimateTurnCostUsd,
  getRateTableVersion,
  resolveModelRates,
} from '../sidecars/agy_hud/backend/weekly_usage.mjs';

test('parseModelsDevPayload extracts primary provider chat rates, skips non-chat models, and aliases dated keys', () => {
  const payload = {
    google: {
      models: {
        'gemini-4-argon': { cost: { input: 2, output: 10, cache_read: 0.1 } },
        'gemini-4-neon': { cost: { input: 3, output: 15, cache_read: 0.15 } },
        'text-embedding-004': { cost: { input: 0.02, output: 0 } },
      },
    },
    anthropic: {
      models: {
        'claude-haiku-4-5-20251001': { cost: { input: 1, output: 5, cache_read: 0.1 } },
        'claude-opus-5-5': { cost: { input: 4, output: 20, cache_read: 0.2 } },
      },
    },
    openai: {
      models: {
        'gpt-5': { cost: { input: 1.25, output: 10, cache_read: 0.125 } },
        'chatgpt-image-latest': { cost: { input: 5, output: 10 } },
      },
    },
    togetherai: {
      models: {
        'openai/gpt-oss-120b': { cost: { input: 0.15, output: 0.6, cache_read: 0.15 } },
      },
    },
  };

  const rates = parseModelsDevPayload(payload);
  assert.deepEqual(rates['gemini-4-argon'], { inPerM: 2, outPerM: 10, crPerM: 0.1 });
  assert.deepEqual(rates['gemini-4-neon'], { inPerM: 3, outPerM: 15, crPerM: 0.15 });
  assert.deepEqual(rates['claude-haiku-4-5'], { inPerM: 1, outPerM: 5, crPerM: 0.1 });
  assert.deepEqual(rates['claude-opus-5-5'], { inPerM: 4, outPerM: 20, crPerM: 0.2 });
  assert.deepEqual(rates['gpt-5'], { inPerM: 1.25, outPerM: 10, crPerM: 0.125 });
  assert.deepEqual(rates['gpt-oss-120b'], { inPerM: 0.15, outPerM: 0.6, crPerM: 0.15 });
  assert.equal(rates['text-embedding-004'], undefined);
  assert.equal(rates['chatgpt-image-latest'], undefined);
});

test('parseLiteLlmPayload converts per-token USD to per-1M and excludes reseller markups', () => {
  const payload = {
    sample_spec: { input_cost_per_token: 0.00001, output_cost_per_token: 0.00002 },
    'bedrock/claude-opus-4-6': { input_cost_per_token: 0.00009, output_cost_per_token: 0.0009 },
    'vertex_ai/gemini-4-carbon': { input_cost_per_token: 0.00008, output_cost_per_token: 0.0008 },
    'gemini/gemini-4-carbon': {
      input_cost_per_token: 0.000004,
      output_cost_per_token: 0.00002,
      cache_read_input_token_cost: 0.0000002,
    },
    'claude-sonnet-4-6': {
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
      cache_read_input_token_cost: 0.0000003,
    },
  };

  const rates = parseLiteLlmPayload(payload);
  assert.deepEqual(rates['gemini-4-carbon'], { inPerM: 4, outPerM: 20, crPerM: 0.2 });
  assert.deepEqual(rates['claude-sonnet-4-6'], { inPerM: 3, outPerM: 15, crPerM: 0.3 });
  assert.equal(rates['claude-opus-4-6'], undefined);

  const merged = mergeRemoteRateMaps({
    litellmRates: rates,
    modelsDevRates: {
      'gemini-4-carbon': { inPerM: 2, outPerM: 10, crPerM: 0.1 }, // Models.dev promo wins
    },
  });
  assert.deepEqual(merged['gemini-4-carbon'], { inPerM: 2, outPerM: 10, crPerM: 0.1 });
  assert.deepEqual(merged['gemini-pro-orchestrator'], { inPerM: 2, outPerM: 10, crPerM: 0.1 });
  assert.deepEqual(merged['claude-sonnet-4-6'], { inPerM: 3, outPerM: 15, crPerM: 0.3 });
});

test('createRateSyncStore syncs from Models.dev + LiteLLM, persists cache, respects 6h interval, and recalculates costs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-rates-'));
  let nowMs = Date.parse('2026-11-25T08:00:00.000Z');
  let fetchCalls = 0;

  try {
    clearRuntimeRates();
    const initialCost = estimateTurnCostUsd('gemini-4-argon-high', 500_000, 0, 100_000).costUsd;
    assert.equal(initialCost, 4); // Built-in $4/$20 => $2 + $2 = $4

    const vBefore = getRateTableVersion();
    const store = createRateSyncStore(tmpDir, {
      now: () => nowMs,
      fetchImpl: async (url) => {
        fetchCalls += 1;
        if (url === MODELS_DEV_URL) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              google: {
                models: {
                  'gemini-4-argon': { cost: { input: 2, output: 10, cache_read: 0.1 } },
                },
              },
            }),
          };
        }
        if (url === LITELLM_RATES_URL) {
          throw new Error('simulated litellm network error');
        }
        throw new Error(`unexpected url ${url}`);
      },
    });

    // 1. Sync succeeds even when LiteLLM fails (single-source resilience)
    const s1 = await store.syncRates();
    assert.equal(s1.ok, true);
    assert.deepEqual(s1.sources, ['models.dev']);
    assert.equal(fetchCalls, 2);
    assert.ok(getRateTableVersion() > vBefore);

    // Same historical token counts now recalculate immediately at updated promo rate ($2/$10 => $1 + $1 = $2)
    assert.equal(estimateTurnCostUsd('gemini-4-argon-high', 500_000, 0, 100_000).costUsd, 2);
    assert.equal(fs.existsSync(store.cacheFile), true);

    // 2. Within 6h interval, non-forced sync is skipped (no extra network calls)
    nowMs += 2 * 60 * 60 * 1000;
    await store.syncRates({ force: false });
    assert.equal(fetchCalls, 2);

    // 3. After 6h interval elapses, sync fetches again
    nowMs += RATE_SYNC_INTERVAL_MS;
    await store.syncRates({ force: false });
    assert.equal(fetchCalls, 4);

    // 4. Cold restart loads persisted cache immediately without network
    clearRuntimeRates();
    assert.deepEqual(resolveModelRates('gemini-4-argon-high'), { inPerM: 4, outPerM: 20, crPerM: 0.2 });
    const store2 = createRateSyncStore(tmpDir, { now: () => nowMs });
    store2.loadCachedSync();
    assert.deepEqual(resolveModelRates('gemini-4-argon-high'), { inPerM: 2, outPerM: 10, crPerM: 0.1 });
  } finally {
    clearRuntimeRates();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
