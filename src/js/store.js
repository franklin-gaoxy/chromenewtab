'use strict';

/* ============================================================
 * 启航 · 新标签页导航（数据层）
 * ============================================================ */

const STORE_KEY = 'qihang-nav-v1';
const SYNC_KEY = 'qihang-sync-v1';
const PER_PAGE = 15;
const QSP_VERSION = '1';

const IS_EXT =
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  typeof chrome.runtime.getURL === 'function' &&
  !!chrome.runtime.id;

/* ---------------- 搜索引擎 ---------------- */
const ENGINES = {
  bing: {
    label: 'Bing',
    badge: 'B',
    urls: {
      web: 'https://www.bing.com/search?q={q}',
      images: 'https://www.bing.com/images/search?q={q}',
      news: 'https://www.bing.com/news/search?q={q}',
      videos: 'https://www.bing.com/videos/search?q={q}',
      maps: 'https://www.bing.com/maps?q={q}'
    }
  },
  google: {
    label: 'Google',
    badge: 'G',
    urls: {
      web: 'https://www.google.com/search?q={q}',
      images: 'https://www.google.com/search?tbm=isch&q={q}',
      news: 'https://www.google.com/search?tbm=nws&q={q}',
      videos: 'https://www.google.com/search?tbm=vid&q={q}',
      maps: 'https://www.google.com/maps/search/{q}'
    }
  },
  baidu: {
    label: '百度',
    badge: '百',
    urls: {
      web: 'https://www.baidu.com/s?wd={q}',
      images: 'https://image.baidu.com/search/index?tn=baiduimage&word={q}',
      news: 'https://www.baidu.com/s?rtt=1&bsst=1&cl=2&tn=news&word={q}',
      videos: 'https://www.baidu.com/sf/vsearch?pd=video&wd={q}',
      maps: 'https://map.baidu.com/search/{q}'
    }
  },
  ddg: {
    label: 'DuckDuckGo',
    badge: 'D',
    urls: {
      web: 'https://duckduckgo.com/?q={q}',
      images: 'https://duckduckgo.com/?q={q}&iax=images&ia=images',
      news: 'https://duckduckgo.com/?q={q}&iar=news&ia=news',
      videos: 'https://duckduckgo.com/?q={q}&iax=videos&ia=videos',
      maps: 'https://duckduckgo.com/?q={q}&iaxm=maps&ia=web'
    }
  }
};

const CATS = [
  { key: 'web', label: '网页' },
  { key: 'images', label: '图片' },
  { key: 'news', label: '新闻' },
  { key: 'videos', label: '视频' },
  { key: 'maps', label: '地图' }
];

/**
 * 内置背景预设。
 * 想新增背景：把图片放进 src/assets/，在下面加一行即可（style 写 background-image 的值，路径相对 newtab.html）。
 * 路径相对于 newtab.html。
 */
const THEMES = [
  {
    key: 'forest',
    label: '雾林',
    style: 'url("assets/bg-forest.webp")'
  },
  {
    key: 'ink',
    label: '矢量雾林',
    style: 'url("assets/bg-forest.svg")'
  },
  {
    key: 'midnight',
    label: '午夜',
    style:
      'radial-gradient(120% 90% at 20% 0%, #1d3a5c 0%, #0d1c2e 45%, #050a12 100%),' +
      'radial-gradient(80% 60% at 85% 85%, rgba(87, 148, 214, 0.32), transparent 70%)'
  },
  {
    key: 'dusk',
    label: '暮光',
    style:
      'linear-gradient(200deg, #f2a07a 0%, #c76a76 32%, #6b4a78 62%, #221930 100%),' +
      'radial-gradient(90% 70% at 80% 10%, rgba(255, 214, 168, 0.55), transparent 65%)'
  },
  {
    key: 'celadon',
    label: '青瓷',
    style:
      'radial-gradient(90% 80% at 15% 15%, #7fb49b 0%, #3d6d5b 40%, #1a2c26 100%),' +
      'radial-gradient(70% 60% at 90% 90%, rgba(180, 232, 205, 0.28), transparent 70%)'
  }
];

const DEFAULT_SETTINGS = {
  engine: 'bing',
  cat: 'web',
  theme: 'forest',
  customBg: '',
  openInNewTab: true,
  showLabels: true,
  perRow: 5,          // 每行图标数量（3 ~ 8）
  align: 'center',    // 网格对齐：center | left | right
  bmWidth: 340,       // 书签侧边栏宽度
  bmHandlePos: 'center' // 书签按钮在屏幕高度的位置：top | center | bottom
};

/* ---------------- 工具函数 ---------------- */
function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return '';
    return u.href;
  } catch (e) {
    return '';
  }
}

function hostOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function suggestTitle(url) {
  const host = hostOf(url);
  if (!host) return '未命名';
  const first = host.split('.')[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function firstChar(str) {
  const s = String(str || '').trim();
  return s ? Array.from(s)[0].toUpperCase() : '?';
}

function hashHue(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

/* 站点图标：扩展环境走 Chrome 内置 favicon 服务，其它环境走公共接口 */
function faviconUrl(rawUrl, size) {
  const url = normalizeUrl(rawUrl);
  if (!url) return '';
  const px = size || 64;
  if (IS_EXT) {
    return chrome.runtime.getURL('_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=' + px);
  }
  try {
    return 'https://icons.duckduckgo.com/ip3/' + new URL(url).hostname + '.ico';
  } catch (e) {
    return '';
  }
}

function buildSearchUrl(keyword, engineKey, catKey) {
  const engine = ENGINES[engineKey] || ENGINES.bing;
  const tpl = engine.urls[catKey] || engine.urls.web;
  return tpl.replace('{q}', encodeURIComponent(keyword));
}

/* ---------------- 默认数据 ---------------- */
function defaultData() {
  const home = [
    { title: '百度', url: 'https://www.baidu.com' },
    { title: '哔哩哔哩', url: 'https://www.bilibili.com' },
    { title: '知乎', url: 'https://www.zhihu.com' },
    { title: '微博', url: 'https://weibo.com' },
    { title: 'GitHub', url: 'https://github.com' },
    { title: '掘金', url: 'https://juejin.cn' },
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: '淘宝', url: 'https://www.taobao.com' },
    { title: 'MDN', url: 'https://developer.mozilla.org' },
    { title: '语雀', url: 'https://www.yuque.com' },
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: '豆包', url: 'https://www.doubao.com' }
  ];
  return {
    groups: [
      {
        id: uid('g'),
        name: '首页',
        items: home.map((it) => ({ id: uid('i'), title: it.title, url: it.url, icon: '' }))
      }
    ],
    activeGroupId: '',
    settings: { ...DEFAULT_SETTINGS }
  };
}

/* 网站条目归一化 */
function normalizeSite(it) {
  return {
    id: it.id || uid('i'),
    title: String(it.title || suggestTitle(it.url)).slice(0, 40),
    url: normalizeUrl(it.url),
    icon: typeof it.icon === 'string' ? it.icon : ''
  };
}

/* 单个条目归一化：网站 / 组件 / 文件夹（文件夹只允许一层，内部只能是网站） */
function normalizeItem(it) {
  if (!it || typeof it !== 'object') return null;

  // 组件条目：没有 url，靠 widget 字段区分
  if (it.kind === 'widget') {
    if (!it.widget) return null;
    return {
      id: it.id || uid('i'),
      kind: 'widget',
      widget: String(it.widget),
      title: String(it.title || it.widget).slice(0, 40),
      config: it.config && typeof it.config === 'object' ? it.config : {}
    };
  }

  if (it.kind === 'folder') {
    const inner = (Array.isArray(it.items) ? it.items : [])
      .filter(
        (sub) =>
          sub &&
          typeof sub === 'object' &&
          sub.kind !== 'widget' &&
          sub.kind !== 'folder' && // 只保留一层：丢弃嵌套文件夹
          normalizeUrl(sub.url)
      )
      .map(normalizeSite);
    return {
      id: it.id || uid('f'),
      kind: 'folder',
      title: String(it.title || '文件夹').slice(0, 20),
      items: inner
    };
  }

  return normalizeUrl(it.url) ? normalizeSite(it) : null;
}

function normalizeData(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const out = {
    groups: [],
    activeGroupId: '',
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) }
  };

  (Array.isArray(data.groups) ? data.groups : []).forEach((g) => {
    if (!g || typeof g !== 'object' || !g.name) return;
    const items = (Array.isArray(g.items) ? g.items : []).map(normalizeItem).filter(Boolean);
    out.groups.push({
      id: g.id || uid('g'),
      name: String(g.name).slice(0, 20),
      items
    });
  });

  if (!out.groups.length) out.groups = defaultData().groups;
  out.activeGroupId = out.groups.some((g) => g.id === data.activeGroupId)
    ? data.activeGroupId
    : out.groups[0].id;
  return out;
}

/* ---------------- 存储 ---------------- */
const store = {
  async get(key) {
    if (IS_EXT) {
      const res = await chrome.storage.local.get(key);
      return res[key] || null;
    }
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    if (IS_EXT) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  },
  async del(key) {
    if (IS_EXT) {
      await chrome.storage.local.remove(key);
      return;
    }
    localStorage.removeItem(key);
  }
};
