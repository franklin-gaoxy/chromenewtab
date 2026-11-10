/* 站点网格、磁贴渲染与拖拽排序 */

/* ---------------- 网格 ---------------- */
function visibleList() {
  const q = ui.query.trim().toLowerCase();
  if (!q) {
    const g = currentGroup();
    return { list: g.items.map((item) => ({ item, groupId: g.id })), searching: false };
  }
  const hit = (text) => text.toLowerCase().indexOf(q) >= 0;
  const list = [];
  state.groups.forEach((g) => {
    g.items.forEach((item) => {
      if (hit(item.title + ' ' + (item.url || ''))) list.push({ item, groupId: g.id });
      // 文件夹内的站点同样参与搜索
      if (item.kind === 'folder') {
        item.items.forEach((child) => {
          if (hit(child.title + ' ' + (child.url || ''))) list.push({ item: child, groupId: g.id });
        });
      }
    });
  });
  return { list, searching: true };
}

function pageCount(len, searching) {
  const size = perPage();
  let pages = Math.max(1, Math.ceil(len / size));
  if (!searching && len > 0 && len % size === 0) pages += 1;
  return pages;
}

function paintIcon(container, item) {
  const label = item.title || hostOf(item.url) || '';
  const hue = hashHue(label || item.url);
  const src = item.icon || faviconUrl(item.url, 64);

  container.innerHTML = '';
  container.classList.remove('cover');
  container.style.background =
    'linear-gradient(150deg, hsl(' + hue + ' 46% 56%), hsl(' + ((hue + 34) % 360) + ' 52% 34%))';

  const letter = document.createElement('span');
  letter.className = 'letter';
  letter.textContent = firstChar(label);
  container.appendChild(letter);

  if (!src) return;

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.addEventListener(
    'load',
    () => {
      if (!img.naturalWidth) return;
      container.innerHTML = '';
      container.style.background = '';
      container.appendChild(img);
    },
    { once: true }
  );
  img.src = src;
}

/* 磁贴拖拽排序 / 合并（网站磁贴、文件夹磁贴与组件磁贴共用） */
function attachTileDrag(tile, item, groupId, searching) {
  if (searching) return;
  tile.draggable = true;

  tile.addEventListener('dragstart', (e) => {
    dragState = { groupId, itemId: item.id, item };
    tile.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', item.id); } catch (err) { /* ignore */ }
  });
  tile.addEventListener('dragend', () => {
    dragState = null;
    tile.classList.remove('dragging');
    document.querySelectorAll('.drop-before, .drop-after, .drop-merge').forEach((n) => {
      n.classList.remove('drop-before', 'drop-after', 'drop-merge');
    });
  });
  tile.addEventListener('dragover', (e) => {
    if (!dragState) return;
    e.preventDefault();
    const zone = dropZone(tile, e, item);
    tile.classList.toggle('drop-merge', zone === 'merge');
    tile.classList.toggle('drop-after', zone === 'after');
    tile.classList.toggle('drop-before', zone === 'before');
  });
  tile.addEventListener('dragleave', () => {
    tile.classList.remove('drop-before', 'drop-after', 'drop-merge');
  });
  tile.addEventListener('drop', (e) => {
    if (!dragState) return;
    e.preventDefault();
    const zone = dropZone(tile, e, item);
    tile.classList.remove('drop-before', 'drop-after', 'drop-merge');
    if (zone === 'merge') {
      mergeItems(dragState.groupId, dragState.itemId, groupId, item.id);
      return;
    }
    moveItem(dragState.groupId, dragState.itemId, groupId, item.id, zone === 'after');
  });
}

/* 拖拽落点：左右边缘是插入，中间交给文件夹合并逻辑 */
function dropZone(tile, e, target) {
  const rect = tile.getBoundingClientRect();
  const ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
  const mergeable =
    dragState &&
    dragState.item &&
    typeof canMergeItems === 'function' &&
    canMergeItems(dragState.item, target);

  if (mergeable) {
    if (ratio < 0.3) return 'before';
    if (ratio > 0.7) return 'after';
    return 'merge';
  }
  return ratio > 0.5 ? 'after' : 'before';
}

function createTile(item, groupId, searching, index) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.style.animationDelay = Math.min(index * 16, 220) + 'ms';
  tile.dataset.id = item.id;
  tile.dataset.group = groupId;
  tile.title = item.url;

  const iconBox = document.createElement('div');
  iconBox.className = 'tile-icon';
  paintIcon(iconBox, item);

  const name = document.createElement('div');
  name.className = 'tile-name';
  name.textContent = item.title;

  const more = document.createElement('button');
  more.className = 'tile-more';
  more.title = '更多操作';
  more.innerHTML = ICONS.more;

  tile.append(iconBox, name, more);

  tile.addEventListener('click', (e) => {
    if (e.target.closest('.tile-more')) {
      e.stopPropagation();
      openItemMenu(e, groupId, item);
      return;
    }
    openUrl(item.url);
  });

  attachTileDrag(tile, item, groupId, searching);

  return tile;
}

function createAddTile() {
  const tile = document.createElement('div');
  tile.className = 'tile add';
  tile.innerHTML =
    '<div class="tile-icon">' + ICONS.plus + '</div>' +
    '<div class="tile-name">添加网站</div>';
  tile.addEventListener('click', () => openLinkModal({ groupId: currentGroup().id }));
  return tile;
}

function moveItem(fromGroupId, itemId, toGroupId, refId, after) {
  const from = groupById(fromGroupId);
  const to = groupById(toGroupId);
  if (!from || !to) return;
  const idx = from.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return;

  const [item] = from.items.splice(idx, 1);
  let insertAt = to.items.findIndex((it) => it.id === refId);
  if (insertAt < 0) insertAt = to.items.length;
  else if (after) insertAt += 1;
  to.items.splice(insertAt, 0, item);

  save();
  renderAll();
}

function renderGrid() {
  const grid = $('grid');
  const { list, searching } = visibleList();
  const pages = pageCount(list.length, searching);
  if (ui.page > pages - 1) ui.page = pages - 1;
  ui.pages = pages;

  const size = perPage();
  const start = ui.page * size;
  const pageItems = list.slice(start, start + size);
  const isEmpty = list.length === 0;

  grid.innerHTML = '';
  if (typeof WidgetRegistry !== 'undefined') WidgetRegistry.cleanup();
  pageItems.forEach((entry, i) => {
    const kind = entry.item.kind;
    grid.appendChild(
      kind === 'widget'
        ? createWidgetTile(entry.item, entry.groupId, searching, i)
        : kind === 'folder'
          ? createFolderTile(entry.item, entry.groupId, searching, i)
          : createTile(entry.item, entry.groupId, searching, i)
    );
  });

  const isLastPage = ui.page === pages - 1;
  if (!searching && isLastPage && !isEmpty) grid.appendChild(createAddTile());

  grid.hidden = isEmpty && !searching;
  $('empty').hidden = !(isEmpty && !searching);

  renderDots(pages);
  renderHint(list.length, searching);
  refreshOpenFolder();
}

function renderDots(pages) {
  const wrap = $('dots');
  wrap.innerHTML = '';
  if (pages < 2) return;
  for (let i = 0; i < pages; i += 1) {
    const dot = document.createElement('button');
    dot.className = 'dot' + (i === ui.page ? ' active' : '');
    dot.title = '第 ' + (i + 1) + ' 页';
    dot.addEventListener('click', () => {
      ui.page = i;
      renderGrid();
    });
    wrap.appendChild(dot);
  }
}

function renderHint(count, searching) {
  const hint = $('filterHint');
  if (!searching) {
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
  hint.textContent = count
    ? '找到 ' + count + ' 个站点，按回车用搜索引擎搜索「' + ui.query + '」'
    : '没有匹配的站点，按回车搜索「' + ui.query + '」';
}

function renderAll() {
  applySettings();
  renderSidebar();
  renderEngines();
  renderSearchEngine();
  renderGrid();
}

/* ---------------- 事件绑定 ---------------- */
function bindGridEvents() {
  $('emptyAdd').addEventListener('click', () => openLinkModal({ groupId: currentGroup().id }));

  // 拖到网格空白处：移到当前分组末尾
  const grid = $('grid');
  grid.addEventListener('dragover', (e) => {
    if (!dragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  grid.addEventListener('drop', (e) => {
    if (!dragState) return;
    const tile = e.target.closest('.tile');
    if (tile && !tile.classList.contains('add')) return; // 落在磁贴上的由磁贴自己处理
    e.preventDefault();
    const g = groupById(dragState.groupId);
    if (!g || !g.items.length) return;
    const last = g.items[g.items.length - 1];
    if (last.id === dragState.itemId) return;
    moveItem(dragState.groupId, dragState.itemId, g.id, last.id, true);
  });

  document.addEventListener('dragend', () => {
    dragState = null;
    document
      .querySelectorAll('.drop-before, .drop-after, .drop-merge, .drop-target')
      .forEach((n) => {
        n.classList.remove('drop-before', 'drop-after', 'drop-merge', 'drop-target');
      });
  });
}
