/* ============================================================
 * 书签 ↔ 主页 双向同步（显示在右侧书签侧边栏内）
 *
 * 主页 → 书签：在指定书签目录下按分组创建同名文件夹，逐个写入网站；
 *              主页里的文件夹会建成同名书签子文件夹（只一层）
 * 书签 → 主页：把指定目录的书签导入指定分组，两种模式
 *   - keep：保留一级目录，子目录在主页生成同名文件夹，其中的书签（含更深层级）全部放进去
 *   - flat：只取该目录下直接包含的书签，忽略子目录
 * ============================================================ */

let bmSyncTab = 'toBookmarks'; // toBookmarks | toGroups

function showBookmarkSync() {
  ensureBookmarkPanel();
  const sync = $('bmSync');
  if (!sync) return;

  $('bmTools').hidden = true;
  $('bmBody').hidden = true;
  sync.hidden = false;
  bmSyncTab = 'toBookmarks';
  renderBookmarkSync();
}

function hideBookmarkSync() {
  const sync = $('bmSync');
  if (!sync) return;
  sync.hidden = true;
  $('bmTools').hidden = false;
  $('bmBody').hidden = false;
}

async function renderBookmarkSync() {
  const box = $('bmSync');
  if (!box) return;

  box.innerHTML =
    '<div class="bm-sync-head">' +
      '<button class="bm-back" id="bmBackTree" type="button">← 返回书签列表</button>' +
    '</div>' +
    '<div class="bm-sync-tabs">' +
      '<button type="button" data-tab="toBookmarks" class="active">主页 → 书签</button>' +
      '<button type="button" data-tab="toGroups">书签 → 主页</button>' +
    '</div>' +
    '<div class="bm-sync-body" id="bmSyncBody"><p class="bm-empty">正在读取书签目录…</p></div>';

  $('bmBackTree').addEventListener('click', () => {
    hideBookmarkSync();
    if (bmTree) renderBookmarkTree();
    else refreshBookmarkTree();
  });

  box.querySelector('.bm-sync-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    bmSyncTab = btn.dataset.tab;
    box.querySelectorAll('.bm-sync-tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === bmSyncTab);
    });
    renderBookmarkSyncBody();
  });

  try {
    await bmLoadTree();
  } catch (e) {
    $('bmSyncBody').innerHTML = '<p class="bm-empty">读取书签失败：' + esc(e && e.message) + '</p>';
    return;
  }

  renderBookmarkSyncBody();
}

function renderBookmarkSyncBody() {
  const box = $('bmSyncBody');
  if (!box) return;

  // 缓存被清空时（例如刚执行完同步）重新拉取一次目录
  if (!bmTree) {
    box.innerHTML = '<p class="bm-empty">正在读取书签目录…</p>';
    bmLoadTree()
      .then(() => renderBookmarkSyncBody())
      .catch((e) => {
        box.innerHTML = '<p class="bm-empty">读取书签失败：' + esc(e && e.message) + '</p>';
      });
    return;
  }

  const folders = bmFolderOptions();
  if (!folders.length) {
    box.innerHTML = '<p class="bm-empty">没有可用的书签目录</p>';
    return;
  }

  const folderOptions = folders
    .map(
      (f) =>
        '<option value="' + f.id + '">' + '　'.repeat(f.depth) + esc(f.title) + '</option>'
    )
    .join('');

  if (bmSyncTab === 'toBookmarks') {
    box.innerHTML =
      '<p class="bm-sync-tip">在所选目录下为每个分组创建一个同名文件夹，把主页图标写进去；主页里的文件夹会建成同名子文件夹（只一层）。已存在的同名书签会跳过。</p>' +
      '<label class="bm-field"><span>目标书签目录</span><select id="bmTargetFolder">' + folderOptions + '</select></label>' +
      '<button class="bm-run" id="bmRunToMarks" type="button">同步到书签</button>' +
      '<p class="bm-sync-status" id="bmSyncStatus"></p>';

    $('bmRunToMarks').addEventListener('click', () => {
      runBmSync('bmRunToMarks', $('bmSyncStatus'), doSyncGroupsToBookmarks, $('bmTargetFolder').value);
    });
    return;
  }

  const groupOptions = state.groups
    .map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>')
    .join('');

  box.innerHTML =
    '<p class="bm-sync-tip">把所选目录里的书签导入指定分组，按网址去重。文件夹只保留一层。</p>' +
    '<label class="bm-field"><span>源书签目录</span><select id="bmSourceFolder">' + folderOptions + '</select></label>' +
    '<label class="bm-field"><span>目标分组</span><select id="bmTargetGroup">' + groupOptions + '</select></label>' +
    '<div class="bm-mode">' +
      '<label><input type="radio" name="bmSyncMode" value="keep" checked />' +
        '<span>保留一级目录：子目录在主页生成同名文件夹，其中的书签（含更深层级）都收进该文件夹</span></label>' +
      '<label><input type="radio" name="bmSyncMode" value="flat" />' +
        '<span>仅当前目录：只同步该目录下直接包含的书签，子目录忽略</span></label>' +
    '</div>' +
    '<button class="bm-run" id="bmRunToGroups" type="button">同步到分组</button>' +
    '<p class="bm-sync-status" id="bmSyncStatus"></p>';

  $('bmRunToGroups').addEventListener('click', () => {
    const modeInput = document.querySelector('input[name="bmSyncMode"]:checked');
    runBmSync('bmRunToGroups', $('bmSyncStatus'), doSyncBookmarksToGroup, {
      sourceId: $('bmSourceFolder').value,
      groupId: $('bmTargetGroup').value,
      keepFolders: !modeInput || modeInput.value === 'keep'
    });
  });
}

async function runBmSync(buttonId, statusNode, task, arg) {
  const btn = $(buttonId);
  if (btn) btn.disabled = true;
  if (statusNode) statusNode.textContent = '正在同步…';

  try {
    const result = await task(arg);
    if (statusNode) statusNode.textContent = result;
    toast(result);
  } catch (e) {
    const msg = '同步失败：' + (e && e.message ? e.message : '未知错误');
    if (statusNode) statusNode.textContent = msg;
    toast(msg);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------------- 主页 → 书签 ---------------- */
async function doSyncGroupsToBookmarks(parentId) {
  if (!parentId) throw new Error('请选择目标目录');

  let foldersMade = 0;
  let created = 0;
  let skipped = 0;
  let groupsTouched = 0;

  // 把一批站点写进某个书签目录，按 url 去重
  const writeSites = async (folderId, sites) => {
    const children = await chrome.bookmarks.getChildren(folderId);
    const urls = new Set(children.filter((c) => c.url).map((c) => c.url));

    for (const site of sites) {
      const url = normalizeUrl(site.url);
      if (!url) continue; // 组件没有网址，跳过
      if (urls.has(url)) {
        skipped += 1;
        continue;
      }
      await chrome.bookmarks.create({ parentId: folderId, title: site.title || url, url });
      urls.add(url);
      created += 1;
    }
  };

  for (const group of state.groups) {
    const folder = await bmEnsureFolder(parentId, group.name);
    if (folder.created) foldersMade += 1;
    groupsTouched += 1;

    await writeSites(folder.id, group.items.filter((it) => it.kind !== 'folder' && it.url));

    // 主页文件夹 → 同名书签子文件夹（只一层，内部是站点）
    for (const item of group.items) {
      if (item.kind !== 'folder' || !item.items.length) continue;
      const sub = await bmEnsureFolder(folder.id, item.title);
      if (sub.created) foldersMade += 1;
      await writeSites(sub.id, item.items);
    }
  }

  bmTree = null;
  return '已同步 ' + groupsTouched + ' 个分组：新建目录 ' + foldersMade + ' 个、书签 ' +
    created + ' 条，跳过已存在 ' + skipped + ' 条';
}

async function bmEnsureFolder(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const found = children.find((c) => !c.url && c.title === title);
  if (found) return { id: found.id, created: false };
  const node = await chrome.bookmarks.create({ parentId, title });
  return { id: node.id, created: true };
}

/* ---------------- 书签 → 主页 ---------------- */
async function doSyncBookmarksToGroup(options) {
  const { sourceId, groupId, keepFolders } = options || {};
  if (!sourceId) throw new Error('请选择源目录');

  const group = groupById(groupId);
  if (!group) throw new Error('目标分组不存在');

  const existing = collectGroupUrls(group);
  let added = 0;
  let skipped = 0;
  let foldersAdded = 0;

  // 写入目标数组，按 url 去重
  const pushSite = (list, node) => {
    const url = normalizeUrl(node.url);
    if (!url) {
      skipped += 1;
      return;
    }
    if (existing.has(url)) {
      skipped += 1;
      return;
    }
    existing.add(url);
    list.push({
      id: uid('i'),
      title: String(node.title || suggestTitle(url)).slice(0, 40),
      url,
      icon: ''
    });
    added += 1;
  };

  const children = await chrome.bookmarks.getChildren(sourceId);

  // 1) 目录下直接包含的书签 → 分组根
  children.forEach((node) => {
    if (node.url) pushSite(group.items, node);
  });

  // 2) 一级子目录 → 主页文件夹；更深层级全部摊平进这个文件夹
  if (keepFolders) {
    for (const node of children) {
      if (node.url) continue;
      const inner = await bmCollectUrls(node.id);
      if (!inner.length) continue;

      const title = String(node.title || '文件夹').slice(0, 20);
      const target = { id: uid('f'), kind: 'folder', title, items: [] };
      inner.forEach((site) => pushSite(target.items, site));
      if (!target.items.length) continue;

      // 同名文件夹已存在时并进去，避免重复
      const same = group.items.find((it) => it.kind === 'folder' && it.title === title);
      if (same) same.items.push(...target.items);
      else group.items.push(target);
      foldersAdded += 1;
    }
  }

  save();
  renderAll();

  return '已导入「' + group.name + '」：新增 ' + added + ' 条' +
    (keepFolders ? '、文件夹 ' + foldersAdded + ' 个' : '') +
    '，跳过 ' + skipped + ' 条（重复或非网页地址）';
}

/* 递归收集某个目录下的全部书签（用于摊平进主页文件夹） */
async function bmCollectUrls(folderId) {
  const out = [];
  const children = await chrome.bookmarks.getChildren(folderId);

  for (const child of children) {
    if (child.url) out.push({ title: child.title, url: child.url });
    else out.push(...(await bmCollectUrls(child.id)));
  }

  return out;
}

/* ---------------- 入口 ---------------- */
function openBookmarkSync() {
  openBookmarkPanel(true);
}
