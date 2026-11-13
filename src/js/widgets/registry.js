/* ============================================================
 * 组件注册表
 *
 * 新增一个组件只需要：
 *   1. 在 js/widgets/ 下新建文件（复杂组件可以建子目录）；
 *   2. 调用 WidgetRegistry.register({ ... }) 注册；
 *   3. 在 newtab.html 里按顺序引入脚本。
 * 其余（添加组件弹窗、磁贴渲染、拖拽、删除菜单）都会自动支持。
 *
 * 组件定义字段：
 *   type           唯一标识，写进数据的 item.widget
 *   name           显示名称
 *   desc           一句话说明（添加组件弹窗中展示）
 *   icon           内联 SVG 字符串
 *   span           占用网格列数，默认 1
 *   mount(el, ctx) 渲染磁贴内容
 *                  ctx = { item, groupId, save, refresh, onDispose }
 *   open(ctx, e)   可选；点击磁贴时触发（不设置则不会响应点击）
 * ============================================================ */

const WidgetRegistry = (() => {
  const defs = new Map();
  const disposers = new Set();

  function register(def) {
    if (!def || !def.type) throw new Error('组件定义缺少 type');
    const normalized = Object.assign(
      { name: def.type, desc: '', icon: '', span: 1, mount: null, open: null },
      def
    );
    defs.set(normalized.type, normalized);
    return normalized;
  }

  const get = (type) => defs.get(type) || null;
  const all = () => Array.from(defs.values());

  function addDisposer(fn) {
    if (typeof fn === 'function') disposers.add(fn);
  }

  /* 网格重绘前调用，释放组件内部的定时器 / 监听 */
  function cleanup() {
    disposers.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[widget] dispose failed', e);
      }
    });
    disposers.clear();
  }

  return { register, get, all, addDisposer, cleanup };
})();

/* 组件渲染 / 交互上下文 */
function widgetContext(item, groupId) {
  return {
    item,
    groupId,
    save,
    refresh: renderAll,
    onDispose: WidgetRegistry.addDisposer
  };
}

/* 组件磁贴：由 grid 渲染时调用 */
function createWidgetTile(item, groupId, searching, index) {
  const def = WidgetRegistry.get(item.widget);
  const tile = document.createElement('div');
  tile.className = 'tile widget-tile';
  tile.dataset.id = item.id;
  tile.dataset.group = groupId;
  tile.dataset.widget = item.widget;
  tile.style.animationDelay = Math.min(index * 16, 220) + 'ms';

  const span = Math.max(1, (def && def.span) || 1);
  if (span > 1) tile.style.gridColumn = 'span ' + span;

  const ctx = widgetContext(item, groupId);

  if (def && typeof def.mount === 'function') {
    try {
      def.mount(tile, ctx);
    } catch (e) {
      console.error('[widget] mount failed:', item.widget, e);
      tile.innerHTML =
        '<div class="tile-icon">!</div><div class="tile-name">' +
        esc(i18n('widget.error')) +
        '</div>';
    }
  } else {
    tile.innerHTML =
      '<div class="tile-icon">?</div><div class="tile-name">' +
      esc(i18n('widget.unknown')) +
      '</div>';
  }

  attachTileDrag(tile, item, groupId, searching);

  tile.addEventListener('click', (e) => {
    if (e.target.closest('.tile-more')) return;
    if (def && typeof def.open === 'function') {
      e.preventDefault();
      def.open(ctx, e);
    }
  });

  if (!searching) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tile-more';
    more.title = i18n('common.more');
    more.innerHTML = ICONS.more;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      openWidgetMenu(e, groupId, item);
    });
    tile.appendChild(more);
  }

  return tile;
}
