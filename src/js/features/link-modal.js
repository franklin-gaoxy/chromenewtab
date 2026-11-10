/* 站点编辑弹窗 */

/* ---------------- 链接编辑 ---------------- */
function updateIconPreview() {
  const abs = normalizeUrl($('fUrl').value);
  const custom = $('fIcon').value.trim();
  const title = $('fTitle').value.trim();
  const box = $('iconPreview');
  const img = $('iconPreviewImg');
  const txt = $('iconPreviewText');
  const src = custom || (abs ? faviconUrl(abs, 64) : '');

  box.style.background = '';
  img.hidden = true;
  txt.hidden = false;
  txt.textContent = firstChar(title || hostOf(abs) || '?');

  if (!src) return;

  const fail = () => {
    img.hidden = true;
    txt.hidden = false;
    txt.textContent = firstChar(title || hostOf(abs) || '?');
  };

  img.onload = () => {
    img.hidden = false;
    txt.hidden = true;
  };
  img.onerror = fail;
  img.src = src;
}

function openLinkModal(opts) {
  const options = opts || {};
  const item = options.item || null;
  const groupId = item ? options.groupId : options.groupId || currentGroup().id;

  const sel = $('fGroup');
  sel.innerHTML = state.groups
    .map((g) => '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>')
    .join('');
  if (state.groups.some((g) => g.id === groupId)) sel.value = groupId;

  editing = { groupId, itemId: item ? item.id : null };
  $('linkModalTitle').textContent = item ? '编辑网站' : '添加网站';
  $('fTitle').value = item ? item.title : '';
  $('fUrl').value = item ? item.url : '';
  $('fIcon').value = item ? item.icon : '';
  $('fDelete').hidden = !item;
  updateIconPreview();

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
  let icon = $('fIcon').value.trim();
  if (icon && icon === faviconUrl(abs, 64)) icon = '';

  if (editing && editing.itemId) {
    const from = groupById(editing.groupId) || targetGroup;
    const idx = from.items.findIndex((it) => it.id === editing.itemId);
    if (idx >= 0) {
      const item = from.items[idx];
      item.title = title;
      item.url = abs;
      item.icon = icon;
      if (from.id !== targetGroup.id) {
        from.items.splice(idx, 1);
        targetGroup.items.push(item);
      }
    }
  } else {
    targetGroup.items.push({ id: uid('i'), title, url: abs, icon });
  }

  closeModal('linkMask');
  save();
  ui.page = Math.floor(Math.max(0, targetGroup.items.length - 1) / perPage());
  renderAll();
  toast(editing && editing.itemId ? '已更新' : '已添加到「' + targetGroup.name + '」');
  editing = null;
}

/* ---------------- 事件绑定 ---------------- */
function bindLinkEvents() {
  $('fUrl').addEventListener('input', updateIconPreview);
  $('fTitle').addEventListener('input', updateIconPreview);
  $('fIcon').addEventListener('input', updateIconPreview);

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
    updateIconPreview();
    toast('已改为自动获取站点图标');
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

