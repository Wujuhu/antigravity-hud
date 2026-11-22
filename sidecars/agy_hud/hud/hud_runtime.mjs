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
  --hud-bg: rgba(255, 255, 255, 0.05);
  --hud-bg-hover: rgba(255, 255, 255, 0.1);
  --hud-border: rgba(255, 255, 255, 0.1);
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
  height: 24px;
  padding: 0 9px;
  margin-right: 6px;
  border-radius: 999px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  color: var(--hud-text);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  flex-shrink: 0;
  transition: background 120ms ease, border-color 120ms ease;
  box-sizing: border-box;
}
#${HUD_ROOT_ID}:hover {
  background: var(--hud-bg-hover);
  border-color: rgba(255, 255, 255, 0.2);
}
#${HUD_ROOT_ID}[data-agy-theme="light"] {
  --hud-bg: rgba(0, 0, 0, 0.035);
  --hud-bg-hover: rgba(0, 0, 0, 0.07);
  --hud-border: rgba(0, 0, 0, 0.1);
  --hud-text: #18191b;
  --hud-muted: #6b707a;
  --hud-sep: rgba(0, 0, 0, 0.2);
  --hud-track: rgba(0, 0, 0, 0.12);
  --hud-accent: #1a73e8;
  --hud-warn: #b06000;
  --hud-danger: #c5221f;
}
#${HUD_ROOT_ID}[data-agy-theme="light"]:hover {
  border-color: rgba(0, 0, 0, 0.2);
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
  width: 13px;
  height: 13px;
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
  width: 344px;
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
  font-size: 11px;
}
#${HUD_POPOVER_ID} .agy-kv span {
  color: var(--pop-muted);
}
#${HUD_POPOVER_ID} .agy-kv strong {
  font-weight: 500;
  color: var(--pop-text);
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
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
#${HUD_POPOVER_ID} .agy-q-bucket {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 82px;
  white-space: nowrap;
}
#${HUD_POPOVER_ID} .agy-q-bucket:first-child {
  min-width: 98px;
}
#${HUD_POPOVER_ID} .agy-q-ring {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transform: rotate(-90deg);
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
        } else if (id === 'cache') {
          if (cac.lastHitPct != null) {
            segments.push('<span class="agy-hud-seg"><span class="agy-hud-muted">缓存</span> ' + esc(Math.round(cac.lastHitPct)) + '%</span>');
          }
        } else if (id === 'tokens') {
          segments.push('<span class="agy-hud-seg">' + esc(fmtTok(cac.cumulativeTotalTokens)) + '</span>');
        } else if (id === 'model') {
          if (mdl.id) {
            segments.push('<span class="agy-hud-seg agy-hud-muted agy-hud-model">' + esc(mdl.id) + '</span>');
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
          blocks.push(
            '<div class="agy-sec">' +
              '<div class="agy-row">' +
                '<span class="agy-title">' + esc(mdl.id || mdl.label || '上下文') + '</span>' +
                '<span class="agy-muted">' + esc(fmtTok(ctx.usedTokens)) + ' / ' + esc(fmtTok(ctx.contextLimit)) + ' · ' + esc(pct.toFixed(1)) + '%' + compHtml + '</span>' +
              '</div>' +
              '<div class="agy-bar-track">' + segs + '</div>' +
              (legends ? '<div class="agy-legend">' + legends + '</div>' : '') +
            '</div>'
          );
        } else if (sec.id === 'speedAndCache') {
          var curSpeed = spd.latestTokPerSec != null ? spd.latestTokPerSec + ' tok/s' : '--';
          var avgSpeed = spd.avgTokPerSec != null ? spd.avgTokPerSec + ' tok/s' : '--';
          var lastHit = cac.lastHitPct != null ? cac.lastHitPct.toFixed(1) + '%' : '--';
          var totalHit = cac.sessionHitPct != null ? cac.sessionHitPct.toFixed(1) + '%' : '--';
          blocks.push(
            '<div class="agy-sec">' +
              '<div class="agy-metrics-grid">' +
                '<div class="agy-kv"><span>本轮速率</span><strong>' + esc(curSpeed) + '</strong></div>' +
                '<div class="agy-kv"><span>本轮缓存</span><strong>' + esc(lastHit) + '</strong></div>' +
                '<div class="agy-kv"><span>会话均值</span><strong>' + esc(avgSpeed) + '</strong></div>' +
                '<div class="agy-kv"><span>总缓存</span><strong>' + esc(totalHit) + '</strong></div>' +
                '<div class="agy-kv"><span>本轮输出</span><strong>' + esc(fmtTok(spd.lastOutputTokens)) + '</strong></div>' +
                '<div class="agy-kv"><span>会话总计</span><strong>' + esc(fmtTok(cac.cumulativeTotalTokens)) + '</strong></div>' +
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
                    '<span class="agy-muted">' + esc(bLbl) + '</span>' +
                    '<span>' + (bPct != null ? esc(bPct) + '%' : '--') + '</span>' +
                    (bDur ? '<span class="agy-muted">' + esc(bDur) + '</span>' : '') +
                  '</span>';
              }
              var activeDot = grp.isActive
                ? '<span class="agy-dot" style="background:var(--pop-accent)"></span>'
                : '<span class="agy-dot" style="background:var(--pop-track)"></span>';
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
        }, 220);
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

    function mountAndRender() {
      var theme = detectTheme();
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

      var popEl = document.getElementById(IDS.popover);
      if (!popEl) {
        popEl = document.createElement('div');
        popEl.id = IDS.popover;
        document.body.appendChild(popEl);
      }

      pillEl.setAttribute('data-agy-theme', theme);
      popEl.setAttribute('data-agy-theme', theme);
      window.__agyHudHoverDelayMs = Number(cfg.hoverDelayMs ?? 150);

      pillEl.innerHTML = renderPillHtml(anchor.cardWidth);
      popEl.innerHTML = renderPopoverHtml();
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
      window.__agyHudObserver = new MutationObserver(function() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function() {
          pending = false;
          if (!document.getElementById(IDS.root) && typeof window.__agyHudLatestRender === 'function') {
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
    return { ok: true, removed: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})();`;
}
