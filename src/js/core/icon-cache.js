/* 站点图标本地缓存（IndexedDB）
   渲染时每次都真的去读一次 IndexedDB，不保留「已读站点」之类的内存缓存；
   页面内存里只保留 Blob 的 objectURL，避免同一张图反复创建地址造成泄漏。
   缓存键是站点域名：同一域名下的不同页面共用一张图标。

   写入来源只有两类，都靠 fetch 拉二进制：
   1. 浏览器本地图标 faviconUrl()（扩展内的 _favicon，等同源地址，不需要任何站点权限）；
   2. 「优先从网络源获取」探测到的高清图标（源站允许跨域时才能写入）。
   fetch 失败、超时、返回非图片或体积过大时直接跳过，不打扰用户。 */

const ICON_CACHE_DB = 'qihang-icon-cache';
const ICON_CACHE_STORE = 'icons';
const ICON_CACHE_MAX_BYTES = 512 * 1024;
const ICON_CACHE_TIMEOUT = 6000;

let iconCacheDBPromise = null;
const iconObjectUrls = new Map(); // host -> objectURL

/* 缓存键：a.b.example.com 与 www.example.com 同属 example.com？不，按精确域名区分，
   因为子域（如 mail.qq.com）常常有自己的图标。 */
function iconCacheKey(rawUrl) {
  return hostOf(rawUrl);
}

function iconCacheOpenDB() {
  if (iconCacheDBPromise) return iconCacheDBPromise;
  iconCacheDBPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb-unavailable'));
      return;
    }
    const req = indexedDB.open(ICON_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ICON_CACHE_STORE)) {
        db.createObjectStore(ICON_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb-open-failed'));
  });
  // 打开失败时清掉缓存的 Promise，下次调用还能再试（例如隐私模式下先失败再恢复）
  iconCacheDBPromise.catch(() => { iconCacheDBPromise = null; });
  return iconCacheDBPromise;
}

function iconCacheRun(mode, fn) {
  return iconCacheOpenDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        let out = null;
        let tx;
        try {
          tx = db.transaction(ICON_CACHE_STORE, mode);
        } catch (e) {
          reject(e);
          return;
        }
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error || new Error('indexeddb-failed'));
        tx.onabort = () => reject(tx.error || new Error('indexeddb-aborted'));
        const req = fn(tx.objectStore(ICON_CACHE_STORE));
        if (req) {
          req.onsuccess = () => {
            out = req.result;
          };
        }
      })
  );
}

/* 读缓存：没有命中返回 null */
function iconCacheGet(rawUrl) {
  const key = iconCacheKey(rawUrl);
  if (!key) return Promise.resolve(null);
  return iconCacheRun('readonly', (os) => os.get(key))
    .then((blob) => (blob && blob.size ? blob : null))
    .catch(() => null);
}

/* 写缓存：成功返回 true */
function iconCachePut(rawUrl, blob) {
  const key = iconCacheKey(rawUrl);
  if (!key || !blob || !blob.size) return Promise.resolve(false);
  return iconCacheRun('readwrite', (os) => os.put(blob, key))
    .then(() => true)
    .catch(() => false);
}

/* 同一张 Blob 只生成一个 objectURL；内容更新时由 iconCacheWarm 主动失效 */
function iconObjectUrlOf(key, blob) {
  const old = iconObjectUrls.get(key);
  if (old) return old;
  try {
    const src = URL.createObjectURL(blob);
    iconObjectUrls.set(key, src);
    return src;
  } catch (e) {
    return '';
  }
}

/* 拉一张图片的二进制：只接受 image/*、体积不超过 512KB，6 秒超时 */
function iconCacheFetchBlob(src) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    let controller = null;
    try {
      controller = typeof AbortController === 'function' ? new AbortController() : null;
    } catch (e) {
      controller = null;
    }
    const timer = setTimeout(() => {
      if (controller) {
        try { controller.abort(); } catch (e) { /* ignore */ }
      }
      finish(null);
    }, ICON_CACHE_TIMEOUT);

    fetch(src, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller ? controller.signal : undefined
    })
      .then((res) => {
        if (!res || !res.ok) return null;
        const type = String(res.headers.get('content-type') || '').toLowerCase();
        if (type && type.indexOf('image/') !== 0) return null;
        return res.blob();
      })
      .then((blob) => {
        clearTimeout(timer);
        if (!blob || !blob.size || blob.size > ICON_CACHE_MAX_BYTES) return finish(null);
        if (blob.type && blob.type.indexOf('image/') !== 0) return finish(null);
        finish(blob);
      })
      .catch(() => {
        clearTimeout(timer);
        finish(null);
      });
  });
}

/* 把某个地址的图标写进缓存，返回可直接给 <img> 用的 objectURL（失败返回空串）
   force = true 用于「优先网络」拿到新图标时覆盖旧缓存 */
async function iconCacheWarm(rawUrl, src, force) {
  const key = iconCacheKey(rawUrl);
  const link = String(src || '');
  if (!key || !/^(https?:|chrome-extension:)/i.test(link)) return '';
  try {
    if (!force) {
      const exists = await iconCacheGet(rawUrl);
      if (exists) return '';
    }
    const blob = await iconCacheFetchBlob(link);
    if (!blob) return '';
    const saved = await iconCachePut(rawUrl, blob);
    if (!saved) return '';
    // 内容变了就丢掉旧地址，下次渲染会按新内容重新生成
    if (force) iconObjectUrls.delete(key);
    return iconObjectUrlOf(key, blob);
  } catch (e) {
    return '';
  }
}

/* 读本地缓存，命中返回 objectURL，未命中返回空串（每次都真的访问 IndexedDB） */
async function iconCacheLoad(rawUrl) {
  const key = iconCacheKey(rawUrl);
  if (!key) return '';
  try {
    const blob = await iconCacheGet(rawUrl);
    if (!blob) return '';
    return iconObjectUrlOf(key, blob);
  } catch (e) {
    return '';
  }
}

/* 打开「本地缓存」开关时批量补一轮：只处理还没缓存的站点（含文件夹内站点） */
async function iconCachePrefetch() {
  const sites = [];
  state.groups.forEach((g) => {
    (g.items || []).forEach((item) => {
      if (item.kind === 'folder') (item.items || []).forEach((site) => sites.push(site));
      else if (!item.kind && item.url) sites.push(item);
    });
  });

  for (const site of sites) {
    if (!iconCacheKey(site.url)) continue;
    const exists = await iconCacheGet(site.url);
    if (exists) continue;
    await iconCacheWarm(site.url, faviconUrl(site.url, 128));
  }
}
