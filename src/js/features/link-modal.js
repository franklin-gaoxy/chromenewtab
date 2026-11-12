/* 站点编辑弹窗 */

/* ---------------- 链接编辑 ---------------- */
let iconPreviewToken = 0;

function updateIconPreview() {
  const abs = normalizeUrl($('fUrl').value);
  const custom = $('fIcon').value.trim() || letterIconValue || '';
  const title = $('fTitle').value.trim();
  const box = $('iconPreview');
  const img = $('iconPreviewImg');
  const txt = $('iconPreviewText');

  box.style.background = '';
  img.hidden = true;
  txt.hidden = false;
  txt.textContent = firstChar(title || hostOf(abs) || '?');

  if (!abs && !custom) return;

  // 与磁贴走同一套解析逻辑，预览里不会出现第三方源的「灰底字母」占位图
  const token = ++iconPreviewToken;
  resolveIcon({ url: abs, icon: custom }).then((src) => {
    if (!src || token !== iconPreviewToken) return;
    const fail = () => {
      img.hidden = true;
      txt.hidden = false;
      txt.textContent = firstChar(title || hostOf(abs) || '?');
    };
    img.onload = () => {
      if (token !== iconPreviewToken) return;
      img.hidden = false;
      txt.hidden = true;
    };
    img.onerror = fail;
    img.src = src;
  });
}

/* ---------------- 纯色文字图标 ---------------- */
const FICON_PLACEHOLDER = '或粘贴图标地址（留空自动获取）';
/* 文字图标可选底色（点色块或直接填色号） */
const LETTER_ICON_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#3b82f6', '#8b5cf6', '#64748b'];
let letterIconBg = '';    // 空 = 按文字哈希自动取色
let letterIconValue = ''; // 文字图标的 data URL 存在这里，输入框里只显示提示文字

function syncColorDots() {
  const dots = document.querySelectorAll('#letterIconColors .color-dot');
  Array.prototype.forEach.call(dots, (dot) => {
    dot.classList.toggle('active', dot.dataset.color === letterIconBg);
  });
}

/* 输入框内容 → 1~6 个字（去掉空白，超过 6 个按码点截断） */
function letterIconText() {
  return Array.from(String($('letterIconText').value || '').replace(/\s+/g, ''))
    .slice(0, 6)
    .join('');
}

function applyLetterIcon() {
  const text = letterIconText();
  if ($('letterIconText').value !== text) $('letterIconText').value = text;
  if (!text) {
    letterIconBg = '';
    letterIconValue = '';
    $('letterIconColor').value = '';
    $('fIcon').value = '';
    $('fIcon').placeholder = FICON_PLACEHOLDER;
    syncColorDots();
    updateIconPreview();
    syncCandidateActive();
    return;
  }
  letterIconValue = letterIconDataUrl(text, letterIconBg);
  // data URL 只存变量不写输入框，避免一长串地址出现在表单里
  $('fIcon').value = '';
  $('fIcon').placeholder = '正在使用文字图标，点「自动获取」可恢复';
  syncColorDots();
  updateIconPreview();
  syncCandidateActive();
}

/* 打开弹窗时：当前图标是文字图标就回显文字与配色，否则收起面板 */
function syncLetterIconPanel() {
  const raw = String($('fIcon').value || '').trim();
  const src = letterIconSource(raw);
  const panel = $('letterIconPanel');
  letterIconValue = src ? raw : '';
  $('fIcon').placeholder = FICON_PLACEHOLDER;
  if (src) {
    $('letterIconText').value = src.text;
    letterIconBg = /^#/.test(src.color || '') ? src.color : '';
    $('letterIconColor').value = letterIconBg;
    panel.hidden = false;
    $('fIcon').value = '';
    $('fIcon').placeholder = '正在使用文字图标，点「自动获取」可恢复';
  } else {
    $('letterIconText').value = '';
    $('letterIconColor').value = '';
    letterIconBg = '';
    panel.hidden = true;
  }
  syncColorDots();
}

/* ---------------- 在线图标候选 ---------------- */
let iconCandTimer = 0;
let iconCandUrl = '';

/* 候选来源统一由 store.js 的 iconCandidateList() 提供（高清优先、含根域回退） */

function syncCandidateActive() {
  const box = $('iconCandidates');
  if (!box) return;
  const abs = normalizeUrl($('fUrl').value);
  const auto = abs ? (iconCandidateList(abs)[0] || '') : '';
  const current = $('fIcon').value.trim() || auto;
  Array.from(box.children).forEach((btn) => {
    btn.classList.toggle('active', current === btn.dataset.src);
  });
}

function renderIconCandidates() {
  const box = $('iconCandidates');
  if (!box) return;

  const abs = normalizeUrl($('fUrl').value);
  if (!abs) {
    box.hidden = true;
    box.innerHTML = '';
    iconCandUrl = '';
    return;
  }

  if (abs === iconCandUrl && box.childElementCount) {
    syncCandidateActive();
    return;
  }

  iconCandUrl = abs;
  box.hidden = false;
  box.innerHTML = '';

  iconCandidateList(abs).slice(0, 6).forEach((src) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-candidate';
    btn.dataset.src = src;
    btn.title = '使用这个图标';

    const img = document.createElement('img');
    img.alt = '';
    img.onload = () => {
      // 过滤 1x1 之类的占位图
      if (img.naturalWidth && img.naturalWidth < 8) {
        btn.remove();
        return;
      }
      syncCandidateActive();
    };
    img.onerror = () => btn.remove();
    img.src = src;

    btn.addEventListener('click', () => {
      $('fIcon').value = src;
      updateIconPreview();
      syncCandidateActive();
    });

    btn.appendChild(img);
    box.appendChild(btn);
  });
}

function scheduleIconCandidates() {
  clearTimeout(iconCandTimer);
  iconCandTimer = setTimeout(renderIconCandidates, 420);
}

function openLinkModal(opts) {
  const options = opts || {};
  const item = options.item || null;
  const folderId = options.folderId || null;
  const groupId = item ? options.groupId : options.groupId || currentGroup().id;

  const sel = $('fGroup');
  sel.innerHTML = state.groups
    .map((g) => '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>')
    .join('');
  if (state.groups.some((g) => g.id === groupId)) sel.value = groupId;

  // 往文件夹里新增时，分组由文件夹决定，隐藏分组选择
  const groupField = $('fGroupField');
  if (groupField) groupField.hidden = !!folderId && !item;

  editing = { groupId, itemId: item ? item.id : null, folderId };
  $('linkModalTitle').textContent = item ? '编辑网站' : '添加网站';
  $('fTitle').value = item ? item.title : '';
  $('fUrl').value = item ? item.url : '';
  $('fIcon').value = item ? item.icon : '';
  $('fDelete').hidden = !item;
  iconCandUrl = '';
  syncLetterIconPanel();
  updateIconPreview();
  renderIconCandidates();

  openModal('linkMask');
  setTimeout(() => {
    const target = item ? $('fUrl') : $('fTitle');
    target.focus();
    target.select();
  }, 50);
}

function saveLink() {
  const abs = normalizeUrl($('fUrl').value);
  if (!abs) {
    toast('请填写正确的网址，例如 juejin.cn');
    $('fUrl').focus();
    return;
  }
  const targetGroup = groupById($('fGroup').value) || currentGroup();
  const title = ($('fTitle').value.trim() || suggestTitle(abs)).slice(0, 40);
  // 输入框里的地址优先；文字图标的值不在输入框里，单独取
  let icon = $('fIcon').value.trim() || letterIconValue || '';
  // 只有用户手动选过的图标才写进数据；内置 _favicon 地址换个环境就失效，存空走自动
  if (icon && isInternalFaviconUrl(icon)) icon = '';

  const folder =
    editing && editing.folderId ? findFolder(editing.groupId, editing.folderId) : null;
  let destination = targetGroup.name;

  if (editing && editing.itemId) {
    // 支持修改文件夹内的站点；换分组时从文件夹里取出
    const entry = findItemEntry(editing.groupId, editing.itemId);
    if (entry) {
      entry.item.title = title;
      entry.item.url = abs;
      entry.item.icon = icon;
      if (entry.group.id !== targetGroup.id) {
        entry.list.splice(entry.index, 1);
        targetGroup.items.push(entry.item);
      }
    }
  } else if (folder) {
    folder.items.push({ id: uid('i'), title, url: abs, icon });
    destination = folder.title;
  } else {
    targetGroup.items.push({ id: uid('i'), title, url: abs, icon });
    ui.page = Math.floor(Math.max(0, targetGroup.items.length - 1) / perPage());
  }

  closeModal('linkMask');
  save();
  renderAll();
  toast(editing && editing.itemId ? '已更新' : '已添加到「' + destination + '」');
  editing = null;
}

/* ---------------- 事件绑定 ---------------- */
function bindLinkEvents() {
  $('fUrl').addEventListener('input', () => {
    updateIconPreview();
    scheduleIconCandidates();
  });
  $('fTitle').addEventListener('input', updateIconPreview);
  $('fIcon').addEventListener('input', () => {
    letterIconValue = '';
    $('fIcon').placeholder = FICON_PLACEHOLDER;
    updateIconPreview();
    syncCandidateActive();
  });

  ['fTitle', 'fUrl', 'fIcon'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveLink();
      }
    });
  });

  $('iconAuto').addEventListener('click', () => {
    $('fIcon').value = '';
    $('fIcon').placeholder = FICON_PLACEHOLDER;
    letterIconBg = '';
    letterIconValue = '';
    $('letterIconText').value = '';
    $('letterIconColor').value = '';
    $('letterIconPanel').hidden = true;
    syncColorDots();
    updateIconPreview();
    syncCandidateActive();
    toast('已改为自动获取站点图标');
  });

  // 文字图标底色：预设色块 + 直接填色号
  const colorBox = $('letterIconColors');
  colorBox.innerHTML = '';
  LETTER_ICON_COLORS.forEach((color) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'color-dot';
    dot.dataset.color = color;
    dot.style.background = color;
    dot.title = color;
    dot.addEventListener('click', () => {
      letterIconBg = color;
      $('letterIconColor').value = color;
      applyLetterIcon();
    });
    colorBox.appendChild(dot);
  });

  $('letterIconColor').addEventListener('input', () => {
    const hex = normalizeHexColor($('letterIconColor').value);
    if (!hex || !letterIconText()) return;
    letterIconBg = hex;
    applyLetterIcon();
  });

  // 纯色文字图标：用户主动点开才启用，输入即预览
  $('letterIconBtn').addEventListener('click', () => {
    const panel = $('letterIconPanel');
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    if (!letterIconText()) {
      const seed = $('fTitle').value.trim() || hostOf(normalizeUrl($('fUrl').value)) || '?';
      $('letterIconText').value = Array.from(seed).slice(0, 2).join('');
      letterIconBg = '';
      $('letterIconColor').value = '';
      applyLetterIcon();
    }
    $('letterIconText').focus();
    $('letterIconText').select();
  });

  $('letterIconText').addEventListener('input', applyLetterIcon);

  $('letterIconShuffle').addEventListener('click', () => {
    if (!letterIconText()) return;
    letterIconBg = 'hsl(' + Math.round(Math.random() * 360) + ' 55% 46%)';
    $('letterIconColor').value = '';
    applyLetterIcon();
  });

  $('iconUploadBtn').addEventListener('click', () => $('iconUpload').click());
  $('iconUpload').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      $('fIcon').value = await fileToIcon(file);
      updateIconPreview();
      toast('图标已更新');
    } catch (err) {
      toast('图片读取失败');
    }
  });

  $('fSave').addEventListener('click', saveLink);
  $('fDelete').addEventListener('click', () => {
    if (!editing || !editing.itemId) return;
    removeItem(editing.groupId, editing.itemId);
    editing = null;
    closeModal('linkMask');
  });
}

