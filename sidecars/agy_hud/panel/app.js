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

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

    const windowTipMap = {
      '5h': '5小时额度估算',
      weekly: '周额度估算',
    };

    const groupBlocks = groups
      .map((g) => {
        const rows =
          Array.isArray(g.rows) && g.rows.length > 0
            ? g.rows
            : [
                {
                  window: 'weekly',
                  actualTokens: g.actualTokens7d,
                  actualCostUsd: g.actualCostUsd7d,
                  usedPct: g.weeklyUsedPct,
                  estimatedTotalTokens: g.estimatedTotalTokens,
                  estimatedTotalCostUsd: g.estimatedTotalCostUsd,
                },
              ];

        const rowCells = rows
          .map((r, idx) => {
            const rowNum = idx + 1;
            const tip = escHtml(`${g.label} · ${windowTipMap[r.window] || '额度估算'}`);
            const actualText = escHtml(`${fmtTok(r.actualTokens)} · ${fmtUsd(r.actualCostUsd)}`);
            const estPart = escHtml(
              r.estimatedTotalTokens != null
                ? `≈ ${fmtTok(r.estimatedTotalTokens)} · ${fmtUsd(r.estimatedTotalCostUsd)}`
                : r.usedPct != null
                  ? `${r.usedPct}%`
                  : '--',
            );
            return (
              `<span class="wk-row-actual" style="grid-row:${rowNum}" title="${tip}">${actualText}</span>` +
              `<span class="wk-row-est" style="grid-row:${rowNum}" title="${tip}">${estPart}</span>`
            );
          })
          .join('');

        const isSingle = rows.length === 1;
        return (
          `<div class="wk-group${isSingle ? ' is-single' : ''}">` +
            `<span class="wk-group-label" style="grid-row:1 / span ${rows.length}">${escHtml(g.label)}</span>` +
            rowCells +
          `</div>`
        );
      })
      .join('');

    box.innerHTML = `
      <div class="wk-table">
        <div class="wk-head">
          <span>额度类别</span>
          <span>已消耗</span>
          <span>额度估算</span>
        </div>
        ${groupBlocks}
      </div>
    `;
  }

  function buildCdpRepairCopy(platform, port, launcherStatus, launcherInfo) {
    const exitHint =
      platform === 'darwin'
        ? '请按 Cmd+Q 彻底退出 Antigravity'
        : platform === 'win32'
          ? '请彻底退出 Antigravity（含右下角托盘图标）'
          : '请彻底退出 Antigravity';

    const status = launcherStatus?.status || '';
    const fullPath =
      launcherStatus?.launcherPath ||
      launcherInfo?.lnkPath ||
      launcherInfo?.bundlePath ||
      '';
    const manualCmd =
      launcherStatus?.manualCommand ||
      launcherInfo?.manualCommand ||
      `antigravity --remote-debugging-port=${port || 9229}`;

    if (status === 'disabled') {
      return {
        alert: '已在设置中暂停 CDP 注入，当前不显示输入栏 HUD。',
        pathLabel: '',
        pathValue: '',
        regenerated: false,
        showRetry: false,
      };
    }

    if (status === 'auto_regenerated' && fullPath) {
      return {
        alert: `当前未处于 CDP 注入状态，且检测到原 HUD 启动器已被删除。已自动为您重新生成启动器，${exitHint}，再使用下方完整路径的启动器重新启动。`,
        pathLabel: '已自动重新生成启动器（完整路径）',
        pathValue: fullPath,
        regenerated: true,
        showRetry: false,
      };
    }

    if (status === 'existing' && fullPath) {
      return {
        alert: `当前未处于 CDP 注入状态，检测到本地 HUD 启动器未删除（当前可能从官方启动器打开）。${exitHint}，再使用下方完整路径的启动器重新启动。`,
        pathLabel: 'HUD 启动器完整路径',
        pathValue: fullPath,
        regenerated: false,
        showRetry: false,
      };
    }

    if (status === 'manual_only') {
      return {
        alert: `当前未处于 CDP 注入状态。${exitHint}后，使用下方带调试端口参数的命令重新启动。`,
        pathLabel: '启动命令',
        pathValue: manualCmd,
        regenerated: false,
        showRetry: false,
      };
    }

    if (status === 'generate_failed') {
      const reason = launcherStatus?.error ? `（${launcherStatus.error}）` : '';
      return {
        alert: `当前未处于 CDP 注入状态，检测到 HUD 启动器缺失且自动生成失败${reason}。可点击下方重试，或使用命令行启动。`,
        pathLabel: manualCmd ? '备用启动命令' : '',
        pathValue: manualCmd,
        regenerated: false,
        showRetry: true,
      };
    }

    return {
      alert: `当前未处于 CDP 注入状态。${exitHint}后，使用 HUD 启动器重新启动。`,
      pathLabel: fullPath ? 'HUD 启动器完整路径' : '',
      pathValue: fullPath,
      regenerated: false,
      showRetry: !fullPath,
    };
  }

  function render() {
    if (!state) return;
    const {
      config,
      cdpStatus,
      platform,
      launcherInfo,
      launcherStatus,
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
    const pathBox = $('cdpPathBox');
    const pathLabel = $('cdpPathLabel');
    const pathValue = $('cdpPathValue');
    const retryFoot = $('cdpRetryFoot');
    const isConnected = Boolean(cdpStatus?.connected);

    dot.classList.toggle('is-ok', isConnected);
    dot.classList.toggle('is-err', !isConnected);
    badge.classList.toggle('is-ok', isConnected);
    badge.classList.toggle('is-err', !isConnected);

    if (isConnected) {
      badge.textContent = '正常';
      repairArea.hidden = true;
      pathBox.hidden = true;
      retryFoot.hidden = true;
    } else {
      badge.textContent = '异常';
      repairArea.hidden = false;
      const copy = buildCdpRepairCopy(platform, config?.cdpPort, launcherStatus, launcherInfo);
      alertEl.textContent = copy.alert;

      if (copy.pathValue) {
        pathBox.hidden = false;
        pathBox.classList.toggle('is-regenerated', Boolean(copy.regenerated));
        pathLabel.textContent = copy.pathLabel;
        pathValue.textContent = copy.pathValue;
      } else {
        pathBox.hidden = true;
      }

      retryFoot.hidden = !copy.showRetry;
      $('btnGenerateLauncherLabel').textContent =
        platform === 'win32'
          ? '重新生成 Windows 启动器 (.lnk)'
          : platform === 'darwin'
            ? '重新生成 macOS 启动器 (.app)'
            : '重新检测启动命令';
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
