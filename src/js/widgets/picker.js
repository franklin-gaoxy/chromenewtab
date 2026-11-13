/* ============================================================
 * 组件选择弹窗 + 组件磁贴菜单
 * 列表内容完全由 WidgetRegistry 提供，新增组件无需改这里。
 * ============================================================ */

/* 组件名称 / 说明优先取文案字典（widget.<type> / widget.<type>Desc），缺失时用组件自带的 */
function widgetName(def) {
  if (!def) return '';
  const key = 'widget.' + def.type;
  return i18nHas(key) ? i18n(key) : def.name || def.type;
}

function widgetDesc(def) {
  if (!def) return '';
  const key = 'widget.' + def.type + 'Desc';
  return i18nHas(key) ? i18n(key) : def.desc || '';
}

function addWidget(type) {
  const def = WidgetRegistry.get(type);
  const g = currentGroup();
  if (!def || !g) return;

  g.items.push({
    id: uid('i'),
    kind: 'widget',
    widget: def.type,
    title: widgetName(def),
    config: {}
  });

  save();
  ui.page = Math.max(0, Math.floor((g.items.length - 1) / perPage()));
  renderAll();
  toast(i18n('common.added', { name: widgetName(def) }));
}

function ensureWidgetPicker() {
  if ($('widgetMask')) return;

  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'widgetMask';
  mask.hidden = true;
  mask.innerHTML =
    '<div class="modal widget-picker" role="dialog" aria-modal="true" aria-labelledby="widgetPickerTitle">' +
      '<header class="modal-head">' +
        '<h2 id="widgetPickerTitle" data-i18n="widget.pickTitle">添加组件</h2>' +
        '<button class="icon-btn" type="button" data-close="widgetMask" data-i18n-title="common.close" title="关闭">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</header>' +
      '<div class="modal-body">' +
        '<p class="picker-tip" data-i18n="widget.pickerTip">组件会插入当前分组，可拖动排序，右键可重命名或删除。</p>' +
        '<div class="widget-choices" id="widgetChoices"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mask);
  applyI18n(mask);

  const closeBtn = mask.querySelector('[data-close]');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('widgetMask'));
  mask.addEventListener('mousedown', (e) => {
    if (e.target === mask) closeModal('widgetMask');
  });
}

function renderWidgetChoices() {
  const box = $('widgetChoices');
  if (!box) return;
  box.innerHTML = '';

  const defs = WidgetRegistry.all();
  if (!defs.length) {
    box.innerHTML = '<p class="picker-empty">' + esc(i18n('widget.none')) + '</p>';
    return;
  }

  defs.forEach((def) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'widget-choice';
    btn.dataset.type = def.type;

    const span = Math.max(1, def.span || 1);
    btn.innerHTML =
      '<span class="widget-choice-icon">' + (def.icon || ICONS.widget) + '</span>' +
      '<span class="widget-choice-text">' +
        '<span class="widget-choice-name">' + esc(widgetName(def)) + '</span>' +
        '<span class="widget-choice-desc">' + esc(widgetDesc(def)) + '</span>' +
      '</span>' +
      '<span class="widget-choice-span">' +
        esc(span > 1 ? i18n('widget.spanN', { n: span }) : i18n('widget.span1')) +
      '</span>';

    btn.addEventListener('click', () => {
      addWidget(def.type);
      closeModal('widgetMask');
    });
    box.appendChild(btn);
  });
}

function openWidgetPicker() {
  ensureWidgetPicker();
  renderWidgetChoices();
  openModal('widgetMask');
}

function openWidgetMenu(event, groupId, item) {
  const def = WidgetRegistry.get(item.widget);
  const items = [];

  if (def && typeof def.open === 'function') {
    items.push({
      label: i18n('menu.open'),
      icon: ICONS.open,
      run: () => def.open(widgetContext(item, groupId))
    });
    items.push({ sep: true });
  }

  items.push({
    label: i18n('common.rename'),
    icon: ICONS.edit,
    run: () => {
      const name = window.prompt(i18n('widget.renamePrompt'), item.title || widgetName(def));
      if (name === null) return;
      const trimmed = name.trim().slice(0, 20);
      if (!trimmed) return;
      item.title = trimmed;
      save();
      renderAll();
    }
  });

  items.push({
    label: i18n('widget.remove'),
    icon: ICONS.trash,
    danger: true,
    run: () => removeItem(groupId, item.id)
  });

  showMenu(event, items);
}

/* ---------------- 事件绑定 ---------------- */
function bindWidgetEvents() {
  document.addEventListener('keydown', (e) => {
    if ((e.key || '').toLowerCase() !== 'escape') return;
    if (!$('widgetMask') || $('widgetMask').hidden) return;
    closeModal('widgetMask');
  });
}
