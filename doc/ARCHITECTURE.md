# 启航导航 · 架构与代码地图

> 本文件是**唯一权威的代码地图**。任何结构性改动（新增/删除/重命名文件、调整加载顺序、改动数据模型或扩展点）都必须同步更新本文件。
> 只改实现细节、修 bug、调样式时无需更新。
> 若本文件与代码不一致，以代码为准，并顺手修正本文件。

技术栈：原生 HTML / CSS / JavaScript，**无框架、无构建、无 npm 依赖**。
扩展入口由根目录 `manifest.json` 指向 `src/newtab.html`，页面用普通 `<script>` 按顺序加载，所有模块共享全局作用域（函数声明 + 少量 `const` 常量）。

---

## 1. 目录结构

```
浏览器插件/
├─ manifest.json              MV3 清单：newtab 指向 src/newtab.html，SW 指向 src/js/background.js
│                            权限：storage / favicon / bookmarks；optional_host_permissions 用于 AI 接口
├─ README.md                  面向使用者的说明：功能、安装、操作流程、权限、FAQ
├─ LICENSE                    MIT 开源协议（个人与商用均免费，分发须保留）
├─ AGENTS.md                  仓库内 AI 协作约定（指向 doc/）
├─ dist/                      发布包 zip（内容清单见 doc/BACKUP-MANIFEST.md）
├─ doc/                       文档（本文件、AI-GUIDE、协议、备份清单）
├─ server/                    QSP v1 示例服务端（Node，无依赖）
├─ tools/gen_assets.py        生成图标与矢量背景，输出到 src/assets
└─ src/                       ★ 全部扩展源码
   ├─ newtab.html             页面骨架 + CSS/JS 加载顺序（唯一入口）
   ├─ assets/                 图标 icon16/32/48/128.png、背景 bg-forest.webp/svg
   ├─ css/
   │  ├─ base.css             变量、重置、滚动条
   │  ├─ background.css       背景图层（.bg / .bg-image / .bg-veil）
   │  ├─ rail.css             左侧分组栏
   │  ├─ stage.css            主舞台与搜索框
   │  ├─ grid.css             图标网格与磁贴（含拖拽指示线、时钟/组件磁贴基础）
   │  ├─ menu.css             右键 / 下拉菜单
   │  ├─ modal.css            通用弹窗、表单控件、switch、chip、mini-btn
   │  ├─ toast.css            轻提示
   │  ├─ drawer.css           右侧设置抽屉
   │  ├─ widgets.css          组件磁贴样式 + 添加组件弹窗
   │  ├─ ai.css               AI 对话弹窗（会话栏 / 消息 / 输入区 / 设置层）
   │  ├─ bookmarks.css        浏览器书签侧边栏（悬浮按钮 / 树 / 搜索 / 同步面板）
   │  └─ responsive.css       媒体查询断点（最后加载）
   └─ js/
      ├─ store.js             常量与数据层：搜索引擎、背景预设、默认数据、normalizeData、store 封装、工具函数（uid/esc/URL/favicon）
      ├─ background.js        Service Worker：点击工具栏图标打开新标签页
      ├─ main.js              入口：bindEvents 汇总、全局快捷键、init()
      ├─ core/
      │  ├─ icons.js          内联 SVG 常量 ICONS
      │  ├─ utils.js          $、toast、copyText、openUrl、downloadBlob
      │  ├─ state.js          全局可变状态：state / syncState / ui / dragState / editing
      │  ├─ data.js           groupById、currentGroup、totalItems、save（防抖持久化）
      │  └─ media.js          本地图片读取与压缩（背景 / 图标）
      ├─ features/
      │  ├─ preferences.js    主题与布局：backgroundImageFor、applySettings、perRow、perPage、applyGridLayout
      │  ├─ rail.js           分组栏渲染、选择、重命名、新建
      │  ├─ search.js         搜索分类、引擎切换、doSearch
      │  ├─ grid.js           可见列表、分页、磁贴、拖拽排序、renderAll
      │  ├─ menu.js           右键菜单、站点/分组增删、openCanvasMenu（右键入口）
      │  ├─ modal.js          openModal/closeModal/openSettingsPanel + 通用关闭绑定
      │  ├─ link-modal.js     站点编辑弹窗与表单校验
      │  ├─ settings-panel.js 设置抽屉内容构建（引擎/背景/行为/布局/同步/备份）与回显
      │  ├─ backup.js         JSON 导出导入、浏览器书签导出（HTML 文件）
      │  ├─ sync.js           远程同步 QSP v1 + 协议文档链接
      │  ├─ bookmarks.js      书签侧边栏：悬浮按钮、书签树、模糊搜索、宽度拖拽
      │  └─ bookmark-sync.js  书签 ↔ 主页双向同步（导入 / 导出、两种遍历模式）
      └─ widgets/
         ├─ registry.js       ★ 组件注册表 WidgetRegistry + 组件磁贴工厂 + 上下文
         ├─ picker.js         添加组件弹窗、组件右键菜单、addWidget
         ├─ clock.js          时钟组件（占 2 格）
         └─ ai/
            ├─ index.js       注册 AI 组件、磁贴外观
            ├─ store.js       AI 数据层（模型/提示词/会话/开关）+ 持久化
            ├─ api.js         OpenAI 兼容请求、域名权限、消息组装
            ├─ chat.js        对话弹窗外壳、会话列表、消息渲染、发送
            └─ settings.js    弹窗内设置页：模型 CRUD / 提示词 CRUD / 通用
```

**加载顺序（`src/newtab.html` 必须与之一致）**
`store.js` → `core/*` → `features/*` → `widgets/registry.js` → `widgets/picker.js` → `widgets/clock.js` → `widgets/ai/*` → `main.js`。
features 内部：`bookmarks.js` 早于 `bookmark-sync.js`（后者复用前者的面板与 `bmLoadTree()`）。
原因：`WidgetRegistry` 是 `const`，各组件文件在顶层立即调用 `register`，因此必须在 registry 之后；`main.js` 最后执行 `init()`。

---

## 2. 数据结构

### 2.1 导航数据（`state`，存储 key `qihang-nav-v1`）

```js
state = {
  groups: [
    {
      id: 'g_xxx',
      name: '首页',
      items: [ /* Item 见下 */ ]
    }
  ],
  activeGroupId: 'g_xxx',
  settings: {
    engine: 'bing',        // bing | google | baidu | ddg
    cat: 'web',            // web | images | news | videos | maps
    theme: 'forest',       // 预设 key 或 'custom'
    customBg: '',          // 自定义背景（URL 或 dataURL）
    openInNewTab: true,
    showLabels: true,
    perRow: 5,             // 每行图标数 3~8
    align: 'center',       // center | left | right
    bmWidth: 340,          // 书签侧边栏宽度（拖拽后写回）
    bmHandlePos: 'center'  // 书签悬浮按钮位置：top | center | bottom
  }
}
```

`Item` 有两种形态，靠 `kind` 区分：

```js
// 网站
{ id, title, url, icon }
// 组件
{ id, kind: 'widget', widget: 'clock' | 'ai' | ..., title, config: {} }
```

`normalizeData()`（store.js）负责旧数据兜底与非法数据过滤，**新增字段时必须在这里补默认值**。

### 2.2 同步状态（`syncState`，存储 key `qihang-sync-v1`）

`{ server, token, username, userId, lastSyncAt, rev }`。

### 2.3 AI 数据（`aiData`，存储 key `qihang-ai-v1`，独立于导航备份）

```js
aiData = {
  models: [{ id, name, base, model, key, temperature }],
  activeModelId: 'model_deepseek',
  prompts: [{ id, title, content }],
  conversations: [{
    id, title, modelId, updatedAt,
    messages: [{ role: 'user'|'assistant'|'system', content, at }]
  }],
  activeConvId: 'c_xxx',
  options: { webSearch: false, deepThink: false }
}
```

---

## 3. 关键链路

### 3.1 启动
`main.js init()` → `store.get(STORE_KEY)` → `normalizeData()` → `applySettings()` → `buildSettingsPanel()` → `renderAll()` → `bindEvents()`。

### 3.2 渲染
`renderAll()`（grid.js）= `applySettings()` + `renderSidebar()` + `renderEngines()` + `renderSearchEngine()` + `renderGrid()`。
`renderGrid()` 会先 `WidgetRegistry.cleanup()` 释放组件定时器，再按 `item.kind === 'widget'` 分派到 `createWidgetTile()` 或 `createTile()`。

**滚轮（`main.js` 的 `bindGlobalShortcuts`）** 分三级处理：
1. `.stage` 还能滚动 → 不拦截，交给原生滚动；
2. 已到顶 / 到底或内容不满一屏 → 翻页（`ui.page` 上下页）；
3. 没有页可翻 → 切换分组，首尾循环（最后一个 ↓ 回到第一个，第一个 ↑ 回到最后一个）；切换后向下置顶、向上置底，并用 420ms 锁避免连续触发。
搜索状态、侧边栏 / 弹窗 / 菜单内的滚动都不参与这套逻辑。

### 3.3 拖拽排序
`attachTileDrag()`（grid.js）为网站磁贴与组件磁贴共用；`moveItem()` 修改 `items` 顺序后 `save() + renderAll()`。
拖到网格空白处由 `bindGridEvents()` 的 `#grid` drop 处理（追加到当前分组末尾）。

### 3.4 组件
右键空白 → `openCanvasMenu()`（menu.js）→ `openWidgetPicker()`（picker.js）→ `addWidget(type)` 往当前分组 push 一个 `kind:'widget'` 的 Item → `renderAll()` → `createWidgetTile()`（registry.js）→ `def.mount(el, ctx)`。
组件点击 → `def.open(ctx)`；组件右键 → `openWidgetMenu()`。

### 3.5 AI 对话
点击 AI 磁贴 → `openAiChat()`（chat.js）→ `loadAiData()` → `aiEnsureConversation()` → `aiRenderAll()` → 用户发送 → `aiSendMessage()` → `aiChatCompletion()`（api.js，OpenAI 兼容 `/chat/completions`）→ 写回 `conversations` → `saveAiDataNow()`。
设置按钮切换 `.ai-shell.show-settings`，内容由 `aiRenderSettings(tab)`（settings.js）渲染。

### 3.6 书签侧边栏
`bindBookmarkEvents()`（bookmarks.js）在页面加载时创建右侧悬浮按钮 `.bm-handle` 与面板 `.bm-panel`。
点击悬浮按钮 → `openBookmarkPanel()` → `refreshBookmarkTree()`（`chrome.bookmarks.getTree()`）→ `renderBookmarkTree()`。
搜索输入 → 90ms 防抖 → `bmCollectMatches()` 扁平结果（先连续包含、再按序字符匹配）。
拖拽面板左缘 `.bm-resizer` → 实时改宽度 → 松手写回 `state.settings.bmWidth`。
悬浮按钮在屏幕高度的位置由 `settings.bmHandlePos`（`top` / `center` / `bottom`）决定：`applySettings()` 把它写到 `body[data-bm-pos]`，`bookmarks.css` 对应 16.67% / 50% / 83.33%（整屏三等份）。
关闭：X 按钮 / `Esc`（main.js 的快捷键链）/ 再次点击悬浮按钮。

### 3.7 书签 ↔ 主页同步
入口：空白处右键 → 「同步书签」→ `openBookmarkSync()` → `openBookmarkPanel(true)` → `showBookmarkSync()` → `renderBookmarkSync()` → `renderBookmarkSyncBody()`。

- **主页 → 书签**（`doSyncGroupsToBookmarks`）：
  遍历 `state.groups`，在所选目录下 `bmEnsureFolder()` 找/建同名文件夹，再逐个 `chrome.bookmarks.create()` 写入网站；按 url 去重，组件（无 url）跳过。
- **书签 → 主页**（`doSyncBookmarksToGroup`）：
  `bmCollectUrls(folderId, recursive)` 取书签；`recursive` 时递归全部子目录并去掉层级平铺，否则只取直接子项。导入前用 `normalizeUrl` 过滤非网页地址，按 url 与分组现有项去重，写入后 `save() + renderAll()`。

两种模式由面板内单选决定：`recursive`（递归）/ `flat`（仅当前目录）。

---

## 4. 扩展点

### 4.1 新增一个组件（最常见）

1. 在 `src/js/widgets/` 下新建文件（复杂组件建子目录）。
2. 注册：

```js
WidgetRegistry.register({
  type: 'weather',            // 唯一，写进 item.widget
  name: '天气',
  desc: '一句话说明',
  icon: '<svg viewBox="0 0 24 24">…</svg>',
  span: 1,                    // 占几列，时钟为 2
  mount(el, ctx) {
    // ctx: { item, groupId, save, refresh, onDispose }
    // 定时器/监听必须用 ctx.onDispose(() => ...) 释放
  },
  open(ctx) { /* 可选：点击行为 */ }
});
```

3. 在 `src/newtab.html` 的组件脚本区按顺序加 `<script>`（registry.js 之后、main.js 之前）。
4. 样式写到 `src/css/widgets.css`（或新建 css 并在 newtab.html 引入）。
5. 更新本文件第 1 节目录树与 4.1 说明。

**禁止**在 `grid.js` / `picker.js` 里为具体组件写 `if (type === ...)` 分支。

### 4.2 新增设置项

同时改 4 处，缺一不可：
1. `src/js/store.js` 的 `DEFAULT_SETTINGS`
2. `src/newtab.html` 设置抽屉里对应的 `setting-block`
3. `src/js/features/settings-panel.js`：`buildSettingsPanel()`（绑定）+ `syncSettingsUI()`（回显）
4. `src/js/features/preferences.js` 的 `applySettings()`（如需即时生效）

### 4.3 新增右键菜单项
`src/js/features/menu.js` 的 `openCanvasMenu()`（空白处）或 `openItemMenu()` / `openGroupMenu()`。

### 4.4 新增全局快捷键
`src/js/main.js` 的 `bindGlobalShortcuts()`。

### 4.5 新增样式
放到语义对应的 `src/css/*.css`；确需新文件时，在 `src/newtab.html` 按“基础 → 组件 → 响应式最后”的顺序引入。

### 4.6 调整书签同步行为
- 读取书签、文件夹下拉：`src/js/features/bookmarks.js`（`bmLoadTree` / `bmFolderOptions`）
- 两个方向的同步与遍历模式：`src/js/features/bookmark-sync.js`（`doSyncGroupsToBookmarks` / `doSyncBookmarksToGroup` / `bmCollectUrls`）
- 入口：`src/js/features/menu.js` 的「同步书签」+ `openBookmarkPanel(true)`

注意事项：`chrome.bookmarks` 只在扩展环境可用，非扩展会自动提示；`manifest.json` 的 `permissions` 必须保留 `bookmarks`，否则面板与同步都不可用。

---

## 5. 连带修改清单（改数据结构必看）

改动 `Item` 或 `state` 结构时，以下位置需要一起检查：

| 位置 | 作用 |
| --- | --- |
| `store.js` `normalizeData()` | 旧数据兜底、字段过滤、默认值 |
| `store.js` `defaultData()` | 首次安装的默认数据 |
| `features/sync.js` `buildSyncPayload()` | 上传字段白名单（漏了会被同步丢弃） |
| `features/sync.js` `mergeGroups()` | 合并时的字段重建规则 |
| `features/backup.js` `exportData()` | 直接序列化 `state`，一般无需改 |
| `features/grid.js` `createTile()` / `createWidgetTile()` | 渲染与交互 |
| `features/grid.js` `visibleList()` | 搜索匹配字段 |
| `features/bookmark-sync.js` 导入 / 导出 | 书签与 Item 的字段映射（组件无 url，写入时跳过） |

新增设置字段时，同样检查 `normalizeData` 的 `settings` 合并与 `syncSettingsUI`。

---

## 6. 编码约定

- 不使用框架、构建工具、npm 依赖、ES Module；保持普通 `<script>` + 全局函数。
- 全局函数用动词开头（`renderX` / `bindX` / `openX` / `applyX`），工具函数用短名（`esc` / `uid` / `$`）。
- 事件绑定统一放在各模块的 `bindXxxEvents()`，由 `main.js` 的 `bindEvents()` 汇总调用。
- DOM 文本一律用 `textContent` 或 `esc()`，避免把用户数据拼进 `innerHTML`。
- 文案与注释使用中文，缩进 2 空格，字符串优先单引号。
- 持久化统一走 `store`（扩展用 `chrome.storage.local`，非扩展回退 `localStorage`）；写数据用防抖 `save()` / `saveAiData()`，需要立即落盘时用 `saveAiDataNow()`。

---

## 7. 验证方式（改完必跑）

```powershell
# 1) 语法检查
Get-ChildItem -Recurse src\js -Filter *.js | ForEach-Object { node --check $_.FullName }

# 2) IDE 诊断（在编辑器里对 src 执行 read_lints）

# 3) 无头 Chrome 冒烟：确认页面能渲染默认分组与磁贴
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-sandbox `
  --virtual-time-budget=4000 --dump-dom "file:///D:/桌面快捷方式/code/浏览器插件/src/newtab.html"
# 输出中应能搜到 rail-item 与 tile-name；若为空说明初始化链路报错。
```

交互类改动（组件、弹窗、拖拽）建议临时复制 `newtab.html` 为 `src/__smoke.html`，在 `</body>` 前插入测试脚本，用 `--dump-dom` 读 `document.title` 传递结果，测完删除该临时文件。

---

## 8. 文档清单

| 文件 | 内容 |
| --- | --- |
| `README.md` | 面向使用者：功能、安装、操作流程、权限、开发验证、FAQ、开源协议 |
| `LICENSE` | MIT 协议全文，分发（含发布包）时必须保留 |
| `doc/ARCHITECTURE.md` | 本文件：目录、数据模型、链路、扩展点、验证方式 |
| `doc/AI-GUIDE.md` | 给 AI / 新协作者的提示词与工作流程 |
| `doc/PROTOCOL.md` | QSP v1 同步协议规范（服务端对接依据） |
| `doc/BACKUP-MANIFEST.md` | 备份包内容与工程路径对应关系 |
