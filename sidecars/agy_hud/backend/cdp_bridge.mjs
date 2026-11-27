/**
 * Cross-platform CDP bridge adapted from aishadiaodeqishui/agy-monitor
 * (backend/cdp_theme_bridge.mjs, MIT License).
 *
 * Works identically on Windows, macOS (darwin), and Linux using Node.js 22+
 * built-in `fetch` and `WebSocket`. Zero external dependencies.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_CDP_PORT,
  LEGACY_DEFAULT_CDP_PORT,
  normalizeCdpPort,
} from './config.mjs';

export function getDefaultAntigravityUserDataDirs({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
} = {}) {
  const dirs = [];
  if (platform === 'win32') {
    const appData = env?.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    dirs.push(path.join(appData, 'Antigravity'), path.join(appData, 'antigravity'));
  } else if (platform === 'darwin') {
    dirs.push(
      path.join(homedir, 'Library', 'Application Support', 'Antigravity'),
      path.join(homedir, 'Library', 'Application Support', 'antigravity'),
    );
  } else {
    const xdg = env?.XDG_CONFIG_HOME || path.join(homedir, '.config');
    dirs.push(path.join(xdg, 'Antigravity'), path.join(xdg, 'antigravity'));
  }
  return Array.from(new Set(dirs));
}

/**
 * Read Chromium/Electron's `DevToolsActivePort` file written automatically when
 * Antigravity starts with `--remote-debugging-port=0` (or any port).
 */
export function readDevToolsActivePort({
  userDataDirs = null,
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
} = {}) {
  const dirs = Array.isArray(userDataDirs)
    ? userDataDirs
    : getDefaultAntigravityUserDataDirs({ platform, env, homedir });

  let best = null;
  for (const dir of dirs) {
    if (!dir) continue;
    const filePath = path.join(dir, 'DevToolsActivePort');
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) continue;
      const lines = raw.split(/\r?\n/);
      const port = Number(String(lines[0] || '').trim());
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      const wsPath = String(lines[1] || '').trim();
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { port, wsPath, filePath, mtimeMs: stat.mtimeMs };
      }
    } catch {
      // ignore missing/unreadable candidate
    }
  }
  return best;
}

/**
 * Build ordered, deduplicated list of CDP ports to probe:
 *   1. Active dynamic port from `DevToolsActivePort` (highest priority)
 *   2. Configured fixed port (if > 0)
 *   3. Legacy default fixed port 9229 (backward compatibility with old shortcuts)
 */
export function resolveCandidateCdpPorts(
  configuredPort = DEFAULT_CDP_PORT,
  { userDataDirs = null, platform = process.platform, env = process.env, homedir = os.homedir() } = {},
) {
  const out = [];
  const add = (p) => {
    const n = Number(p);
    if (Number.isInteger(n) && n >= 1 && n <= 65535 && !out.includes(n)) {
      out.push(n);
    }
  };

  const active = readDevToolsActivePort({ userDataDirs, platform, env, homedir });
  if (active?.port) add(active.port);

  const cfgPort = normalizeCdpPort(configuredPort, DEFAULT_CDP_PORT);
  if (cfgPort > 0) add(cfgPort);
  add(LEGACY_DEFAULT_CDP_PORT);
  return out;
}

const CONV_URL_PATH_RE = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const CONV_URL_QUERY_RE = /[?&]conversationId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function extractConversationIdFromUrl(url = '') {
  const s = String(url || '').trim();
  if (!s) return '';
  const mPath = s.match(CONV_URL_PATH_RE);
  if (mPath) return mPath[1].toLowerCase();
  const mQuery = s.match(CONV_URL_QUERY_RE);
  if (mQuery) return mQuery[1].toLowerCase();
  return '';
}

export function isAntigravityAppTarget(target) {
  if (!target || !target.webSocketDebuggerUrl) return false;
  const tType = String(target.type || '').toLowerCase();
  if (tType !== 'page' && tType !== 'webview' && tType !== 'iframe') return false;

  const url = String(target.url || '').trim();
  const low = url.toLowerCase();
  const title = String(target.title || '').trim();
  const lowTitle = title.toLowerCase();
  if (!low) return false;

  if (
    low.startsWith('devtools://') ||
    low.startsWith('chrome-extension://') ||
    low.startsWith('chrome://') ||
    low.startsWith('about:') ||
    low.startsWith('blob:') ||
    low.startsWith('data:') ||
    low.startsWith('plugin://')
  ) {
    return false;
  }

  // Never inject into AGY HUD's own sidecar settings panel or other sidecars
  if (
    lowTitle === 'agy hud' ||
    low.includes('/agy_hud') ||
    low.includes('sidecar://')
  ) {
    return false;
  }

  const isLoopbackHttp =
    low.startsWith('https://127.0.0.1:') ||
    low.startsWith('https://localhost:') ||
    low.startsWith('http://127.0.0.1:') ||
    low.startsWith('http://localhost:');
  if (isLoopbackHttp) {
    if (tType !== 'page') return false;
    return (
      lowTitle === 'antigravity' ||
      lowTitle.endsWith(' - antigravity') ||
      lowTitle.includes('antigravity')
    );
  }

  if (low.startsWith('https://') || low.startsWith('http://')) {
    return false;
  }

  return true;
}

export async function listCdpTargets(port = LEGACY_DEFAULT_CDP_PORT, { host = '127.0.0.1', timeoutMs = 1500 } = {}) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    return { ok: false, status: 0, port: 0, targets: [], error: '无效的 CDP 端口' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${p}/json/list`, {
      signal: controller.signal,
      headers: { Connection: 'close' },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, port: p, targets: [] };
    }
    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : [];
    const targets = list.filter(isAntigravityAppTarget);
    return { ok: true, status: res.status, port: p, targets, totalTargets: list.length };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      port: p,
      targets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe candidate CDP ports (`DevToolsActivePort` first, then configured/legacy port)
 * and return the first live endpoint serving Antigravity targets.
 */
export async function discoverCdpTargets(
  configuredPort = DEFAULT_CDP_PORT,
  {
    host = '127.0.0.1',
    timeoutMs = 1500,
    userDataDirs = null,
    platform = process.platform,
    env = process.env,
    homedir = os.homedir(),
    listTargetsImpl = listCdpTargets,
  } = {},
) {
  const candidates = resolveCandidateCdpPorts(configuredPort, {
    userDataDirs,
    platform,
    env,
    homedir,
  });

  let emptyOkFallback = null;
  let lastError = '';

  for (const candPort of candidates) {
    const res = await listTargetsImpl(candPort, { host, timeoutMs });
    if (res.ok && Array.isArray(res.targets) && res.targets.length > 0) {
      return { ...res, port: candPort, triedPorts: candidates };
    }
    if (res.ok && !emptyOkFallback) {
      emptyOkFallback = { ...res, port: candPort, triedPorts: candidates };
    } else if (res.error) {
      lastError = res.error;
    }
  }

  if (emptyOkFallback) return emptyOkFallback;
  return {
    ok: false,
    status: 0,
    port: candidates[0] || 0,
    targets: [],
    triedPorts: candidates,
    error: lastError || 'CDP 调试端口未就绪',
  };
}

export function cdpEvaluate(wsUrl, expression, { timeoutMs = 2500 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') {
      reject(new Error('当前 Node.js 版本不支持原生 WebSocket（需要 Node.js >= 22.5.0）'));
      return;
    }

    let settled = false;
    let ws = null;
    const reqId = 1;
    const timer = setTimeout(() => {
      finish(new Error('CDP Runtime.evaluate 超时'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch {
          // ignore close errors
        }
        ws = null;
      }
    };

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(value);
    };

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      finish(err instanceof Error ? err : new Error('无法创建 CDP WebSocket'));
      return;
    }

    ws.addEventListener('open', () => {
      try {
        ws.send(
          JSON.stringify({
            id: reqId,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true },
          }),
        );
      } catch (err) {
        finish(err instanceof Error ? err : new Error('CDP 消息发送失败'));
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data || '{}'));
        if (msg.id !== reqId) return;
        if (msg.error) {
          finish(new Error(msg.error.message || 'CDP 协议返回错误'));
          return;
        }
        if (msg.result?.exceptionDetails) {
          const desc =
            msg.result.exceptionDetails.exception?.description ||
            msg.result.exceptionDetails.text ||
            '页面执行脚本异常';
          finish(new Error(desc));
          return;
        }
        finish(null, msg.result?.result?.value);
      } catch (err) {
        finish(err instanceof Error ? err : new Error('CDP 响应解析失败'));
      }
    });

    ws.addEventListener('error', () => {
      finish(new Error('CDP WebSocket 连接失败'));
    });

    ws.addEventListener('close', () => {
      if (!settled) {
        finish(new Error('CDP WebSocket 在返回前已关闭'));
      }
    });
  });
}

export async function pushExpressionToTargets({
  port = DEFAULT_CDP_PORT,
  expression = '',
  buildExpressionForTarget = null,
  targetsOverride = null,
  timeoutMs = 2500,
} = {}) {
  const discovery = targetsOverride
    ? { ok: true, port, targets: targetsOverride }
    : await discoverCdpTargets(port, { timeoutMs: Math.min(timeoutMs, 1500) });
  const activePort = discovery.port || port;
  if (!discovery.ok) {
    return {
      connected: false,
      port: activePort,
      injectedCount: 0,
      anchorFound: false,
      detectedConversationId: '',
      error: discovery.error || 'CDP 调试端口未就绪',
    };
  }

  let injectedCount = 0;
  let anchorFound = false;
  let detectedConversationId = '';
  let lastError = '';

  for (const target of discovery.targets) {
    try {
      const targetConvId = extractConversationIdFromUrl(target.url);
      if (targetConvId) detectedConversationId = targetConvId;
      const expr = typeof buildExpressionForTarget === 'function'
        ? await buildExpressionForTarget(target, targetConvId)
        : expression;
      if (!expr) continue;
      const val = await cdpEvaluate(target.webSocketDebuggerUrl, expr, { timeoutMs });
      injectedCount += 1;
      if (val && val.mounted) {
        anchorFound = true;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    connected: discovery.targets.length > 0 && injectedCount > 0,
    port: activePort,
    targetCount: discovery.targets.length,
    injectedCount,
    anchorFound,
    detectedConversationId,
    error: injectedCount === 0 ? lastError || '未找到 Antigravity 主窗口页面' : '',
  };
}
