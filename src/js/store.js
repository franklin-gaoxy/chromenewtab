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
  lang: 'zh',         // 界面语言：zh | en（见 core/i18n.js）
  iconAutoFetch: false, // 自动获取高清图标（默认关闭：只用固定地址）
  engine: 'bing',
  cat: 'web',
  theme: 'forest',
  customBg: '',
  openInNewTab: true,
  showLabels: true,
  iconFrame: true,    // 图标是否使用统一底色 + 边框（关闭后按原始形状铺满）
  iconSize: 60,       // 图标边长 px（40 ~ 88，默认 60）
  labelSize: 12.5,    // 磁贴名称字号 px（10 ~ 18，默认 12.5）
  perRow: 8,          // 每行图标数量（3 ~ 8，默认 8）
  align: 'center',    // 网格对齐：center | left | right
  bmWidth: 340,       // 书签侧边栏宽度
  bmHandlePos: 'center', // 书签按钮在屏幕高度的位置：top | center | bottom
  expandedSections: [], // 设置抽屉里被展开的区块（默认全部折叠；值为 section 的 data-section）
  autoBackupEnabled: false,   // 定时备份开关
  autoBackupTime: '09:00',    // 每天执行时间 HH:MM
  autoBackupMode: 'default',  // default（下载目录）| custom（自定义目录）
  autoBackupDirName: '',      // 自定义目录的显示名
  autoBackupKeepDays: 7,      // 保留天数，0 表示永久
  autoBackupLastRun: ''       // 最近一次成功备份的日期 YYYY-MM-DD
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
  if (!host) return i18n('common.unnamed');
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
  const px = size || 128;
  if (IS_EXT) {
    return chrome.runtime.getURL('_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=' + px);
  }
  try {
    return 'https://icons.duckduckgo.com/ip3/' + new URL(url).hostname + '.ico';
  } catch (e) {
    return '';
  }
}

/* 取根域：a.b.feishu.cn → feishu.cn，用于子域站点回退主站图标 */
function rootDomainOf(rawUrl) {
  try {
    const host = new URL(normalizeUrl(rawUrl)).hostname;
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const last2 = parts.slice(-2).join('.');
    // co.uk / com.cn 这类二级后缀要取三段
    if (/^(com|net|org|gov|edu|co|ac)\.(cn|uk|jp|kr|hk|tw|au|nz|br|in|sg)$/.test(last2)) {
      return parts.slice(-3).join('.');
    }
    return last2;
  } catch (e) {
    return '';
  }
}

/* 站点图标候选：按「高清优先」排序，paintIcon 会逐个尝试并取第一个足够清晰的 */
function iconCandidateList(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return [];
  const list = [];
  const push = (u) => {
    if (u && list.indexOf(u) < 0) list.push(u);
  };
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (e) {
    return list;
  }
  const root = rootDomainOf(url);
  const sub = !!root && root !== host;
  // 第三方服务会去抓 apple-touch-icon / 大尺寸 logo，比 Chrome 的 16px 缓存清晰得多
  // 子域（如 xxx.feishu.cn）常常只有主站收录了图标，所以根域紧随其后
  push('https://favicon.im/' + host + '?larger=true');
  if (sub) push('https://favicon.im/' + root + '?larger=true');
  // 站点自带的 touch icon 通常就是 180×180 的大图，且同域、稳定
  push('https://' + host + '/apple-touch-icon.png');
  // icon.horse 对大站能拿到 128~256px 的原始 logo；未收录时会返回占位图，只放在靠后的位置
  push('https://icon.horse/icon/' + host);
  if (sub) push('https://icon.horse/icon/' + root);
  push('https://logo.clearbit.com/' + host);
  if (sub) push('https://logo.clearbit.com/' + root);
  push('https://www.google.com/s2/favicons?domain=' + host + '&sz=256');
  if (sub) push('https://www.google.com/s2/favicons?domain=' + root + '&sz=256');
  push('https://' + host + '/apple-touch-icon-precomposed.png');
  push('https://' + host + '/favicon-32x32.png');
  push('https://' + host + '/favicon.png');
  push('https://' + host + '/favicon.ico');
  push('https://icons.duckduckgo.com/ip3/' + (root || host) + '.ico');
  push('https://www.google.com/s2/favicons?domain=' + host + '&sz=64');
  if (IS_EXT) push(faviconUrl(url, 256));
  return list;
}

/* Chrome 内置 _favicon 地址不能固化进数据（换扩展 ID / 换浏览器就失效） */
function isInternalFaviconUrl(src) {
  return String(src || '').indexOf('_favicon/') >= 0;
}

/* ---------------- 纯色文字图标（用户自选，存成 SVG data URL） ---------------- */

/* 1~3 字单行、4 字 2+2、5 字 3+2、6 字 3+3；字号按最长一行保守取值，不会出界 */
function letterIconLines(text) {
  const chars = Array.from(String(text || '').replace(/\s+/g, '')).slice(0, 6);
  if (!chars.length) return [];
  if (chars.length <= 3) return [chars.join('')];
  if (chars.length === 4) return [chars.slice(0, 2).join(''), chars.slice(2).join('')];
  return [chars.slice(0, 3).join(''), chars.slice(3).join('')];
}

/* 色号输入归一化：#abc / abc / #aabbcc → #aabbcc；不合法返回空串 */
function normalizeHexColor(input) {
  const m = String(input || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '';
  const hex = m[1].toLowerCase();
  return '#' + (hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex);
}

function letterIconDataUrl(text, color, size) {
  const lines = letterIconLines(text);
  if (!lines.length) return '';
  const total = Array.from(lines.join('')).length;
  const raw = String(color || '');
  // 只接受 #rrggbb / hsl(...)，其余按文字哈希取色
  const bg = /^#[0-9a-f]{6}$/i.test(raw) || /^hsl\(/i.test(raw)
    ? raw
    : 'hsl(' + hashHue(lines.join('')) + ' 52% 46%)';
  const px = size || 128;
  const fontSize = lines.length > 1 ? 28 : total === 1 ? 50 : total === 2 ? 40 : 29;
  const gap = fontSize * 1.12;
  const baseY = lines.length > 1 ? 50 - gap / 2 : 50;
  const texts = lines
    .map(
      (line, i) =>
        '<text x="50" y="' + (baseY + i * gap).toFixed(2) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-family="system-ui,-apple-system,Segoe UI,Microsoft YaHei,PingFang SC,sans-serif" ' +
        'font-size="' + fontSize + '" font-weight="600" fill="#fff">' + esc(line) + '</text>'
    )
    .join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px + '">' +
    '<rect width="100" height="100" rx="22" fill="' + bg + '"/>' + texts + '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* 从 data URL 读回文字与底色，编辑已有站点时回显；不是文字图标则返回 null */
function letterIconSource(url) {
  const src = String(url || '');
  if (src.indexOf('data:image/svg+xml') !== 0) return null;
  try {
    const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
    const text = (svg.match(/<text[^>]*>[^<]*<\/text>/g) || [])
      .map((t) =>
        t
          .replace(/^<text[^>]*>/, '')
          .replace(/<\/text>$/, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      )
      .join('');
    const fill = svg.match(/<rect[^>]*fill="([^"]*)"/);
    const color = fill && fill[1] && fill[1].indexOf('url(') !== 0 ? fill[1] : '';
    return { text: text, color: color };
  } catch (e) {
    return null;
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
      title: String(it.title || i18n('folder.newName')).slice(0, 20),
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
