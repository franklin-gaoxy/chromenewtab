# 发布包内容清单（路径对应关系）

| 项目 | 内容 |
| --- | --- |
| 压缩包 | `dist/qihang-nav-1.1.0.zip` |
| 生成日期 | 2026-11-11 |
| 扩展版本 | 1.1.0（Manifest V3） |
| 包内根目录 | 扩展源码根目录（解压后可直接「加载已解压的扩展程序」） |
| 包内文件数 | 62（仅为文件，不含目录项） |
| 包大小 | 约 369 KB |
| 开源协议 | MIT（`LICENSE`，随包分发） |

包内路径与工程路径**一一对应**（下表中的「工程路径」以工程根 `浏览器插件/` 为基准），因为打包时不带顶层文件夹。

## 1. 顶层与入口

| 包内路径 | 工程路径 | 作用 | 大小 |
| --- | --- | --- | --- |
| `manifest.json` | `manifest.json` | MV3 清单：接管新标签页、权限、后台脚本 | 890 B |
| `README.md` | `README.md` | 面向使用者的说明：功能、安装、操作流程、FAQ | 14.3 KB |
| `LICENSE` | `LICENSE` | MIT 开源协议全文（分发时必须保留） | 1.0 KB |
| `src/newtab.html` | `src/newtab.html` | 页面骨架 + CSS/JS 加载顺序（唯一入口） | 12.4 KB |

## 2. 目录汇总

| 包内目录 | 工程路径 | 文件数 | 大小 | 内容 |
| --- | --- | --- | --- | --- |
| `src/assets/` | `src/assets/` | 6 | 291 KB | `bg-forest.svg`、`bg-forest.webp`、`icon16/32/48/128.png` |
| `src/css/` | `src/css/` | 14 | 52 KB | base / background / rail / stage / grid / menu / modal / toast / drawer / folder / widgets / ai / bookmarks / responsive |
| `src/js/` | `src/js/` | 29 | 151.3 KB | 见下方分表 |
| `doc/` | `doc/` | 4 | 51.4 KB | ARCHITECTURE / AI-GUIDE / PROTOCOL / BACKUP-MANIFEST |
| `server/` | `server/` | 2 | 15.5 KB | `server.js`、`README.md` |
| `tools/` | `tools/` | 3 | 24.7 KB | `gen_assets.py`、`smoke/cases.js`、`smoke/run.js` |

## 3. `src/js/` 明细

| 包内路径 | 作用 |
| --- | --- |
| `js/store.js` | 常量与数据层：搜索引擎、背景预设、默认数据、`normalizeData`、`store` 封装、工具函数 |
| `js/main.js` | 入口：`bindEvents` 汇总、全局快捷键、`init()` |
| `js/background.js` | Service Worker：点击工具栏图标打开新标签页 |
| `js/core/` | `icons.js`（内联 SVG）、`utils.js`（DOM/剪贴板/下载）、`state.js`（全局状态）、`data.js`（分组与持久化）、`media.js`（本地图片压缩） |
| `js/features/` | `preferences.js`、`rail.js`、`search.js`、`grid.js`、`folder.js`、`menu.js`、`modal.js`、`link-modal.js`、`settings-panel.js`、`backup.js`、`sync.js`、`bookmarks.js`、`bookmark-sync.js` |
| `js/widgets/` | `registry.js`（组件注册表）、`picker.js`（添加组件）、`clock.js`（时钟，占 2 格） |
| `js/widgets/ai/` | `index.js`（注册）、`store.js`（AI 数据层）、`api.js`（OpenAI 兼容请求）、`chat.js`（对话框）、`settings.js`（模型/提示词设置） |

模块划分与加载顺序见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 4. 未打入包的文件

| 工程路径 | 未打包原因 |
| --- | --- |
| `dist/` | 压缩包自身，避免递归打包 |
| `AGENTS.md` | 仓库内 AI 协作约定，与扩展运行无关 |
| `server/data/` | 运行时数据（首次启动自动创建） |
| `.git/`、`__pycache__/`、`*.pyc` | 版本控制与本地缓存 |

## 5. 安装 / 使用对应关系

| 目标 | 需要的文件 |
| --- | --- |
| 在浏览器中安装扩展 | 解压整个包，用「加载已解压的扩展程序」指向解压后的根目录（含 `manifest.json`） |
| 只部署后端 | 只需 `server/server.js`，`node server.js` 即可运行 |
| 对接自研后端 | 阅读 `doc/PROTOCOL.md`，按第 7 章实现接口即可与扩展互通 |
| 修改背景预设 | 图片放入 `src/assets/`，在 `src/js/store.js` 的 `THEMES` 数组加一项 |
| 重新生成图标/矢量背景 | `python tools/gen_assets.py` |
| 备份/迁移扩展数据 | 扩展内「设置 → 备份与恢复 → 导出备份」，得到 JSON，可在其他机器导入 |
| 导入到浏览器书签栏 | 扩展内空白处右键 →「同步书签」→「主页 → 书签」，或导出 JSON 备份后在新机器恢复 |

## 6. 打包方式复现

```powershell
cd 浏览器插件
Compress-Archive -Path manifest.json,README.md,LICENSE,src,doc,server,tools `
  -DestinationPath dist/qihang-nav-1.1.0.zip -Force
```

> `Compress-Archive` 打包不含顶层文件夹，解压后的目录即为扩展根目录。
> 注意：Windows PowerShell 5.1 的 `Compress-Archive` 会把条目名写成反斜杠（`src\js\main.js`），在 macOS / Linux 上解压可能变成一个畸形文件名。若要跨平台分发，改用下面的写法（条目名统一为 `/`）。

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$root = (Get-Location).Path
$out  = Join-Path $root 'dist\qihang-nav-1.1.0.zip'
if (Test-Path $out) { Remove-Item $out -Force }

$files = @(Get-Item (Join-Path $root 'manifest.json'), (Join-Path $root 'README.md'), (Join-Path $root 'LICENSE'))
foreach ($d in @('src', 'doc', 'server', 'tools')) {
  $files += Get-ChildItem -Path (Join-Path $root $d) -Recurse -File
}

$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($f in $files) {
  $rel   = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open(); $fs = [System.IO.File]::OpenRead($f.FullName)
  $fs.CopyTo($es); $fs.Dispose(); $es.Dispose()
}
$zip.Dispose()
```

打包后核对：

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path dist\qihang-nav-1.1.0.zip).Path)
$z.Entries.Count                                              # 62
@($z.Entries | Where-Object { $_.FullName -like '*\*' }).Count  # 0（无反斜杠条目）
$z.Entries | Where-Object { $_.FullName -eq 'src/newtab.html' } # 入口必须在
$z.Dispose()
```
