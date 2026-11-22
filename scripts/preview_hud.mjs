#!/usr/bin/env node
/**
 * Generates an interactive offline HTML preview of the AGY HUD composer pill
 * and hover popover card so you can inspect styling, dark/light themes, and
 * custom metric ordering directly in any browser.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDefaultConfig } from '../sidecars/agy_hud/backend/config.mjs';
import { assembleHudSnapshot } from '../sidecars/agy_hud/backend/telemetry_aggregator.mjs';
import { buildHudInjectExpression } from '../sidecars/agy_hud/hud/hud_runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'preview-output');
const OUT_FILE = path.join(OUT_DIR, 'hud-preview.html');

const sampleSnapshot = assembleHudSnapshot({
  contextSnap: {
    found: true,
    conversationId: 'demo-preview-0001',
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
        fiveHour: { remainingPct: 62, remainingMs: 65 * 60 * 1000, isFull: false },
        weekly: { remainingPct: 58, remainingMs: 48 * 3600 * 1000, isFull: false },
      },
    ],
  },
  weeklyUsage: {
    windowDays: 7,
    scannedSessions: 19,
    totalTokens: 18450000,
    totalCostUsd: 26.84,
    totalCacheSavedUsd: 31.2,
    byGroup: {
      gemini: { tokens: 12600000, costUsd: 16.4, cacheSavedUsd: 21.0, turns: 120 },
      gpt_claude: { tokens: 1450000, costUsd: 2.14, cacheSavedUsd: 1.8, turns: 18 },
      argon: { tokens: 4400000, costUsd: 8.3, cacheSavedUsd: 8.4, turns: 34 },
    },
  },
});

const defaultCfg = createDefaultConfig();
const expr = buildHudInjectExpression(sampleSnapshot, defaultCfg);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>AGY HUD 离线 UI 预览</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      background: #12151d;
      color: #e2e8f0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 28px;
      box-sizing: border-box;
      transition: background 150ms ease, color 150ms ease;
    }
    body.light {
      background: #f8fafc;
      color: #0f172a;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .toolbar button {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid rgba(148,163,184,0.3);
      background: rgba(148,163,184,0.14);
      color: inherit;
      cursor: pointer;
    }
    .mock-composer {
      width: min(820px, 100%);
      margin: 0 auto 20px;
      border-radius: 16px;
      border: 1px solid rgba(148,163,184,0.22);
      background: rgba(30, 35, 48, 0.72);
      padding: 14px 16px 10px;
    }
    body.light .mock-composer {
      background: #ffffff;
    }
    .mock-composer textarea {
      width: 100%;
      height: 44px;
      border: none;
      outline: none;
      resize: none;
      background: transparent;
      color: inherit;
      font-size: 14px;
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
      gap: 8px;
    }
    .mock-btn {
      height: 26px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.25);
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>AGY HUD 离线交互预览</strong>
    <button id="toggleTheme">切换明暗主题</button>
    <span style="opacity:0.75;font-size:12px">将鼠标悬停在下方「Turbo」左侧的胶囊上查看 Hover 详情浮层</span>
  </div>

  <div class="mock-composer">
    <textarea placeholder="Ask anything, @ to mention, / for actions"></textarea>
    <div class="mock-bar">
      <div class="mock-left">
        <button class="mock-btn">+</button>
        <button class="mock-btn">Gemini 4 Neon ▾</button>
      </div>
      <div class="mock-right">
        <button class="mock-btn">🛡 Turbo ▾</button>
        <button class="mock-btn" aria-label="Microphone">🎙</button>
        <button class="mock-btn" aria-label="Send">▶</button>
      </div>
    </div>
  </div>

  <script>
    ${expr}
    document.getElementById('toggleTheme').addEventListener('click', () => {
      document.body.classList.toggle('light');
      if (typeof window.__agyHudLatestRender === 'function') {
        window.__agyHudLatestRender();
      }
    });
  </script>
</body>
</html>
`;

await fsp.mkdir(OUT_DIR, { recursive: true });
await fsp.writeFile(OUT_FILE, html, 'utf8');
console.log(`✓ 已生成离线交互预览页: ${OUT_FILE}`);
