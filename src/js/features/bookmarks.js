/* ============================================================
 * 浏览器书签侧边栏
 *   - 屏幕右侧悬浮按钮 → 打开 / 关闭侧边栏
 *   - 按层级展示书签树，支持模糊搜索
 *   - 左侧边缘可拖动调整宽度（记忆到 settings.bmWidth）
 * 与主页数据的双向同步见 features/bookmark-sync.js
 * ============================================================ */

const BM_ICON_BOOKMARK = ICONS.bookmark;
const BM_ICON_FOLDER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h3l1.6 2H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const BM_ICON_ARROW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BM_ICON_SEARCH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const BM_ICON_CLOSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

let bmTree = null;        // chrome.bookmarks.getTree() 缓存（每次打开刷新）
let bmExpanded = null;    // Set<folderId> 展开的文件夹
let bmSearchTimer = 0;
let bmLoading = false;

function bookmarksAvailable() {
  return (
    typeof chrome !== 'undefined' &&
    chrome.bookmarks &&
    typeof chrome.bookmarks.getTree === 'function'
  );
}

function bmWidth() {
  const n = Number(state.settings.bmWidth);
  if (!Number.isFinite(n)) return 340;
  return Math.min(720, Math.max(260, Math.round(n)));
}

/* ---------------- 侧边栏 DOM ---------------- */
function ensureBookmarkPanel() {
  if ($('bmPanel')) return;

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'bm-handle';
  handle.id = 'bmHandle';
  handle.title = '浏览器书签';
  handle.setAttribute('aria-label', '打开浏览器书签');
  handle.innerHTML = BM_ICON_BOOKMARK;
  handle.addEventListener('click', () => {
    const panel = $('bmPanel');
    if (panel && !panel.hidden) closeBookmarkPanel();
    else openBookmarkPanel();
  });
  document.body.appendChild(handle);

  const panel = document.createElement('aside');
  panel.className = 'bm-panel';
  panel.id = 'bmPanel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '浏览器书签');
  panel.innerHTML =
    '<div class="bm-resizer" id="bmResizer" title="拖动调整宽度"></div>' +
    '<header class="bm-head">' +
      '<div class="bm-head-title">' + BM_ICON_BOOKMARK + '<h2>浏览器书签</h2></div>' +
      '<div class="bm-head-actions">' +
        '<button class="bm-icon-btn" id="bmRefresh" type="button" title="刷新书签">' + ICONS.refresh + '</button>' +
        '<button class="bm-icon-btn" id="bmClose" type="button" title="关闭">' + BM_ICON_CLOSE + '</button>' +
      '</div>' +
    '</header>' +
    '<div class="bm-tools" id="bmTools">' +
      '<div class="bm-search-box">' +
        BM_ICON_SEARCH +
        '<input id="bmSearch" type="text" placeholder="搜索书签（支持模糊匹配）" spellcheck="false" autocomplete="off" />' +
        '<button class="bm-search-clear" id="bmSearchClear" type="button" title="清空" hidden>' + BM_ICON_CLOSE + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="bm-body" id="bmBody"></div>' +
    '<div class="bm-sync" id="bmSync" hidden></div>';

  document.body.appendChild(panel);

  $('bmClose').addEventListener('click', closeBookmarkPanel);
  $('bmRefresh').addEventListener('click', () => {
    bmTree = null;
    refreshBookmarkTree();
  });
  $('bmSearch').addEventListener('input', () => {
    const input = $('bmSearch');
    $('bmSearchClear').hidden = !input.value;
    clearTimeout(bmSearchTimer);
    bmSearchTimer = setTimeout(renderBookmarkTree, 90);
  });
  $('bmSearchClear').addEventListener('click', () => {
    $('bmSearch').value = '';
    $('bmSearchClear').hidden = true;
    renderBookmarkTree();
    $('bmSearch').focus();
  });

  bindBookmarkResize();
}

function bindBookmarkResize() {
  const resizer = $('bmResizer');
  const panel = $('bmPanel');
  if (!resizer || !panel) return;

  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel.getBoundingClientRect().width;
    resizer.setPointerCapture && resizer.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const next = Math.min(720, Math.max(260, startW + (startX - ev.clientX)));
      panel.style.width = next + 'px';
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('bm-resizing');
      state.settings.bmWidth = Math.round(panel.getBoundingClientRect().width);
      save();
    };

    document.body.classList.add('bm-resizing');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

/* ---------------- 打开 / 关闭 ---------------- */
function openBookmarkPanel(syncMode) {
  ensureBookmarkPanel();
  const panel = $('bmPanel');
  if (!panel) return;

  if (!bookmarksAvailable()) {
    toast('浏览器书签仅在扩展环境中可用');
    return;
  }

  panel.hidden = false;
  panel.style.width = bmWidth() + 'px';
  document.body.classList.add('bm-open');

  if (syncMode) {
    showBookmarkSync();
  } else {
    hideBookmarkSync();
    refreshBookmarkTree();
  }
}

function closeBookmarkPanel() {
  const panel = $('bmPanel');
  if (!panel) return;
  panel.hidden = true;
  document.body.classList.remove('bm-open');
  document.body.classList.remove('bm-resizing');
}

/* ---------------- 书签树 ---------------- */
async function refreshBookmarkTree() {
  const body = $('bmBody');
  if (!body || bmLoading) return;

  bmLoading = true;
  body.innerHTML = '<p class="bm-empty">正在读取书签…</p>';

  try {
    bmTree = await chrome.bookmarks.getTree();
  } catch (e) {
    bmLoading = false;
    body.innerHTML = '<p class="bm-empty">读取书签失败：' + esc(e && e.message) + '</p>';
    return;
  }

  bmLoading = false;

  if (!bmExpanded) {
    bmExpanded = new Set();
    const root = bmTree && bmTree[0];
    (root && root.children ? root.children : []).forEach((node) => {
      if (node.children) bmExpanded.add(node.id);
    });
  }

  renderBookmarkTree();
}

function renderBookmarkTree() {
  const body = $('bmBody');
  if (!body || !bmTree) return;

  const query = ($('bmSearch') ? $('bmSearch').value : '').trim().toLowerCase();
  body.innerHTML = '';

  if (query) {
    const matches = [];
    bmCollectMatches(bmTree[0], query, [], matches);
    if (!matches.length) {
      body.innerHTML = '<p class="bm-empty">没有匹配的书签</p>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'bm-results';
    matches.slice(0, 150).forEach((m) => list.appendChild(bmBookmarkRow(m.node, m.path)));
    body.appendChild(list);
    if (matches.length > 150) {
      const more = document.createElement('p');
      more.className = 'bm-more';
      more.textContent = '还有 ' + (matches.length - 150) + ' 条结果，请继续输入以缩小范围';
      body.appendChild(more);
    }
    return;
  }

  const root = bmTree[0];
  const wrap = document.createElement('div');
  wrap.className = 'bm-tree';
  (root && root.children ? root.children : []).forEach((node) => {
    wrap.appendChild(bmTreeNode(node, 0));
  });
  body.appendChild(wrap);
}

function bmTreeNode(node, depth) {
  if (node.url) return bmBookmarkRow(node, '', depth);

  const folder = document.createElement('div');
  folder.className = 'bm-folder';

  const open = bmExpanded.has(node.id);
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'bm-folder-head';
  head.style.paddingLeft = 8 + depth * 14 + 'px';
  head.innerHTML =
    '<span class="bm-arrow' + (open ? ' open' : '') + '">' + BM_ICON_ARROW + '</span>' +
    '<span class="bm-folder-icon">' + BM_ICON_FOLDER + '</span>' +
    '<span class="bm-folder-name">' + esc(node.title || '未命名') + '</span>' +
    '<span class="bm-count">' + ((node.children && node.children.length) || 0) + '</span>';

  head.addEventListener('click', () => {
    if (bmExpanded.has(node.id)) bmExpanded.delete(node.id);
    else bmExpanded.add(node.id);
    renderBookmarkTree();
  });
  folder.appendChild(head);

  if (open && node.children) {
    const kids = document.createElement('div');
    kids.className = 'bm-children';
    node.children.forEach((child) => kids.appendChild(bmTreeNode(child, depth + 1)));
    folder.appendChild(kids);
  }

  return folder;
}

function bmBookmarkRow(node, pathText, depth) {
  const row = document.createElement('a');
  row.className = 'bm-link';
  row.href = node.url;
  row.title = pathText ? pathText + ' / ' + node.url : node.url;
  if (typeof depth === 'number') row.style.paddingLeft = 8 + depth * 14 + 16 + 'px';

  const icon = document.createElement('span');
  icon.className = 'bm-link-icon';
  const src = faviconUrl(node.url, 32);
  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = src;
    img.addEventListener('error', () => img.remove(), { once: true });
    icon.appendChild(img);
  }

  const name = document.createElement('span');
  name.className = 'bm-link-name';
  name.textContent = node.title || hostOf(node.url) || node.url;

  row.append(icon, name);

  if (pathText) {
    const path = document.createElement('span');
    path.className = 'bm-link-path';
    path.textContent = pathText;
    row.appendChild(path);
  }

  row.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(node.url);
  });

  return row;
}

/* 递归收集匹配的书签（路径用于结果提示） */
function bmCollectMatches(node, query, path, out) {
  const parts = query.split(/\s+/).filter(Boolean);

  (node.children || []).forEach((child) => {
    if (child.url) {
      const hay = (child.title + ' ' + child.url).toLowerCase();
      if (parts.every((p) => bmFuzzyHit(hay, p))) {
        out.push({ node: child, path: path.join(' / ') });
      }
      return;
    }
    bmCollectMatches(child, query, path.concat(child.title || '未命名'), out);
  });

  return out;
}

/* 先判断连续包含，再退化为按顺序的字符匹配 */
function bmFuzzyHit(text, needle) {
  if (!needle) return true;
  if (text.indexOf(needle) >= 0) return true;
  let i = 0;
  for (let j = 0; j < text.length && i < needle.length; j += 1) {
    if (text[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

/* ---------------- 文件夹列表（同步面板复用） ---------------- */
function bmFolderOptions() {
  const out = [];
  if (!bmTree) return out;

  const walk = (node, depth) => {
    if (node.url) return;
    if (node.id !== '0') {
      out.push({ id: node.id, title: node.title || '未命名', depth });
    }
    (node.children || []).forEach((child) => walk(child, node.id === '0' ? depth : depth + 1));
  };

  walk(bmTree[0], 0);
  return out;
}

async function bmLoadTree() {
  if (bmTree) return bmTree;
  bmTree = await chrome.bookmarks.getTree();
  return bmTree;
}

/* ---------------- 事件绑定 ---------------- */
function bindBookmarkEvents() {
  ensureBookmarkPanel();
}
