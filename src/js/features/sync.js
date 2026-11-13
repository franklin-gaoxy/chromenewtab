/* 远程同步（QSP v1） */

/* ============================================================
 * 远程同步（Qihang Sync Protocol v1）
 * 协议规范见 doc/PROTOCOL.md
 * ============================================================ */

function normalizeServer(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}

async function ensureServerPermission(server) {
  if (!IS_EXT || !chrome.permissions) return true;
  let origin = '';
  try {
    origin = new URL(server).origin + '/*';
  } catch (e) {
    throw new Error(i18n('sync.badServer'));
  }
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch (e) {
    return false;
  }
}

async function qspRequest(pathname, options) {
  const opts = options || {};
  const base = normalizeServer(syncState.server);
  if (!base) throw new Error(i18n('sync.noServer'));

  const headers = {
    'Content-Type': 'application/json',
    'X-QSP-Version': QSP_VERSION
  };
  if (syncState.token) headers.Authorization = 'Bearer ' + syncState.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(base + pathname, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      cache: 'no-store'
    });
  } catch (e) {
    throw new Error(
      e.name === 'AbortError' ? i18n('sync.timeout') : i18n('sync.network')
    );
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(i18n('sync.badJson', { status: res.status }));
  }

  if (!json || json.ok !== true) {
    const info = (json && json.error) || {};
    const err = new Error(info.message || i18n('sync.httpFail', { status: res.status }));
    err.code = info.code || 'SERVER_ERROR';
    err.status = res.status;
    throw err;
  }
  return json.data;
}

function buildSyncPayload() {
  return {
    schema: 1,
    groups: state.groups.map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((it) => {
        if (it.kind === 'widget') {
          return {
            id: it.id,
            kind: 'widget',
            widget: it.widget,
            title: it.title,
            config: it.config || {}
          };
        }
        if (it.kind === 'folder') {
          return {
            id: it.id,
            kind: 'folder',
            title: it.title,
            items: it.items.map((site) => ({
              id: site.id,
              title: site.title,
              url: site.url,
              icon: site.icon || ''
            }))
          };
        }
        return {
          id: it.id,
          title: it.title,
          url: it.url,
          icon: it.icon || ''
        };
      })
    })),
    activeGroupId: state.activeGroupId
  };
}

function applySyncPayload(payload) {
  const groups = payload && Array.isArray(payload.groups) ? payload.groups : [];
  if (!groups.length) {
    toast(i18n('sync.noRemoteData'));
    return false;
  }
  const normalized = normalizeData({
    groups,
    activeGroupId: (payload && payload.activeGroupId) || '',
    settings: state.settings
  });
  state.groups = normalized.groups;
  state.activeGroupId = normalized.activeGroupId;
  ui.page = 0;
  save();
  renderAll();
  return true;
}

/* 合并策略：分组按 id 合并，条目按 id + url 去重，本地顺序优先 */
function mergeGroups(localGroups, remoteGroups) {
  const result = [];
  const index = new Map();

  const push = (g) => {
    if (!g || !g.id || index.has(g.id)) return index.get(g.id);
    const copy = { id: g.id, name: String(g.name || i18n('common.unnamed')).slice(0, 20), items: [] };
    index.set(g.id, copy);
    result.push(copy);
    return copy;
  };

  (localGroups || []).forEach(push);
  (remoteGroups || []).forEach(push);

  const fill = (groups) => {
    (groups || []).forEach((g) => {
      const target = index.get(g.id);
      if (!target) return;
      const urls = new Set(target.items.map((it) => it.url));
      (g.items || []).forEach((it) => {
        if (!it) return;
        if (it.id && target.items.some((x) => x.id === it.id)) return;

        if (it.kind === 'widget' && it.widget) {
          target.items.push({
            id: it.id || uid('i'),
            kind: 'widget',
            widget: it.widget,
            title: String(it.title || it.widget).slice(0, 40),
            config: it.config && typeof it.config === 'object' ? it.config : {}
          });
          return;
        }

        if (it.kind === 'folder') {
          const inner = (Array.isArray(it.items) ? it.items : [])
            .filter((site) => site && site.url)
            .map((site) => ({
              id: site.id || uid('i'),
              title: String(site.title || suggestTitle(site.url)).slice(0, 40),
              url: site.url,
              icon: site.icon || ''
            }));
          if (!inner.length) return;
          target.items.push({
            id: it.id || uid('f'),
            kind: 'folder',
            title: String(it.title || i18n('folder.newName')).slice(0, 20),
            items: inner
          });
          return;
        }

        if (!it.url) return;
        if (urls.has(it.url)) return;
        urls.add(it.url);
        target.items.push({
          id: it.id || uid('i'),
          title: String(it.title || suggestTitle(it.url)).slice(0, 40),
          url: it.url,
          icon: it.icon || ''
        });
      });
    });
  };

  fill(localGroups);
  fill(remoteGroups);
  return result;
}

async function persistSync() {
  await store.set(SYNC_KEY, {
    server: syncState.server,
    token: syncState.token,
    username: syncState.username,
    userId: syncState.userId,
    lastSyncAt: syncState.lastSyncAt,
    rev: syncState.rev
  });
}

async function doAuth(register) {
  const server = normalizeServer($('syncServer').value);
  const username = $('syncUserInput').value.trim();
  const password = $('syncPassInput').value;

  if (!server) return toast(i18n('sync.noServer'));
  if (!username || !password) return toast(i18n('sync.needCredentials'));

  try {
    const granted = await ensureServerPermission(server);
    if (!granted) return toast(i18n('sync.noPermission'));
  } catch (e) {
    return toast(e.message);
  }

  syncState.server = server;
  setSyncBusy(true);
  $('syncStatus') &&
    ($('syncStatus').textContent = register ? i18n('sync.registering') : i18n('sync.loggingIn'));

  try {
    const data = await qspRequest(
      register ? '/api/v1/auth/register' : '/api/v1/auth/login',
      { method: 'POST', body: { username, password } }
    );
    syncState.token = data.token;
    syncState.userId = (data.user && data.user.id) || '';
    syncState.username = (data.user && data.user.username) || username;
    syncState.rev = (data.user && data.user.rev) || 0;
    $('syncPassInput').value = '';
    await persistSync();
    updateSyncUI();
    toast(register ? i18n('settings.syncRegisterDone') : i18n('settings.syncLoginDone'));
  } catch (err) {
    toast(err.message || i18n('sync.loginFailed'));
    updateSyncUI();
  } finally {
    setSyncBusy(false);
  }
}

async function doLogout() {
  if (syncState.token) {
    try {
      await qspRequest('/api/v1/auth/logout', { method: 'POST' });
    } catch (e) {
      /* 退出失败也清除本地凭证 */
    }
  }
  syncState.token = '';
  syncState.userId = '';
  syncState.username = '';
  syncState.rev = 0;
  syncState.lastSyncAt = 0;
  await persistSync();
  updateSyncUI();
  toast(i18n('settings.syncLogoutDone'));
}

async function syncUpload() {
  const payload = buildSyncPayload();
  const size = new Blob([JSON.stringify(payload)]).size;
  if (size > 2 * 1024 * 1024) {
    throw new Error(i18n('sync.tooLarge'));
  }
  const data = await qspRequest('/api/v1/sync', {
    method: 'PUT',
    body: { baseRev: null, payload }
  });
  syncState.rev = data.rev;
  syncState.lastSyncAt = Date.now();
  await persistSync();
  updateSyncUI();
  toast(i18n('sync.uploaded', { n: payload.groups.length }));
}

async function syncDownload() {
  if (!window.confirm(i18n('sync.downloadConfirm'))) return;
  const remote = await qspRequest('/api/v1/sync');
  if (!remote.payload) throw new Error(i18n('sync.emptyRemote'));
  if (applySyncPayload(remote.payload)) {
    syncState.rev = remote.rev;
    syncState.lastSyncAt = Date.now();
    await persistSync();
    updateSyncUI();
    toast(i18n('settings.syncDownloadDone'));
  }
}

async function syncMerge() {
  const remote = await qspRequest('/api/v1/sync');
  if (!remote.payload || !Array.isArray(remote.payload.groups)) {
    return syncUpload();
  }
  const merged = mergeGroups(state.groups, remote.payload.groups);
  const payload = { schema: 1, groups: merged, activeGroupId: state.activeGroupId };
  const data = await qspRequest('/api/v1/sync', {
    method: 'PUT',
    body: { baseRev: remote.rev, payload }
  });
  applySyncPayload(payload);
  syncState.rev = data.rev;
  syncState.lastSyncAt = Date.now();
  await persistSync();
  updateSyncUI();
  toast(i18n('sync.merged', { n: totalItems() }));
}

function setSyncBusy(busy) {
  ['syncLogin', 'syncRegister', 'syncUpload', 'syncDownload', 'syncMerge', 'syncLogout'].forEach(
    (id) => {
      const node = $(id);
      if (node) node.disabled = busy;
    }
  );
}

async function runSync(label, task) {
  const status = $('syncStatus');
  const previous = status ? status.textContent : '';
  setSyncBusy(true);
  if (status) status.textContent = label;
  try {
    await task();
  } catch (err) {
    if (err.code === 'CONFLICT') {
      toast(i18n('sync.conflict'));
    } else {
      toast(err.message || i18n('sync.failed'));
    }
    if (status) status.textContent = previous;
  } finally {
    setSyncBusy(false);
  }
}

function updateSyncUI() {
  const logged = !!syncState.token;
  const guest = $('syncGuest');
  const box = $('syncUserBox');
  if (!guest || !box) return;

  guest.hidden = logged;
  box.hidden = !logged;

  const input = $('syncServer');
  if (input && document.activeElement !== input) {
    input.value = syncState.server || 'http://localhost:8787';
  }
  if (!logged) return;

  $('syncAccount').textContent = syncState.username || i18n('sync.unknownUser');
  $('syncServerLabel').textContent =
    (syncState.server || '') + (syncState.rev ? ' · rev ' + syncState.rev : '');
  $('syncStatus').textContent = syncState.lastSyncAt
    ? i18n('sync.lastSyncAt', { time: new Date(syncState.lastSyncAt).toLocaleString() })
    : i18n('settings.syncStatusInit');
}

/* 打开 QSP 协议文档（扩展内以纯文本形式展示，避免 .md 被直接下载） */
async function openProtocolDoc() {
  const path = 'doc/PROTOCOL.md';
  const extUrl = IS_EXT && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL(path)
    : path;
  try {
    const res = await fetch(extUrl);
    if (!res.ok) throw new Error('load failed');
    const text = await res.text();
    const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    window.open(blobUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 300000);
  } catch (e) {
    window.open(extUrl, '_blank', 'noopener');
  }
}

function bindSyncEvents() {
  // 协议文档链接由 data-i18n-html 渲染，语言切换会重建节点，因此用事件委托
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('#protocolDocLink');
    if (!link) return;
    e.preventDefault();
    openProtocolDoc();
  });
  $('syncLogin').addEventListener('click', () => doAuth(false));
  $('syncRegister').addEventListener('click', () => doAuth(true));
  $('syncLogout').addEventListener('click', doLogout);
  $('syncUpload').addEventListener('click', () => runSync(i18n('sync.busyUpload'), syncUpload));
  $('syncDownload').addEventListener('click', () => runSync(i18n('sync.busyDownload'), syncDownload));
  $('syncMerge').addEventListener('click', () => runSync(i18n('sync.busyMerge'), syncMerge));
  $('syncPassInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAuth(false);
  });
  updateSyncUI();
}

