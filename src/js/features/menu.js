/* 右键菜单与站点增删 */

/* ---------------- 菜单 ---------------- */
function hideMenu() {
  $('itemMenu').hidden = true;
}

function showMenu(event, items) {
  const menu = $('itemMenu');
  menu.innerHTML = '';

  items.forEach((it) => {
    if (it.sep) {
      const line = document.createElement('div');
      line.className = 'menu-sep';
      menu.appendChild(line);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item' + (it.danger ? ' danger' : '');
    btn.innerHTML = (it.icon || '') + '<span>' + esc(it.label) + '</span>';
    btn.addEventListener('click', () => {
      hideMenu();
      it.run();
    });
    menu.appendChild(btn);
  });

  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  let x = event.clientX;
  let y = event.clientY + 6;
  if (x + rect.width > window.innerWidth - 12) x = window.innerWidth - rect.width - 12;
  if (y + rect.height > window.innerHeight - 12) y = event.clientY - rect.height - 6;
  menu.style.left = Math.max(12, x) + 'px';
  menu.style.top = Math.max(12, y) + 'px';
  window.__menuAt = Date.now();
}

function findItem(groupId, itemId) {
  const entry = findItemEntry(groupId, itemId);
  return entry ? entry.item : null;
}

/* 空白处右键：全局操作入口 */
function openCanvasMenu(event) {
  showMenu(event, [
    { label: i18n('menu.addSite'), icon: ICONS.plus, run: () => openLinkModal({}) },
    { label: i18n('menu.addWidget'), icon: ICONS.widget, run: () => openWidgetPicker() },
    { label: i18n('rail.newGroup'), icon: ICONS.rename, run: createGroup },
    { sep: true },
    { label: i18n('menu.syncBookmarks'), icon: ICONS.bookmark, run: () => openBookmarkSync() },
    { label: i18n('menu.changeBg'), icon: ICONS.image, run: () => openSettingsPanel('bg') },
    { label: i18n('menu.remoteSync'), icon: ICONS.cloud, run: () => openSettingsPanel('sync') },
    { sep: true },
    { label: i18n('menu.settings'), icon: ICONS.gear, run: () => openSettingsPanel('lang') },
    { label: i18n('menu.refresh'), icon: ICONS.refresh, run: () => window.location.reload() }
  ]);
}

function openItemMenu(event, groupId, item) {
  showMenu(event, [
    { label: i18n('menu.open'), icon: ICONS.open, run: () => openUrl(item.url) },
    { label: i18n('menu.copyUrl'), icon: ICONS.copy, run: () => copyText(item.url) },
    { sep: true },
    { label: i18n('menu.edit'), icon: ICONS.edit, run: () => openLinkModal({ groupId, item }) },
    { label: i18n('menu.delete'), icon: ICONS.trash, danger: true, run: () => removeItem(groupId, item.id) }
  ]);
}

function openGroupMenu(event, g) {
  const node = event.target.closest('.rail-item');
  showMenu(event, [
    { label: i18n('menu.renameGroup'), icon: ICONS.rename, run: () => startRename(g, node) },
    { label: i18n('menu.clearGroup'), icon: ICONS.broom, run: () => {
      if (!g.items.length) return toast(i18n('menu.clearGroupEmpty'));
      g.items = [];
      save();
      renderAll();
      toast(i18n('menu.cleared', { name: g.name }));
    } },
    { sep: true },
    { label: i18n('menu.deleteGroup'), icon: ICONS.trash, danger: true, run: () => removeGroup(g.id) }
  ]);
}

function removeGroup(id) {
  if (state.groups.length <= 1) {
    toast(i18n('menu.keepOneGroup'));
    return;
  }
  const g = groupById(id);
  if (!g) return;
  state.groups = state.groups.filter((it) => it.id !== id);
  if (state.activeGroupId === id) state.activeGroupId = state.groups[0].id;
  ui.page = 0;
  save();
  renderAll();
  toast(i18n('menu.groupDeleted', { name: g.name }));
}

function removeItem(groupId, itemId) {
  const entry = findItemEntry(groupId, itemId);
  if (!entry) return;
  entry.list.splice(entry.index, 1);
  save();
  renderAll();
  toast(i18n('menu.deleted'));
}

/* ---------------- 事件绑定 ---------------- */
function bindMenuEvents() {
  // 右键：用插件自己的菜单替换浏览器默认菜单
  document.addEventListener('contextmenu', (e) => {
    const node = e.target;
    if (node.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (node.closest('.ai-shell, #aiMask, #widgetMask')) return; // 组件内部保留原生菜单
    e.preventDefault();
    if (node.closest('#folderMask')) return; // 文件夹面板内部自己处理右键

    const tile = node.closest('.tile');
    if (tile && !tile.classList.contains('add')) {
      const item = findItem(tile.dataset.group, tile.dataset.id);
      if (item) {
        if (item.kind === 'widget') openWidgetMenu(e, tile.dataset.group, item);
        else if (item.kind === 'folder') openFolderMenu(e, tile.dataset.group, item);
        else openItemMenu(e, tile.dataset.group, item);
        return;
      }
    }

    const groupNode = node.closest('.rail-item');
    if (groupNode && groupNode.dataset.id) {
      const g = groupById(groupNode.dataset.id);
      if (g) {
        openGroupMenu(e, g);
        return;
      }
    }

    openCanvasMenu(e);
  });

  document.addEventListener('click', (e) => {
    if ($('itemMenu').hidden) return;
    if (Date.now() - (window.__menuAt || 0) < 160) return;
    if ($('itemMenu').contains(e.target)) return;
    hideMenu();
  });
}
