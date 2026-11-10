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
  const g = groupById(groupId);
  if (!g) return null;
  return g.items.find((it) => it.id === itemId) || null;
}

/* 空白处右键：全局操作入口 */
function openCanvasMenu(event) {
  showMenu(event, [
    { label: '添加网站', icon: ICONS.plus, run: () => openLinkModal({}) },
    { label: '添加组件', icon: ICONS.widget, run: () => openWidgetPicker() },
    { label: '新建分组', icon: ICONS.rename, run: createGroup },
    { sep: true },
    { label: '同步书签', icon: ICONS.bookmark, run: () => openBookmarkSync() },
    { label: '更换背景', icon: ICONS.image, run: () => openSettingsPanel('bg') },
    { label: '远程同步', icon: ICONS.cloud, run: () => openSettingsPanel('sync') },
    { sep: true },
    { label: '设置', icon: ICONS.gear, run: () => openSettingsPanel('engine') },
    { label: '刷新页面', icon: ICONS.refresh, run: () => window.location.reload() }
  ]);
}

function openItemMenu(event, groupId, item) {
  showMenu(event, [
    { label: '打开', icon: ICONS.open, run: () => openUrl(item.url) },
    { label: '复制链接', icon: ICONS.copy, run: () => copyText(item.url) },
    { sep: true },
    { label: '编辑', icon: ICONS.edit, run: () => openLinkModal({ groupId, item }) },
    { label: '删除', icon: ICONS.trash, danger: true, run: () => removeItem(groupId, item.id) }
  ]);
}

function openGroupMenu(event, g) {
  const node = event.target.closest('.rail-item');
  showMenu(event, [
    { label: '重命名', icon: ICONS.rename, run: () => startRename(g, node) },
    { label: '清空分组', icon: ICONS.broom, run: () => {
      if (!g.items.length) return toast('分组已经是空的');
      g.items = [];
      save();
      renderAll();
      toast('已清空「' + g.name + '」');
    } },
    { sep: true },
    { label: '删除分组', icon: ICONS.trash, danger: true, run: () => removeGroup(g.id) }
  ]);
}

function removeGroup(id) {
  if (state.groups.length <= 1) {
    toast('至少保留一个分组');
    return;
  }
  const g = groupById(id);
  if (!g) return;
  state.groups = state.groups.filter((it) => it.id !== id);
  if (state.activeGroupId === id) state.activeGroupId = state.groups[0].id;
  ui.page = 0;
  save();
  renderAll();
  toast('已删除「' + g.name + '」');
}

function removeItem(groupId, itemId) {
  const g = groupById(groupId);
  if (!g) return;
  const idx = g.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return;
  g.items.splice(idx, 1);
  save();
  renderAll();
  toast('已删除');
}

/* ---------------- 事件绑定 ---------------- */
function bindMenuEvents() {
  // 右键：用插件自己的菜单替换浏览器默认菜单
  document.addEventListener('contextmenu', (e) => {
    const node = e.target;
    if (node.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (node.closest('.ai-shell, #aiMask, #widgetMask')) return; // 组件内部保留原生菜单
    e.preventDefault();

    const tile = node.closest('.tile');
    if (tile && !tile.classList.contains('add')) {
      const item = findItem(tile.dataset.group, tile.dataset.id);
      if (item) {
        if (item.kind === 'widget') openWidgetMenu(e, tile.dataset.group, item);
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
