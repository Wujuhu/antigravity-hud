(function () {
  let state = null;
  let dragCtx = null;

  const $ = (id) => document.getElementById(id);

  const COMPACT_PRESETS = {
    relaxed: { lineHeight: 1.7, blockGap: 22, listGap: 8, label: '舒适' },
    off: { lineHeight: 1.55, blockGap: 14, listGap: 6, label: '原版' },
    compact: { lineHeight: 1.4, blockGap: 8, listGap: 2, label: '紧凑' },
  };

  const GRIP_SVG =
    '<svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor" aria-hidden="true">' +
      '<circle cx="4" cy="2.5" r="0.9"/><circle cx="8" cy="2.5" r="0.9"/>' +
      '<circle cx="4" cy="6" r="0.9"/><circle cx="8" cy="6" r="0.9"/>' +
      '<circle cx="4" cy="9.5" r="0.9"/><circle cx="8" cy="9.5" r="0.9"/>' +
    '</svg>';

  const UP_SVG =
    '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 10l4-4 4 4"/>' +
    '</svg>';

  const DOWN_SVG =
    '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 6l4 4 4-4"/>' +
    '</svg>';

  function fmtTok(n) {
    const v = Number(n || 0);
    if (!Number.isFinite(v) || v <= 0) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(v));
  }

  function fmtUsd(n) {
    const v = Number(n || 0);
    if (!Number.isFinite(v) || v <= 0) return '$0.00';
    return v >= 100 ? `$${v.toFixed(1)}` : `$${v.toFixed(2)}`;
  }

  function fmtTimeShort(ms) {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '--';
    const d = new Date(n);
    const pad = (x) => String(x).padStart(2, '0');
    return `更新于 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  function moveItem(listKey, items, fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    savePatch({ [listKey]: next });
  }

  function renderSortableList(listEl, listKey, items, catalog) {
    const metaMap = new Map((catalog || []).map((c) => [c.id, c]));
    listEl.innerHTML = '';

    items.forEach((item, idx) => {
      const meta = metaMap.get(item.id) || { label: item.id };
      const li = document.createElement('li');
      li.className = 'clean-row' + (item.enabled ? '' : ' is-off');
      li.draggable = true;

      const left = document.createElement('div');
      left.className = 'row-left';

      const grip = document.createElement('span');
      grip.className = 'drag-grip';
      grip.innerHTML = GRIP_SVG;

      const title = document.createElement('span');
      title.className = 'row-title';
      title.textContent = meta.label;

      left.append(grip, title);

      const right = document.createElement('div');
      right.className = 'row-right';

      const movers = document.createElement('span');
      movers.className = 'row-movers';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'mover-btn';
      btnUp.title = '上移';
      btnUp.innerHTML = UP_SVG;
      btnUp.disabled = idx === 0;
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        moveItem(listKey, items, idx, idx - 1);
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'mover-btn';
      btnDown.title = '下移';
      btnDown.innerHTML = DOWN_SVG;
      btnDown.disabled = idx === items.length - 1;
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        moveItem(listKey, items, idx, idx + 1);
      });

      movers.append(btnUp, btnDown);

      const sw = document.createElement('label');
      sw.className = 'switch switch-sm';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = Boolean(item.enabled);
      chk.addEventListener('change', () => {
        const next = items.map((entry, i) =>
          i === idx ? { ...entry, enabled: chk.checked } : entry,
        );
        savePatch({ [listKey]: next });
      });
      const slider = document.createElement('span');
      slider.className = 'slider';
      sw.append(chk, slider);

      right.append(movers, sw);
      li.append(left, right);

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
      li.addEventListener('dragleave', () => li.classList.remove('is-over'));
      li.addEventListener('drop', (e) => {
        if (!dragCtx || dragCtx.listKey !== listKey) return;
        e.preventDefault();
        li.classList.remove('is-over');
        if (dragCtx.fromIdx !== idx) moveItem(listKey, items, dragCtx.fromIdx, idx);
      });

      listEl.appendChild(li);
    });
  }

  function renderHudSummary(pillItems, catalog) {
    const el = $('hudSummaryText');
    if (!el) return;
    const metaMap = new Map((catalog || []).map((c) => [c.id, c.label]));
    const active = (pillItems || [])
      .filter((x) => x && x.enabled)
      .map((x) => metaMap.get(x.id) || x.id);
    el.textContent = active.length > 0 ? active.join(' · ') : '未启用';
  }

  function renderLayoutControls(config) {
    const mode = config.compactMode || 'off';
    const lh = Number(config.compactLineHeight || 1.4);
    const bg = Number(config.compactBlockGap ?? 8);
    const lg = Number(config.compactListGap ?? 2);

    const summaryEl = $('layoutSummaryText');
    if (summaryEl) {
      summaryEl.textContent =
        mode === 'custom'
          ? `自定义 · ${lh.toFixed(2)} / ${bg}px`
          : COMPACT_PRESETS[mode]?.label || '原版';
    }

    document.querySelectorAll('[data-compact-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.compactMode === mode);
    });

    if (document.activeElement !== $('rangeLineHeight')) {
      $('rangeLineHeight').value = String(lh);
    }
    if (document.activeElement !== $('rangeBlockGap')) {
      $('rangeBlockGap').value = String(bg);
    }
    if (document.activeElement !== $('rangeListGap')) {
      $('rangeListGap').value = String(lg);
    }
    $('valLineHeight').textContent = lh.toFixed(2);
    $('valBlockGap').textContent = `${bg}px`;
    $('valListGap').textContent = `${lg}px`;
    $('chkShowTurnSummary').checked = config.showTurnSummary !== false;
  }

  function renderWeeklyEstimate(we, computedAtMs) {
    const box = $('weeklyEstimateBody');
    const updatedEl = $('weeklyUpdatedAt');
    if (updatedEl) {
      updatedEl.textContent = fmtTimeShort(computedAtMs);
    }

    const groups = Array.isArray(we?.groups) ? we.groups : [];
    if (!we || groups.length === 0) {
      box.innerHTML = '<div class="meta">暂无数据</div>';
      return;
    }

    const rows = groups
      .map((g) => {
        const estPart = g.estimatedTotalTokens != null
          ? `≈ ${fmtTok(g.estimatedTotalTokens)} · ${fmtUsd(g.estimatedTotalCostUsd)}`
          : g.weeklyUsedPct != null
            ? `${g.weeklyUsedPct}%`
            : '--';
        return (
          `<div class="wk-row">` +
            `<span class="wk-row-label">${g.label}</span>` +
            `<span class="wk-row-actual">${fmtTok(g.actualTokens7d)} · ${fmtUsd(g.actualCostUsd7d)}</span>` +
            `<span class="wk-row-est">${estPart}</span>` +
          `</div>`
        );
      })
      .join('');

    box.innerHTML = `
      <div class="wk-table">
        <div class="wk-head">
          <span>额度类别</span>
          <span>已消耗</span>
          <span>周额度估算</span>
        </div>
        ${rows}
      </div>
    `;
  }

  function buildCdpAlertMessage(platform, port) {
    if (platform === 'darwin') {
      return '当前未处于 CDP 注入状态。请点击下方生成启动器，按 Cmd+Q 彻底退出 Antigravity 后，打开 /Applications/Antigravity (HUD).app（或桌面快捷方式）重新启动。';
    }
    if (platform === 'win32') {
      return '当前未处于 CDP 注入状态。请点击下方生成启动器，彻底退出 Antigravity（含右下角托盘图标）后，双击桌面 Antigravity (HUD).lnk 重新启动。';
    }
    return `当前未处于 CDP 注入状态。请彻底退出 Antigravity 后，使用带 --remote-debugging-port=${port || 9229} 参数的命令重新启动。`;
  }

  function buildLauncherSuccessMessage(platform) {
    if (platform === 'darwin') {
      return '已生成 macOS 启动器与桌面快捷方式。请按 Cmd+Q 彻底退出 Antigravity，再通过下方应用重新启动：';
    }
    if (platform === 'win32') {
      return '已生成 Windows 启动器。请彻底退出 Antigravity（含托盘图标），再双击下方快捷方式重新启动：';
    }
    return '已生成启动命令。请彻底退出 Antigravity 后使用下方命令重新启动：';
  }

  function render() {
    if (!state) return;
    const {
      config,
      cdpStatus,
      platform,
      launcherInfo,
      catalogs,
      snapshot,
      weeklyComputedAtMs,
      currentVersion,
      updateStatus,
    } = state;

    const dot = $('statusDot');
    const badge = $('cdpStateText');
    const repairArea = $('cdpRepairArea');
    const alertEl = $('cdpAlertText');
    const isConnected = Boolean(cdpStatus?.connected);

    dot.classList.toggle('is-ok', isConnected);
    dot.classList.toggle('is-err', !isConnected);
    badge.classList.toggle('is-ok', isConnected);
    badge.classList.toggle('is-err', !isConnected);

    if (isConnected) {
      badge.textContent = '正常';
      repairArea.hidden = true;
    } else {
      badge.textContent = '异常';
      repairArea.hidden = false;
      alertEl.textContent = buildCdpAlertMessage(platform, config?.cdpPort);
    }

    $('btnGenerateLauncherLabel').textContent =
      platform === 'win32'
        ? '生成 Windows 启动器 (.lnk)'
        : platform === 'darwin'
          ? '生成 macOS 启动器 (.app)'
          : '显示启动命令';

    if (launcherInfo && !isConnected) {
      const box = $('launcherResultBox');
      box.hidden = false;
      $('launcherResultMsg').textContent = buildLauncherSuccessMessage(platform);
      $('launcherResult').textContent =
        launcherInfo.lnkPath || launcherInfo.bundlePath || launcherInfo.manualCommand || '';
    } else {
      $('launcherResultBox').hidden = true;
    }

    $('versionBadge').textContent = `v${currentVersion || '1.0.0'}`;
    $('chkAutoCheckUpdate').checked = Boolean(config.autoCheckUpdate);
    $('chkAutoApplyUpdate').checked = Boolean(config.autoApplyUpdate);

    const btnApply = $('btnApplyUpdate');
    const uText = $('updateStatusText');
    if (updateStatus?.applying) {
      btnApply.hidden = false;
      btnApply.disabled = true;
      uText.textContent = '更新中…';
    } else if (updateStatus?.appliedVersion) {
      btnApply.hidden = true;
      uText.textContent = `已更新 v${updateStatus.appliedVersion}`;
    } else if (updateStatus?.hasUpdate) {
      btnApply.hidden = false;
      btnApply.disabled = false;
      uText.textContent = `有新版 v${updateStatus.latestVersion}`;
    } else if (updateStatus?.error) {
      btnApply.hidden = true;
      uText.textContent = updateStatus.error;
    } else if (updateStatus?.ok) {
      btnApply.hidden = true;
      uText.textContent = '已是最新';
    } else {
      btnApply.hidden = true;
      uText.textContent = '';
    }

    $('selectCtxFormat').value = config.contextDisplayFormat;
    $('selectWindowCap').value = String(config.windowCapMode);

    renderWeeklyEstimate(snapshot?.weeklyEstimate || null, weeklyComputedAtMs);
    renderHudSummary(config.pillItems, catalogs?.pillItems);
    renderSortableList($('pillItemsList'), 'pillItems', config.pillItems, catalogs?.pillItems);
    renderLayoutControls(config);
  }

  async function refresh() {
    state = await api('GET', '/api/state');
    render();
  }

  $('selectCtxFormat').addEventListener('change', (e) => savePatch({ contextDisplayFormat: e.target.value }));
  $('selectWindowCap').addEventListener('change', (e) => {
    const val = e.target.value === 'auto' ? 'auto' : Number(e.target.value);
    savePatch({ windowCapMode: val });
  });
  $('btnReset').addEventListener('click', async () => {
    state = await api('POST', '/api/config/reset', {});
    render();
  });

  document.querySelectorAll('[data-compact-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.compactMode;
      const preset = COMPACT_PRESETS[mode];
      if (!preset) return;
      savePatch({
        compactMode: mode,
        compactLineHeight: preset.lineHeight,
        compactBlockGap: preset.blockGap,
        compactListGap: preset.listGap,
      });
    });
  });

  function bindSlider(id, valId, key, formatFn) {
    const el = $(id);
    el.addEventListener('input', () => {
      $(valId).textContent = formatFn(el.value);
    });
    el.addEventListener('change', () => {
      savePatch({
        compactMode: 'custom',
        [key]: Number(el.value),
      });
    });
  }
  bindSlider('rangeLineHeight', 'valLineHeight', 'compactLineHeight', (v) => Number(v).toFixed(2));
  bindSlider('rangeBlockGap', 'valBlockGap', 'compactBlockGap', (v) => `${Math.round(Number(v))}px`);
  bindSlider('rangeListGap', 'valListGap', 'compactListGap', (v) => `${Math.round(Number(v))}px`);

  $('chkShowTurnSummary').addEventListener('change', (e) => {
    savePatch({ showTurnSummary: e.target.checked });
  });

  $('btnGenerateLauncher').addEventListener('click', async () => {
    const res = await api('POST', '/api/launcher/generate', {});
    if (res?.state) {
      state = res.state;
      render();
    }
  });
  $('chkAutoCheckUpdate').addEventListener('change', (e) => {
    savePatch({ autoCheckUpdate: e.target.checked });
  });
  $('chkAutoApplyUpdate').addEventListener('change', (e) => {
    savePatch({ autoApplyUpdate: e.target.checked });
  });
  $('btnCheckUpdate').addEventListener('click', async () => {
    $('updateStatusText').textContent = '检查中…';
    state = await api('POST', '/api/update/check', {});
    render();
  });
  $('btnApplyUpdate').addEventListener('click', async () => {
    $('btnApplyUpdate').disabled = true;
    $('updateStatusText').textContent = '更新中…';
    const res = await api('POST', '/api/update/apply', {});
    if (res?.state) state = res.state;
    render();
  });

  refresh();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
})();
