/* 设置抽屉内容与同步回显 */

/* ---------------- 设置面板 ---------------- */
function buildSettingsPanel() {
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
      toast('搜索引擎已切换为 ' + ENGINES[key].label);
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
    btn.title = theme.label;
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
  customChip.title = '自定义图片';
  customChip.textContent = '自定义';
  customChip.style.cssText =
    'display:grid;place-items:center;font-size:11px;color:rgba(255,255,255,.75);' +
    'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);width:auto;padding:0 10px;';
  customChip.addEventListener('click', () => {
    if (!state.settings.customBg) {
      toast('先粘贴图片链接或选择本地图片');
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

  const optPerRow = $('optPerRow');
  optPerRow.addEventListener('change', () => {
    const n = Math.min(8, Math.max(3, Math.round(Number(optPerRow.value)) || 5));
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
    { key: 'center', label: '居中' },
    { key: 'left', label: '靠左' },
    { key: 'right', label: '靠右' }
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.align = opt.key;
    btn.textContent = opt.label;
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
    { key: 'top', label: '靠上' },
    { key: 'center', label: '居中' },
    { key: 'bottom', label: '靠下' }
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.pos = opt.key;
    btn.textContent = opt.label;
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
}

function syncSettingsUI() {
  const s = state.settings;
  document.querySelectorAll('#engineChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.engine === s.engine);
  });
  document.querySelectorAll('#bgChips .bg-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.theme === s.theme);
  });
  $('optNewTab').checked = s.openInNewTab;
  $('optLabels').checked = s.showLabels;
  $('optPerRow').value = perRow();
  document.querySelectorAll('#alignChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.align === (s.align || 'center'));
  });
  document.querySelectorAll('#bmPosChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.pos === (s.bmHandlePos || 'center'));
  });
  $('bgUrl').value = s.customBg && s.customBg.indexOf('data:') !== 0 ? s.customBg : '';
  updateSyncUI();
}

/* ---------------- 事件绑定 ---------------- */
function bindSettingsEvents() {
  $('bgApplyUrl').addEventListener('click', () => {
    const url = $('bgUrl').value.trim();
    if (!url) {
      toast('请输入图片链接');
      return;
    }
    state.settings.customBg = url;
    state.settings.theme = 'custom';
    save();
    applySettings();
    syncSettingsUI();
    toast('背景已更新');
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
      toast('背景已更新');
    } catch (err) {
      toast('图片读取失败');
    }
  });
}

