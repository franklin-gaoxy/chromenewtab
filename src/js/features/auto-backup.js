/* 定时备份：每次全量导出，默认写浏览器下载目录，可选自定义目录（File System Access） */

const AUTO_BACKUP_DB_NAME = 'qihang-auto-backup';
const AUTO_BACKUP_DB_STORE = 'handles';
const AUTO_BACKUP_DIR_KEY = 'backup-dir';
const AUTO_BACKUP_CHECK_MS = 60 * 1000;

let autoBackupTimer = 0;
let autoBackupRunning = false;

/* ---------------- 时间工具 ---------------- */
function autoBackupPad(n) {
  return String(n).padStart(2, '0');
}

function autoBackupDateKey(d) {
  return d.getFullYear() + '-' + autoBackupPad(d.getMonth() + 1) + '-' + autoBackupPad(d.getDate());
}

function autoBackupFileName(d) {
  return 'qihang-nav-' + autoBackupDateKey(d) + '.json';
}

/* ---------------- 目录句柄（IndexedDB） ---------------- */
function autoBackupOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTO_BACKUP_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTO_BACKUP_DB_STORE)) {
        db.createObjectStore(AUTO_BACKUP_DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function autoBackupSaveHandle(handle) {
  const db = await autoBackupOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_DB_STORE, 'readwrite');
    tx.objectStore(AUTO_BACKUP_DB_STORE).put(handle, AUTO_BACKUP_DIR_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function autoBackupLoadHandle() {
  const db = await autoBackupOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTO_BACKUP_DB_STORE, 'readonly');
    const req = tx.objectStore(AUTO_BACKUP_DB_STORE).get(AUTO_BACKUP_DIR_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/* ---------------- 是否到点 ---------------- */
function autoBackupDue(now) {
  const s = state.settings;
  if (!s.autoBackupEnabled) return false;

  const parts = String(s.autoBackupTime || '09:00').split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;

  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (now.getTime() < due.getTime()) return false;

  // 当天已执行过就不再执行；错过时间当天只会补一次
  return s.autoBackupLastRun !== autoBackupDateKey(now);
}

/* ---------------- 清理过期备份 ---------------- */
async function autoBackupCleanup(handle, keepDays) {
  const days = Number(keepDays);
  if (!Number.isFinite(days) || days <= 0) return 0;

  let removed = 0;
  const now = Date.now();
  for await (const entry of handle.values()) {
    if (!entry || entry.kind !== 'file') continue;
    const m = /^qihang-nav-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(entry.name);
    if (!m) continue;
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    if (now - t > days * 86400000) {
      try {
        await handle.removeEntry(entry.name);
        removed += 1;
      } catch (e) {
        /* 单个文件删除失败不影响后续 */
      }
    }
  }
  return removed;
}

/* ---------------- 下载目录：写入 / 清理 / 打开 ---------------- */
async function autoBackupDownloadFile(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    return await chrome.downloads.download({
      url,
      filename: 'qihang-backup/' + name,
      conflictAction: 'overwrite',
      saveAs: false
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

async function autoBackupCleanupDownloads(keepDays) {
  const days = Number(keepDays);
  if (!Number.isFinite(days) || days <= 0) return 0;
  if (!IS_EXT || !chrome.downloads) return 0;

  let items = [];
  try {
    items = await chrome.downloads.search({});
  } catch (e) {
    return 0;
  }

  let removed = 0;
  const now = Date.now();
  for (const item of items) {
    const file = String(item.filename || '').replace(/\\/g, '/');
    if (file.indexOf('/qihang-backup/') < 0) continue;

    const m = /qihang-nav-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(file);
    if (!m) continue;

    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    if (now - t <= days * 86400000) continue;

    try {
      await chrome.downloads.removeFile(item.id);
      removed += 1;
    } catch (e) {
      /* 文件可能被手动移动或删除，忽略 */
    }
    try {
      await chrome.downloads.erase({ id: item.id });
    } catch (e) {
      /* 清不掉下载记录也不影响备份本身 */
    }
  }
  return removed;
}

function autoBackupOpenFolder() {
  if (IS_EXT && chrome.downloads && chrome.downloads.showDefaultFolder) {
    chrome.downloads.showDefaultFolder();
    return;
  }
  toast(i18n('settings.openDirFail'));
}

/* ---------------- 执行一次备份 ---------------- */
async function runAutoBackup(manual) {
  if (autoBackupRunning) return false;

  const s = state.settings;
  const now = new Date();
  const name = autoBackupFileName(now);
  const text = JSON.stringify(buildBackupPayload(), null, 2);

  autoBackupRunning = true;
  let where = '';

  try {
    if ((s.autoBackupMode || 'default') === 'custom') {
      const handle = await autoBackupLoadHandle();
      if (!handle) throw new Error(i18n('settings.noDir'));
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error(i18n('settings.dirReauth'));

      const fileHandle = await handle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(text);
      await writable.close();

      await autoBackupCleanup(handle, s.autoBackupKeepDays);
      where = handle.name || i18n('settings.autoBackupCustom');
    } else {
      if (!IS_EXT || !chrome.downloads) throw new Error(i18n('settings.noDownloads'));
      await autoBackupDownloadFile(text, name);
      await autoBackupCleanupDownloads(s.autoBackupKeepDays);
      where = i18n('settings.whereDefault');
    }
  } catch (err) {
    autoBackupRunning = false;
    const msg = err && err.message ? err.message : i18n('settings.autoBackupFailShort');
    syncAutoBackupUI(msg);
    if (manual) toast(i18n('settings.autoBackupFail', { msg }));
    return false;
  }

  autoBackupRunning = false;
  s.autoBackupLastRun = autoBackupDateKey(now);
  save();
  syncAutoBackupUI(i18n('settings.autoBackupDone', { path: where + ' · ' + name }));
  if (manual) toast(i18n('settings.backupDoneManual', { name }));
  return true;
}

/* ---------------- 选择 / 授权目录 ---------------- */
async function autoBackupPickDir() {
  if (!window.showDirectoryPicker) {
    toast(i18n('settings.noPicker'));
    return false;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'qihang-backup' });
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      toast(i18n('settings.pickDirFail'));
      return false;
    }
    await autoBackupSaveHandle(handle);
    state.settings.autoBackupMode = 'custom';
    state.settings.autoBackupDirName = handle.name || i18n('settings.autoBackupCustom');
    save();
    syncAutoBackupUI();
    toast(i18n('settings.dirSet', { name: state.settings.autoBackupDirName }));
    return true;
  } catch (err) {
    if (err && err.name !== 'AbortError') toast(i18n('settings.pickDirErr'));
    return false;
  }
}

/* ---------------- UI 回显 ---------------- */
function syncAutoBackupUI(message) {
  const s = state.settings;
  const enabled = $('autoBackupEnabled');
  if (!enabled) return;

  enabled.checked = !!s.autoBackupEnabled;
  $('autoBackupTime').value = s.autoBackupTime || '09:00';

  const keep = Number(s.autoBackupKeepDays);
  $('autoBackupKeepDays').value = Number.isFinite(keep) && keep >= 0 ? keep : 7;

  document.querySelectorAll('#autoBackupModeChips .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.mode === (s.autoBackupMode || 'default'));
  });

  const isCustom = (s.autoBackupMode || 'default') === 'custom';

  const dirLabel = $('autoBackupDirLabel');
  if (dirLabel) {
    dirLabel.textContent = isCustom
      ? i18n('settings.dirCustom', { name: s.autoBackupDirName || i18n('settings.dirNone') })
      : i18n('settings.autoBackupDirDefault');
  }

  const openBtn = $('autoBackupOpenDir');
  if (openBtn) openBtn.hidden = isCustom;

  const reauthBtn = $('autoBackupReauth');
  if (reauthBtn) reauthBtn.hidden = !isCustom;

  const body = $('autoBackupBody');
  if (body) body.hidden = !s.autoBackupEnabled;

  const status = $('autoBackupStatus');
  if (status) {
    status.textContent = message
      ? message
      : s.autoBackupLastRun
        ? i18n('settings.lastBackup', { time: s.autoBackupLastRun })
        : i18n('settings.autoBackupStatusInit');
  }
}

/* ---------------- 事件绑定 ---------------- */
function bindAutoBackupEvents() {
  const modeChips = $('autoBackupModeChips');
  if (!modeChips) return;

  modeChips.innerHTML = '';
  [
    { key: 'default', label: 'settings.autoBackupDefault' },
    { key: 'custom', label: 'settings.autoBackupCustom' }
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.mode = opt.key;
    btn.dataset.i18n = opt.label;
    btn.textContent = i18n(opt.label);
    btn.addEventListener('click', async () => {
      if (opt.key === 'custom') {
        await autoBackupPickDir();
        return;
      }
      state.settings.autoBackupMode = 'default';
      save();
      syncAutoBackupUI();
    });
    modeChips.appendChild(btn);
  });

  $('autoBackupEnabled').addEventListener('change', (e) => {
    state.settings.autoBackupEnabled = e.target.checked;
    save();
    syncAutoBackupUI();
  });

  $('autoBackupTime').addEventListener('change', (e) => {
    state.settings.autoBackupTime = e.target.value || '09:00';
    save();
    syncAutoBackupUI();
  });

  $('autoBackupKeepDays').addEventListener('change', (e) => {
    const n = Math.min(365, Math.max(0, Math.round(Number(e.target.value)) || 0));
    e.target.value = n;
    state.settings.autoBackupKeepDays = n;
    save();
    syncAutoBackupUI();
  });

  $('autoBackupNow').addEventListener('click', () => runAutoBackup(true));
  $('autoBackupOpenDir').addEventListener('click', autoBackupOpenFolder);
  $('autoBackupReauth').addEventListener('click', () => autoBackupPickDir());

  syncAutoBackupUI();
}

/* ---------------- 启动检查 ---------------- */
function checkAutoBackup() {
  if (!autoBackupDue(new Date())) return;
  runAutoBackup(false);
}

function initAutoBackup() {
  syncAutoBackupUI();
  checkAutoBackup();
  clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(checkAutoBackup, AUTO_BACKUP_CHECK_MS);
  window.addEventListener('focus', checkAutoBackup);
}
