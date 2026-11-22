import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createQuotaClient,
  normalizeQuotaSummary,
  parseLsAddress,
} from '../sidecars/agy_hud/backend/quota.mjs';

test('parseLsAddress strictly allows loopback addresses only', () => {
  assert.deepEqual(parseLsAddress('127.0.0.1:5387'), {
    protocol: 'http',
    hostname: '127.0.0.1',
    port: 5387,
  });
  assert.deepEqual(parseLsAddress('https://localhost:8443'), {
    protocol: 'https',
    hostname: 'localhost',
    port: 8443,
  });
  assert.equal(parseLsAddress('https://evil.example.com:443'), null);
  assert.equal(parseLsAddress('192.168.1.5:5387'), null);
});

test('normalizeQuotaSummary orders Gemini, GPT&Claude, Argon and calculates remainingPct', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');
  const res = normalizeQuotaSummary(
    {
      groups: [
        {
          displayName: 'Argon Models',
          buckets: [
            {
              bucketId: 'argon-5h',
              window: '5h',
              remainingFraction: 0.62,
              resetTime: '2026-11-22T13:30:00.000Z',
            },
          ],
        },
        {
          displayName: 'Gemini Models',
          buckets: [
            {
              bucketId: 'gemini-5h',
              window: '5h',
              remainingFraction: 0.85,
              resetTime: '2026-11-22T15:00:00.000Z',
            },
            {
              bucketId: 'gemini-weekly',
              window: 'weekly',
              remainingFraction: 0.72,
              resetTime: '2026-11-26T12:00:00.000Z',
            },
          ],
        },
      ],
    },
    now,
  );

  assert.equal(res.available, true);
  assert.deepEqual(
    res.groups.map((g) => g.key),
    ['gemini', 'argon'],
  );
  assert.equal(res.groups[0].fiveHour.remainingPct, 85);
  assert.equal(res.groups[0].fiveHour.remainingMs, 3 * 3600 * 1000);
  assert.equal(res.groups[0].weekly.remainingPct, 72);
});

test('createQuotaClient caches within TTL and serves stale data on subsequent fetch failure', async () => {
  let calls = 0;
  let shouldFail = false;
  let fakeNow = 1_000_000;

  const client = createQuotaClient({
    env: { ANTIGRAVITY_LS_ADDRESS: '127.0.0.1:5387', ANTIGRAVITY_CSRF_TOKEN: 'mock-token' },
    ttlMs: 30_000,
    now: () => fakeNow,
    fetcher: async () => {
      calls += 1;
      if (shouldFail) throw new Error('mock transient error');
      return {
        groups: [
          {
            displayName: 'Gemini',
            buckets: [{ bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.9 }],
          },
        ],
      };
    },
  });

  const r1 = await client.getQuotaSummary();
  assert.equal(r1.ok, true);
  assert.equal(r1.stale, false);
  assert.equal(calls, 1);

  // Within TTL -> cached
  fakeNow += 5_000;
  const r2 = await client.getQuotaSummary();
  assert.equal(calls, 1);
  assert.equal(r2.groups[0].fiveHour.remainingPct, 90);

  // Expired + failure -> graceful stale fallback
  fakeNow += 40_000;
  shouldFail = true;
  const r3 = await client.getQuotaSummary();
  assert.equal(calls, 2);
  assert.equal(r3.stale, true);
  assert.equal(r3.available, true);
});
