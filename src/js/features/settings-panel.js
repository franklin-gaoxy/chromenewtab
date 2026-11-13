/* 设置抽屉内容与同步回显 */

/* ---------------- 设置面板 ---------------- */
function buildSettingsPanel() {
  // 语言：中文 / English（自名不随界面语言变化）
  const langChips = $('langChips');
  langChips.innerHTML = '';
  [
    { key: 'zh', label: 'settings.langZh' },
    { key: 'en', label: 'settings.langEn' }
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.lang = opt.key;
    btn.textContent = i18n(opt.label);
    btn.addEventListener('click', () => changeUiLanguage(opt.key));
    langChips.appendChild(btn);
  });

  const engineChips = $('engineChips');
  engineChips.innerHTML = '';
  Object.keys(ENGINES).forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.engine = key;
    btn.textContent = ENGINES[key].label;
    btn.addEventListener('click', () => {
      state.settings.engine = key;
      save();
      syncSettingsUI();
      renderSearchEngine();
      toast(i18n('search.engineSwitched', { name: ENGINES[key].label }));
    });
    engineChips.appendChild(btn);
  });

  const bgChips = $('bgChips');
  bgChips.innerHTML = '';
  THEMES.forEach((theme) => {
    const btn = document.createElement('button');
    btn.className = 'bg-chip';
    btn.type = 'button';
    btn.dataset.theme = theme.key;
    btn.dataset.i18nTitle = 'theme.' + theme.key;
    btn.title = i18nHas('theme.' + theme.key) ? i18n('theme.' + theme.key) : theme.label;
    btn.style.backgroundImage = theme.style;
    btn.addEventListener('click', () => {
      state.settings.theme = theme.key;
      save();
      applySettings();
      syncSettingsUI();
    });
    bgChips.appendChild(btn);
  });

  const customChip = document.createElement('button');
  customChip.className = 'bg-chip custom';
  customChip.type = 'button';
  customChip.dataset.theme = 'custom';
  customChip.dataset.i18nTitle = 'settings.bgCustom';
  customChip.dataset.i18n = 'settings.bgCustomShort';
  customChip.title = i18n('settings.bgCustom');
  customChip.textContent = i18n('settings.bgCustomShort');
  customChip.style.cssText =
    'display:grid;place-items:center;font-size:11px;color:rgba(255,255,255,.75);' +
    'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);width:auto;padding:0 10px;';
  customChip.addEventListener('click', () => {
    if (!state.settings.customBg) {
      toast(i18n('settings.bgEmpty'));
      $('bgUrl').focus();
      return;
    }
    state.settings.theme = 'custom';
    save();
    applySettings();
    syncSettingsUI();
  });
  bgChips.appendChild(customChip);

  const optNewTab = $('optNewTab');
  const optLabels = $('optLabels');
  optNewTab.addEventListener('change', () => {
    state.settings.openInNewTab = optNewTab.checked;
    save();
  });
  optLabels.addEventListener('change', () => {
    state.settings.showLabels = optLabels.checked;
    save();
    applySettings();
  });

  const optIconFrame = $('optIconFrame');
  optIconFrame.addEventListener('change', () => {
    state.settings.iconFrame = optIconFrame.checked;
    save();
    applySettings();
  });

  const optIconAuto = $('optIconAuto');
  optIconAuto.addEventListener('change', () => {
    state.settings.iconAutoFetch = optIconAuto.checked;
    save();
    // 打开时立刻为还没设置图标的站点补一轮（结果会写进数据）；关闭不清理已保存的地址
    if (optIconAuto.checked) renderAll();
  });

  // 图标大小 / 名称字号：拖动即时预览，松手落盘
  const optIconSize = $('optIconSize');
  const optLabelSize = $('optLabelSize');
  const syncSizeVals = () => {
    $('optIconSizeVal').textContent = iconSize() + 'px';
    $('optLabelSizeVal').textContent = labelSize() + 'px';
  };
  optIconSize.addEventListener('input', () => {
    state.settings.iconSize = Number(optIconSize.value);
    applySettings();
    syncSizeVals();
  });
  optIconSize.addEventListener('change', () => {
    save();
    syncSizeVals();
  });
  optLabelSize.addEventListener('input', () => {
    state.settings.labelSize = Number(optLabelSize.value);
    applySettings();
    syncSizeVals();
  });
  optLabelSize.addEventListener('change', () => {
    save();
    syncSizeVals();
  });

  const optPerRow = $('optPerRow');
  optPerRow.addEventListener('change', () => {
    const n = Math.min(8, Math.max(3, Math.round(Number(optPerRow.value)) || 8));
    optPerRow.value = n;
    state.settings.perRow = n;
    ui.page = 0;
    save();
    applySettings();
    renderAll();
  });

  const alignChips = $('alignChips');
  alignChips.innerHTML = '';
  [
    { key: 'center', label: 'settings.alignCenter' },
    { key: 'left', label: 'settings.alignLeft' },
    { key: 'right', label: 'settings.alignRight' }
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.align = opt.key;
    btn.dataset.i18n = opt.label;
    btn.textContent = i18n(opt.label);
    btn.addEventListener('click', () => {
      state.settings.align = opt.key;
      save();
      applySettings();
      syncSettingsUI();
    });
    alignChips.appendChild(btn);
  });

  const bmPosChips = $('bmPosChips');
  bmPosChips.innerHTML = '';
  [
    { key: 'top', label: 'settings.bmTop' },
    { key: 'center', label: 'settings.bmCenter' },
    { key: 'bottom', label: 'settings.bmBottom' }
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.pos = opt.key;
    btn.dataset.i18n = opt.label;
    btn.textContent = i18n(opt.label);
    btn.addEventListener('click', () => {
      state.settings.bmHandlePos = opt.key;
      save();
      applySettings();
      syncSettingsUI();
    });
    bmPosChips.appendChild(btn);
  });

  syncSettingsUI();
  renderSearchEngine();
  initCollapsibleSections();
}

/* ---------------- 设置区块折叠（默认全部折叠，记录被展开的） ---------------- */
function expandedSections() {
  return Array.isArray(state.settings.expandedSections) ? state.settings.expandedSections : [];
}

function syncCollapseUI() {
  const expanded = new Set(expandedSections());
  document.querySelectorAll('.drawer-body .setting-block').forEach((sec) => {
    const isExpanded = expanded.has(sec.dataset.section);
    sec.classList.toggle('collapsed', !isExpanded);
    const head = sec.querySelector('h3.collapse-head');
    if (head) head.setAttribute('aria-expanded', String(isExpanded));
  });
}

function initCollapsibleSections() {
  document.querySelectorAll('.drawer-body .setting-block').forEach((sec) => {
    const head = sec.querySelector('h3');
    if (!head || head.classList.contains('collapse-head')) return;

    head.classList.add('collapse-head');
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', 'true');

    const ico = document.createElement('i');
    ico.className = 'collapse-ico';
    ico.setAttribute('aria-hidden', 'true');
    head.appendChild(ico);

    const toggle = () => {
      const key = sec.dataset.section;
      const set = new Set(expandedSections());
      if (set.has(key)) set.delete(key);
      else set.add(key);
      state.settings.expandedSections = Array.from(set);
      save();
      syncCollapseUI();
    };

    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  syncCollapseUI();
}

function syncSettingsUI() {
  const s = state.settings;
  document.querySelectorAll('#langChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.lang === (s.lang || 'zh'));
  });
  document.querySelectorAll('#engineChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.engine === s.engine);
  });
  document.querySelectorAll('#bgChips .bg-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.theme === s.theme);
  });
  $('optNewTab').checked = s.openInNewTab;
  $('optLabels').checked = s.showLabels;
  $('optIconFrame').checked = s.iconFrame !== false;
  $('optIconAuto').checked = !!s.iconAutoFetch;
  $('optPerRow').value = perRow();
  $('optIconSize').value = String(iconSize());
  $('optLabelSize').value = String(labelSize());
  $('optIconSizeVal').textContent = iconSize() + 'px';
  $('optLabelSizeVal').textContent = labelSize() + 'px';
  document.querySelectorAll('#alignChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.align === (s.align || 'center'));
  });
  document.querySelectorAll('#bmPosChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.pos === (s.bmHandlePos || 'center'));
  });
  $('bgUrl').value = s.customBg && s.customBg.indexOf('data:') !== 0 ? s.customBg : '';
  updateSyncUI();
  syncAutoBackupUI();
}

/* 切换界面语言：落盘偏好 → 铺静态文案 → 重绘各模块的动态内容 */
function changeUiLanguage(lang) {
  state.settings.lang = applyLanguage(lang);
  save();
  syncSettingsUI();
  renderAll();

  if (typeof aiData !== 'undefined' && aiData) {
    aiRenderAll();
    if ($('aiSetBody')) aiRenderSettings();
  }

  const bmPanel = $('bmPanel');
  if (bmPanel && !bmPanel.hidden) {
    // 外壳上的标题 / 标签已由 data-i18n 更新，这里只重绘正文
    if ($('bmSync') && !$('bmSync').hidden) renderBookmarkSyncBody();
    else renderBookmarkTree();
  }
}

/* ---------------- 事件绑定 ---------------- */
function bindSettingsEvents() {
  $('bgApplyUrl').addEventListener('click', () => {
    const url = $('bgUrl').value.trim();
    if (!url) {
      toast(i18n('settings.bgUrlEmpty'));
      return;
    }
    state.settings.customBg = url;
    state.settings.theme = 'custom';
    save();
    applySettings();
    syncSettingsUI();
    toast(i18n('settings.bgUrlApplied'));
  });

  $('bgUploadBtn').addEventListener('click', () => $('bgUpload').click());
  $('bgUpload').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      state.settings.customBg = await fileToBackground(file);
      state.settings.theme = 'custom';
      save();
      applySettings();
      syncSettingsUI();
      toast(i18n('settings.bgUrlApplied'));
    } catch (err) {
      toast(i18n('settings.bgApplyFailed'));
    }
  });
}

