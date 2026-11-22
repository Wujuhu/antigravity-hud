#!/usr/bin/env node
/**
 * Renders the real AGY HUD composer injection (dark + light) and the real
 * Sidecar settings panel with sanitized demo data, then captures crisp 2x PNG
 * screenshots into `docs/screenshots/` using local headless Chrome/Edge.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import {
  PILL_ITEM_CATALOG,
  POPOVER_SECTION_CATALOG,
  createDefaultConfig,
} from '../sidecars/agy_hud/backend/config.mjs';
import { assembleHudSnapshot } from '../sidecars/agy_hud/backend/telemetry_aggregator.mjs';
import { buildHudInjectExpression } from '../sidecars/agy_hud/hud/hud_runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PANEL_DIR = path.join(REPO_ROOT, 'sidecars', 'agy_hud', 'panel');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'screenshots');

function findBrowser() {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['google-chrome', 'chromium', 'chromium-browser'];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  throw new Error('未找到本机 Chrome / Edge 浏览器，无法自动截取高清 UI 图');
}

// 100% sanitized demo telemetry (zero personal paths, usernames, or private data)
const demoSnapshot = assembleHudSnapshot({
  contextSnap: {
    found: true,
    conversationId: 'demo-sanitized-0001',
    model: { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)' },
    contextLimit: 512000,
    limitSource: 'antigravity',
    usedTokens: 124200,
    freeTokens: 387800,
    usedPercent: 24.3,
    cache: {
      lastPromptTokens: 122500,
      sinceLastCacheTokens: 10500,
      cachedTokens: 112000,
      cacheHitRatio: 91.4,
      lastOutputTokens: 1420,
      cumulativeInputTokens: 465000,
      cumulativeCachedTokens: 400830,
      sessionCacheHitRatio: 86.2,
      cumulativeOutputTokens: 17500,
    },
    categories: {
      systemPrompt: 7800,
      systemTools: 5600,
      rulesFiles: 2200,
      skills: 1900,
      messages: 18200,
      agentReplies: 30000,
      toolCallArgs: 6500,
      toolCallOutputs: 44000,
      agentThinking: 8000,
    },
  },
  speedMetrics: {
    latestTokPerSec: 227.4,
    avgTokPerSec: 164.0,
    lastDurationSec: 6.2,
    lastOutputTokens: 1420,
    upstreamModelId: 'gemini-4-neon-high',
  },
  quotaSummary: {
    ok: true,
    available: true,
    stale: false,
    fetchedAtMs: Date.now(),
    groups: [
      {
        key: 'gemini',
        label: 'Gemini',
        fiveHour: { remainingPct: 85, remainingMs: 198 * 60 * 1000, isFull: false },
        weekly: { remainingPct: 72, remainingMs: 96 * 3600 * 1000, isFull: false },
      },
      {
        key: 'gpt_claude',
        label: 'GPT&Claude',
        fiveHour: { remainingPct: 100, remainingMs: null, isFull: true },
        weekly: { remainingPct: 94, remainingMs: 120 * 3600 * 1000, isFull: false },
      },
      {
        key: 'argon',
        label: 'Argon',
        weekly: { remainingPct: 58, remainingMs: 48 * 3600 * 1000, isFull: false },
      },
    ],
  },
  weeklyUsage: {
    windowDays: 7,
    scannedSessions: 19,
    totalTokens: 18_450_000,
    totalCostUsd: 26.84,
    totalCacheSavedUsd: 31.2,
    byGroup: {
      gemini: { tokens: 12_600_000, costUsd: 16.4, cacheSavedUsd: 21.0, turns: 120 },
      gpt_claude: { tokens: 1_450_000, costUsd: 2.14, cacheSavedUsd: 1.8, turns: 18 },
      argon: { tokens: 4_400_000, costUsd: 8.3, cacheSavedUsd: 8.4, turns: 34 },
    },
  },
});

const demoConfig = {
  ...createDefaultConfig(),
};

function buildComposerDemoHtml(theme = 'dark') {
  const isLight = theme === 'light';
  const hudExpr = buildHudInjectExpression(demoSnapshot, demoConfig);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: ${isLight ? '#f6f7f9' : '#111215'};
      color: ${isLight ? '#18191b' : '#e8eaed'};
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 18px 24px 22px;
    }
    .mock-composer {
      width: min(800px, 100%);
      margin: 0 auto;
      border-radius: 14px;
      border: 1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
      background: ${isLight ? '#ffffff' : '#181a1f'};
      box-shadow: ${isLight ? '0 4px 16px rgba(0,0,0,0.05)' : '0 6px 24px rgba(0,0,0,0.32)'};
      padding: 13px 15px 10px;
    }
    .mock-composer textarea {
      width: 100%;
      height: 42px;
      border: none;
      outline: none;
      resize: none;
      background: transparent;
      color: inherit;
      font-size: 14px;
      font-family: inherit;
    }
    .mock-composer textarea::placeholder {
      color: ${isLight ? '#94a3b8' : '#64748b'};
    }
    .mock-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
    }
    .mock-left, .mock-right {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .mock-btn {
      height: 26px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid ${isLight ? 'rgba(100,116,139,0.22)' : 'rgba(148,163,184,0.2)'};
      background: transparent;
      color: inherit;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .mock-btn-icon {
      width: 26px;
      padding: 0;
      justify-content: center;
    }
    .mock-btn-send {
      background: ${isLight ? '#0f172a' : '#f1f5f9'};
      color: ${isLight ? '#ffffff' : '#0f172a'};
      border-color: transparent;
    }
  </style>
</head>
<body>
  <div class="mock-composer">
    <textarea placeholder="Ask anything, @ to mention, / for actions"></textarea>
    <div class="mock-bar">
      <div class="mock-left">
        <button class="mock-btn mock-btn-icon">+</button>
        <button class="mock-btn">Gemini 4 Neon ▾</button>
      </div>
      <div class="mock-right">
        <button class="mock-btn">🛡 Turbo ▾</button>
        <button class="mock-btn mock-btn-icon" aria-label="Microphone">🎙</button>
        <button class="mock-btn mock-btn-icon mock-btn-send" aria-label="Send">▲</button>
      </div>
    </div>
  </div>
  <script>
    ${hudExpr}
    // Open the real hover popover immediately with transition disabled for crisp capture
    (function openForCapture() {
      const pill = document.getElementById('agy-hud-composer-root');
      const pop = document.getElementById('agy-hud-hover-popover');
      const composer = document.querySelector('.mock-composer');
      if (pill && pop && composer) {
        pop.style.transition = 'none';
        pop.classList.add('is-visible');
        const pr = pill.getBoundingClientRect();
        const cr = composer.getBoundingClientRect();
        const pw = pop.offsetWidth || 348;
        const ph = pop.offsetHeight || 280;
        const left = Math.max(12, Math.min(window.innerWidth - pw - 12, pr.left + pr.width / 2 - pw / 2));
        const top = Math.max(14, cr.top - ph - 12);
        pop.style.left = Math.round(left) + 'px';
        pop.style.top = Math.round(top) + 'px';
      }
    })();
  </script>
</body>
</html>`;
}

const demoPanelState = {
  platform: 'win32',
  currentVersion: '1.0.0',
  weeklyComputedAtMs: Date.now(),
  config: demoConfig,
  snapshot: demoSnapshot,
  cdpStatus: {
    connected: true,
    port: 9229,
    injectedCount: 1,
    anchorFound: true,
    error: '',
  },
  launcherInfo: {
    platform: 'win32',
    port: 9229,
    lnkPath: 'C:\\Users\\demo\\Desktop\\Antigravity (CDP).lnk',
  },
  updateStatus: {
    ok: true,
    configured: true,
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    hasUpdate: false,
    applying: false,
    appliedVersion: '',
    error: '',
  },
  catalogs: {
    pillItems: PILL_ITEM_CATALOG,
    popoverSections: POPOVER_SECTION_CATALOG,
  },
};

await fsp.mkdir(OUT_DIR, { recursive: true });
const browser = findBrowser();

const server = http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  if (u.pathname === '/hud-dark') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildComposerDemoHtml('dark'));
    return;
  }
  if (u.pathname === '/hud-light') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildComposerDemoHtml('light'));
    return;
  }
  if (u.pathname === '/panel') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8'));
    return;
  }
  if (u.pathname === '/styles.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(fs.readFileSync(path.join(PANEL_DIR, 'styles.css'), 'utf8'));
    return;
  }
  if (u.pathname === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(fs.readFileSync(path.join(PANEL_DIR, 'app.js'), 'utf8'));
    return;
  }
  if (u.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(demoPanelState));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

async function snap(urlPath, outName, width, height) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agy-hud-shot-'));
  const tmpShot = path.join(tmpDir, outName);
  const profileDir = path.join(tmpDir, 'profile');
  const outPath = path.join(OUT_DIR, outName);

  try {
    await execFileAsync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        '--virtual-time-budget=1500',
        `--user-data-dir=${profileDir}`,
        `--window-size=${width},${height}`,
        `--screenshot=${tmpShot}`,
        `http://127.0.0.1:${port}${urlPath}`,
      ],
      { timeout: 25000 },
    );
    await fsp.copyFile(tmpShot, outPath);
    const stat = fs.statSync(outPath);
    console.log(`✓ Captured ${outName} (${Math.round(stat.size / 1024)} KB)`);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

try {
  await snap('/hud-dark', 'hud-hover-dark.png', 860, 410);
  await snap('/hud-light', 'hud-hover-light.png', 860, 410);
  await snap('/panel', 'sidecar-panel.png', 520, 460);
} finally {
  server.close();
}
