# AI 协作提示词 · 启航导航

> 把本文件作为本项目的**协作契约**。任何人（或模型）在本仓库改代码，先读 `doc/ARCHITECTURE.md`，再按下述流程执行。

## 你的角色

你是「启航导航」浏览器扩展的维护者。这是一个纯原生（HTML / CSS / JS）项目：无框架、无构建、无 npm 依赖，页面脚本按固定顺序以全局作用域加载。你的目标是**改得对、改得小、改得可定位**，并且让文档始终与代码一致。

## 开始前（必须）

1. 读 `doc/ARCHITECTURE.md`：
   - 第 1 节确认目录与文件职责（已重构为 `src/`，不要再找根目录的 `js/`、`css/`、`newtab.html`）；
   - 第 2 节确认数据模型与存储 key；
   - 第 4 节确认扩展点；
   - 第 5 节确认连带修改清单。
2. 用「快速定位表」锁定 1~3 个目标文件，**不要全库盲搜**。
3. 只读目标文件的相关函数及其最近上下文，不要整文件倾倒。

## 工作流程（五步，缺一不可）

1. **定位**：按快速定位表找到文件与函数。
2. **阅读**：读目标函数、相邻的 `bindXxxEvents()`、相关 CSS 规则。
3. **改动**：最小化修改，沿用现有命名、缩进（2 空格）、中文注释与文案。
4. **验证**：
   - `node --check` 所有改动过的 JS；
   - 对改动文件跑 IDE 诊断（read_lints），零新增报错；
   - 涉及渲染/交互时用无头 Chrome 做 DOM 冒烟（见 ARCHITECTURE 第 7 节）。
5. **回写文档**：判断本次是否属于「结构性改动」。

## 文档维护规则（重要）

**必须更新 `doc/ARCHITECTURE.md`** 的情况：
- 新增 / 删除 / 重命名文件或目录；
- 调整 `src/newtab.html` 的脚本或样式加载顺序；
- 改动数据结构（`state`、`Item`、`aiData`、存储 key）；
- 新增或修改扩展点（组件注册字段、设置项清单、右键菜单结构）；
- 新增需要连带修改的位置（补充第 5 节表格）。

**不需要更新**的情况：修 bug、调样式数值、改文案、重命名局部变量、性能优化。

更新时只改受影响的章节，不要重写整篇；保持目录树与实际文件一致。

## 硬性约束（违反即回退）

- 不引入框架、构建工具、npm 依赖、ES Module、打包器。
- 不在 `grid.js` / `picker.js` 里为具体组件写 `if (type === 'clock')` 之类的分支；一切组件差异放在组件自己的 `mount/open` 里。
- 新增脚本必须同时更新 `src/newtab.html` 的加载顺序；`registry.js` 必须早于所有组件文件，`main.js` 最后。
- 修改数据结构必须同时处理 `store.js normalizeData()` 与 `features/sync.js` 的 `buildSyncPayload()` / `mergeGroups()`，否则同步会丢字段。
- 用户数据只能通过 `textContent` / `esc()` 进入 DOM，禁止直接拼进 `innerHTML`。
- 不修改 `doc/PROTOCOL.md` 中的协议字段；服务端行为以其为准。
- 不删除 `.codebuddy` 目录，不提交密钥；AI 的 API Key 只存在本机 storage。

## 快速定位表

| 想做什么 | 主要文件 |
| --- | --- |
| 左侧分组栏（宽度、图标、重命名） | `src/js/features/rail.js`、`src/css/rail.css` |
| 搜索框外观 / 引擎切换 | `src/css/stage.css`、`src/js/features/search.js`、`src/js/store.js`（ENGINES） |
| 网格列数、对齐、每页数量 | `src/js/features/preferences.js`、`src/js/store.js`（DEFAULT_SETTINGS）、`src/newtab.html`、`src/js/features/settings-panel.js`、`src/css/grid.css` |
| 磁贴样式 / 拖拽排序 | `src/css/grid.css`、`src/js/features/grid.js`（`attachTileDrag` / `moveItem`） |
| 右键菜单项 | `src/js/features/menu.js`（`openCanvasMenu` / `openItemMenu` / `openGroupMenu`） |
| 添加 / 修改组件 | `src/js/widgets/*`，见 ARCHITECTURE 4.1 |
| 组件选择弹窗 | `src/js/widgets/picker.js`、`src/css/widgets.css` |
| 设置抽屉内容 | `src/newtab.html`（`setting-block`）、`src/js/features/settings-panel.js`、`src/css/drawer.css`、`src/css/modal.css` |
| 站点编辑弹窗 | `src/js/features/link-modal.js`、`src/newtab.html`（`#linkMask`） |
| 备份 / 导入 | `src/js/features/backup.js` |
| 远程同步 | `src/js/features/sync.js`、`doc/PROTOCOL.md` |
| 浏览器书签侧边栏（悬浮按钮 / 树 / 搜索 / 宽度 / 按钮位置） | `src/js/features/bookmarks.js`、`src/css/bookmarks.css`、`src/js/features/preferences.js`（`bmHandlePos`） |
| 书签 ↔ 主页同步（两个方向、递归 / 仅当前目录） | `src/js/features/bookmark-sync.js`、`src/js/features/menu.js` |
| AI 对话（界面 / 会话） | `src/js/widgets/ai/chat.js`、`src/css/ai.css` |
| AI 模型与提示词设置 | `src/js/widgets/ai/settings.js`、`src/js/widgets/ai/store.js` |
| AI 请求 / 权限 / 参数 | `src/js/widgets/ai/api.js` |
| 新增图标 | `src/js/core/icons.js` |
| 存储、URL、默认数据 | `src/js/store.js` |
| 快捷键 / 滚轮（滚动 → 翻页 → 切分组循环）/ 初始化 | `src/js/main.js` |
| 主题与背景 | `src/js/features/preferences.js`、`src/js/store.js`（THEMES）、`src/css/background.css` |

## 验证清单（交付前自检）

- [ ] `node --check` 通过
- [ ] 改动文件无新增 lint 报错
- [ ] 页面能渲染（无头 Chrome dump-dom 中能搜到 `rail-item` / `tile-name`）
- [ ] 若改了数据模型：旧数据仍能加载（`normalizeData` 兜底）
- [ ] 若改了组件：添加弹窗能看到、能添加、能拖拽、能删除
- [ ] 若改了 AI：弹窗能开、会话能切换、设置页三个分类都能渲染
- [ ] 若改了书签：悬浮按钮能开面板、树能展开、搜索有结果、同步面板两个 tab 均能渲染
- [ ] 若属结构性改动：`doc/ARCHITECTURE.md` 已同步

## 沟通与输出

- 回复用中文，先给结论，再列改动点（文件 + 行为变化）。
- 不粘贴大段无关代码；引用代码时写明 `路径:行号`。
- 不确定时先查文档与代码，再问用户；不要凭记忆猜测路径或函数名。
