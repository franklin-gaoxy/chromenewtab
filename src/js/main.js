/* ============================================================
 * 入口：初始化数据 + 串联各功能模块的事件绑定
 * 拆分的模块见 js/core、js/features、js/widgets
 * ============================================================ */

function bindEvents() {
  bindRailEvents();
  bindSearchEvents();
  bindGridEvents();
  bindMenuEvents();
  bindModalEvents();
  bindLinkEvents();
  bindSettingsEvents();
  bindBackupEvents();
  bindSyncEvents();
  bindWidgetEvents();
  bindBookmarkEvents();
  bindGlobalShortcuts();
}

function bindGlobalShortcuts() {
  // 鼠标滚轮：先滚动当前页面 → 到边界后翻页 → 翻不动再切换分组（首尾循环）
  let wheelTimer = 0;
  let wheelLocked = false;

  const lockWheel = () => {
    wheelLocked = true;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelLocked = false;
    }, 420);
  };

  document.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      const target = e.target;
      if (target && target.closest &&
          target.closest('.rail, .drawer-mask, .mask, .menu, .bm-panel, .bm-handle')) return;

      // 搜索状态下完全交给浏览器，不拦截、不切分组
      if (ui.query) return;

      const stage = document.querySelector('.stage');
      if (!stage) return;

      const down = e.deltaY > 0;
      const canScroll = stage.scrollHeight > stage.clientHeight + 4;
      const atTop = stage.scrollTop <= 0;
      const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 4;

      // 页面还能继续滚：交给原生滚动
      if (canScroll && ((down && !atBottom) || (!down && !atTop))) return;

      e.preventDefault();
      if (wheelLocked) return;

      // 1) 当前分组还有下一页 / 上一页
      const nextPage = down ? ui.page + 1 : ui.page - 1;
      if (nextPage >= 0 && nextPage < ui.pages) {
        ui.page = nextPage;
        renderGrid();
        lockWheel();
        return;
      }

      // 2) 切换分组：最后一个 ↓ 回到第一个，第一个 ↑ 回到最后一个
      const groups = state.groups;
      if (groups.length < 2) return;
      const idx = groups.findIndex((g) => g.id === state.activeGroupId);
      const nextIdx = down ? (idx + 1) % groups.length : (idx - 1 + groups.length) % groups.length;
      if (nextIdx === idx) return;

      selectGroup(groups[nextIdx].id);
      lockWheel();

      // 向下切换后停在顶部，向上切换后停在底部，避免连续触发
      requestAnimationFrame(() => {
        stage.scrollTop = down ? 0 : stage.scrollHeight;
      });
    },
    { passive: false }
  );

  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();

    if (key === 'escape') {
      if (!$('linkMask').hidden) return closeModal('linkMask');
      if (!$('settingsMask').hidden) return closeModal('settingsMask');
      if ($('widgetMask') && !$('widgetMask').hidden) return closeModal('widgetMask');
      if ($('aiMask') && !$('aiMask').hidden) return closeModal('aiMask');
      if ($('bmPanel') && !$('bmPanel').hidden) return closeBookmarkPanel();
      if (!$('itemMenu').hidden) return hideMenu();
      if ($('searchInput').value) {
        $('searchInput').value = '';
        ui.query = '';
        ui.page = 0;
        $('clearBtn').hidden = true;
        renderGrid();
      }
      return;
    }

    const meta = e.ctrlKey || e.metaKey;
    if (meta && key === 'k') {
      e.preventDefault();
      $('searchInput').focus();
      $('searchInput').select();
    } else if (e.altKey && key === 'n') {
      e.preventDefault();
      openLinkModal({ groupId: currentGroup().id });
    }
  });
}

/* ---------------- 启动 ---------------- */
async function init() {
  let raw = null;
  try {
    raw = await store.get(STORE_KEY);
  } catch (e) {
    raw = null;
  }

  state = normalizeData(raw || defaultData());
  if (!raw) {
    store.set(STORE_KEY, {
      groups: state.groups,
      activeGroupId: state.activeGroupId,
      settings: state.settings
    });
  }

  try {
    syncState = Object.assign(syncState, (await store.get(SYNC_KEY)) || {});
  } catch (e) {
    /* ignore */
  }

  applySettings();
  buildSettingsPanel();
  renderAll();
  bindEvents();
}

init();
