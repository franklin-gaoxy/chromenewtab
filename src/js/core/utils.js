/* 通用工具：DOM 取值、轻提示、剪贴板、打开链接、下载 */

const $ = (id) => document.getElementById(id);

/* ---------------- 提示 ---------------- */
let toastTimer = 0;
function toast(msg) {
  const node = $('toast');
  node.textContent = msg;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => { node.hidden = true; }, 240);
  }, 1800);
}

function copyText(text) {
  const done = () => toast(i18n('common.copied'));
  const fail = () => toast(i18n('common.copyFailed'));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
    return;
  }
  fail();
}

function openUrl(url) {
  const abs = normalizeUrl(url);
  if (!abs) {
    toast(i18n('common.badUrl'));
    return;
  }
  if (state.settings.openInNewTab) window.open(abs, '_blank', 'noopener');
  else window.location.href = abs;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

