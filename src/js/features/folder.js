/* ============================================================
 * 文件夹（仅一层）
 *
 * 数据：{ id, kind: 'folder', title, items: [{ id, title, url, icon }] }
 * 交互：
 *   - 磁贴拖到另一个磁贴中间 → 合并成文件夹；拖到文件夹上 → 放进去
 *   - 点击文件夹 → 打开毛玻璃面板
 *   - 右键文件夹 / 面板内的站点 → 菜单
 * ============================================================ */

let openFolderRef = null; // { groupId, folderId, rect }

/* ---------------- 合并 ---------------- */
function canMergeItems(from, to) {
  if (!from || !to || from.id === to.id) return false;
  // 组件不参与合并（组件之间、组件与站点都不合并）
  if (from.kind === 'widget' || to.kind === 'widget') return false;
  return true;
}

/* 文件夹取内部站点，普通站点取自身 */
function folderSitesOf(item) {
  if (!item) return [];
  return item.kind === 'folder' ? item.items.slice() : [item];
}

/* 把 from 合并进 to：目标已是文件夹则放入，否则两者合成新文件夹 */
function mergeItems(fromGroupId, fromId, toGroupId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const fromGroup = groupById(fromGroupId);
  const toGroup = groupById(toGroupId);
  if (!fromGroup || !toGroup) return;

  const from = fromGroup.items.find((it) => it.id === fromId);
  const to = toGroup.items.find((it) => it.id === toId);
  if (!canMergeItems(from, to)) return;

  const incoming = folderSitesOf(from);
  if (!incoming.length) {
    toast('这个文件夹还是空的');
    return;
  }

  // 先把源从原分组摘掉，再重新定位目标（同组时下标会变化）
  const fromIndex = fromGroup.items.findIndex((it) => it.id === fromId);
  fromGroup.items.splice(fromIndex, 1);

  const at = toGroup.items.findIndex((it) => it.id === toId);
  if (at < 0) {
    fromGroup.items.push(from); // 目标已不存在，回滚
    return;
  }

  if (to.kind === 'folder') {
    to.items.push(...incoming);
    toast('已放入「' + to.title + '」');
  } else {
    const folder = {
      id: uid('f'),
      kind: 'folder',
      title: from.kind === 'folder' ? from.title : '文件夹',
      items: [to].concat(incoming)
    };
    toGroup.items.splice(at, 1, folder);
    toast('已合并为文件夹');
  }

  save();
  renderAll();
}

/* ---------------- 文件夹磁贴 ---------------- */
function createFolderTile(item, groupId, searching, index) {
  const tile = document.createElement('div');
  tile.className = 'tile tile-folder';
  tile.dataset.id = item.id;
  tile.dataset.group = groupId;
  tile.title = item.title;
  tile.style.animationDelay = Math.min(index * 16, 220) + 'ms';

  const iconBox = document.createElement('div');
  iconBox.className = 'tile-icon folder-icon';
  fillFolderPreview(iconBox, item);

  const name = document.createElement('div');
  name.className = 'tile-name';
  name.textContent = item.title;

  tile.append(iconBox, name);

  if (!searching) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tile-more';
    more.title = '更多操作';
    more.innerHTML = ICONS.more;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      openFolderMenu(e, groupId, item);
    });
    tile.appendChild(more);
  }

  tile.addEventListener('click', (e) => {
    if (e.target.closest('.tile-more')) return;
    openFolder(groupId, item, tile);
  });

  attachTileDrag(tile, item, groupId, searching);
  return tile;
}

/* 文件夹磁贴的 2×2 预览 */
function fillFolderPreview(box, item) {
  box.innerHTML = '';
  box.classList.toggle('folder-empty', !item.items.length);
  if (!item.items.length) {
    box.innerHTML = ICONS.folder;
    return;
  }

  item.items.slice(0, 4).forEach((site, i) => {
    const cell = document.createElement('span');
    cell.className = 'folder-cell';
    if (i === 3 && item.items.length > 4) {
      cell.classList.add('folder-count');
      cell.textContent = '+' + (item.items.length - 3);
    } else {
      paintIcon(cell, site);
    }
    box.appendChild(cell);
  });
}

/* ---------------- 文件夹面板（毛玻璃） ---------------- */
function openFolder(groupId, folder, tileEl) {
  const mask = $('folderMask');
  if (!mask) return;
  openFolderRef = {
    groupId,
    folderId: folder.id,
    rect: tileEl ? tileEl.getBoundingClientRect() : null
  };
  mask.hidden = false;
  renderFolderPanel();
}

function closeFolder() {
  const mask = $('folderMask');
  if (mask) mask.hidden = true;
  openFolderRef = null;
}

/* 当前打开面板对应的文件夹（数据可能已被删除） */
function currentFolder() {
  if (!openFolderRef) return null;
  const group = groupById(openFolderRef.groupId);
  if (!group) return null;
  const folder = group.items.find((it) => it.id === openFolderRef.folderId);
  return folder && folder.kind === 'folder' ? folder : null;
}

/* 数据变化后（renderGrid 调用）重绘面板内容 */
function refreshOpenFolder() {
  const mask = $('folderMask');
  if (!mask || mask.hidden || !openFolderRef) return;
  if (!currentFolder()) {
    closeFolder();
    return;
  }
  renderFolderPanel();
}

function renderFolderPanel() {
  const panel = $('folderPanel');
  if (!panel || !openFolderRef) return;
  const folder = currentFolder();
  if (!folder) return;

  panel.innerHTML = '';
  panel.appendChild(buildFolderHead(folder));
  panel.appendChild(buildFolderGrid(folder));
  positionFolderPanel(panel, openFolderRef.rect);
}

function buildFolderHead(folder) {
  const head = document.createElement('header');
  head.className = 'folder-head';

  const title = document.createElement('span');
  title.className = 'folder-title';
  title.textContent = folder.title;

  const count = document.createElement('em');
  count.className = 'folder-count-badge';
  count.textContent = String(folder.items.length);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'folder-close';
  close.title = '关闭';
  close.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  close.addEventListener('click', closeFolder);

  head.append(title, count, close);
  return head;
}

function buildFolderGrid(folder) {
  const grid = document.createElement('div');
  grid.className = 'folder-grid';

  folder.items.forEach((site) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'f-item';
    cell.dataset.id = site.id;
    cell.title = site.title + '\n' + site.url;

    const icon = document.createElement('span');
    icon.className = 'f-item-icon';
    paintIcon(icon, site);

    const name = document.createElement('span');
    name.className = 'f-item-name';
    name.textContent = site.title;

    cell.append(icon, name);
    cell.addEventListener('click', () => {
      closeFolder();
      openUrl(site.url);
    });
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFolderItemMenu(e, folder, site);
    });
    grid.appendChild(cell);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'f-item f-add';
  add.innerHTML =
    '<span class="f-item-icon">' + ICONS.plus + '</span>' +
    '<span class="f-item-name">添加网站</span>';
  add.addEventListener('click', () => {
    openLinkModal({ groupId: openFolderRef.groupId, folderId: folder.id });
  });
  grid.appendChild(add);

  return grid;
}

/* 以文件夹磁贴为锚点摆放，空间不够就翻到上方 */
function positionFolderPanel(panel, rect) {
  const pad = 14;
  const width = Math.max(220, Math.min(340, Math.round(window.innerWidth / 2)));
  panel.style.width = width + 'px';

  if (!rect) {
    panel.style.left = Math.round((window.innerWidth - width) / 2) + 'px';
    panel.style.top = '18vh';
    return;
  }

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

  const height = panel.offsetHeight || 260;
  let top = rect.bottom + 12;
  if (top + height > window.innerHeight - pad) {
    const above = rect.top - height - 12;
    top = above >= pad ? above : Math.max(pad, window.innerHeight - height - pad);
  }

  panel.style.left = Math.round(left) + 'px';
  panel.style.top = Math.round(top) + 'px';
}

/* ---------------- 菜单与文件夹操作 ---------------- */
function openFolderMenu(event, groupId, folder) {
  showMenu(event, [
    { label: '打开', icon: ICONS.open, run: () => openFolderById(groupId, folder.id) },
    { label: '重命名', icon: ICONS.rename, run: () => renameFolder(groupId, folder.id) },
    { sep: true },
    { label: '解散文件夹', icon: ICONS.unfold, run: () => dissolveFolder(groupId, folder.id) },
    { label: '删除文件夹', icon: ICONS.trash, danger: true, run: () => removeFolder(groupId, folder.id) }
  ]);
}

function openFolderItemMenu(event, folder, site) {
  const group = groupOfFolder(folder.id);
  const groupId = group ? group.id : currentGroup().id;
  showMenu(event, [
    { label: '打开', icon: ICONS.open, run: () => openUrl(site.url) },
    { label: '复制链接', icon: ICONS.copy, run: () => copyText(site.url) },
    { sep: true },
    {
      label: '编辑',
      icon: ICONS.edit,
      run: () => openLinkModal({ groupId, item: site, folderId: folder.id })
    },
    { label: '移出文件夹', icon: ICONS.unfold, run: () => moveOutOfFolder(folder.id, site.id) },
    { label: '删除', icon: ICONS.trash, danger: true, run: () => removeItem(groupId, site.id) }
  ]);
}

function groupOfFolder(folderId) {
  return state.groups.find((g) => g.items.some((it) => it.id === folderId)) || null;
}

function findFolder(groupId, folderId) {
  const group = groupById(groupId);
  if (!group) return null;
  return group.items.find((it) => it.id === folderId && it.kind === 'folder') || null;
}

function openFolderById(groupId, folderId) {
  const folder = findFolder(groupId, folderId);
  if (!folder) return;
  const tile = document.querySelector('.tile-folder[data-id="' + folderId + '"]');
  openFolder(groupId, folder, tile);
}

function renameFolder(groupId, folderId) {
  const folder = findFolder(groupId, folderId);
  if (!folder) return;
  const val = window.prompt('文件夹名称', folder.title);
  if (val === null) return;
  const name = val.trim();
  if (!name) return;
  folder.title = name.slice(0, 20);
  save();
  renderAll();
}

/* 解散：把里面的站点按原顺序放回分组，文件夹本身消失 */
function dissolveFolder(groupId, folderId) {
  const group = groupById(groupId);
  if (!group) return;
  const at = group.items.findIndex((it) => it.id === folderId);
  if (at < 0) return;
  const folder = group.items[at];
  if (!folder.items.length) {
    removeFolder(groupId, folderId);
    return;
  }
  group.items.splice(at, 1, ...folder.items);
  closeFolder();
  save();
  renderAll();
  toast('已解散「' + folder.title + '」');
}

function removeFolder(groupId, folderId) {
  const group = groupById(groupId);
  if (!group) return;
  const at = group.items.findIndex((it) => it.id === folderId);
  if (at < 0) return;
  const folder = group.items[at];
  const ask = folder.items.length
    ? '删除文件夹「' + folder.title + '」及其中 ' + folder.items.length + ' 个站点？'
    : '删除文件夹「' + folder.title + '」？';
  if (!window.confirm(ask)) return;
  group.items.splice(at, 1);
  closeFolder();
  save();
  renderAll();
  toast('已删除文件夹');
}

function moveOutOfFolder(folderId, siteId) {
  const group = groupOfFolder(folderId);
  if (!group) return;
  const folder = group.items.find((it) => it.id === folderId);
  if (!folder) return;
  const idx = folder.items.findIndex((x) => x.id === siteId);
  if (idx < 0) return;
  const [site] = folder.items.splice(idx, 1);
  const at = group.items.findIndex((it) => it.id === folderId);
  group.items.splice(at + 1, 0, site);
  save();
  renderAll();
  toast('已移出文件夹');
}

/* ---------------- 事件绑定 ---------------- */
function bindFolderEvents() {
  const mask = $('folderMask');
  if (!mask) return;

  mask.addEventListener('mousedown', (e) => {
    if (e.target === mask) closeFolder();
  });

  // 面板内不弹浏览器右键菜单（站点自己的菜单在更内层已拦下）
  const panel = $('folderPanel');
  if (panel) {
    panel.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  window.addEventListener('resize', () => {
    const node = $('folderPanel');
    if (!node || !openFolderRef || mask.hidden) return;
    positionFolderPanel(node, openFolderRef.rect);
  });
}
