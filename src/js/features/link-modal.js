/* 站点编辑弹窗 */

/* ---------------- 链接编辑 ---------------- */
let iconPreviewToken = 0;
let iconPreviewTimer = 0;
let idleIconTimer = 0;

/* 只更新「首字占位」（纯本地计算）：输入过程中用，不触发任何图标请求。
   已经有自定义图标（文字图标 / 已选地址 / 上传）时直接不动，避免把预览刷掉。 */
function setPreviewLetter() {
  if ($('fIcon').value.trim() || letterIconValue) return;
  const abs = normalizeUrl($('fUrl').value);
  const title = $('fTitle').value.trim();
  $('iconPreview').style.background = '';
  $('iconPreviewImg').hidden = true;
  const txt = $('iconPreviewText');
  txt.hidden = false;
  txt.textContent = firstChar(title || hostOf(abs) || '?');
}

/* 输入停顿后再更新真实图标（避免每敲一个字母就查一次图标） */
function scheduleIconPreview() {
  clearTimeout(iconPreviewTimer);
  iconPreviewTimer = setTimeout(updateIconPreview, 700);
}

/* 停手 1.2s 后才去取网站图标与候选。
   已经有文字图标 / 地址 / 上传图时：预览保持不动，但下方候选照常拉取，方便改选。 */
function refreshIconForUrl() {
  const abs = normalizeUrl($('fUrl').value);
  if (!abs || !hostLooksReady(abs)) return;
  if (!($('fIcon').value.trim() || letterIconValue)) updateIconPreview();
  renderIconCandidates();
}

function scheduleIdleIconWork() {
  clearTimeout(idleIconTimer);
  idleIconTimer = setTimeout(refreshIconForUrl, 1200);
}

function updateIconPreview() {
  const abs = normalizeUrl($('fUrl').value);
  const custom = $('fIcon').value.trim() || letterIconValue || '';
  const title = $('fTitle').value.trim();
  const img = $('iconPreviewImg');
  const txt = $('iconPreviewText');

  // 没有自定义图标时才画首字；有自定义图标就保持当前预览，不先隐藏（否则会闪）
  if (!custom) {
    setPreviewLetter();
    if (!abs || !hostLooksReady(abs)) return;
  }

  // 预览只展示「将要保存的固定地址」，不做后台探测
  const src = custom || (abs ? faviconUrl(abs, 128) : '');
  if (!src) return;

  const token = ++iconPreviewToken;
  const done = () => {
    if (token !== iconPreviewToken) return;
    img.hidden = false;
    txt.hidden = true;
  };
  const fail = () => {
    if (token !== iconPreviewToken) return;
    img.hidden = true;
    txt.hidden = false;
    txt.textContent = firstChar(title || hostOf(abs) || '?');
  };

  // 同一地址不重设 src，直接复用已加载的图
  if (img.getAttribute('src') === src) {
    if (img.complete && img.naturalWidth) done();
    return;
  }
  img.onload = done;
  img.onerror = fail;
  img.src = src; // 不提前隐藏旧图，新图 ready 后直接替换
}

/* ---------------- 纯色文字图标 ---------------- */
/* 图标输入框的常规提示（语言切换后会重新取） */
function ficonPlaceholder() {
  return i18n('link.iconPh');
}
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
    $('fIcon').placeholder = ficonPlaceholder();
    syncColorDots();
    updateIconPreview();
    syncCandidateActive();
    return;
  }
  // 底色只取一次：首次生成时随机固定，之后改文字不再换色
  if (!letterIconBg) {
    letterIconBg = LETTER_ICON_COLORS[Math.floor(Math.random() * LETTER_ICON_COLORS.length)];
    $('letterIconColor').value = letterIconBg;
  }
  letterIconValue = letterIconDataUrl(text, letterIconBg);
  // data URL 只存变量不写输入框，避免一长串地址出现在表单里
  $('fIcon').value = '';
  $('fIcon').placeholder = i18n('link.iconInUse');
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
  $('fIcon').placeholder = ficonPlaceholder();
  if (src) {
    $('letterIconText').value = src.text;
    // 回显原色（hex 或 hsl 都保留），否则重新编辑会换色
    letterIconBg = src.color || '';
    $('letterIconColor').value = letterIconBg;
    panel.hidden = false;
    $('fIcon').value = '';
    $('fIcon').placeholder = i18n('link.iconInUse');
  } else {
    $('letterIconText').value = '';
    $('letterIconColor').value = '';
    letterIconBg = '';
    panel.hidden = true;
  }
  syncColorDots();
}

/* ---------------- 在线图标候选 ---------------- */
let iconCandUrl = '';

/* 候选来源统一由 store.js 的 iconCandidateList() 提供（高清优先、含根域回退） */

function syncCandidateActive() {
  const box = $('iconCandidates');
  if (!box) return;
  // 只用输入框里已固定的地址做高亮；留空时磁贴用的是浏览器本地图标，不对应任何候选
  const current = $('fIcon').value.trim();
  Array.from(box.children).forEach((btn) => {
    btn.classList.toggle('active', !!current && current === btn.dataset.src);
  });
}

/* 域名是否已输完整：避免 "ma" / "mail" 这种半截地址就去拉十几个图标 */
function hostLooksReady(url) {
  const host = hostOf(url);
  if (!host) return false;
  if (host === 'localhost') return true;
  return host.indexOf('.') > 0;
}

function renderIconCandidates() {
  const box = $('iconCandidates');
  if (!box) return;

  const abs = normalizeUrl($('fUrl').value);
  if (!abs || !hostLooksReady(abs)) {
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

  // 展开全部候选：加载失败的（404 / 占位图）由 onerror 自行移除，能选的尽量多
  iconCandidateList(abs).slice(0, 14).forEach((src) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-candidate';
    btn.dataset.src = src;
    btn.title = i18n('link.iconCandidates');

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
  $('linkModalTitle').textContent = item ? i18n('link.editTitle') : i18n('link.addTitle');
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
    toast(i18n('link.urlRequired'));
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
  toast(
    editing && editing.itemId
      ? i18n('common.updated')
      : i18n('common.added', { name: destination })
  );
  editing = null;
}

/* ---------------- 事件绑定 ---------------- */
function bindLinkEvents() {
  // 输入过程中只刷新首字占位：不查图标、不拉候选
  $('fUrl').addEventListener('input', () => {
    setPreviewLetter();
    scheduleIdleIconWork();
  });
  // 停手 1.2s 后才真正取图标与候选；离开输入框时立即补一次
  $('fUrl').addEventListener('blur', () => {
    clearTimeout(idleIconTimer);
    refreshIconForUrl();
  });
  $('fTitle').addEventListener('input', setPreviewLetter);
  $('fIcon').addEventListener('input', () => {
    letterIconValue = '';
    $('fIcon').placeholder = ficonPlaceholder();
    setPreviewLetter();
    scheduleIconPreview();
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
    $('fIcon').placeholder = ficonPlaceholder();
    letterIconBg = '';
    letterIconValue = '';
    $('letterIconText').value = '';
    $('letterIconColor').value = '';
    $('letterIconPanel').hidden = true;
    syncColorDots();

    // 「自动获取」= 主动探测一次，把最清晰的地址固定写进输入框后保存；
    // 磁贴渲染不再自己探测，所以图标定下来就不会变。
    const abs = normalizeUrl($('fUrl').value);
    if (!abs) {
      updateIconPreview();
      syncCandidateActive();
      return;
    }
    toast(i18n('link.iconFetching'));
    resolveIcon({ url: abs }).then((src) => {
      if (src && !isInternalFaviconUrl(src)) {
        $('fIcon').value = src;
      }
      updateIconPreview();
      syncCandidateActive();
      toast(i18n('link.iconAutoDone'));
    });
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
      toast(i18n('link.iconUpdated'));
    } catch (err) {
      toast(i18n('common.loadFailed'));
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

