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
    throw new Error('服务器地址格式不正确');
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
  if (!base) throw new Error('请先填写服务器地址');

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
    throw new Error(e.name === 'AbortError' ? '请求超时，请检查服务器地址' : '无法连接服务器，请检查地址与网络');
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('服务器返回的内容不是合法 JSON（HTTP ' + res.status + '）');
  }

  if (!json || json.ok !== true) {
    const info = (json && json.error) || {};
    const err = new Error(info.message || '请求失败（HTTP ' + res.status + '）');
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
      items: g.items.map((it) =>
        it.kind === 'widget'
          ? {
              id: it.id,
              kind: 'widget',
              widget: it.widget,
              title: it.title,
              config: it.config || {}
            }
          : {
              id: it.id,
              title: it.title,
              url: it.url,
              icon: it.icon || ''
            }
      )
    })),
    activeGroupId: state.activeGroupId
  };
}

function applySyncPayload(payload) {
  const groups = payload && Array.isArray(payload.groups) ? payload.groups : [];
  if (!groups.length) {
    toast('服务器上没有可用的分组数据');
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
    const copy = { id: g.id, name: String(g.name || '未命名').slice(0, 20), items: [] };
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

  if (!server) return toast('请填写服务器地址');
  if (!username || !password) return toast('请填写用户名和密码');

  try {
    const granted = await ensureServerPermission(server);
    if (!granted) return toast('未授权访问该服务器地址');
  } catch (e) {
    return toast(e.message);
  }

  syncState.server = server;
  setSyncBusy(true);
  $('syncStatus') && ($('syncStatus').textContent = register ? '正在注册…' : '正在登录…');

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
    toast(register ? '注册成功，已登录' : '登录成功');
  } catch (err) {
    toast(err.message || '登录失败');
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
  toast('已退出登录');
}

async function syncUpload() {
  const payload = buildSyncPayload();
  const size = new Blob([JSON.stringify(payload)]).size;
  if (size > 2 * 1024 * 1024) {
    throw new Error('数据超过 2MB，请先精简自定义图标后再上传');
  }
  const data = await qspRequest('/api/v1/sync', {
    method: 'PUT',
    body: { baseRev: null, payload }
  });
  syncState.rev = data.rev;
  syncState.lastSyncAt = Date.now();
  await persistSync();
  updateSyncUI();
  toast('已上传 ' + payload.groups.length + ' 个分组');
}

async function syncDownload() {
  if (!window.confirm('将用服务器上的数据覆盖本机分组，确定继续？')) return;
  const remote = await qspRequest('/api/v1/sync');
  if (!remote.payload) throw new Error('服务器上还没有备份数据');
  if (applySyncPayload(remote.payload)) {
    syncState.rev = remote.rev;
    syncState.lastSyncAt = Date.now();
    await persistSync();
    updateSyncUI();
    toast('已从服务器恢复');
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
  toast('已合并上传，共 ' + totalItems() + ' 个站点');
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
      toast('服务器数据已被其他设备更新，请先「从服务器恢复」或「智能合并」');
    } else {
      toast(err.message || '同步失败');
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

  $('syncAccount').textContent = syncState.username || '未知用户';
  $('syncServerLabel').textContent =
    (syncState.server || '') + (syncState.rev ? ' · rev ' + syncState.rev : '');
  $('syncStatus').textContent = syncState.lastSyncAt
    ? '上次同步：' + new Date(syncState.lastSyncAt).toLocaleString()
    : '尚未同步';
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
  $('protocolDocLink').addEventListener('click', (e) => {
    e.preventDefault();
    openProtocolDoc();
  });
  $('syncLogin').addEventListener('click', () => doAuth(false));
  $('syncRegister').addEventListener('click', () => doAuth(true));
  $('syncLogout').addEventListener('click', doLogout);
  $('syncUpload').addEventListener('click', () => runSync('正在上传…', syncUpload));
  $('syncDownload').addEventListener('click', () => runSync('正在恢复…', syncDownload));
  $('syncMerge').addEventListener('click', () => runSync('正在合并…', syncMerge));
  $('syncPassInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAuth(false);
  });
  updateSyncUI();
}

