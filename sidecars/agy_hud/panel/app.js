(function () {
  let state = null;
  let dragCtx = null;

  const $ = (id) => document.getElementById(id);

  function fmtTok(n) {
    const v = Number(n || 0);
    if (!Number.isFinite(v) || v <= 0) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(v));
  }

  function fmtDur(ms) {
    const v = Number(ms);
    if (!Number.isFinite(v) || v <= 0) return '';
    const mins = Math.ceil(v / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remM = mins % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remH = hours % 24;
      return remH > 0 ? `${days}d${remH}h` : `${days}d`;
    }
    return remM > 0 ? `${hours}h${remM}m` : `${hours}h`;
  }

  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    return res.json();
  }

  async function savePatch(patch) {
    state = await api('POST', '/api/config', patch);
    render();
  }

  function renderSortableList(listEl, listKey, items, catalog) {
    const metaMap = new Map((catalog || []).map((c) => [c.id, c]));
    listEl.innerHTML = '';

    items.forEach((item, idx) => {
      const meta = metaMap.get(item.id) || { label: item.id, description: '' };
      const li = document.createElement('li');
      li.className = 'sortable-item';
      li.draggable = true;
      li.dataset.index = String(idx);

      const left = document.createElement('div');
      left.className = 'item-left';

      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      handle.title = '拖拽调整顺序';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = Boolean(item.enabled);
      chk.addEventListener('change', () => {
        const next = items.map((entry, i) =>
          i === idx ? { ...entry, enabled: chk.checked } : entry,
        );
        savePatch({ [listKey]: next });
      });

      const textWrap = document.createElement('div');
      textWrap.className = 'item-text';
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = meta.label;
      const desc = document.createElement('span');
      desc.className = 'item-desc';
      desc.textContent = meta.description;
      textWrap.append(title, desc);

      left.append(handle, chk, textWrap);

      const controls = document.createElement('div');
      controls.className = 'item-controls';

      const btnUp = document.createElement('button');
      btnUp.className = 'btn btn-icon';
      btnUp.textContent = '↑';
      btnUp.disabled = idx === 0;
      btnUp.title = '上移';
      btnUp.addEventListener('click', () => moveItem(listKey, items, idx, idx - 1));

      const btnDown = document.createElement('button');
      btnDown.className = 'btn btn-icon';
      btnDown.textContent = '↓';
      btnDown.disabled = idx === items.length - 1;
      btnDown.title = '下移';
      btnDown.addEventListener('click', () => moveItem(listKey, items, idx, idx + 1));

      controls.append(btnUp, btnDown);
      li.append(left, controls);

      // Drag and drop reordering
      li.addEventListener('dragstart', () => {
        dragCtx = { listKey, fromIdx: idx };
        li.classList.add('is-dragging');
      });
      li.addEventListener('dragend', () => {
        dragCtx = null;
        li.classList.remove('is-dragging');
        listEl.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
      });
      li.addEventListener('dragover', (e) => {
        if (!dragCtx || dragCtx.listKey !== listKey) return;
        e.preventDefault();
        li.classList.add('is-over');
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('is-over');
      });
      li.addEventListener('drop', (e) => {
        if (!dragCtx || dragCtx.listKey !== listKey) return;
        e.preventDefault();
        li.classList.remove('is-over');
        if (dragCtx.fromIdx !== idx) {
          moveItem(listKey, items, dragCtx.fromIdx, idx);
        }
      });

      listEl.appendChild(li);
    });
  }

  function moveItem(listKey, items, fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    savePatch({ [listKey]: next });
  }

  function renderSnapshot(snap) {
    const body = $('liveSnapshotBody');
    if (!snap || !snap.found) {
      $('modelBadge').textContent = '等待对话';
      body.textContent = '尚未检测到活跃会话日志，开始对话后将自动显示实时上下文、速率、缓存与配额。';
      return;
    }

    $('modelBadge').textContent = snap.model?.id || snap.model?.label || '--';
    const ctx = snap.context || {};
    const spd = snap.speed || {};
    const cac = snap.cache || {};
    const qta = snap.quota || {};

    const segHtml = (ctx.breakdown || [])
      .map((item) => `<div style="width:${item.pct}%;background:${item.color}" title="${item.label}: ${fmtTok(item.tokens)}"></div>`)
      .join('');

    const quotaHtml = qta.available && qta.groups?.length
      ? qta.groups.map((g) => {
          const fh = g.fiveHour;
          const wk = g.weekly;
          const fhStr = fh?.remainingPct != null ? `${fh.remainingPct}%${fh.remainingMs && !fh.isFull ? ` (${fmtDur(fh.remainingMs)})` : ''}` : '--';
          const wkStr = wk?.remainingPct != null ? `${wk.remainingPct}%${wk.remainingMs && !wk.isFull ? ` (${fmtDur(wk.remainingMs)})` : ''}` : '--';
          return `<div class="snap-quota-row"><span>${g.isActive ? '● ' : ''}${g.label}</span><span>5h ${fhStr} · 周 ${wkStr}</span></div>`;
        }).join('')
      : '<div class="hint">原生配额需在 Antigravity 内以 Sidecar 运行时自动获取。</div>';

    body.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span>上下文占用</span>
          <strong>${fmtTok(ctx.usedTokens)} / ${fmtTok(ctx.contextLimit)} (${ctx.usedPercent}%)</strong>
        </div>
        <div class="snap-bar">${segHtml}</div>
      </div>
      <div class="snap-kv-grid">
        <div class="snap-box">
          <div class="snap-label">本轮 / 平均速率</div>
          <div class="snap-val">${spd.latestTokPerSec ?? '--'} / ${spd.avgTokPerSec ?? '--'} tok/s</div>
        </div>
        <div class="snap-box">
          <div class="snap-label">本轮 / 总缓存命中率</div>
          <div class="snap-val">${cac.lastHitPct != null ? cac.lastHitPct + '%' : '--'} / ${cac.sessionHitPct != null ? cac.sessionHitPct + '%' : '--'}</div>
        </div>
      </div>
      <div>${quotaHtml}</div>
    `;
  }

  function render() {
    if (!state) return;
    const { config, cdpStatus, platform, launcherInfo, catalogs, snapshot } = state;

    const dot = $('statusDot');
    const sub = $('statusSub');
    if (cdpStatus?.connected) {
      dot.classList.add('is-ok');
      sub.textContent = cdpStatus.anchorFound
        ? `CDP 已直连 (:${cdpStatus.port}) · HUD 已挂载`
        : `CDP 已直连 (:${cdpStatus.port}) · 等待输入框出现`;
    } else {
      dot.classList.remove('is-ok');
      sub.textContent = config.cdpEnabled
        ? `待 CDP 启动 (:${config.cdpPort})`
        : 'CDP 注入已暂停';
    }

    $('chkCdpEnabled').checked = Boolean(config.cdpEnabled);
    if (document.activeElement !== $('inputPort')) {
      $('inputPort').value = String(config.cdpPort);
    }
    $('selectCtxFormat').value = config.contextDisplayFormat;
    $('selectWindowCap').value = String(config.windowCapMode);

    const pName = platform === 'win32' ? 'Windows (.lnk)' : platform === 'darwin' ? 'macOS (.app)' : platform;
    $('platformTag').textContent = pName;
    $('btnGenerateLauncher').textContent =
      platform === 'win32'
        ? '生成 Windows CDP 快捷方式 (.lnk)'
        : platform === 'darwin'
          ? '生成 macOS 套壳启动器 (.app)'
          : '显示 Linux CDP 启动命令';

    if (launcherInfo) {
      const box = $('launcherResult');
      box.hidden = false;
      const target = launcherInfo.lnkPath || launcherInfo.bundlePath || launcherInfo.manualCommand || '';
      box.innerHTML = `已就绪：<code>${target}</code><br/>请先彻底退出 Antigravity（含后台托盘 / Cmd+Q），再通过该启动器重新打开。`;
    }

    renderSortableList($('pillItemsList'), 'pillItems', config.pillItems, catalogs?.pillItems);
    renderSortableList($('popoverSectionsList'), 'popoverSections', config.popoverSections, catalogs?.popoverSections);
    renderSnapshot(snapshot);
  }

  async function refresh() {
    state = await api('GET', '/api/state');
    render();
  }

  $('chkCdpEnabled').addEventListener('change', (e) => savePatch({ cdpEnabled: e.target.checked }));
  $('btnSavePort').addEventListener('click', () => {
    const port = Number($('inputPort').value);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      savePatch({ cdpPort: port });
    }
  });
  $('selectCtxFormat').addEventListener('change', (e) => savePatch({ contextDisplayFormat: e.target.value }));
  $('selectWindowCap').addEventListener('change', (e) => {
    const val = e.target.value === 'auto' ? 'auto' : Number(e.target.value);
    savePatch({ windowCapMode: val });
  });
  $('btnRefresh').addEventListener('click', async () => {
    state = await api('POST', '/api/refresh', {});
    render();
  });
  $('btnReset').addEventListener('click', async () => {
    state = await api('POST', '/api/config/reset', {});
    render();
  });
  $('btnGenerateLauncher').addEventListener('click', async () => {
    const res = await api('POST', '/api/launcher/generate', {});
    if (res?.state) {
      state = res.state;
      render();
    }
  });

  refresh();
  setInterval(refresh, 3000);
})();
