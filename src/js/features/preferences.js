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
  document.body.dataset.bmPos = ['top', 'center', 'bottom'].indexOf(s.bmHandlePos) >= 0
    ? s.bmHandlePos
    : 'center';
  applyGridLayout();
}

/* 每行图标数量（3 ~ 8） */
function perRow() {
  const n = Math.round(Number(state.settings.perRow));
  if (!Number.isFinite(n)) return 5;
  return Math.min(8, Math.max(3, n));
}

/* 每页图标总数：固定 3 行 */
function perPage() {
  return perRow() * 3;
}

function applyGridLayout() {
  const grid = $('grid');
  if (!grid) return;
  const alignMap = { center: 'center', left: 'flex-start', right: 'flex-end' };
  grid.style.setProperty('--cols', String(perRow()));
  grid.style.setProperty('--grid-align', alignMap[state.settings.align] || 'center');
}

