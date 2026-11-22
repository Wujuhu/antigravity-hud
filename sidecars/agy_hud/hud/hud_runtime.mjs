/**
 * Self-contained HUD DOM/CSS injection builder for Antigravity composer bar.
 *
 * Design principles:
 *   - Restrained Antigravity-native neutral palette (no neon/flashy accents).
 *   - Zero redundant secondary labels or verbose descriptions.
 *   - Single combined context bar showing both window occupancy and 5-part breakdown.
 *   - Unified compact ring gauges for all quota windows (5h, weekly, or any tier-specific
 *     buckets returned for Free / Pro / Ultra accounts) with zero horizontal quota bars.
 */

export const HUD_ROOT_ID = 'agy-hud-composer-root';
export const HUD_POPOVER_ID = 'agy-hud-hover-popover';
export const HUD_STYLE_ID = 'agy-hud-injected-style';

export function buildHudCss() {
  return `
#${HUD_ROOT_ID} {
  --hud-bg: transparent;
  --hud-bg-hover: rgba(255, 255, 255, 0.08);
  --hud-border: rgba(255, 255, 255, 0.16);
  --hud-text: #e2e4e9;
  --hud-muted: #8b909a;
  --hud-sep: rgba(255, 255, 255, 0.22);
  --hud-track: rgba(255, 255, 255, 0.14);
  --hud-accent: #8ab4f8;
  --hud-warn: #e0a84b;
  --hud-danger: #e06c75;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  margin-right: 4px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--hud-text);
  font-family: inherit;
  font-size: var(--hud-font-size, 0.85714rem);
  font-weight: var(--hud-font-weight, inherit);
  line-height: var(--hud-line-height, 1.3333);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  flex-shrink: 0;
  transition: background 140ms ease, border-color 140ms ease;
  box-sizing: border-box;
}
#${HUD_ROOT_ID}:hover {
  background: var(--hud-bg-hover);
  border-color: var(--hud-border);
}
#${HUD_ROOT_ID}[data-agy-theme="light"] {
  --hud-bg: transparent;
  --hud-bg-hover: rgba(0, 0, 0, 0.055);
  --hud-border: rgba(0, 0, 0, 0.16);
  --hud-text: #18191b;
  --hud-muted: #6b707a;
  --hud-sep: rgba(0, 0, 0, 0.2);
  --hud-track: rgba(0, 0, 0, 0.12);
  --hud-accent: #1a73e8;
  --hud-warn: #b06000;
  --hud-danger: #c5221f;
}
#${HUD_ROOT_ID}[data-agy-theme="light"]:hover {
  background: var(--hud-bg-hover);
  border-color: var(--hud-border);
}
#${HUD_ROOT_ID} .agy-hud-seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
#${HUD_ROOT_ID} .agy-hud-sep {
  color: var(--hud-sep);
  font-size: 10px;
}
#${HUD_ROOT_ID} .agy-hud-muted {
  color: var(--hud-muted);
}
#${HUD_ROOT_ID} .agy-hud-ring {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transform: rotate(-90deg);
}
#${HUD_ROOT_ID} .agy-hud-model {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

#${HUD_POPOVER_ID} {
  --pop-bg: #16181d;
  --pop-border: rgba(255, 255, 255, 0.1);
  --pop-divider: rgba(255, 255, 255, 0.07);
  --pop-text: #e8eaed;
  --pop-muted: #8b909a;
  --pop-track: rgba(255, 255, 255, 0.1);
  --pop-accent: #8ab4f8;
  --pop-good: #81c995;
  --pop-warn: #e0a84b;
  --pop-danger: #e06c75;
  position: fixed;
  z-index: 2147483000;
  width: 360px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--pop-bg);
  border: 1px solid var(--pop-border);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  color: var(--pop-text);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 120ms ease, transform 120ms ease;
}
#${HUD_POPOVER_ID}.is-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
#${HUD_POPOVER_ID}::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 22px;
}
#${HUD_POPOVER_ID}[data-agy-theme="light"] {
  --pop-bg: #ffffff;
  --pop-border: rgba(0, 0, 0, 0.1);
  --pop-divider: rgba(0, 0, 0, 0.07);
  --pop-text: #18191b;
  --pop-muted: #6b707a;
  --pop-track: rgba(0, 0, 0, 0.09);
  --pop-accent: #1a73e8;
  --pop-good: #188038;
  --pop-warn: #b06000;
  --pop-danger: #c5221f;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
}
#${HUD_POPOVER_ID} .agy-sec {
  padding: 9px 0;
  border-top: 1px solid var(--pop-divider);
}
#${HUD_POPOVER_ID} .agy-sec:first-child {
  padding-top: 0;
  border-top: none;
}
#${HUD_POPOVER_ID} .agy-sec:last-child {
  padding-bottom: 0;
}
#${HUD_POPOVER_ID} .agy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
#${HUD_POPOVER_ID} .agy-title {
  font-weight: 500;
  font-size: 11.5px;
  color: var(--pop-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${HUD_POPOVER_ID} .agy-muted {
  color: var(--pop-muted);
  font-size: 11px;
}
#${HUD_POPOVER_ID} .agy-ctx-stat {
  color: var(--pop-text);
  font-size: 11.5px;
  font-weight: 400;
}
#${HUD_POPOVER_ID} .agy-bar-track {
  width: 100%;
  height: 5px;
  margin-top: 7px;
  border-radius: 999px;
  background: var(--pop-track);
  overflow: hidden;
  display: flex;
}
#${HUD_POPOVER_ID} .agy-bar-seg {
  height: 100%;
  flex-shrink: 0;
}
#${HUD_POPOVER_ID} .agy-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 7px;
}
#${HUD_POPOVER_ID} .agy-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--pop-muted);
}
#${HUD_POPOVER_ID} .agy-legend-item strong {
  color: var(--pop-text);
  font-weight: 500;
}
#${HUD_POPOVER_ID} .agy-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
#${HUD_POPOVER_ID} .agy-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 16px;
}
#${HUD_POPOVER_ID} .agy-kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
}
#${HUD_POPOVER_ID} .agy-kv span {
  color: var(--pop-muted);
  white-space: nowrap;
}
#${HUD_POPOVER_ID} .agy-kv strong {
  font-weight: 500;
  color: var(--pop-text);
  white-space: nowrap;
}
#${HUD_POPOVER_ID} .agy-quota-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
#${HUD_POPOVER_ID} .agy-quota-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
}
#${HUD_POPOVER_ID} .agy-quota-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
  color: var(--pop-text);
  white-space: nowrap;
}
#${HUD_POPOVER_ID} .agy-quota-buckets {
  display: grid;
  grid-template-columns: 112px 108px;
  align-items: center;
  gap: 4px 10px;
}
#${HUD_POPOVER_ID} .agy-q-bucket {
  display: grid;
  grid-template-columns: 14px 16px 32px 1fr;
  align-items: center;
  column-gap: 4px;
  white-space: nowrap;
}
#${HUD_POPOVER_ID} .agy-q-lbl {
  color: var(--pop-muted);
  font-size: 11px;
  text-align: left;
}
#${HUD_POPOVER_ID} .agy-q-pct {
  text-align: left;
  font-variant-numeric: tabular-nums;
}
#${HUD_POPOVER_ID} .agy-q-dur {
  color: var(--pop-muted);
  font-size: 11px;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
#${HUD_POPOVER_ID} .agy-q-ring {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transform: rotate(-90deg);
}
#${HUD_POPOVER_ID} .agy-head-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
#${HUD_POPOVER_ID} .agy-sidecar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: -3px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 5px;
  color: var(--pop-muted);
  text-decoration: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 120ms ease, background 120ms ease;
}
#${HUD_POPOVER_ID} .agy-sidecar-icon:hover {
  color: var(--pop-text);
  background: var(--pop-track);
}

/* Per-turn summary inline with the host feedback toolbar (aligned left, actions right, responsive wrap) */
[data-testid="cascade-system-message-toolbar"] > div:has(> .agy-turn-summary-bar) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}
.agy-turn-summary-bar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 6px;
  margin-right: auto;
  padding-left: 4px;
  font-family: inherit;
  font-size: 0.85714rem;
  font-weight: 350;
  line-height: 1.3333;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground, rgba(168, 169, 178, 0.92));
  box-sizing: border-box;
  user-select: text;
}
.agy-turn-summary-bar .agy-turn-sep {
  opacity: 0.42;
  user-select: none;
}
.agy-turn-summary-bar[data-agy-theme="light"] {
  color: var(--muted-foreground, rgba(82, 88, 99, 0.88));
}
.agy-turn-summary-bar .agy-turn-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.agy-turn-summary-bar .agy-turn-model {
  color: var(--foreground, rgba(232, 234, 237, 0.92));
  font-weight: 500;
}
.agy-turn-summary-bar[data-agy-theme="light"] .agy-turn-model {
  color: var(--foreground, rgba(24, 25, 27, 0.9));
}
.agy-turn-summary-bar .agy-turn-effort {
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted-foreground, rgba(200, 203, 210, 0.9));
  font-size: 0.75rem;
  line-height: 1.45;
}
.agy-turn-summary-bar[data-agy-theme="light"] .agy-turn-effort {
  background: rgba(0, 0, 0, 0.06);
  color: var(--muted-foreground, rgba(64, 69, 79, 0.9));
}
.agy-turn-summary-bar .agy-turn-val {
  color: inherit;
}

/* Optional compact layout rules adapted from WhiteBr1ck/agy-powertools (MIT License) */
html[data-agy-hud-compact="1"] [data-testid="agent-response"],
html[data-agy-hud-compact="1"] [data-testid="agent-response"] :is([data-markdown-root], p, li, pre, code, button, .text-base, .text-sm, .text-compact),
html[data-agy-hud-compact="1"] [data-testid="cascade-system-message-toolbar"],
html[data-agy-hud-compact="1"] [data-testid="cascade-system-message-toolbar"] :is([data-markdown-root], p, pre, code, button, .text-base),
html[data-agy-hud-compact="1"] [data-testid="user-input-step"],
html[data-agy-hud-compact="1"] [data-testid="user-input-step"] .text-base {
  line-height: var(--agy-hud-lh, 1.4) !important;
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] :is([data-testid="worked-for-collapsible"], [data-testid="tool-group-collapsible"], div.group.min-h-8) {
  min-height: 24px;
  padding-block: 2px;
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-testid="cascade-system-message-toolbar"],
html[data-agy-hud-compact="1"] [data-testid="cascade-system-message-toolbar"] {
  gap: 4px;
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] {
  gap: 0;
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] :is(p, ul, ol, blockquote) {
  margin-block: 0;
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] > :not(style) + :not(style) {
  margin-block-start: var(--agy-hud-block-gap, 8px);
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] :is(h1, h2, h3, h4, h5, h6) {
  line-height: var(--agy-hud-lh, 1.4);
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] li {
  margin-block: var(--agy-hud-list-gap, 2px);
}
html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] :is(li, blockquote) > :not(style) + :not(style) {
  margin-block-start: calc(var(--agy-hud-block-gap, 8px) * 0.75);
}
html[data-agy-hud-compact="1"] [data-testid="user-input-step"] {
  padding-top: 0.75rem;
}
@layer theme {
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] :is(h1, h2, h3, h4, h5, h6) {
    margin-block: calc(var(--agy-hud-block-gap, 8px) + 4px) 0 !important;
  }
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] blockquote > :first-child {
    margin-block-start: 0 !important;
  }
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] hr {
    margin-block: calc(var(--agy-hud-block-gap, 8px) + 4px) !important;
  }
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] hr + :not(style),
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] > :first-child,
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] > style + :not(style) {
    margin-block-start: 0 !important;
  }
  html[data-agy-hud-compact="1"] [data-testid="agent-response"] [data-markdown-root] > :last-child {
    margin-block-end: 0 !important;
  }
}
`;
}

/**
 * Build the self-contained browser JS expression executed via CDP `Runtime.evaluate`.
 */
export function buildHudInjectExpression(snapshot, config) {
  const payloadJson = JSON.stringify({
    snapshot: snapshot || {},
    config: config || {},
    css: buildHudCss(),
    ids: {
      root: HUD_ROOT_ID,
      popover: HUD_POPOVER_ID,
      style: HUD_STYLE_ID,
    },
  });

  return `(function(DATA) {
  try {
    var IDS = DATA.ids;
    var snap = DATA.snapshot || {};
    var cfg = DATA.config || {};

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function fmtTok(n) {
      var v = Number(n || 0);
      if (!Number.isFinite(v) || v <= 0) return '0';
      if (v >= 1000000) return (v / 1000000).toFixed(2).replace(/\\.00$/, '') + 'M';
      if (v >= 10000) return (v / 1000).toFixed(1).replace(/\\.0$/, '') + 'k';
      if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
      return String(Math.round(v));
    }

    function fmtDur(ms) {
      var v = Number(ms);
      if (!Number.isFinite(v) || v <= 0) return '';
      var totalMin = Math.ceil(v / 60000);
      if (totalMin < 60) return totalMin + 'm';
      var hours = Math.floor(totalMin / 60);
      var mins = totalMin % 60;
      if (hours >= 24) {
        var days = Math.floor(hours / 24);
        var remH = hours % 24;
        return remH > 0 ? days + 'd' + remH + 'h' : days + 'd';
      }
      return mins > 0 ? hours + 'h' + mins + 'm' : hours + 'h';
    }

    function detectTheme() {
      try {
        var bg = window.getComputedStyle(document.body).backgroundColor || '';
        var m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
        if (m) {
          var lum = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000;
          return lum > 140 ? 'light' : 'dark';
        }
      } catch (e) {}
      return 'dark';
    }

    function ctxColor(pct) {
      if (pct >= 85) return 'var(--hud-danger)';
      if (pct >= 65) return 'var(--hud-warn)';
      return 'var(--hud-accent)';
    }

    function quotaRingColor(pct) {
      if (pct == null) return 'var(--pop-muted)';
      if (pct <= 15) return 'var(--pop-danger)';
      if (pct <= 35) return 'var(--pop-warn)';
      return 'var(--pop-good)';
    }

    function makeRingSvg(cls, pct, strokeColor, trackVar) {
      var r = 5.2;
      var circ = 2 * Math.PI * r;
      var clamped = Math.max(0, Math.min(100, Number(pct || 0)));
      var dash = (clamped / 100) * circ;
      return (
        '<svg class="' + cls + '" viewBox="0 0 14 14" aria-hidden="true">' +
          '<circle cx="7" cy="7" r="' + r + '" fill="none" stroke="' + trackVar + '" stroke-width="1.8"></circle>' +
          '<circle cx="7" cy="7" r="' + r + '" fill="none" stroke="' + strokeColor + '" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '"></circle>' +
        '</svg>'
      );
    }

    var styleEl = document.getElementById(IDS.style);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = IDS.style;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    if (styleEl.textContent !== DATA.css) {
      styleEl.textContent = DATA.css;
    }

    function findComposerAnchor() {
      var vh = window.innerHeight || 0;
      var vw = window.innerWidth || 0;
      if (vh < 240 || vw < 320) return null;

      var inputs = document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]');
      var bestInput = null;
      var bestBottom = -1;
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (!ir || ir.width < 150 || ir.height < 14) continue;
        if (ir.bottom < vh - 290 || ir.top > vh - 10) continue;
        if (ir.bottom > bestBottom) {
          bestBottom = ir.bottom;
          bestInput = inputs[i];
        }
      }
      if (!bestInput) return null;

      var card = bestInput;
      var chosenBtn = null;
      var cardRect = null;
      var MODE_RE = /turbo|planning|fast|auto|strict|review|proceed|sandbox|permission|ask|\\u6781\\u901f|\\u89c4\\u5212|\\u5feb\\u901f|\\u81ea\\u52a8|\\u4e25\\u683c|\\u5ba1\\u67e5|\\u6743\\u9650/i;
      var MIC_RE = /microphone|voice|dictate|speech|audio|\\u9ea6\\u514b\\u98ce|\\u8bed\\u97f3/i;
      var SEND_RE = /send|stop|submit|cancel|\\u53d1\\u9001|\\u505c\\u6b62/i;

      for (var up = 0; up < 6 && card && card.parentElement && card.parentElement !== document.body; up++) {
        card = card.parentElement;
        var cr = card.getBoundingClientRect();
        if (cr.height < 48 || cr.height > 380 || cr.width < 200) continue;
        var btns = card.querySelectorAll('button');
        if (btns.length < 2) continue;

        var modeBtn = null, micBtn = null, sendBtn = null;
        var rightRowBtns = [];
        for (var bi = 0; bi < btns.length; bi++) {
          var b = btns[bi];
          if (b.closest && b.closest('#' + IDS.root)) continue;
          var br = b.getBoundingClientRect();
          if (!br || br.width < 14 || br.height < 14 || br.top < cr.top + cr.height * 0.35) continue;
          rightRowBtns.push({ el: b, r: br });
          var label = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).trim();
          if (!modeBtn && MODE_RE.test(label) && br.width <= 180) modeBtn = b;
          else if (!micBtn && MIC_RE.test(label) && br.width <= 56) micBtn = b;
          else if (!sendBtn && SEND_RE.test(label) && br.width <= 56) sendBtn = b;
        }

        if (!modeBtn && micBtn) {
          var mr = micBtn.getBoundingClientRect();
          var mcy = (mr.top + mr.bottom) / 2;
          for (var ri = 0; ri < rightRowBtns.length; ri++) {
            var cand = rightRowBtns[ri];
            if (cand.el === micBtn) continue;
            var ccy = (cand.r.top + cand.r.bottom) / 2;
            if (Math.abs(ccy - mcy) <= 12 && cand.r.right <= mr.left + 2 && mr.left - cand.r.right <= 24 && cand.r.width <= 52) {
              modeBtn = cand.el;
              break;
            }
          }
        }

        chosenBtn = modeBtn || micBtn || sendBtn;
        if (chosenBtn) {
          cardRect = cr;
          break;
        }
      }

      if (!chosenBtn || !chosenBtn.parentElement) return null;
      return { parent: chosenBtn.parentElement, before: chosenBtn, cardWidth: cardRect ? cardRect.width : 600 };
    }

    function renderPillHtml(cardWidth) {
      var ctx = snap.context || {};
      var spd = snap.speed || {};
      var cac = snap.cache || {};
      var qta = snap.quota || {};
      var mdl = snap.model || {};
      var pct = Number(ctx.usedPercent || 0);
      var pctRound = Math.round(pct);
      var fmt = cfg.contextDisplayFormat || 'percent';

      var ordered = Array.isArray(cfg.pillItems) ? cfg.pillItems : [];
      var activeIds = [];
      for (var i = 0; i < ordered.length; i++) {
        if (ordered[i] && ordered[i].enabled) activeIds.push(ordered[i].id);
      }
      if (activeIds.length === 0) activeIds = ['context'];

      var maxCount = cardWidth < 420 ? 2 : cardWidth < 540 ? 3 : activeIds.length;
      var segments = [];

      for (var k = 0; k < activeIds.length && segments.length < maxCount; k++) {
        var id = activeIds[k];
        if (id === 'context') {
          var ctxText = fmt === 'tokens'
            ? fmtTok(ctx.usedTokens)
            : fmt === 'both'
              ? pctRound + '% ' + fmtTok(ctx.usedTokens)
              : pctRound + '%';
          segments.push(
            '<span class="agy-hud-seg">' +
              makeRingSvg('agy-hud-ring', pct, ctxColor(pct), 'var(--hud-track)') +
              '<span>' + esc(ctxText) + '</span>' +
            '</span>'
          );
        } else if (id === 'speed') {
          var sVal = spd.latestTokPerSec != null ? Math.round(spd.latestTokPerSec) + ' tok/s' : '--';
          segments.push('<span class="agy-hud-seg' + (spd.latestTokPerSec == null ? ' agy-hud-muted' : '') + '">' + esc(sVal) + '</span>');
        } else if (id === 'quota') {
          if (qta.available && qta.activeFiveHourPct != null) {
            var qColor = qta.activeFiveHourPct <= 15 ? 'var(--hud-danger)' : qta.activeFiveHourPct <= 35 ? 'var(--hud-warn)' : 'var(--hud-text)';
            var qLbl = qta.primaryBucketLabel || '5h';
            segments.push('<span class="agy-hud-seg" style="color:' + qColor + '"><span class="agy-hud-muted">' + esc(qLbl) + '</span> ' + esc(qta.activeFiveHourPct) + '%</span>');
          }
        } else if (id === 'weeklyQuota') {
          if (qta.available && qta.activeWeeklyPct != null) {
            var wColor = qta.activeWeeklyPct <= 15 ? 'var(--hud-danger)' : qta.activeWeeklyPct <= 35 ? 'var(--hud-warn)' : 'var(--hud-text)';
            segments.push('<span class="agy-hud-seg" style="color:' + wColor + '"><span class="agy-hud-muted">周</span> ' + esc(qta.activeWeeklyPct) + '%</span>');
          }
        } else if (id === 'cache') {
          if (cac.lastHitPct != null) {
            segments.push('<span class="agy-hud-seg"><span class="agy-hud-muted">缓存</span> ' + esc(Math.round(cac.lastHitPct)) + '%</span>');
          }
        } else if (id === 'tokens') {
          segments.push('<span class="agy-hud-seg">' + esc(fmtTok(cac.cumulativeTotalTokens)) + '</span>');
        } else if (id === 'model') {
          var mName = mdl.label || mdl.id;
          if (mName && mName !== '待会话开始') {
            segments.push('<span class="agy-hud-seg agy-hud-muted agy-hud-model">' + esc(mName) + '</span>');
          }
        }
      }

      if (segments.length === 0) {
        segments.push('<span class="agy-hud-seg">AGY HUD</span>');
      }
      return segments.join('<span class="agy-hud-sep">·</span>');
    }

    function renderPopoverHtml() {
      var ctx = snap.context || {};
      var spd = snap.speed || {};
      var cac = snap.cache || {};
      var qta = snap.quota || {};
      var mdl = snap.model || {};
      var sections = Array.isArray(cfg.popoverSections) ? cfg.popoverSections : [];
      var blocks = [];

      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        if (!sec || !sec.enabled) continue;

        if (sec.id === 'context') {
          var pct = Number(ctx.usedPercent || 0);
          var list = Array.isArray(ctx.breakdown) ? ctx.breakdown : [];
          var segs = '';
          var legends = '';
          for (var b = 0; b < list.length; b++) {
            var item = list[b];
            var wp = Number(item.windowPct != null ? item.windowPct : (pct * Number(item.pct || 0) / 100));
            if (wp > 0) {
              segs += '<div class="agy-bar-seg" style="width:' + Math.min(100, wp).toFixed(2) + '%;background:' + esc(item.color) + '" title="' + esc(item.label + ' ' + fmtTok(item.tokens)) + '"></div>';
            }
            if (Number(item.tokens || 0) > 0) {
              legends +=
                '<span class="agy-legend-item">' +
                  '<span class="agy-dot" style="background:' + esc(item.color) + '"></span>' +
                  esc(item.label) + ' <strong>' + esc(fmtTok(item.tokens)) + '</strong>' +
                '</span>';
            }
          }
          var compCount = Number(ctx.compactionCount || 0);
          var compHtml = compCount > 0 ? ' · 压缩 ' + esc(compCount) + '次' : '';
          var hasAuxToggle = Boolean(document.querySelector('[data-testid="toggle-aux-sidebar"]'));
          var sidecarTitle = hasAuxToggle ? '打开右侧 AGY HUD 侧边栏' : '进入任意对话后可打开右侧 AGY HUD 侧边栏';
          var sidecarBtn =
            '<button type="button" class="agy-sidecar-icon" data-agy-action="open-sidecar" title="' + sidecarTitle + '" aria-label="' + sidecarTitle + '"' + (hasAuxToggle ? '' : ' style="opacity:0.45"') + '>' +
              '<svg viewBox="0 0 16 16" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<rect x="2" y="2.5" width="12" height="11" rx="2"/>' +
                '<line x1="10" y1="2.5" x2="10" y2="13.5"/>' +
              '</svg>' +
            '</button>';
          blocks.push(
            '<div class="agy-sec">' +
              '<div class="agy-row">' +
                '<span class="agy-title">' + esc(mdl.label || mdl.id || '上下文') + '</span>' +
                '<span class="agy-head-right">' +
                  '<span class="agy-ctx-stat">' + esc(fmtTok(ctx.usedTokens)) + ' / ' + esc(fmtTok(ctx.contextLimit)) + ' · ' + esc(pct.toFixed(1)) + '%' + compHtml + '</span>' +
                  sidecarBtn +
                '</span>' +
              '</div>' +
              '<div class="agy-bar-track">' + segs + '</div>' +
              (legends ? '<div class="agy-legend">' + legends + '</div>' : '') +
            '</div>'
          );
        } else if (sec.id === 'speedAndCache') {
          var sp = snap.spend || {};
          var turnsArr = Array.isArray(snap.turns) ? snap.turns : [];
          var lastTurnFallback = turnsArr.length > 0 ? turnsArr[turnsArr.length - 1] : null;
          function fmtIntTtft(secVal) {
            var v = Number(secVal);
            if (!Number.isFinite(v) || v <= 0) return '';
            if (v < 1) return Math.round(v * 1000) + 'ms';
            return Math.round(v) + 's';
          }
          function fmtSpeedPair(ttftSec, tpsVal) {
            var tPart = fmtIntTtft(ttftSec);
            var sNum = Number(tpsVal);
            var sPart = tpsVal != null && Number.isFinite(sNum) && sNum > 0 ? Math.round(sNum) + ' tok/s' : '';
            if (tPart && sPart) return tPart + ' · ' + sPart;
            if (sPart) return sPart;
            if (tPart) return tPart;
            return '--';
          }
          var curSpeed = fmtSpeedPair(spd.lastTtftSec, spd.latestTokPerSec);
          var avgSpeed = fmtSpeedPair(spd.avgTtftSec, spd.avgTokPerSec);
          var lastHit = cac.lastHitPct != null ? cac.lastHitPct.toFixed(1) + '%' : '--';
          var totalHit = cac.sessionHitPct != null ? cac.sessionHitPct.toFixed(1) + '%' : '--';
          var turnTok = Number(
            sp.lastTurnTokens != null
              ? sp.lastTurnTokens
              : lastTurnFallback
                ? lastTurnFallback.totalTokens
                : 0,
          );
          var turnUsd = Number(
            sp.lastTurnCostUsd != null
              ? sp.lastTurnCostUsd
              : lastTurnFallback
                ? lastTurnFallback.totalCostUsd
                : 0,
          );
          var totalTok = Number(
            sp.sessionTotalTokens != null && Number(sp.sessionTotalTokens) > 0
              ? sp.sessionTotalTokens
              : cac.cumulativeTotalTokens || 0,
          );
          var totalUsd = Number(sp.sessionTotalCostUsd != null ? sp.sessionTotalCostUsd : 0);
          var turnSpendText = turnTok > 0 ? fmtTok(turnTok) + ' · ' + fmtUsd(turnUsd) : '0 · $0.00';
          var totalSpendText = totalTok > 0 ? fmtTok(totalTok) + ' · ' + fmtUsd(totalUsd) : '0 · $0.00';
          blocks.push(
            '<div class="agy-sec">' +
              '<div class="agy-metrics-grid">' +
                '<div class="agy-kv"><span>本轮速率</span><strong>' + esc(curSpeed) + '</strong></div>' +
                '<div class="agy-kv"><span>本轮缓存</span><strong>' + esc(lastHit) + '</strong></div>' +
                '<div class="agy-kv"><span>会话均值</span><strong>' + esc(avgSpeed) + '</strong></div>' +
                '<div class="agy-kv"><span>总缓存</span><strong>' + esc(totalHit) + '</strong></div>' +
                '<div class="agy-kv"><span>本轮花费</span><strong>' + esc(turnSpendText) + '</strong></div>' +
                '<div class="agy-kv"><span>总计花费</span><strong>' + esc(totalSpendText) + '</strong></div>' +
              '</div>' +
            '</div>'
          );
        } else if (sec.id === 'quota') {
          var groups = Array.isArray(qta.groups) ? qta.groups : [];
          var qRows = '';
          if (qta.available && groups.length > 0) {
            for (var g = 0; g < groups.length; g++) {
              var grp = groups[g];
              var buckets = Array.isArray(grp.buckets) && grp.buckets.length > 0
                ? grp.buckets
                : [grp.fiveHour, grp.weekly].filter(Boolean);
              var bucketHtml = '';
              for (var bi = 0; bi < buckets.length; bi++) {
                var bk = buckets[bi];
                var bPct = bk && bk.remainingPct != null ? bk.remainingPct : null;
                var bDur = bk && !bk.isFull && bk.remainingMs ? fmtDur(bk.remainingMs) : '';
                var bLbl = bk.label || (bk.window === 'weekly' ? '周' : bk.window === '5h' ? '5h' : '');
                bucketHtml +=
                  '<span class="agy-q-bucket">' +
                    makeRingSvg('agy-q-ring', bPct != null ? bPct : 0, quotaRingColor(bPct), 'var(--pop-track)') +
                    '<span class="agy-q-lbl">' + esc(bLbl) + '</span>' +
                    '<span class="agy-q-pct">' + (bPct != null ? esc(bPct) + '%' : '--') + '</span>' +
                    '<span class="agy-q-dur">' + (bDur ? esc(bDur) : '') + '</span>' +
                  '</span>';
              }
              var activeDot = '<span class="agy-dot" style="background:var(--pop-accent)"></span>';
              qRows +=
                '<div class="agy-quota-row">' +
                  '<span class="agy-quota-name">' + activeDot + esc(grp.label) + '</span>' +
                  '<span class="agy-quota-buckets">' + bucketHtml + '</span>' +
                '</div>';
            }
          } else {
            qRows = '<div class="agy-muted">额度暂不可用</div>';
          }
          blocks.push(
            '<div class="agy-sec">' +
              '<div class="agy-quota-list">' + qRows + '</div>' +
            '</div>'
          );
        }
      }

      if (blocks.length === 0) {
        blocks.push('<div class="agy-sec agy-muted">无显示区块</div>');
      }
      return blocks.join('');
    }

    function positionPopover(pillEl, popEl) {
      var pr = pillEl.getBoundingClientRect();
      var pw = popEl.offsetWidth || 344;
      var ph = popEl.offsetHeight || 220;
      var left = pr.left + pr.width / 2 - pw / 2;
      left = Math.max(12, Math.min(window.innerWidth - pw - 12, left));
      var composerCard = pillEl.closest ? pillEl.closest('form, [class*="composer"], [class*="input"], .mock-composer') : null;
      var anchorTop = pr.top;
      if (composerCard) {
        var cr = composerCard.getBoundingClientRect();
        if (cr && cr.top < anchorTop && anchorTop - cr.top < 140) {
          anchorTop = cr.top;
        }
      }
      var top = anchorTop - ph - 10;
      if (top < 12) top = Math.max(12, pr.top - ph - 8);
      popEl.style.left = Math.round(left) + 'px';
      popEl.style.top = Math.round(top) + 'px';
    }

    function bindHoverEvents(pillEl, popEl) {
      // Freeze popover DOM innerHTML updates while pointer is pressed inside popover so click is never dropped
      popEl.onmousedown = function(ev) {
        if (ev.target && ev.target.closest && ev.target.closest('[data-agy-action="open-sidecar"]')) {
          window.__agyHudPopPointerDown = true;
          ev.stopPropagation();
        }
      };
      if (!window.__agyHudPopMouseUpBound) {
        window.__agyHudPopMouseUpBound = true;
        window.addEventListener('mouseup', function() {
          window.__agyHudPopPointerDown = false;
        }, true);
      }

      // Run open sequence strictly on click (+ setTimeout 0) so the user's own mouseup/click
      // finishes BEFORE opening Radix/Base-UI dropdowns and cannot outside-click-dismiss them!
      popEl.onclick = function(ev) {
        window.__agyHudPopPointerDown = false;
        var link = ev.target && ev.target.closest ? ev.target.closest('[data-agy-action="open-sidecar"]') : null;
        if (!link) return;
        ev.preventDefault();
        ev.stopPropagation();
        popEl.classList.remove('is-visible');

        var opSeq = (window.__agyHudSidecarOpSeq = (window.__agyHudSidecarOpSeq || 0) + 1);

        function isCurrent() {
          return window.__agyHudSidecarOpSeq === opSeq;
        }

        function isVisible(el) {
          if (!el || !el.getBoundingClientRect) return false;
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }

        function fireClick(el) {
          if (!el) return;
          try {
            el.focus && el.focus({ preventScroll: true });
          } catch (e) {}
          try {
            el.click();
          } catch (e) {}
        }

        function waitUntil(probeFn, onReady, timeoutMs, intervalMs) {
          var deadline = Date.now() + (timeoutMs || 1800);
          var step = intervalMs || 70;
          function tick() {
            if (!isCurrent()) return;
            var res = null;
            try {
              res = probeFn();
            } catch (e) {
              res = null;
            }
            if (res) {
              onReady(res);
              return;
            }
            if (Date.now() < deadline) {
              setTimeout(tick, step);
            }
          }
          tick();
        }

        // Strict search: existing AGY HUD tab in the right side-panel tab strip ONLY
        function findExistingAgyHudTab() {
          var tabBtns = document.querySelectorAll('.agy-aux-tab button, [data-side-panel-strip] button');
          for (var i = 0; i < tabBtns.length; i++) {
            var btn = tabBtns[i];
            if (!isVisible(btn)) continue;
            var titleEl = btn.querySelector ? btn.querySelector('.agy-aux-tab-title') : null;
            var txt = ((titleEl ? titleEl.textContent : btn.textContent) || '').trim();
            if (txt === 'AGY HUD') return btn;
          }
          return null;
        }

        // Strict search: AGY HUD entry inside the Plugins submenu ONLY
        function findVisiblePluginMenuItem() {
          var items = document.querySelectorAll('[data-testid="plugins-submenu-item"]');
          for (var i = 0; i < items.length; i++) {
            var n = items[i];
            if (!isVisible(n)) continue;
            if ((n.textContent || '').trim() === 'AGY HUD') return n;
          }
          return null;
        }

        function findVisibleExtCard() {
          var extCard = document.querySelector('[data-testid="new-tab-card-extensions"]');
          return extCard && isVisible(extCard) ? extCard : null;
        }

        function findVisiblePlusBtn() {
          var plusBtn = document.querySelector('[data-testid="side-panel-new-tab-button"]');
          return plusBtn && isVisible(plusBtn) ? plusBtn : null;
        }

        function openFromPluginsCard(extCard) {
          fireClick(extCard);
          var retried = false;
          var startedAt = Date.now();
          waitUntil(
            function() {
              var item = findVisiblePluginMenuItem();
              if (item) return item;
              if (!retried && Date.now() - startedAt > 360) {
                var cardAgain = findVisibleExtCard();
                if (cardAgain) {
                  retried = true;
                  fireClick(cardAgain);
                }
              }
              return null;
            },
            function(item) {
              fireClick(item);
            },
            2000,
            70,
          );
        }

        function selectOrAddAgyHudTab() {
          waitUntil(
            function() {
              var tab = findExistingAgyHudTab();
              if (tab) return { kind: 'tab', el: tab };
              var menuItem = findVisiblePluginMenuItem();
              if (menuItem) return { kind: 'menuItem', el: menuItem };
              var extCard = findVisibleExtCard();
              if (extCard) return { kind: 'ext', el: extCard };
              var plusBtn = findVisiblePlusBtn();
              if (plusBtn) return { kind: 'plus', el: plusBtn };
              return null;
            },
            function(found) {
              if (found.kind === 'tab' || found.kind === 'menuItem') {
                fireClick(found.el);
                return;
              }
              if (found.kind === 'ext') {
                openFromPluginsCard(found.el);
                return;
              }
              if (found.kind === 'plus') {
                fireClick(found.el);
                waitUntil(
                  function() {
                    var item = findVisiblePluginMenuItem();
                    if (item) return { kind: 'menuItem', el: item };
                    var card = findVisibleExtCard();
                    if (card) return { kind: 'ext', el: card };
                    return null;
                  },
                  function(next) {
                    if (next.kind === 'menuItem') fireClick(next.el);
                    else openFromPluginsCard(next.el);
                  },
                  1800,
                  70,
                );
              }
            },
            2000,
            70,
          );
        }

        // Defer to next macrotask so current click event lifecycle completes cleanly
        setTimeout(function() {
          if (!isCurrent()) return;
          var toggleBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
          if (!toggleBtn) return;
          var isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
          var panelAlreadyMounted = Boolean(
            findExistingAgyHudTab() || findVisibleExtCard() || findVisiblePlusBtn(),
          );

          if (!isExpanded && !panelAlreadyMounted && isVisible(toggleBtn)) {
            fireClick(toggleBtn);
            setTimeout(function() {
              if (isCurrent()) selectOrAddAgyHudTab();
            }, 80);
            return;
          }

          selectOrAddAgyHudTab();
        }, 0);
      };

      if (pillEl.__agyHudBound) return;
      pillEl.__agyHudBound = true;
      var showTimer = null;
      var hideTimer = null;

      function openPop() {
        clearTimeout(hideTimer);
        if (popEl.classList.contains('is-visible')) {
          positionPopover(pillEl, popEl);
          return;
        }
        var delay = Number(window.__agyHudHoverDelayMs || 150);
        clearTimeout(showTimer);
        showTimer = setTimeout(function() {
          if (!document.body.contains(pillEl)) return;
          positionPopover(pillEl, popEl);
          popEl.classList.add('is-visible');
        }, delay);
      }

      function scheduleClose() {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function() {
          popEl.classList.remove('is-visible');
        }, 380);
      }

      pillEl.addEventListener('mouseenter', openPop);
      pillEl.addEventListener('mouseleave', scheduleClose);
      popEl.addEventListener('mouseenter', function() { clearTimeout(hideTimer); });
      popEl.addEventListener('mouseleave', scheduleClose);

      if (!window.__agyHudGlobalEscBound) {
        window.__agyHudGlobalEscBound = true;
        window.addEventListener('keydown', function(ev) {
          if (ev.key === 'Escape') {
            var p = document.getElementById(IDS.popover);
            if (p) p.classList.remove('is-visible');
          }
        });
        window.addEventListener('mousedown', function(ev) {
          var p = document.getElementById(IDS.popover);
          var r = document.getElementById(IDS.root);
          if (p && p.classList.contains('is-visible')) {
            if (!p.contains(ev.target) && (!r || !r.contains(ev.target))) {
              p.classList.remove('is-visible');
            }
          }
        }, true);
      }
    }

    function fmtSec(sec) {
      var s = Number(sec || 0);
      if (!Number.isFinite(s) || s <= 0) return '';
      if (s >= 60) {
        var mins = Math.floor(s / 60);
        var rem = Math.round(s % 60);
        return rem > 0 ? mins + 'm' + rem + 's' : mins + 'm';
      }
      return (s >= 10 ? s.toFixed(1) : s.toFixed(1)) + 's';
    }

    function fmtUsd(v) {
      var n = Number(v || 0);
      if (!Number.isFinite(n) || n <= 0) return '$0.00';
      if (n < 0.01) return '$' + n.toFixed(4).replace(/0+$/, '');
      if (n >= 100) return '$' + n.toFixed(1);
      return '$' + n.toFixed(2);
    }

    function applyCompactLayout() {
      var root = document.documentElement;
      if (!root) return;
      var mode = cfg.compactMode || 'off';
      if (mode === 'off') {
        root.removeAttribute('data-agy-hud-compact');
        root.style.removeProperty('--agy-hud-lh');
        root.style.removeProperty('--agy-hud-block-gap');
        root.style.removeProperty('--agy-hud-list-gap');
        return;
      }
      var lh = mode === 'relaxed' ? 1.7 : mode === 'compact' ? 1.4 : Number(cfg.compactLineHeight || 1.4);
      var bg = mode === 'relaxed' ? 22 : mode === 'compact' ? 8 : Number(cfg.compactBlockGap ?? 8);
      var lg = mode === 'relaxed' ? 8 : mode === 'compact' ? 2 : Number(cfg.compactListGap ?? 2);
      root.setAttribute('data-agy-hud-compact', '1');
      root.style.setProperty('--agy-hud-lh', String(lh));
      root.style.setProperty('--agy-hud-block-gap', String(bg) + 'px');
      root.style.setProperty('--agy-hud-list-gap', String(lg) + 'px');
    }

    function extractToolbarStepMeta(tb) {
      try {
        var keys = Object.keys(tb);
        var fk = '';
        for (var k = 0; k < keys.length; k++) {
          if (keys[k].indexOf('__reactFiber$') === 0 || keys[k].indexOf('__reactInternalInstance$') === 0) {
            fk = keys[k];
            break;
          }
        }
        if (!fk) return null;
        var f = tb[fk];
        var nrcProps = null;
        var iEcProps = null;
        var sliceProps = null;
        for (var i = 0; i < 20 && f; i++) {
          var p = f.memoizedProps;
          if (p) {
            if (!nrcProps && Array.isArray(p.steps) && 'showThumbsUpDown' in p) nrcProps = p;
            if (!iEcProps && p.cascadeId && Array.isArray(p.trajectorySteps) && typeof p.trajectoryLength === 'number') {
              iEcProps = p;
            }
            if (!sliceProps && p.trajectorySlice && Array.isArray(p.trajectorySlice.stepsInSlice)) {
              sliceProps = p;
            }
          }
          if (nrcProps && (iEcProps || sliceProps)) break;
          f = f.return;
        }
        if (!nrcProps) return null;
        var tSteps = iEcProps
          ? iEcProps.trajectorySteps
          : sliceProps && sliceProps.trajectorySlice
            ? sliceProps.trajectorySlice.stepsInSlice
            : [];
        var base = iEcProps
          ? iEcProps.trajectoryLength - tSteps.length
          : sliceProps && sliceProps.trajectorySlice && typeof sliceProps.trajectorySlice.totalStepsLength === 'number'
            ? sliceProps.trajectorySlice.totalStepsLength - tSteps.length
            : 0;
        var maxStep = -1;
        var maxMeta = -1;
        for (var sIdx = 0; sIdx < nrcProps.steps.length; sIdx++) {
          var s = nrcProps.steps[sIdx];
          if (!s) continue;
          var srcInfo = s.metadata && s.metadata.sourceTrajectoryStepInfo;
          var si = srcInfo && typeof srcInfo.stepIndex === 'number' ? srcInfo.stepIndex : -1;
          if (si < 0 && tSteps.length > 0) {
            var pos = tSteps.indexOf(s);
            if (pos >= 0) si = base + pos;
          }
          if (si > maxStep) maxStep = si;
          if (srcInfo && typeof srcInfo.metadataIndex === 'number' && srcInfo.metadataIndex > maxMeta) {
            maxMeta = srcInfo.metadataIndex;
          }
        }
        if (maxStep < 0 && maxMeta < 0) return null;
        return { maxStep: maxStep, maxMeta: maxMeta };
      } catch (e) {
        return null;
      }
    }

    function matchTurnForToolbar(turns, meta, fallbackIdx) {
      if (!Array.isArray(turns) || turns.length === 0) return null;
      if (meta) {
        if (meta.maxStep >= 0) {
          for (var i = 0; i < turns.length; i++) {
            var t = turns[i];
            if (meta.maxStep >= t.startStepIdx && (t.endStepIdx < 0 || meta.maxStep <= t.endStepIdx)) {
              return t;
            }
          }
        }
        if (meta.maxMeta >= 0) {
          for (var j = 0; j < turns.length; j++) {
            var t2 = turns[j];
            if (meta.maxMeta >= t2.minGenIdx && meta.maxMeta <= t2.maxGenIdx) {
              return t2;
            }
          }
        }
      }
      if (fallbackIdx >= 0 && fallbackIdx < turns.length) {
        return turns[fallbackIdx];
      }
      return null;
    }

    function buildTurnSummaryHtml(t) {
      if (!t) return '';
      var parts = [];
      if (t.modelLabel) {
        var mHtml = '<span class="agy-turn-model">' + esc(t.modelLabel) + '</span>';
        if (t.effort) {
          mHtml += '<span class="agy-turn-effort">' + esc(t.effort) + '</span>';
        }
        parts.push('<span class="agy-turn-item">' + mHtml + '</span>');
      }
      if (t.cacheHitPct != null) {
        parts.push('<span class="agy-turn-item"><span class="agy-turn-val">' + esc(Number(t.cacheHitPct).toFixed(1)) + '%</span></span>');
      }
      if (t.totalDurSec > 0) {
        parts.push('<span class="agy-turn-item"><span class="agy-turn-val">' + esc(fmtSec(t.totalDurSec)) + '</span></span>');
      }
      if (t.tps != null && t.tps > 0) {
        parts.push('<span class="agy-turn-item"><span class="agy-turn-val">' + esc(t.tps) + ' tok/s</span></span>');
      }
      if (t.totalTokens > 0) {
        parts.push('<span class="agy-turn-item"><span class="agy-turn-val">' + esc(fmtTok(t.totalTokens)) + '</span></span>');
      }
      if (t.totalCostUsd != null && t.totalTokens > 0) {
        parts.push('<span class="agy-turn-item"><span class="agy-turn-val">' + esc(fmtUsd(t.totalCostUsd)) + '</span></span>');
      }
      return parts.join('<span class="agy-turn-sep">·</span>');
    }

    function renderTurnSummaries(theme) {
      var turns = Array.isArray(snap.turns) ? snap.turns : [];
      var enabled = cfg.showTurnSummary !== false && turns.length > 0;
      if (!enabled) {
        var existing = document.querySelectorAll('.agy-turn-summary-bar');
        for (var r = 0; r < existing.length; r++) existing[r].remove();
        return;
      }

      var toolbars = document.querySelectorAll('[data-testid="cascade-system-message-toolbar"]');
      if (!toolbars || toolbars.length === 0) return;

      for (var i = 0; i < toolbars.length; i++) {
        var tb = toolbars[i];
        // Clean up any legacy sibling bar placed above the toolbar in earlier versions
        var legacyPrev = tb.previousElementSibling;
        if (legacyPrev && legacyPrev.classList && legacyPrev.classList.contains('agy-turn-summary-bar')) {
          legacyPrev.remove();
        }
        var row = tb.querySelector(':scope > div') || tb;
        var bar = row.querySelector(':scope > .agy-turn-summary-bar');

        var meta = extractToolbarStepMeta(tb);
        var turn = matchTurnForToolbar(turns, meta, i);
        if (!turn) {
          if (bar) bar.remove();
          continue;
        }
        var html = buildTurnSummaryHtml(turn);
        if (!html) {
          if (bar) bar.remove();
          continue;
        }
        if (!bar) {
          bar = document.createElement('span');
          bar.className = 'agy-turn-summary-bar';
          bar.setAttribute('data-agy-turn-bar', '1');
          row.prepend(bar);
        } else if (row.firstElementChild !== bar) {
          row.prepend(bar);
        }
        bar.setAttribute('data-agy-theme', theme);
        if (bar.getAttribute('data-agy-turn-html') !== html) {
          bar.setAttribute('data-agy-turn-html', html);
          bar.innerHTML = html;
        }
      }
    }

    function mountAndRender() {
      var theme = detectTheme();
      applyCompactLayout();
      renderTurnSummaries(theme);

      var anchor = findComposerAnchor();
      if (!anchor) return false;

      var pillEl = document.getElementById(IDS.root);
      if (!pillEl) {
        pillEl = document.createElement('div');
        pillEl.id = IDS.root;
        pillEl.setAttribute('role', 'status');
        pillEl.setAttribute('aria-label', 'AGY HUD');
      }
      if (pillEl.parentElement !== anchor.parent || pillEl.nextSibling !== anchor.before) {
        anchor.parent.insertBefore(pillEl, anchor.before);
      }

      // Sync exact font metrics from adjacent host button (e.g. Turbo) for 0px typography mismatch
      if (anchor.before && window.getComputedStyle) {
        try {
          var refEl = anchor.before.tagName === 'BUTTON'
            ? anchor.before
            : (anchor.before.querySelector && anchor.before.querySelector('button')) || anchor.before;
          var refCs = window.getComputedStyle(refEl);
          if (refCs.fontSize) pillEl.style.setProperty('--hud-font-size', refCs.fontSize);
          if (refCs.fontWeight) pillEl.style.setProperty('--hud-font-weight', refCs.fontWeight);
          if (refCs.lineHeight) pillEl.style.setProperty('--hud-line-height', refCs.lineHeight);
        } catch (e) {}
      }

      var popEl = document.getElementById(IDS.popover);
      if (!popEl) {
        popEl = document.createElement('div');
        popEl.id = IDS.popover;
        document.body.appendChild(popEl);
      }

      pillEl.setAttribute('data-agy-theme', theme);
      popEl.setAttribute('data-agy-theme', theme);
      window.__agyHudHoverDelayMs = Number(cfg.hoverDelayMs ?? 150);

      var nextPillHtml = renderPillHtml(anchor.cardWidth);
      if (pillEl.getAttribute('data-agy-pill-html') !== nextPillHtml) {
        pillEl.setAttribute('data-agy-pill-html', nextPillHtml);
        pillEl.innerHTML = nextPillHtml;
      }
      var nextPopHtml = renderPopoverHtml();
      if (!window.__agyHudPopPointerDown && popEl.getAttribute('data-agy-pop-html') !== nextPopHtml) {
        popEl.setAttribute('data-agy-pop-html', nextPopHtml);
        popEl.innerHTML = nextPopHtml;
      }
      bindHoverEvents(pillEl, popEl);
      if (popEl.classList.contains('is-visible')) {
        positionPopover(pillEl, popEl);
      }
      return true;
    }

    window.__agyHudLatestRender = mountAndRender;
    var mounted = mountAndRender();

    if (!window.__agyHudObserver && typeof MutationObserver === 'function' && document.body) {
      var pending = false;
      window.__agyHudObserver = new MutationObserver(function(mutations) {
        var relevant = false;
        for (var m = 0; m < mutations.length; m++) {
          var tgt = mutations[m].target;
          if (tgt && tgt.closest && (tgt.closest('#' + IDS.root) || tgt.closest('#' + IDS.popover) || tgt.closest('.agy-turn-summary-bar'))) {
            continue;
          }
          relevant = true;
          break;
        }
        if (!relevant) return;
        if (pending) return;
        pending = true;
        requestAnimationFrame(function() {
          pending = false;
          if (typeof window.__agyHudLatestRender === 'function') {
            window.__agyHudLatestRender();
          }
        });
      });
      window.__agyHudObserver.observe(document.body, { childList: true, subtree: true });
    }

    return { ok: true, mounted: mounted };
  } catch (err) {
    return { ok: false, mounted: false, error: String(err && err.message ? err.message : err) };
  }
})(${payloadJson});`;
}

export function buildHudRemoveExpression() {
  return `(function() {
  try {
    if (window.__agyHudObserver) {
      window.__agyHudObserver.disconnect();
      window.__agyHudObserver = null;
    }
    window.__agyHudLatestRender = null;
    var ids = [${JSON.stringify(HUD_ROOT_ID)}, ${JSON.stringify(HUD_POPOVER_ID)}, ${JSON.stringify(HUD_STYLE_ID)}];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    var bars = document.querySelectorAll('.agy-turn-summary-bar');
    for (var b = 0; b < bars.length; b++) bars[b].remove();
    if (document.documentElement) {
      document.documentElement.removeAttribute('data-agy-hud-compact');
      document.documentElement.style.removeProperty('--agy-hud-lh');
      document.documentElement.style.removeProperty('--agy-hud-block-gap');
      document.documentElement.style.removeProperty('--agy-hud-list-gap');
    }
    return { ok: true, removed: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})();`;
}
