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

/* 图标清晰度阈值：边长低于 48px 视为模糊，达到 96px 才认为足够高清 */
const ICON_CLEAR_PX = 48;
const ICON_HI_PX = 96;
const ICON_TIMEOUT = 5000; // 单张候选图超时（只在用户主动「自动获取」时探测）

/* 加载单张图标，失败或超时返回 null */
function loadIcon(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), ICON_TIMEOUT);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/* 1x1 像素、favicon.im 的「灰底字母」占位 SVG（100 的 viewBox 在 Chromium 渲染为 150x150）都不算图标 */
function isPlaceholderIcon(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 8 || h < 8) return true;
  return w === 150 && h === 150;
}

/* 只在用户点「自动获取」/ 弹窗预览候选时调用：并发探测候选源，取最清晰的一个。
   不写缓存、不碰数据 —— 磁贴渲染永远用固定地址（item.icon 或浏览器本地 favicon）。 */
function resolveIcon(item) {
  const custom = String(item.icon || '').trim();
  if (custom) return Promise.resolve(custom);

  const candidates = iconCandidateList(item.url).slice(0, 8);
  if (!candidates.length) return Promise.resolve('');

  return Promise.all(
    candidates.map(async (src, order) => {
      const img = await loadIcon(src);
      if (!img || isPlaceholderIcon(img)) return null;
      return { src, order, px: Math.max(img.naturalWidth, img.naturalHeight) };
    })
  ).then((rows) => {
    const found = rows.filter(Boolean).sort((a, b) => a.order - b.order);
    if (!found.length) return '';
    const hi = found.find((r) => r.px >= ICON_HI_PX);
    const mid = found.find((r) => r.px >= ICON_CLEAR_PX);
    return (hi || mid || found[0]).src;
  });
}

/* 本次会话已尝试过自动补图的磁贴，避免切分组时反复探测 */
const iconAutoTried = new Set();

/* 已加载过的图标 <img> 节点池：切换分组重建磁贴时直接复用节点，
   浏览器不会重新发请求、也不会重新解码，慢网下不会「等一会儿才出现」 */
const iconImgPool = new Map(); // src -> HTMLImageElement[]
const ICON_IMG_MAX = 400;
let iconImgCount = 0;

function takePooledIconImg(src) {
  const list = iconImgPool.get(src);
  if (!list) return null;
  for (const el of list) {
    if (!el.isConnected) return el;
  }
  return null;
}

function putIconImg(src, img) {
  const list = iconImgPool.get(src);
  if (list) list.push(img);
  else iconImgPool.set(src, [img]);
  iconImgCount += 1;
  if (iconImgCount <= ICON_IMG_MAX) return;
  // 超限时淘汰最早创建、且当前不在页面上的节点
  for (const [key, arr] of iconImgPool) {
    const idx = arr.findIndex((el) => !el.isConnected);
    if (idx < 0) continue;
    arr.splice(idx, 1);
    iconImgCount -= 1;
    if (!arr.length) iconImgPool.delete(key);
    break;
  }
}

/* 加载失败的节点要出池，否则下次会复用到一张死图 */
function dropIconImg(src, img) {
  const list = iconImgPool.get(src);
  if (!list) return;
  const idx = list.indexOf(img);
  if (idx < 0) return;
  list.splice(idx, 1);
  iconImgCount -= 1;
  if (!list.length) iconImgPool.delete(src);
  img.onerror = null;
  if (img.parentNode) img.parentNode.removeChild(img);
}

function paintIcon(container, item) {
  const label = item.title || hostOf(item.url) || '';
  const hue = hashHue(label || item.url);
  const host = hostOf(item.url);
  const custom = String(item.icon || '').trim();

  let seq = 0;
  container.classList.remove('letter-tile');

  /* 「纯色底 + 首字」只在确实拿不到图时出现，正常路径不会先闪一下文字 */
  const showLetter = () => {
    seq += 1;
    container.innerHTML = '';
    container.classList.remove('cover');
    container.style.background =
      'linear-gradient(150deg, hsl(' + hue + ' 46% 56%), hsl(' + ((hue + 34) % 360) + ' 52% 34%))';
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = firstChar(label);
    container.appendChild(letter);
  };

  /* 图片直接上屏（不等 load），加载失败才交给 onFail；序号防止慢请求覆盖新图 */
  const showImage = (src, onFail) => {
    if (!src) return;
    const mine = ++seq;
    container.innerHTML = '';
    container.classList.remove('cover');
    container.style.background = '';

    // 同一个图标地址复用已加载过的节点：切分组回来零请求、零解码
    let img = takePooledIconImg(src);
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      putIconImg(src, img);
    }
    // 用属性赋值而不是 addEventListener，复用时能覆盖上一次的回调
    img.onerror = () => {
      if (mine !== seq) return;
      dropIconImg(src, img);
      if (onFail) onFail();
    };
    container.appendChild(img);
    if (img.getAttribute('src') !== src) img.src = src;
  };

  if (custom) {
    // 文字图标是「整块图标」，放大到接近底板宽度，多行文字才看得清
    container.classList.toggle('letter-tile', custom.indexOf('data:image/svg+xml') === 0);
    // 用户指定的图标加载失败就显示占位，不自动换源、不改数据，等用户自己调整
    showImage(custom, showLetter);
    return;
  }
  if (!host) {
    showLetter();
    return;
  }

  // 未设置图标：用浏览器本地图标（固定地址，扩展内是 _favicon?pageUrl=…&size=128）
  const fixed = faviconUrl(item.url, 128);
  if (fixed) showImage(fixed, showLetter);
  else showLetter();

  // 开关打开时才补高清图：只为「没设置过图标」的站点挑一次，结果固化进 item.icon。
  // 固化之后即使再关掉开关，地址仍然生效，不会出现图标缺失或变化。
  if (!state.settings.iconAutoFetch || !item.url || iconAutoTried.has(item.id)) return;
  iconAutoTried.add(item.id);
  resolveIcon({ url: item.url })
    .then((src) => {
      if (!src || isInternalFaviconUrl(src)) return;
      item.icon = src;
      save();
      showImage(src, () => { /* 换图失败保持本地图标 */ });
    })
    .catch(() => { /* 探测失败保持本地图标 */ });
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
  more.title = i18n('common.more');
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
    '<div class="tile-name">' + esc(i18n('grid.addSite')) + '</div>';
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
    dot.title = i18n('grid.page', { n: i + 1 });
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
    ? i18n('search.hintFound', { n: count, q: ui.query })
    : i18n('search.hintNone', { q: ui.query });
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
