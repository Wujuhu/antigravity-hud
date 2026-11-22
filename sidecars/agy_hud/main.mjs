/**
 * AGY HUD Sidecar Entrypoint.
 *
 * Runs as an Antigravity UI sidecar (aux_pane settings panel) and pushes
 * customizable live telemetry to the host composer bar via CDP when enabled.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PILL_ITEM_CATALOG,
  POPOVER_SECTION_CATALOG,
  createConfigStore,
} from './backend/config.mjs';
import { createQuotaClient } from './backend/quota.mjs';
import { collectLiveSnapshot } from './backend/telemetry_aggregator.mjs';
import { pushExpressionToTargets } from './backend/cdp_bridge.mjs';
import { generateWindowsCdpLauncher } from './backend/launcher_win.mjs';
import { generateMacCdpLauncher } from './backend/launcher_mac.mjs';
import {
  buildHudInjectExpression,
  buildHudRemoveExpression,
} from './hud/hud_runtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL_DIR = join(__dirname, 'panel');
const NO_STORE = { 'Cache-Control': 'no-store' };

const configStore = createConfigStore();
const quotaClient = createQuotaClient();

let activeConversationId = '';
let latestSnapshot = null;
let latestCdpStatus = {
  connected: false,
  port: configStore.get().cdpPort,
  injectedCount: 0,
  anchorFound: false,
  error: '尚未同步',
};
let latestLauncherInfo = null;
let syncInFlight = false;
let pollTimer = null;

async function syncOnce({ forceQuota = false } = {}) {
  if (syncInFlight) return latestSnapshot;
  syncInFlight = true;
  try {
    const config = configStore.get();
    const snapshot = await collectLiveSnapshot({
      conversationId: activeConversationId,
      quotaClient,
      config,
      forceQuota,
    });
    latestSnapshot = snapshot;

    if (config.cdpEnabled) {
      const expr = buildHudInjectExpression(snapshot, config);
      latestCdpStatus = await pushExpressionToTargets({
        port: config.cdpPort,
        expression: expr,
      });
    } else {
      latestCdpStatus = {
        connected: false,
        port: config.cdpPort,
        injectedCount: 0,
        anchorFound: false,
        error: '已在设置中暂停 CDP 注入',
      };
    }
    return snapshot;
  } finally {
    syncInFlight = false;
  }
}

function restartPollingLoop() {
  if (pollTimer) clearInterval(pollTimer);
  const interval = configStore.get().pollIntervalMs || 1800;
  pollTimer = setInterval(() => {
    syncOnce().catch(() => {});
  }, interval);
  pollTimer.unref?.();
}

async function generatePlatformLauncher() {
  const cfg = configStore.get();
  if (process.platform === 'win32') {
    latestLauncherInfo = await generateWindowsCdpLauncher({
      dataDir: configStore.dataDir,
      port: cfg.cdpPort,
    });
  } else if (process.platform === 'darwin') {
    latestLauncherInfo = await generateMacCdpLauncher({
      port: cfg.cdpPort,
    });
  } else {
    latestLauncherInfo = {
      platform: process.platform,
      port: cfg.cdpPort,
      manualCommand: `antigravity --remote-debugging-port=${cfg.cdpPort}`,
    };
  }
  return latestLauncherInfo;
}

function buildStatePayload() {
  return {
    platform: process.platform,
    config: configStore.get(),
    snapshot: latestSnapshot,
    cdpStatus: latestCdpStatus,
    launcherInfo: latestLauncherInfo,
    catalogs: {
      pillItems: PILL_ITEM_CATALOG,
      popoverSections: POPOVER_SECTION_CATALOG,
    },
  };
}

async function handleApiRequest(method, urlPath, bodyObj = {}, queryConvId = '') {
  if (queryConvId) activeConversationId = queryConvId;

  if (method === 'GET' && urlPath === '/api/state') {
    if (!latestSnapshot) {
      await syncOnce();
    }
    return buildStatePayload();
  }

  if (method === 'POST' && urlPath === '/api/refresh') {
    await syncOnce({ forceQuota: true });
    return buildStatePayload();
  }

  if (method === 'POST' && urlPath === '/api/config') {
    const prev = configStore.get();
    const next = await configStore.save(bodyObj);
    if (prev.cdpEnabled && !next.cdpEnabled) {
      await pushExpressionToTargets({
        port: prev.cdpPort,
        expression: buildHudRemoveExpression(),
      }).catch(() => {});
    }
    restartPollingLoop();
    await syncOnce();
    return buildStatePayload();
  }

  if (method === 'POST' && urlPath === '/api/config/reset') {
    await configStore.reset();
    restartPollingLoop();
    await syncOnce();
    return buildStatePayload();
  }

  if (method === 'POST' && urlPath === '/api/launcher/generate') {
    const info = await generatePlatformLauncher();
    return { ok: true, launcherInfo: info, state: buildStatePayload() };
  }

  if (method === 'POST' && urlPath === '/api/cdp/remove') {
    const cfg = configStore.get();
    const res = await pushExpressionToTargets({
      port: cfg.cdpPort,
      expression: buildHudRemoveExpression(),
    });
    return { ok: true, result: res };
  }

  return { ok: false, error: `Unknown endpoint: ${method} ${urlPath}` };
}

async function start() {
  restartPollingLoop();
  syncOnce().catch(() => {});

  // Try Antigravity's native sidecar_sdk first; fall back to standalone HTTP server for local preview/debug
  let sdk = null;
  try {
    sdk = await import('sidecar_sdk');
  } catch {
    sdk = null;
  }

  if (sdk?.SidecarApp && sdk?.Response) {
    const { SidecarApp, Response } = sdk;
    const app = new SidecarApp();

    app.page('/', () => new Response(readFileSync(join(PANEL_DIR, 'index.html'), 'utf8'), {
      contentType: 'text/html; charset=utf-8',
      headers: NO_STORE,
    }));

    const staticFiles = {
      '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
      '/app.js': ['app.js', 'application/javascript; charset=utf-8'],
    };
    for (const [route, [file, contentType]] of Object.entries(staticFiles)) {
      app.api(
        route,
        () => new Response(readFileSync(join(PANEL_DIR, file), 'utf8'), { contentType, headers: NO_STORE }),
        'GET',
      );
    }

    app.api('/api/state', async (data) => {
      const conv = (typeof data?.conversationId === 'string' && data.conversationId.trim()) || app.config?.conversationId || '';
      return handleApiRequest('GET', '/api/state', {}, conv);
    }, 'GET');

    for (const postRoute of [
      '/api/refresh',
      '/api/config',
      '/api/config/reset',
      '/api/launcher/generate',
      '/api/cdp/remove',
    ]) {
      app.api(postRoute, async (data) => {
        const conv = app.config?.conversationId || '';
        return handleApiRequest('POST', postRoute, data || {}, conv);
      }, 'POST');
    }

    app.run();
    return;
  }

  // Standalone HTTP server fallback (useful for local testing outside Antigravity)
  const port = Number(process.env.AGY_HUD_DEV_PORT || 47821);
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && u.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE });
        res.end(readFileSync(join(PANEL_DIR, 'index.html'), 'utf8'));
        return;
      }
      if (req.method === 'GET' && u.pathname === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', ...NO_STORE });
        res.end(readFileSync(join(PANEL_DIR, 'styles.css'), 'utf8'));
        return;
      }
      if (req.method === 'GET' && u.pathname === '/app.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', ...NO_STORE });
        res.end(readFileSync(join(PANEL_DIR, 'app.js'), 'utf8'));
        return;
      }

      let body = {};
      if (req.method === 'POST') {
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw.trim()) body = JSON.parse(raw);
      }

      const payload = await handleApiRequest(
        req.method || 'GET',
        u.pathname,
        body,
        u.searchParams.get('conversationId') || '',
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[AGY HUD] Standalone preview server listening at http://127.0.0.1:${port}`);
  });
}

start().catch((err) => {
  console.error('[AGY HUD] Fatal startup error:', err);
  process.exitCode = 1;
});
