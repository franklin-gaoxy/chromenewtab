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
├─ tools/
│  ├─ gen_assets.py           生成图标与矢量背景，输出到 src/assets
│  └─ smoke/                  页面冒烟测试：run.js（运行器）+ cases.js（用例）
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
   │  ├─ folder.css           文件夹磁贴与毛玻璃面板
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
      │  ├─ grid.js           可见列表、分页、磁贴、拖拽排序/合并落点、renderAll
      │  ├─ folder.js         文件夹：拖拽合并、磁贴预览、毛玻璃面板、重命名/解散/删除
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
features 内部：`bookmarks.js` 早于 `bookmark-sync.js`（后者复用前者的面板与 `bmLoadTree()`）；`folder.js` 紧跟在 `grid.js` 之后（`grid.js` 渲染时调用 `createFolderTile()` / `refreshOpenFolder()`，拖拽落点调用 `canMergeItems()` / `mergeItems()`）。
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

`Item` 有三种形态，靠 `kind` 区分：

```js
// 网站
{ id, title, url, icon }
// 组件
{ id, kind: 'widget', widget: 'clock' | 'ai' | ..., title, config: {} }
// 文件夹（只允许一层，内部只能是网站，不允许嵌套）
{ id, kind: 'folder', title, items: [{ id, title, url, icon }] }
```

`normalizeData()`（store.js）负责旧数据兜底与非法数据过滤，**新增字段时必须在这里补默认值**。
条目归一化拆成了 `normalizeItem()`（三分支）与 `normalizeSite()`；文件夹内部的嵌套文件夹与组件会被丢弃，保证「一层」约束。

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

### 3.3 拖拽排序与合并
`attachTileDrag()`（grid.js）为网站 / 文件夹 / 组件磁贴共用；`dragState` 里带上被拖的 `item`。
落点由 `dropZone()` 计算：可合并时左 30% 为 `before`、右 30% 为 `after`、中间为 `merge`（`.drop-merge` 高亮）；组件不参与合并，退化为左右两半插入。
- 插入：`moveItem()` 修改 `items` 顺序后 `save() + renderAll()`。
- 合并：`mergeItems()`（folder.js），见 3.8。
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
  遍历 `state.groups`，在所选目录下 `bmEnsureFolder()` 找/建同名文件夹，再用内部 `writeSites()` 逐个 `chrome.bookmarks.create()` 写入网站；分组里的文件夹再 `bmEnsureFolder()` 建一层同名子文件夹后写入（只一层），按 url 去重，组件（无 url）跳过。
- **书签 → 主页**（`doSyncBookmarksToGroup`）：
  先取源目录直接子项：书签直接进分组；`keepFolders` 为真时，每个一级子目录生成一个主页文件夹，`bmCollectUrls()` 递归摊平该子目录下的全部书签并放进去（更深层级不再产生新文件夹）。导入前用 `normalizeUrl` 过滤非网页地址，按 url 与分组现有项（`collectGroupUrls()`）去重；同名文件夹已存在则并入。写入后 `save() + renderAll()`。

两种模式由面板内单选决定：`keep`（保留一级目录，默认）/ `flat`（仅当前目录）。

### 3.8 文件夹（只一层）
- 入口：磁贴拖到另一个磁贴中间 → `mergeItems(fromGroupId, fromId, toGroupId, toId)`（folder.js）。
  - 目标是文件夹 → 把源摊平后的站点追加进去；
  - 目标是站点 → 在目标位置新建 `kind:'folder'`，包含两者（文件夹标题沿用源的）。
  - 源 / 目标是组件时不合并；跨分组同样适用（先摘除源，再按 id 重新定位目标，避免同组下标错位）。
- 渲染：`renderGrid()` 按 `item.kind` 分派，文件夹走 `createFolderTile()` → `fillFolderPreview()` 画 2×2 预览（超过 4 个时第 4 格显示 `+n`）。
- 面板：点击文件夹 → `openFolder()` → `$('folderMask')` + `$('folderPanel')`（`css/folder.css`，`backdrop-filter: blur()` 毛玻璃），内容由 `renderFolderPanel()` 生成；位置以磁贴 `rect` 为锚点，`renderGrid()` 结尾调用 `refreshOpenFolder()` 同步数据变化。关闭走 `closeFolder()`（遮罩 / X / `Esc`）。
- 管理：`openFolderMenu()`（打开 / 重命名 / 解散 / 删除）、`openFolderItemMenu()`（打开 / 复制 / 编辑 / 移出 / 删除）；`dissolveFolder()` 把站点按原顺序放回分组。
- 定位工具：`findItemEntry()`（data.js，会进一层文件夹）、`collectGroupUrls()`（含文件夹内网址）、`groupOfFolder()` / `findFolder()`（folder.js）。
- 数据约束：文件夹里只能是网站（`normalizeItem()` 丢弃嵌套文件夹与组件），因此不存在多层结构。

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
层级约定是「书签目录 ↔ 主页文件夹只对应一层」：改这里要同时看 3.8 与第 5 节，别把 `bmCollectUrls()` 的摊平逻辑改成新建多层文件夹（数据模型不支持嵌套）。

---

## 5. 连带修改清单（改数据结构必看）

改动 `Item` 或 `state` 结构时，以下位置需要一起检查：

| 位置 | 作用 |
| --- | --- |
| `store.js` `normalizeItem()` / `normalizeSite()` / `normalizeData()` | 旧数据兜底、字段过滤、默认值、文件夹一层约束 |
| `store.js` `defaultData()` | 首次安装的默认数据 |
| `features/sync.js` `buildSyncPayload()` | 上传字段白名单（漏了会被同步丢弃） |
| `features/sync.js` `mergeGroups()` | 合并时的字段重建规则 |
| `features/backup.js` `exportData()` | 直接序列化 `state`，一般无需改（文件夹天然带结构） |
| `features/backup.js` `buildBookmarksHtml()` | 导出书签 HTML 的层级（分组 / 文件夹各一层） |
| `features/grid.js` `createTile()` / `createWidgetTile()` / `createFolderTile()` | 渲染与交互 |
| `features/grid.js` `visibleList()` | 搜索匹配字段（文件夹内的站点也参与匹配） |
| `features/folder.js` | 合并规则、面板、右键菜单、文件夹增删 |
| `features/link-modal.js` `saveLink()` | 在文件夹内新增 / 修改站点 |
| `features/bookmark-sync.js` 导入 / 导出 | 书签与 Item 的字段映射（组件无 url，写入时跳过；目录只对应一层文件夹） |

新增设置字段时，同样检查 `normalizeData` 的 `settings` 合并与 `syncSettingsUI`。

### 5.1 Item 字段消费点索引

> 用途：改 Item 时**先查这张表定位，不要整库通读**。每行是「谁会因为这次改动出问题」。
> 「新增 kind」列标 ★ 的是必须改的分派点，其余是字段读写点。

| 位置（文件:函数） | 读写的字段 | 新增 kind 时要做什么 |
| --- | --- | --- |
| `store.js` `normalizeItem()` | 全部字段、`kind` 分支 | ★ 加分支，并决定非法数据怎么丢弃 |
| `store.js` `normalizeSite()` | `id/title/url/icon` | 一般不用改 |
| `store.js` `defaultData()` | 首次安装的默认条目 | 一般不用改 |
| `core/data.js` `totalItems()` | 全部 `items`（文件夹额外算内部站点） | 决定计数口径 |
| `core/data.js` `findItemEntry()` | `id`，会进文件夹一层 | ★ 新 kind 若是容器，要在这里展开 |
| `core/data.js` `collectGroupUrls()` | `url`（含文件夹内） | ★ 容器类型要遍历内部 |
| `features/rail.js` `renderSidebar()` | `g.items.length` | 只影响「N 个站点」数字 |
| `features/grid.js` `renderGrid()` | `kind` 分派磁贴工厂 | ★ 加一路渲染 |
| `features/grid.js` `visibleList()` | `title/url`（文件夹内站点也匹配） | ★ 容器要参与搜索展开 |
| `features/grid.js` `paintIcon()` | `icon/url/title` | 一般不用改 |
| `features/grid.js` `createTile()` | `url`→打开、`title` | 站点专用 |
| `features/grid.js` `attachTileDrag()` / `dropZone()` | `kind/id`（合并判定） | ★ 决定新类型能否合并 / 拖拽 |
| `features/folder.js` `canMergeItems()` | `kind` | ★ 组件在此被排除 |
| `features/folder.js` `mergeItems()` / `folderSitesOf()` | `kind/items` | ★ 合并时怎么摊平 |
| `features/folder.js` `createFolderTile()` / `fillFolderPreview()` | `title/items[].icon` | 文件夹专用 |
| `features/folder.js` `buildFolderGrid()` / `openFolderItemMenu()` | `url/title` | 文件夹内只能是站点 |
| `features/menu.js` 右键分派（`bindMenuEvents`） | `kind` | ★ 加一路菜单 |
| `features/menu.js` `openItemMenu()` / `removeItem()` | `url`；删除走 `findItemEntry` | 一般不用改 |
| `features/menu.js` `openGroupMenu()` 清空分组 | `g.items` | 容器会被整体丢弃 |
| `features/link-modal.js` `saveLink()` | `title/url/icon`，`folderId` | ★ 容器内的增改入口 |
| `features/backup.js` `exportData()` / `importData()` | 直接序列化 + `normalizeData` | 一般不用改 |
| `features/backup.js` `buildBookmarksHtml()` | `title/url`，文件夹→一层子目录 | ★ 容器要映射成目录 |
| `features/sync.js` `buildSyncPayload()` | 字段白名单 | ★ 漏字段会被同步丢弃 |
| `features/sync.js` `mergeGroups()` | 字段重建规则 | ★ 同上 |
| `features/bookmark-sync.js` `doSyncGroupsToBookmarks()` | `url`；`kind:'folder'`→子目录 | ★ 容器→目录 |
| `features/bookmark-sync.js` `doSyncBookmarksToGroup()` | 生成文件夹（只一层） | ★ 目录→容器 |
| `features/bookmark-sync.js` `bmCollectUrls()` | `url` | 只读，一般不用改 |
| `widgets/picker.js` `addWidget()` | push 一个 `kind:'widget'` | 组件入口，一般不用改 |

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

# 3) 冒烟测试（页面内用例，16 项，退出码非 0 即失败）
node tools/smoke/run.js
```

`tools/smoke/run.js` 会读 `src/newtab.html`，把 `tools/smoke/cases.js` 内联成 `src/__smoke.html`，用无头 Chrome/Edge 跑一遍并解析 `document.title`，最后删除临时文件（浏览器路径可用环境变量 `CHROME_PATH` 指定）。

**新增用例**：只改 `tools/smoke/cases.js`，在对应分组里追加 `ok('名字', 断言, 失败细节)`；用例只能调用页面已有的全局函数。覆盖范围：文件夹合并 / 磁贴 / 面板 / 毛玻璃、备份往返、一层约束、同步字段白名单与合并、书签 HTML 层级、书签双向同步（内部伪造 `chrome.bookmarks`，不需要真扩展环境）。

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
