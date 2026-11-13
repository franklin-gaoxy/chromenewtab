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
    const panelStyle = getComputedStyle(panel);
    ok(
      'folder-opaque',
      panelStyle.backdropFilter === 'none' || panelStyle.backdropFilter === '',
      'backdrop=' + panelStyle.backdropFilter
    );

    const firstGrid = panel.querySelector('.folder-grid');
    const gridCols = firstGrid
      ? getComputedStyle(firstGrid).gridTemplateColumns.split(' ').length
      : 0;
    ok('folder-cols', gridCols === folderColumns(), 'cols=' + gridCols + ' expect=' + folderColumns());

    // 用 offset* 量，避开入场动画的 transform
    const dx = Math.abs(panel.offsetLeft + panel.offsetWidth / 2 - window.innerWidth / 2);
    const dy = Math.abs(panel.offsetTop + panel.offsetHeight / 2 - window.innerHeight / 2);
    ok('folder-centered', dx < 2 && dy < 2, 'dx=' + Math.round(dx) + ' dy=' + Math.round(dy));

    // 面板内图标尺寸应与主页磁贴一致
    const mainIconEl = document.querySelector('#grid .tile-icon');
    const panelIconEl = panel.querySelector('.f-item-icon');
    ok(
      'folder-icon-size',
      !!mainIconEl &&
        !!panelIconEl &&
        mainIconEl.offsetWidth === panelIconEl.offsetWidth &&
        mainIconEl.offsetHeight === panelIconEl.offsetHeight,
      'main=' + (mainIconEl ? mainIconEl.offsetWidth : 'none') +
        ' panel=' + (panelIconEl ? panelIconEl.offsetWidth : 'none')
    );

    closeFolder();
    ok('folder-close', !!mask && mask.hidden);

    /* ---------------- 默认命名：文件夹 / 文件夹 2 ---------------- */
    ok('folder-name-1', folder.title === '文件夹', folder.title);

    mergeItems(group.id, group.items[2].id, group.id, group.items[1].id);
    const folderList = group.items.filter((it) => it.kind === 'folder');
    ok(
      'folder-name-2',
      folderList.length === 2 && folderList[1].title === '文件夹 2',
      folderList.map((it) => it.title).join(',')
    );

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

        /* ---------------- 大文件夹（120 个图标）展示 ---------------- */
        const sites = [];
        for (let i = 0; i < 120; i += 1) {
          sites.push({
            id: 'i_many_' + i,
            title: '站点' + i,
            url: 'https://s' + i + '.example.com',
            icon: ''
          });
        }
        state.groups.push({
          id: 'g_many',
          name: '大文件夹测试',
          items: [{ id: 'f_many', kind: 'folder', title: '大文件夹', items: sites }]
        });
        const prevActiveGroup = state.activeGroupId;
        state.activeGroupId = 'g_many';
        renderAll();

        const manyTile = document.querySelector('.tile-folder[data-id="f_many"]');
        ok('many-tile', !!manyTile);
        if (manyTile) manyTile.click();

        const manyPanel = document.getElementById('folderPanel');
        const box = manyPanel.getBoundingClientRect();
        ok(
          'many-in-viewport',
          box.top >= 0 &&
            box.bottom <= window.innerHeight + 1 &&
            box.left >= 0 &&
            box.right <= window.innerWidth + 1,
          'top=' + Math.round(box.top) + ' bottom=' + Math.round(box.bottom) + ' vh=' + window.innerHeight
        );

        const manyGrid = manyPanel.querySelector('.folder-grid');
        ok(
          'many-scrollable',
          !!manyGrid && manyGrid.scrollHeight > manyGrid.clientHeight,
          manyGrid ? manyGrid.scrollHeight + '/' + manyGrid.clientHeight : 'no grid'
        );
        ok(
          'many-no-hscroll',
          !!manyGrid && manyGrid.scrollWidth <= manyGrid.clientWidth + 1,
          manyGrid ? manyGrid.scrollWidth + '/' + manyGrid.clientWidth : 'no grid'
        );

        // 重绘（如删掉一项）后滚动位置不应跳回顶部
        if (manyGrid) manyGrid.scrollTop = 200;
        renderAll();
        const keptScroll = document.querySelector('.folder-grid');
        ok('many-scroll-kept', !!keptScroll && keptScroll.scrollTop > 0,
          'scrollTop=' + (keptScroll ? keptScroll.scrollTop : 'none'));

        // 面板内的滚轮不能穿透到底层（翻页 / 切分组）
        const pageBefore = ui.page;
        const groupBefore = state.activeGroupId;
        const wheelEvt = new WheelEvent('wheel', {
          deltaY: 120,
          bubbles: true,
          cancelable: true
        });
        keptScroll.dispatchEvent(wheelEvt);
        ok(
          'folder-wheel-passthrough',
          !wheelEvt.defaultPrevented && ui.page === pageBefore && state.activeGroupId === groupBefore,
          'prevented=' + wheelEvt.defaultPrevented + ' page=' + ui.page + '/' + pageBefore
        );

        // 面板内过滤：站点11 应命中 站点11 + 站点110~119
        const filterInput = manyPanel.querySelector('.folder-filter-input');
        ok('folder-filter-input', !!filterInput);
        if (filterInput) {
          filterInput.value = '站点11';
          filterInput.dispatchEvent(new Event('input'));
          // 模糊匹配带顺序兜底，命中数不精确，只要明显减少即可
          const matched = manyPanel.querySelectorAll('.f-item:not(.f-add)').length;
          ok('folder-filter', matched > 0 && matched < 120, 'matched=' + matched);
          filterInput.value = 'zzzz-no-hit';
          filterInput.dispatchEvent(new Event('input'));
          ok(
            'folder-filter-empty',
            !!manyPanel.querySelector('.folder-empty-tip')
          );
          filterInput.value = '';
          filterInput.dispatchEvent(new Event('input'));
        }

        closeFolder();
        state.groups = state.groups.filter((g) => g.id !== 'g_many');
        state.activeGroupId = prevActiveGroup;
        renderAll();

        /* ---------------- 书签侧边栏：点外部自动收起 ---------------- */
        openBookmarkPanel();
        const bmPanel = document.getElementById('bmPanel');
        ok('bm-open', !!bmPanel && !bmPanel.hidden);

        const pointerDown = (node) =>
          node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        pointerDown(bmPanel);
        ok('bm-keep-inside', !bmPanel.hidden);

        pointerDown(document.getElementById('bmHandle'));
        ok('bm-keep-handle', !bmPanel.hidden);

        pointerDown(document.body);
        ok('bm-autoclose', bmPanel.hidden);

        /* ---------------- 设置区块折叠（默认折叠） ---------------- */
        const autoHeads = document.querySelectorAll('.drawer-body h3.collapse-head');
        ok('settings-collapse-auto', autoHeads.length === 7, 'n=' + autoHeads.length);

        initCollapsibleSections();
        const dataSection = document.querySelector('.setting-block[data-section="data"]');
        const dataHead = dataSection.querySelector('h3.collapse-head');
        ok('settings-collapse-default', dataSection.classList.contains('collapsed'));

        dataHead.click();
        ok(
          'settings-expand',
          !dataSection.classList.contains('collapsed') &&
            state.settings.expandedSections.indexOf('data') >= 0
        );

        dataHead.click();
        ok(
          'settings-collapse',
          dataSection.classList.contains('collapsed') &&
            state.settings.expandedSections.indexOf('data') < 0
        );

        /* ---------------- 界面语言（i18n） ---------------- */
        const zhDeleted = i18n('menu.deleted');
        applyLanguage('en');
        ok(
          'i18n-en',
          i18n('menu.deleted') === 'Deleted' && document.documentElement.lang === 'en',
          i18n('menu.deleted')
        );
        ok(
          'i18n-dom',
          document.getElementById('settingsTitle').textContent === 'Settings',
          document.getElementById('settingsTitle').textContent
        );
        ok(
          'i18n-fallback',
          i18n('__missing_key__') === '__missing_key__',
          i18n('__missing_key__')
        );
        applyLanguage('zh');
        ok(
          'i18n-back',
          i18n('menu.deleted') === zhDeleted && document.documentElement.lang === 'zh-CN',
          i18n('menu.deleted')
        );

        /* ---------------- 定时备份：到期判断 ---------------- */
        const keepEnabled = state.settings.autoBackupEnabled;
        const keepTime = state.settings.autoBackupTime;
        const keepLastRun = state.settings.autoBackupLastRun;

        state.settings.autoBackupEnabled = true;
        state.settings.autoBackupTime = '00:00';
        state.settings.autoBackupLastRun = '';
        ok('auto-backup-due', autoBackupDue(new Date()) === true);

        state.settings.autoBackupLastRun = autoBackupDateKey(new Date());
        ok('auto-backup-once-a-day', autoBackupDue(new Date()) === false);

        state.settings.autoBackupTime = '23:59';
        state.settings.autoBackupLastRun = '';
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        ok('auto-backup-before-time', autoBackupDue(midnight) === false);

        state.settings.autoBackupEnabled = false;
        ok('auto-backup-disabled', autoBackupDue(new Date()) === false);

        state.settings.autoBackupEnabled = keepEnabled;
        state.settings.autoBackupTime = keepTime;
        state.settings.autoBackupLastRun = keepLastRun;

        /* ---------------- 分组拖拽排序 ---------------- */
        const railBaseOrder = state.groups.map((g) => g.id).join(',');
        state.groups.push({ id: 'g_smoke', name: '冒烟分组', items: [] });
        moveGroup('g_smoke', state.groups[0].id, false);
        ok(
          'rail-reorder-first',
          state.groups[0].id === 'g_smoke',
          state.groups.map((g) => g.id).join(',')
        );
        moveGroup('g_smoke', state.groups[state.groups.length - 1].id, true);
        ok(
          'rail-reorder-last',
          state.groups[state.groups.length - 1].id === 'g_smoke',
          state.groups.map((g) => g.id).join(',')
        );
        state.groups = state.groups.filter((g) => g.id !== 'g_smoke');
        save();
        renderAll();
        ok(
          'rail-reorder-restore',
          state.groups.map((g) => g.id).join(',') === railBaseOrder,
          state.groups.map((g) => g.id).join(',')
        );

        /* ---------------- 图标节点复用（切分组不重新请求） ---------------- */
        const iconSvg =
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
          '<rect width="32" height="32" fill="#09f"/></svg>';
        const iconItem = {
          id: 'i_icon',
          url: 'https://example.com',
          title: 'Icon',
          icon: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg)
        };
        const iconBoxA = document.createElement('div');
        const iconBoxB = document.createElement('div');
        paintIcon(iconBoxA, iconItem);
        const iconImgA = iconBoxA.querySelector('img');
        paintIcon(iconBoxB, iconItem);
        const iconImgB = iconBoxB.querySelector('img');
        ok(
          'icon-img-reuse',
          !!iconImgA && iconImgA === iconImgB,
          iconImgA === iconImgB ? 'same-node' : 'rebuilt'
        );

        /* ---------------- 高清图标开关：默认关闭、不覆盖已有地址 ---------------- */
        ok('icon-auto-off-default', state.settings.iconAutoFetch === false);

        const plainItem = { id: 'i_plain', url: 'https://example.com', title: 'Plain' };
        paintIcon(document.createElement('div'), plainItem);
        ok('icon-auto-off-no-write', !plainItem.icon, String(plainItem.icon));

        const keepIconAuto = state.settings.iconAutoFetch;
        state.settings.iconAutoFetch = true;
        let iconAutoSafe = true;
        try {
          paintIcon(document.createElement('div'), {
            id: 'i_auto',
            url: 'https://example.com',
            title: 'Auto'
          });
        } catch (e) {
          iconAutoSafe = false;
        }
        state.settings.iconAutoFetch = keepIconAuto;
        ok('icon-auto-on-safe', iconAutoSafe);

        /* ---------------- 图标候选来源数量 ---------------- */
        const candList = iconCandidateList('https://mail.qq.com/');
        ok('icon-candidates-many', candList.length >= 14, 'n=' + candList.length);

        done();
      })
      .catch((err) => {
        document.title = 'ERR:' + (err && err.message ? err.message : err);
      });
  } catch (err) {
    document.title = 'ERR:' + (err && err.message ? err.message : err);
  }
}
