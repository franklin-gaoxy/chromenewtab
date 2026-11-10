/* 弹窗通用开关 */

/* ---------------- 弹窗通用 ---------------- */
function openModal(id) {
  $(id).hidden = false;
}

function closeModal(id) {
  $(id).hidden = true;
}

function openSettingsPanel(section) {
  syncSettingsUI();
  openModal('settingsMask');
  if (!section) return;
  setTimeout(() => {
    const target = document.querySelector('.setting-block[data-section="' + section + '"]');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

/* ---------------- 事件绑定 ---------------- */
function bindModalEvents() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  ['linkMask', 'settingsMask', 'widgetMask', 'aiMask'].forEach((id) => {
    const mask = $(id);
    if (!mask) return;
    mask.addEventListener('mousedown', (e) => {
      if (e.target === mask) closeModal(id);
    });
  });
}
