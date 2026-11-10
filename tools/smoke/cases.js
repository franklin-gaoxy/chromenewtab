/* ============================================================
 * 页面冒烟用例
 *
 * 由 tools/smoke/run.js 注入到 src/newtab.html 的临时副本里执行。
 * 结果写入 document.title，格式：name:ok | name:fail(detail)
 *
 * 新增用例：在下面按分组追加 ok('名字', 断言, 失败时的细节)
 * 用例只能依赖页面里已有的全局函数（grid / folder / backup / sync / bookmark-sync）
 * ============================================================ */

function runSmokeTests() {
  const results = [];
  const ok = (name, pass, detail) => {
    results.push(name + ':' + (pass ? 'ok' : 'fail' + (detail ? '(' + detail + ')' : '')));
  };
  const done = () => {
    document.title = results.join(' | ');
  };

  window.onerror = (msg) => {
    document.title = 'ERR:' + msg;
  };

  try {
    /* ---------------- 文件夹：合并 / 渲染 / 面板 ---------------- */
    const group = state.groups[0];
    state.activeGroupId = group.id;
    renderAll();

    const first = group.items[0];
    const second = group.items[1];
    mergeItems(group.id, second.id, group.id, first.id);

    const folder = group.items.find((it) => it.kind === 'folder');
    ok(
      'folder-merge',
      !!folder && folder.items.length === 2,
      folder ? 'items=' + folder.items.length : '没有生成文件夹'
    );

    const tile = document.querySelector('.tile-folder');
    ok('folder-tile', !!tile);

    if (tile) tile.click();
    const mask = document.getElementById('folderMask');
    const panel = document.getElementById('folderPanel');
    const cells = panel ? panel.querySelectorAll('.f-item').length : 0;
    ok('folder-panel', !!mask && !mask.hidden && cells === 3, 'cells=' + cells);
    ok(
      'folder-blur',
      !!panel && (getComputedStyle(panel).backdropFilter || '').indexOf('blur') >= 0
    );

    closeFolder();
    ok('folder-close', !!mask && mask.hidden);

    /* ---------------- 数据层：备份结构 / 一层约束 ---------------- */
    const snapshot = JSON.parse(
      JSON.stringify({
        groups: state.groups,
        activeGroupId: state.activeGroupId,
        settings: state.settings
      })
    );
    const restored = normalizeData(snapshot);
    const restoredFolder = restored.groups[0].items.find((it) => it.kind === 'folder');
    ok('backup-roundtrip', !!restoredFolder && restoredFolder.items.length === 2);

    const nested = normalizeData({
      groups: [
        {
          id: 'g_nest',
          name: '嵌套',
          items: [
            {
              id: 'f_nest',
              kind: 'folder',
              title: 'F',
              items: [
                { id: 'i_a', title: 'a', url: 'a.example.com' },
                {
                  id: 'f_inner',
                  kind: 'folder',
                  title: 'inner',
                  items: [{ id: 'i_b', title: 'b', url: 'b.example.com' }]
                }
              ]
            }
          ]
        }
      ]
    });
    const nestedItems = nested.groups[0].items[0].items;
    ok('folder-one-level', nestedItems.length === 1, 'items=' + nestedItems.length);

    /* ---------------- 远程同步：字段白名单 / 合并 ---------------- */
    const payload = buildSyncPayload();
    const payloadFolder = payload.groups[0].items.find((it) => it.kind === 'folder');
    ok('sync-payload', !!payloadFolder && payloadFolder.items.length === 2);

    const merged = mergeGroups([], payload.groups);
    const mergedFolder = merged[0].items.find((it) => it.kind === 'folder');
    ok('sync-merge', !!mergedFolder && mergedFolder.items.length === 2);

    /* ---------------- 书签 HTML 导出 ---------------- */
    const html = buildBookmarksHtml('启航导航').html;
    ok('bookmarks-html', (html.match(/<DL><p>/g) || []).length >= 4);
    const urls = collectGroupUrls(group).size;
    ok('collect-urls', urls === 12, 'size=' + urls);

    /* ---------------- 书签 ↔ 主页（伪造 chrome.bookmarks） ---------------- */
    const nodes = new Map();
    let seq = 0;
    const makeNode = (title, parentId, url) => {
      const node = { id: 'b' + ++seq, title, parentId };
      if (url) node.url = url;
      else node.children = [];
      nodes.set(node.id, node);
      if (parentId) nodes.get(parentId).children.push(node);
      return node;
    };

    window.chrome = window.chrome || {};
    window.chrome.bookmarks = {
      async getChildren(id) {
        const node = nodes.get(id);
        return node && node.children ? node.children.slice() : [];
      },
      async create(info) {
        return makeNode(info.title || '', info.parentId, info.url);
      },
      async getTree() {
        return [nodes.get('root')];
      }
    };

    nodes.set('root', { id: 'root', title: '', children: [] });
    const src = makeNode('导入源', 'root');
    makeNode('站点A', src.id, 'https://a.example.com');
    const job = makeNode('工作', src.id);
    makeNode('站点B', job.id, 'https://b.example.com');
    const deep = makeNode('深层', job.id);
    makeNode('站点C', deep.id, 'https://c.example.com');
    const tools = makeNode('工具', src.id);
    makeNode('站点D', tools.id, 'https://d.example.com');

    state.groups.push({ id: 'g_smoke_keep', name: '冒烟-保留目录', items: [] });
    state.groups.push({ id: 'g_smoke_flat', name: '冒烟-仅当前', items: [] });

    doSyncBookmarksToGroup({ sourceId: src.id, groupId: 'g_smoke_keep', keepFolders: true })
      .then(() => {
        const g = groupById('g_smoke_keep');
        const work = g.items.find((it) => it.kind === 'folder' && it.title === '工作');
        const tool = g.items.find((it) => it.kind === 'folder' && it.title === '工具');
        const aRoot = g.items.find((it) => it.kind !== 'folder' && it.url.indexOf('a.example.com') >= 0);
        ok(
          'bm-import-keep',
          !!work && work.items.length === 2 && !!tool && tool.items.length === 1 && !!aRoot
        );
        ok(
          'bm-import-deep-flat',
          !!work && work.items.some((it) => it.url.indexOf('c.example.com') >= 0)
        );
        return doSyncBookmarksToGroup({
          sourceId: src.id,
          groupId: 'g_smoke_flat',
          keepFolders: false
        });
      })
      .then(() => {
        const g = groupById('g_smoke_flat');
        ok(
          'bm-import-flat',
          g.items.length === 1 && g.items[0].url.indexOf('a.example.com') >= 0,
          'items=' + g.items.length
        );
        return doSyncGroupsToBookmarks('root');
      })
      .then(() => {
        const root = nodes.get('root');
        const groupFolder = root.children.find((c) => c.title === '首页');
        const keepFolder = root.children.find((c) => c.title === '冒烟-保留目录');
        const sub = keepFolder && keepFolder.children.find((c) => !c.url && c.title === '工作');
        ok('bm-export-group', !!groupFolder);
        ok('bm-export-sub', !!sub && sub.children.filter((c) => c.url).length === 2);
        done();
      })
      .catch((err) => {
        document.title = 'ERR:' + (err && err.message ? err.message : err);
      });
  } catch (err) {
    document.title = 'ERR:' + (err && err.message ? err.message : err);
  }
}
