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
const ICON_CACHE_KEY = 'qihang:icon-cache';
const ICON_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 天
const ICON_CACHE_MAX = 400;

/* 解析结果按 host 落到 localStorage：刷新页面时直接命中，不再先闪字母块 */
function loadIconCache() {
  const map = new Map();
  try {
    const data = JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}');
    const now = Date.now();
    Object.keys(data).forEach((host) => {
      const row = data[host];
      if (!row || !row.src) return;
      if (now - Number(row.ts || 0) > ICON_CACHE_TTL) return;
      map.set(host, row.src);
    });
  } catch (e) { /* 缓存损坏就当空的 */ }
  return map;
}

function persistIconCache(host, src) {
  try {
    const data = JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}');
    data[host] = { src: src, ts: Date.now() };
    const keys = Object.keys(data);
    if (keys.length > ICON_CACHE_MAX) {
      keys
        .sort((a, b) => Number(data[a].ts || 0) - Number(data[b].ts || 0))
        .slice(0, keys.length - ICON_CACHE_MAX)
        .forEach((k) => delete data[k]);
    }
    localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(data));
  } catch (e) { /* 写失败不影响显示 */ }
}

function rememberIcon(host, src) {
  if (!host || !src) return;
  iconSrcCache.set(host, src);
  persistIconCache(host, src);
}

function forgetIcon(host) {
  iconSrcCache.delete(host);
  try {
    const data = JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}');
    if (data[host]) {
      delete data[host];
      localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(data));
    }
  } catch (e) { /* 忽略 */ }
}

const iconSrcCache = loadIconCache(); // host -> 最终采用的图标地址（跨会话保留）
const iconJobs = new Map();           // host -> 正在解析的 Promise（避免同站点重复请求）

/* 加载单张图标，失败或超时返回 null */
function loadIcon(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 2500);
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

/* 按候选顺序找图：优先 96px+ 的真高清，其次 48px+，都没有才退回第一张可用的 */
function resolveIcon(item) {
  const custom = String(item.icon || '').trim();
  if (custom) return Promise.resolve(custom);

  const host = hostOf(item.url);
  if (!host) return Promise.resolve('');
  if (iconSrcCache.has(host)) return Promise.resolve(iconSrcCache.get(host));
  if (iconJobs.has(host)) return iconJobs.get(host);

  const candidates = iconCandidateList(item.url).slice(0, 8);
  const job = (async () => {
    let mid = '';
    let any = '';
    for (const src of candidates) {
      const img = await loadIcon(src);
      if (!img || isPlaceholderIcon(img)) continue;
      const px = Math.max(img.naturalWidth, img.naturalHeight);
      if (!any) any = src;
      if (px >= ICON_HI_PX) {
        rememberIcon(host, src);
        return src;
      }
      if (px >= ICON_CLEAR_PX && !mid) mid = src;
    }
    const best = mid || any;
    if (best) rememberIcon(host, best);
    return best;
  })();

  iconJobs.set(host, job);
  job.then(() => iconJobs.delete(host));
  return job;
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
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener(
      'error',
      () => {
        if (mine === seq && onFail) onFail();
      },
      { once: true }
    );
    container.appendChild(img);
    img.src = src;
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

  const cached = iconSrcCache.get(host);
  if (cached) {
    // 命中缓存直接上屏（HTTP 缓存下几乎瞬时），不画字母块
    showImage(cached, () => {
      forgetIcon(host);
      resolveIcon(item).then((src) => {
        if (src) showImage(src, showLetter);
        else showLetter();
      });
    });
    return;
  }

  // 无缓存：先用浏览器本地 favicon 顶上（通常已缓存），高清源解析完成后再换
  let resolved = false;
  let quickFailed = false;
  const quick = IS_EXT ? faviconUrl(item.url, 128) : '';
  if (quick) {
    showImage(quick, () => {
      if (resolved) showLetter();
      else quickFailed = true;
    });
  }

  resolveIcon(item).then((src) => {
    resolved = true;
    if (src) showImage(src, showLetter);
    else if (!quick || quickFailed) showLetter();
  });
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
