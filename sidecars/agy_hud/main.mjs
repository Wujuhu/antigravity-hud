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
  DEFAULT_UPDATE_REPO_SLUG,
  PILL_ITEM_CATALOG,
  POPOVER_SECTION_CATALOG,
  createConfigStore,
} from './backend/config.mjs';
import { createQuotaClient } from './backend/quota.mjs';
import { collectLiveSnapshot } from './backend/telemetry_aggregator.mjs';
import {
  discoverCdpTargets,
  extractConversationIdFromUrl,
  pushExpressionToTargets,
} from './backend/cdp_bridge.mjs';
import { createLauncherReconciler } from './backend/launcher_check.mjs';
import {
  buildHudInjectExpression,
  buildHudRemoveExpression,
} from './hud/hud_runtime.mjs';
import {
  buildWeeklyQuotaEstimates,
  scanWeeklyLocalUsage,
} from './backend/weekly_usage.mjs';
import { createQuotaAnchorStore } from './backend/quota_anchors.mjs';
import {
  applyPluginUpdate,
  checkForUpdates,
  readInstalledVersion,
} from './backend/updater.mjs';
import { ensureLauncherSyncedToCurrentVersion } from './backend/sync_launcher.mjs';
import {
  RATE_SYNC_INTERVAL_MS,
  createRateSyncStore,
} from './backend/rate_sync.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');
const PANEL_DIR = join(__dirname, 'panel');
const NO_STORE = { 'Cache-Control': 'no-store' };
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const configStore = createConfigStore();
const quotaClient = createQuotaClient();
const quotaAnchorStore = createQuotaAnchorStore(configStore.dataDir);
const rateSyncStore = createRateSyncStore(configStore.dataDir);
rateSyncStore.loadCachedSync();
const launcherReconciler = createLauncherReconciler({
  platform: process.platform,
  dataDir: configStore.dataDir,
});

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
let latestLauncherStatus = null;
let lastWeeklyComputedAtMs = null;
let latestUpdateStatus = {
  ok: false,
  configured: Boolean(configStore.get().updateRepoSlug || DEFAULT_UPDATE_REPO_SLUG),
  currentVersion: readInstalledVersion(PLUGIN_ROOT),
  latestVersion: readInstalledVersion(PLUGIN_ROOT),
  hasUpdate: false,
  applying: false,
  appliedVersion: '',
  checkedAtMs: null,
  error: '',
};
let syncInFlightPromise = null;
let pollTimer = null;
let updateTimer = null;
let rateSyncTimer = null;

async function syncOnce({ forceQuota = false } = {}) {
  if (syncInFlightPromise) return syncInFlightPromise;
  syncInFlightPromise = (async () => {
    try {
    const config = configStore.get();

    // Fetch quota once per sync cycle (cached internally by quotaClient)
    let quotaSummary = null;
    try {
      quotaSummary = await quotaClient.getQuotaSummary({ force: forceQuota });
    } catch {
      quotaSummary = null;
    }

    const snapCache = new Map();
    const getSnapshotForConv = async (convId, allowFallbackRecent) => {
      const cacheKey = `${convId || ''}|${allowFallbackRecent ? '1' : '0'}`;
      if (snapCache.has(cacheKey)) return snapCache.get(cacheKey);
      const snap = await collectLiveSnapshot({
        conversationId: convId,
        allowFallbackRecent,
        quotaClient,
        quotaSummaryOverride: quotaSummary,
        config,
        forceQuota: false,
        includeWeeklyEstimate: false,
      });
      snapCache.set(cacheKey, snap);
      return snap;
    };

    let primarySnapshot = null;

      if (config.cdpEnabled) {
        const discovery = await discoverCdpTargets(config.cdpPort, { timeoutMs: 1500 });
        if (discovery.ok && discovery.targets.length > 0) {
          let lastTargetSnap = null;
          latestCdpStatus = await pushExpressionToTargets({
            port: discovery.port || config.cdpPort,
            targetsOverride: discovery.targets,
            buildExpressionForTarget: async (target, targetConvId) => {
              // If target URL is an Antigravity loopback web app without /c/<uuid>, it's a fresh/home view
              const lowUrl = String(target.url || '').toLowerCase();
              const isWebAppHome =
                !targetConvId &&
                (lowUrl.startsWith('https://127.0.0.1:') ||
                  lowUrl.startsWith('https://localhost:') ||
                  lowUrl.startsWith('http://127.0.0.1:') ||
                  lowUrl.startsWith('http://localhost:'));
              const convToUse = targetConvId || (isWebAppHome ? '' : activeConversationId);
              const allowFallback = !isWebAppHome;
              const snap = await getSnapshotForConv(convToUse, allowFallback);
              lastTargetSnap = snap;
              return buildHudInjectExpression(snap, config);
            },
          });
          if (latestCdpStatus.detectedConversationId) {
            activeConversationId = latestCdpStatus.detectedConversationId;
          }
          primarySnapshot = lastTargetSnap;
        } else {
          latestCdpStatus = {
            connected: false,
            port: discovery.port || config.cdpPort,
            injectedCount: 0,
            anchorFound: false,
            detectedConversationId: '',
            error: discovery.error || 'CDP 调试端口未就绪',
          };
        }
      } else {
      latestCdpStatus = {
        connected: false,
        port: config.cdpPort,
        injectedCount: 0,
        anchorFound: false,
        detectedConversationId: '',
        error: '已在设置中暂停 CDP 注入',
      };
    }

    if (!primarySnapshot) {
      primarySnapshot = await getSnapshotForConv(activeConversationId, true);
    }
    latestSnapshot = primarySnapshot;

    // O(1) in-memory anchor check (never reads transcript logs) so ad-hoc/natural
    // quota resets are captured immediately even while the sidecar panel is closed.
    if (primarySnapshot?.quota?.available && Array.isArray(primarySnapshot.quota.groups)) {
      quotaAnchorStore.observe(primarySnapshot.quota.groups);
    }

    // Reset outage tracking immediately once CDP injection is healthy again (pure O(1) in-memory)
    if (latestCdpStatus?.connected) {
      await reconcileLauncherStatus();
    }

      return primarySnapshot;
    } finally {
      syncInFlightPromise = null;
    }
  })();
  return syncInFlightPromise;
}

function restartPollingLoop() {
  if (pollTimer) clearInterval(pollTimer);
  const configured = configStore.get().pollIntervalMs || 1200;
  const interval = Math.max(800, Math.min(configured, 1200));
  pollTimer = setInterval(() => {
    syncOnce().catch(() => {});
  }, interval);
  pollTimer.unref?.();
}

async function runUpdateCheck({ allowAutoApply = false } = {}) {
  const cfg = configStore.get();
  const currentVersion = readInstalledVersion(PLUGIN_ROOT);
  const res = await checkForUpdates({
    repoSlug: cfg.updateRepoSlug || DEFAULT_UPDATE_REPO_SLUG,
    currentVersion,
  });
  latestUpdateStatus = {
    ...latestUpdateStatus,
    ...res,
    applying: false,
  };

  if (allowAutoApply && cfg.autoApplyUpdate && res.ok && res.hasUpdate && res.downloadUrl) {
    await runApplyUpdate();
  }
  return latestUpdateStatus;
}

async function runApplyUpdate() {
  if (!latestUpdateStatus?.downloadUrl) {
    await runUpdateCheck({ allowAutoApply: false });
  }
  if (!latestUpdateStatus?.downloadUrl) {
    return { ok: false, error: latestUpdateStatus?.error || '未找到可下载的更新包' };
  }
  latestUpdateStatus = { ...latestUpdateStatus, applying: true, error: '' };
  try {
    const applied = await applyPluginUpdate({
      downloadUrl: latestUpdateStatus.downloadUrl,
      targetPluginDir: PLUGIN_ROOT,
      dataDir: configStore.dataDir,
    });
    // Reload config in case the newly landed launcher sync migrated legacy cdpPort
    configStore.reload();
    await reconcileLauncherStatus().catch(() => {});
    latestUpdateStatus = {
      ...latestUpdateStatus,
      applying: false,
      hasUpdate: false,
      currentVersion: applied.updatedVersion,
      appliedVersion: applied.updatedVersion,
      launcherSynced: Boolean(applied.launcherSynced),
      error: '',
    };
    return { ok: true, applied };
  } catch (err) {
    latestUpdateStatus = {
      ...latestUpdateStatus,
      applying: false,
      error: err instanceof Error ? err.message : String(err),
    };
    return { ok: false, error: latestUpdateStatus.error };
  }
}

function restartRateSyncLoop() {
  if (rateSyncTimer) clearInterval(rateSyncTimer);
  rateSyncTimer = setInterval(() => {
    rateSyncStore
      .syncRates({ force: false })
      .then((s) => {
        if (s?.ok) return syncOnce();
      })
      .catch(() => {});
  }, RATE_SYNC_INTERVAL_MS);
  rateSyncTimer.unref?.();
}

function restartUpdateLoop() {
  if (updateTimer) clearInterval(updateTimer);
  const cfg = configStore.get();
  if (!cfg.autoCheckUpdate || !(cfg.updateRepoSlug || DEFAULT_UPDATE_REPO_SLUG)) return;
  updateTimer = setInterval(() => {
    runUpdateCheck({ allowAutoApply: true }).catch(() => {});
  }, UPDATE_CHECK_INTERVAL_MS);
  updateTimer.unref?.();
}

async function reconcileLauncherStatus() {
  const cfg = configStore.get();
  latestLauncherStatus = await launcherReconciler.reconcile({
    connected: Boolean(latestCdpStatus?.connected),
    cdpEnabled: Boolean(cfg.cdpEnabled),
    port: cfg.cdpPort,
  });
  const generated = launcherReconciler.getLastGeneratedInfo();
  if (generated) latestLauncherInfo = generated;
  return latestLauncherStatus;
}

async function generatePlatformLauncher() {
  const cfg = configStore.get();
  const res = await launcherReconciler.forceRegenerate({ port: cfg.cdpPort });
  latestLauncherStatus = {
    status: res.status,
    autoGenerated: res.autoGenerated,
    launcherPath: res.launcherPath,
    desktopShortcutPath: res.desktopShortcutPath,
    manualCommand: res.manualCommand,
    error: res.error,
  };
  if (res.info) latestLauncherInfo = res.info;
  return latestLauncherInfo || latestLauncherStatus;
}

function buildStatePayload({ includeWeekly = false, forceWeekly = false } = {}) {
  let weeklyEstimate = null;
  if (includeWeekly) {
    // On-demand calculation: runs ONLY when the sidecar UI panel is open and querying
    const quotaGroups = latestSnapshot?.quota?.groups || [];
    const anchors = quotaAnchorStore.observe(quotaGroups);
    const weeklyUsage = scanWeeklyLocalUsage({
      anchors,
      quotaGroups,
      force: forceWeekly,
    });
    weeklyEstimate = buildWeeklyQuotaEstimates(weeklyUsage, quotaGroups, anchors);
    if (weeklyUsage?.scannedAtMs) {
      lastWeeklyComputedAtMs = weeklyUsage.scannedAtMs;
    } else if (!lastWeeklyComputedAtMs) {
      lastWeeklyComputedAtMs = Date.now();
    }
  }
  return {
    platform: process.platform,
    currentVersion: readInstalledVersion(PLUGIN_ROOT),
    config: configStore.get(),
    snapshot: latestSnapshot ? { ...latestSnapshot, weeklyEstimate } : null,
    weeklyComputedAtMs: lastWeeklyComputedAtMs,
    cdpStatus: latestCdpStatus,
    launcherInfo: latestLauncherInfo,
    launcherStatus: latestLauncherStatus,
    rateSyncStatus: rateSyncStore.getStatus(),
    updateStatus: latestUpdateStatus,
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
    await reconcileLauncherStatus();
    return buildStatePayload({ includeWeekly: true, forceWeekly: false });
  }

  if (method === 'POST' && urlPath === '/api/refresh') {
    await syncOnce({ forceQuota: true });
    await reconcileLauncherStatus();
    return buildStatePayload({ includeWeekly: true, forceWeekly: true });
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
    restartUpdateLoop();
    await syncOnce();
    await reconcileLauncherStatus();
    return buildStatePayload({ includeWeekly: true });
  }

  if (method === 'POST' && urlPath === '/api/config/reset') {
    await configStore.reset();
    restartPollingLoop();
    restartUpdateLoop();
    await syncOnce();
    await reconcileLauncherStatus();
    return buildStatePayload({ includeWeekly: true });
  }

  if (method === 'POST' && urlPath === '/api/update/check') {
    await Promise.all([
      runUpdateCheck({ allowAutoApply: false }),
      rateSyncStore.syncRates({ force: true }).catch(() => {}),
    ]);
    await syncOnce();
    return buildStatePayload({ includeWeekly: true, forceWeekly: true });
  }

  if (method === 'POST' && urlPath === '/api/update/apply') {
    const result = await runApplyUpdate();
    return { ...result, state: buildStatePayload({ includeWeekly: true }) };
  }

  if (method === 'POST' && urlPath === '/api/launcher/generate') {
    const info = await generatePlatformLauncher();
    return { ok: true, launcherInfo: info, state: buildStatePayload({ includeWeekly: true }) };
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
  restartUpdateLoop();
  restartRateSyncLoop();
  // Keep Windows/macOS launchers synced automatically after upgrades from older versions
  ensureLauncherSyncedToCurrentVersion({
    dataDir: configStore.dataDir,
    pluginDir: PLUGIN_ROOT,
    currentVersion: readInstalledVersion(PLUGIN_ROOT),
  })
    .then((res) => {
      if (res && !res.skipped) configStore.reload();
    })
    .catch(() => {});
  syncOnce().catch(() => {});
  const initCfg = configStore.get();
  setTimeout(() => {
    if (initCfg.autoCheckUpdate && (initCfg.updateRepoSlug || DEFAULT_UPDATE_REPO_SLUG)) {
      runUpdateCheck({ allowAutoApply: true }).catch(() => {});
    }
    rateSyncStore
      .syncRates({ force: false })
      .then((s) => {
        if (s?.ok) return syncOnce();
      })
      .catch(() => {});
  }, 5000).unref?.();

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
      '/api/update/check',
      '/api/update/apply',
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
