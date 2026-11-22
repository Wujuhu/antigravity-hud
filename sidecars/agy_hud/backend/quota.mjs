/**
 * Upstream source: https://github.com/aishadiaodeqishui/agy-monitor
 * Original file: sidecars/agy_monitor/backend/quota.mjs
 * License: MIT (see THIRD_PARTY_NOTICES.md)
 */
/**
 * Antigravity native quota summary reader.
 *
 * Calls the local Antigravity Language Server Connect-RPC endpoint
 * `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`
 * using the platform-injected loopback address (`ANTIGRAVITY_LS_ADDRESS`) and
 * CSRF token (`ANTIGRAVITY_CSRF_TOKEN`), with short in-memory TTL caching and
 * graceful degradation when unavailable.
 */

import http from 'node:http';
import https from 'node:https';

const QUOTA_RPC_PATH =
  '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary';
const MAX_RESPONSE_BYTES = 512 * 1024;
const ALLOWED_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Parse and validate `ANTIGRAVITY_LS_ADDRESS` strictly against loopback hosts.
 */
export function parseLsAddress(rawAddress) {
  const raw = typeof rawAddress === 'string' ? rawAddress.trim() : '';
  if (!raw) return null;

  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const protocol = parsed.protocol === 'https:' ? 'https' : parsed.protocol === 'http:' ? 'http' : '';
  if (!protocol) return null;

  const rawHost = String(parsed.hostname || '').toLowerCase();
  if (!ALLOWED_LOOPBACK_HOSTS.has(rawHost)) {
    return null;
  }
  const hostname = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;

  const port = Number(parsed.port || (protocol === 'https' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { protocol, hostname, port };
}

function clampFraction(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function normalizeBucket(raw, nowMs) {
  if (!raw || typeof raw !== 'object') return null;

  const bucketId = typeof raw.bucketId === 'string'
    ? raw.bucketId.trim()
    : typeof raw.bucket_id === 'string'
      ? raw.bucket_id.trim()
      : '';
  const windowRaw = typeof raw.window === 'string' ? raw.window.trim().toLowerCase() : '';
  const displayName = typeof raw.displayName === 'string'
    ? raw.displayName.trim()
    : typeof raw.display_name === 'string'
      ? raw.display_name.trim()
      : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const disabled = Boolean(raw.disabled);

  const fractionRaw =
    raw.remainingFraction !== undefined
      ? raw.remainingFraction
      : raw.remaining_fraction !== undefined
        ? raw.remaining_fraction
        : null;
  const remainingFraction = clampFraction(fractionRaw);
  const remainingPct = remainingFraction === null ? null : Math.round(remainingFraction * 100);
  const remainingPctExact =
    remainingFraction === null ? null : Math.round(remainingFraction * 1000) / 10;

  const resetTime = typeof raw.resetTime === 'string'
    ? raw.resetTime.trim()
    : typeof raw.reset_time === 'string'
      ? raw.reset_time.trim()
      : '';
  const parsedResetMs = resetTime ? Date.parse(resetTime) : Number.NaN;
  const resetTimeMs = Number.isFinite(parsedResetMs) ? parsedResetMs : null;

  let windowKind = 'other';
  if (
    windowRaw === '5h' ||
    windowRaw.includes('5h') ||
    windowRaw.includes('5-hour') ||
    windowRaw.includes('five_hour') ||
    bucketId.toLowerCase().includes('5h')
  ) {
    windowKind = '5h';
  } else if (
    windowRaw === 'weekly' ||
    windowRaw.includes('week') ||
    windowRaw === '7d' ||
    bucketId.toLowerCase().includes('weekly')
  ) {
    windowKind = 'weekly';
  }

  // Official UI omits countdown when remainingFraction is exact 1.0 with no usage description
  const isFull =
    remainingFraction !== null && remainingFraction >= 0.99999 && !description;
  const remainingMs =
    resetTimeMs !== null ? Math.max(0, resetTimeMs - nowMs) : null;

  return {
    bucketId,
    window: windowKind,
    rawWindow: windowRaw || windowKind,
    displayName,
    description,
    disabled,
    remainingFraction,
    remainingPct,
    remainingPctExact,
    resetTime,
    resetTimeMs,
    remainingMs,
    isFull,
  };
}

function classifyQuotaGroup(rawGroup, index) {
  const displayName = typeof rawGroup?.displayName === 'string'
    ? rawGroup.displayName.trim()
    : typeof rawGroup?.display_name === 'string'
      ? rawGroup.display_name.trim()
      : '';
  const lowerName = displayName.toLowerCase();
  const buckets = Array.isArray(rawGroup?.buckets) ? rawGroup.buckets : [];
  const bucketIds = buckets
    .map((b) => String(b?.bucketId || b?.bucket_id || '').toLowerCase())
    .join(' ');

  if (lowerName.includes('argon') || bucketIds.includes('argon')) {
    return { key: 'argon', label: 'Argon', order: 2 };
  }
  if (
    lowerName.includes('claude') ||
    lowerName.includes('gpt') ||
    lowerName.includes('3p') ||
    bucketIds.includes('3p-')
  ) {
    return { key: 'gpt_claude', label: 'GPT&Claude', order: 1 };
  }
  if (lowerName.includes('gemini') || bucketIds.includes('gemini-')) {
    return { key: 'gemini', label: 'Gemini', order: 0 };
  }

  const fallbackLabel = displayName ? displayName.slice(0, 16) : `Group ${index + 1}`;
  const fallbackKey =
    lowerName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `group_${index + 1}`;
  return { key: fallbackKey, label: fallbackLabel, order: 10 + index };
}

/**
 * Normalize raw RetrieveUserQuotaSummaryResponse into compact UI-ready groups.
 */
export function normalizeQuotaSummary(payload, nowMs = Date.now()) {
  const root =
    payload && typeof payload === 'object' && payload.response && typeof payload.response === 'object'
      ? payload.response
      : payload && typeof payload === 'object'
        ? payload
        : {};

  const rawGroups = Array.isArray(root.groups) ? root.groups : [];
  const groups = rawGroups.map((rawGroup, index) => {
    const meta = classifyQuotaGroup(rawGroup, index);
    const displayName = typeof rawGroup?.displayName === 'string'
      ? rawGroup.displayName.trim()
      : typeof rawGroup?.display_name === 'string'
        ? rawGroup.display_name.trim()
        : meta.label;
    const description = typeof rawGroup?.description === 'string' ? rawGroup.description.trim() : '';
    const rawBuckets = Array.isArray(rawGroup?.buckets) ? rawGroup.buckets : [];
    const normalizedBuckets = rawBuckets
      .map((b) => normalizeBucket(b, nowMs))
      .filter(Boolean);

    const fiveHour = normalizedBuckets.find((b) => b.window === '5h') || null;
    const weekly = normalizedBuckets.find((b) => b.window === 'weekly') || null;

    return {
      key: meta.key,
      label: meta.label,
      order: meta.order,
      displayName,
      description,
      fiveHour,
      weekly,
      buckets: normalizedBuckets,
    };
  });

  // Sort consistently: Gemini -> GPT&Claude -> Argon -> any additional groups
  groups.sort((a, b) => a.order - b.order);

  // Strip internal sort field from public output
  const cleanGroups = groups.map(({ order: _order, ...rest }) => rest);

  return {
    ok: true,
    available: cleanGroups.length > 0,
    stale: false,
    fetchedAtMs: nowMs,
    description: typeof root.description === 'string' ? root.description.trim() : '',
    groups: cleanGroups,
  };
}

/**
 * Perform the local Connect-RPC HTTP(S) call to Antigravity Language Server.
 */
export function callRetrieveUserQuotaSummary({
  address,
  csrfToken,
  timeoutMs = 3500,
} = {}) {
  return new Promise((resolve, reject) => {
    const parsed = parseLsAddress(address);
    if (!parsed) {
      const err = new Error('ANTIGRAVITY_LS_ADDRESS 无效或非本机回环地址');
      err.code = 'invalid_address';
      reject(err);
      return;
    }
    const token = typeof csrfToken === 'string' ? csrfToken.trim() : '';
    if (!token) {
      const err = new Error('缺少宿主注入的 ANTIGRAVITY_CSRF_TOKEN');
      err.code = 'missing_token';
      reject(err);
      return;
    }

    const transport = parsed.protocol === 'https' ? https : http;
    const body = '{}';
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(val);
    };

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: QUOTA_RPC_PATH,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': token,
      },
    };
    if (parsed.protocol === 'https') {
      reqOptions.rejectUnauthorized = false;
    }

    const req = transport.request(reqOptions, (res) => {
      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          req.destroy();
          const err = new Error('配额接口响应体积超出安全上限');
          err.code = 'response_too_large';
          finish(err);
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8');
        let parsedJson = null;
        try {
          parsedJson = rawText ? JSON.parse(rawText) : {};
        } catch {
          parsedJson = null;
        }

        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) {
          const rpcMsg =
            typeof parsedJson?.message === 'string' && parsedJson.message.trim()
              ? parsedJson.message.trim()
              : `HTTP ${status}`;
          const err = new Error(rpcMsg);
          err.status = status;
          err.code =
            typeof parsedJson?.code === 'string' && parsedJson.code.trim()
              ? parsedJson.code.trim()
              : `http_${status}`;
          finish(err);
          return;
        }

        if (!parsedJson || typeof parsedJson !== 'object') {
          const err = new Error('配额接口返回了无效 JSON');
          err.code = 'invalid_json';
          finish(err);
          return;
        }
        finish(null, parsedJson);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const err = new Error('连接本地配额服务超时');
      err.code = 'timeout';
      finish(err);
    });

    req.on('error', (err) => {
      const wrapped = new Error(err?.message || '连接本地配额服务失败');
      wrapped.code = err?.code || 'network_error';
      finish(wrapped);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Create a cached, coalesced quota fetcher bound to the current process env.
 */
export function createQuotaClient({
  env = process.env,
  ttlMs = 30_000,
  minForceIntervalMs = 2_500,
  timeoutMs = 3_500,
  fetcher = callRetrieveUserQuotaSummary,
  now = () => Date.now(),
} = {}) {
  let cached = null;
  let lastAttemptAtMs = 0;
  let inFlight = null;

  async function getQuotaSummary({ force = false } = {}) {
    const currentNow = now();
    if (cached) {
      const age = currentNow - cached.fetchedAtMs;
      if (!force && age >= 0 && age < ttlMs) {
        return cached;
      }
      if (force && currentNow - lastAttemptAtMs < minForceIntervalMs) {
        return cached;
      }
    }

    if (inFlight) {
      return inFlight;
    }

    const address = env?.ANTIGRAVITY_LS_ADDRESS || '';
    const csrfToken = env?.ANTIGRAVITY_CSRF_TOKEN || '';

    if (!address || !csrfToken) {
      return {
        ok: false,
        available: false,
        stale: false,
        code: 'env_unavailable',
        error: '当前运行环境未注入宿主配额服务凭据',
        fetchedAtMs: currentNow,
        groups: [],
      };
    }

    lastAttemptAtMs = currentNow;
    inFlight = (async () => {
      try {
        const raw = await fetcher({ address, csrfToken, timeoutMs });
        const normalized = normalizeQuotaSummary(raw, now());
        cached = normalized;
        return normalized;
      } catch (err) {
        const code = typeof err?.code === 'string' ? err.code : 'fetch_failed';
        const message =
          typeof err?.message === 'string' && err.message.trim()
            ? err.message.trim().slice(0, 180)
            : '获取官方配额失败';
        if (cached) {
          return {
            ...cached,
            stale: true,
            code,
            error: message,
          };
        }
        return {
          ok: false,
          available: false,
          stale: false,
          code,
          error: message,
          fetchedAtMs: now(),
          groups: [],
        };
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  function clearCache() {
    cached = null;
    lastAttemptAtMs = 0;
  }

  return {
    getQuotaSummary,
    clearCache,
  };
}
