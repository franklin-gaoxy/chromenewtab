/* 主题与布局偏好（背景、列数、对齐） */

/* ---------------- 主题与设置渲染 ---------------- */
function backgroundImageFor(settings) {
  if (settings.theme === 'custom' && settings.customBg) {
    return 'url("' + String(settings.customBg).replace(/"/g, '%22') + '")';
  }
  const preset = THEMES.find((t) => t.key === settings.theme);
  return (preset || THEMES[0]).style;
}

function applySettings() {
  const s = state.settings;
  const layer = $('bgImage');
  if (layer) {
    layer.style.backgroundImage = backgroundImageFor(s);
    layer.dataset.source = s.theme;
  }
  document.body.dataset.bg = s.theme;
  document.body.classList.toggle('no-labels', !s.showLabels);
  document.body.dataset.iconFrame = s.iconFrame === false ? 'off' : 'on';
  document.body.dataset.bmPos = ['top', 'center', 'bottom'].indexOf(s.bmHandlePos) >= 0
    ? s.bmHandlePos
    : 'center';
  applyGridLayout();
}

/* 每行图标数量（3 ~ 8） */
function perRow() {
  const n = Math.round(Number(state.settings.perRow));
  if (!Number.isFinite(n)) return 8;
  return Math.min(8, Math.max(3, n));
}

/* 每页图标总数：固定 3 行 */
function perPage() {
  return perRow() * 3;
}

/* 图标边长（40 ~ 88 px） */
function iconSize() {
  const n = Math.round(Number(state.settings.iconSize));
  if (!Number.isFinite(n)) return 60;
  return Math.min(88, Math.max(40, n));
}

/* 磁贴名称字号（10 ~ 18 px） */
function labelSize() {
  const n = Number(state.settings.labelSize);
  if (!Number.isFinite(n)) return 12.5;
  return Math.min(18, Math.max(10, n));
}

function applyGridLayout() {
  const grid = $('grid');
  if (!grid) return;
  const alignMap = { center: 'center', left: 'flex-start', right: 'flex-end' };
  grid.style.setProperty('--cols', String(perRow()));
  grid.style.setProperty('--grid-align', alignMap[state.settings.align] || 'center');

  // 尺寸变量写在 body 上：默认值不写，保留 responsive.css 断点的自动收缩
  const size = iconSize();
  const label = labelSize();
  const vars = document.body.style;
  const sizeVars = ['--tile-icon-size', '--tile-icon-radius', '--tile-icon-img', '--tile-icon-letter', '--tile-col-width'];
  if (size === 60) {
    sizeVars.forEach((k) => vars.removeProperty(k));
  } else {
    vars.setProperty('--tile-icon-size', size + 'px');
    vars.setProperty('--tile-icon-radius', Math.round(size * 0.3) + 'px');
    vars.setProperty('--tile-icon-img', Math.round(size * 0.57) + 'px');
    vars.setProperty('--tile-icon-letter', Math.round(size * 0.42) + 'px');
    vars.setProperty('--tile-col-width', Math.round(size + 52) + 'px');
  }
  if (label === 12.5) vars.removeProperty('--tile-name-size');
  else vars.setProperty('--tile-name-size', label + 'px');
}

