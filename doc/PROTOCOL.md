# 启航同步协议（QSP）v1

> Qihang Sync Protocol，简称 **QSP**。本文件是 v1 的规范性说明，任何服务端实现只要满足本文要求，就能与本扩展互通。
>
> - 协议版本：`1`
> - 状态：稳定
> - 参考实现：`server/server.js`（零依赖 Node.js 示例服务）
> - 客户端实现：`js/newtab.js`（`qspRequest` 及同步相关函数）

---

## 1. 概述

QSP 用于在**用户自己的服务器**上备份与同步导航数据（分组、站点）。设计目标：

- **极简**：只需 HTTP + JSON，无 WebSocket、无额外 SDK。
- **无状态鉴权**：所有同步请求使用 Bearer Token。
- **乐观并发**：用自增修订号 `rev` 做冲突检测，客户端可自行选择覆盖或合并。
- **可自建**：第三方可用任何语言实现，只需遵循本文。

协议**不包含**：账号找回、多用户共享、实时推送、文件上传（图标以外）。

---

## 2. 术语

| 术语 | 说明 |
| --- | --- |
| 客户端 | 浏览器扩展（`newtab.html` 运行的同步模块） |
| 服务端 | 用户自建、符合本协议的 HTTP 服务 |
| 载荷 / payload | 一份完整的导航数据快照，见第 6 章 |
| `rev` | 修订号，从 0 开始，每次成功写入 +1，单调递增 |
| 会话令牌 / token | 登录后由服务端签发的不透明字符串 |
| 强制覆盖 | 不带版本校验的写入（`baseRev: null`） |

---

## 3. 传输层约定

| 项目 | 规定 |
| --- | --- |
| 协议 | HTTP/1.1 或更高 |
| 安全 | **生产环境必须使用 HTTPS**；`http://` 仅允许在 `localhost`/内网调试 |
| 基础路径 | `<server>/api/v1` |
| 媒体类型 | `application/json; charset=utf-8` |
| 字符编码 | UTF-8 |
| 时间格式 | RFC 3339（UTC），如 `2026-11-06T08:30:00.000Z` |
| 请求头 `X-QSP-Version` | 客户端声明的协议主版本，值为 `1`。服务端不支持时应返回 `400 UNSUPPORTED_VERSION` |
| 响应头 `X-QSP-Server` | 服务端实现标识，如 `qihang-sample/1.1.0`，便于排查问题 |
| 请求体大小上限 | **2 MiB**（2097152 字节） |
| 缓存 | 客户端应使用 `no-store`，服务端应返回 `Cache-Control: no-store` |

**CORS**：扩展页面直接跨域请求服务端，服务端必须允许：

```
Access-Control-Allow-Origin: <请求的 Origin>（或 *）
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-QSP-Version
Access-Control-Max-Age: 86400
```

预检请求（`OPTIONS`）应返回 `204 No Content`。

---

## 4. 认证

1. 客户端通过注册或登录接口获得 `token`。
2. 之后所有受保护接口都必须携带：

```http
Authorization: Bearer qst_xxxxxxxxxxxxxxxxxxxxxxxx
```

3. `token` 对客户端**不透明**，不得解析其内部结构。示例实现的格式为 `qst_` + 24 字节随机数的 base64url 编码。
4. 有效期建议 30 天；服务端可在 `expiresAt`（ISO 8601）中给出确切时间。
5. 令牌失效、被吊销、格式错误 → 返回 `401 UNAUTHORIZED`。客户端此时应清除本地令牌并要求重新登录。
6. 退出登录调用 `POST /auth/logout`，服务端应立即吊销该令牌（`200` 即使令牌已失效也可接受）。

**密码传输**：客户端只发送明文密码，安全性依赖 HTTPS。服务端**必须**使用加盐慢哈希存储（示例使用 `scrypt` + 16 字节随机盐），禁止明文或裸 MD5/SHA1 存储。

---

## 5. 响应信封与错误码

所有响应（除 `204`）都是 JSON 对象，`ok` 字段为布尔值。

**成功**

```json
{
  "ok": true,
  "data": { }
}
```

**失败**

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误"
  }
}
```

- `code` 为**机器可读**的稳定标识，客户端据此分支处理，不得依赖 `message` 文本。
- `message` 为**人类可读**的提示，可本地化、可变化。
- 部分错误可附带 `data`（例如冲突时返回服务端当前 `rev`），见第 8 章。

### 5.1 错误码表

| `code` | 建议 HTTP 状态 | 含义 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 参数缺失、格式非法、校验失败 |
| `UNSUPPORTED_VERSION` | 400 | 协议主版本不受支持 |
| `UNAUTHORIZED` | 401 | 缺少令牌或令牌无效/过期 |
| `INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `FORBIDDEN` | 403 | 有权访问但不允许该操作 |
| `NOT_FOUND` | 404 | 接口或资源不存在 |
| `METHOD_NOT_ALLOWED` | 405 | 该路径不支持此 HTTP 方法 |
| `USER_EXISTS` | 409 | 注册时用户名已存在 |
| `CONFLICT` | 409 | 修订号不匹配（并发写入） |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体或载荷超过 2 MiB |
| `TOO_MANY_REQUESTS` | 429 | 触发限流 |
| `SERVER_ERROR` | 500 | 服务端内部错误 |

---

## 6. 同步载荷（SyncPayload）

载荷是一份**完整快照**，不是增量补丁。服务端只负责原样存取，不理解其中业务含义（除基本格式校验）。

```json
{
  "schema": 1,
  "groups": [
    {
      "id": "g_home_001",
      "name": "首页",
      "items": [
        {
          "id": "i_001",
          "title": "掘金",
          "url": "https://juejin.cn/",
          "icon": ""
        }
      ]
    }
  ],
  "activeGroupId": "g_home_001"
}
```

### 6.1 字段说明

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `schema` | number | 是 | 固定为 `1`，载荷结构版本 |
| `groups` | array | 是 | 最多 100 个分组 |
| `groups[].id` | string | 是 | `^[A-Za-z0-9_-]{1,64}$`，在载荷内唯一 |
| `groups[].name` | string | 是 | 非空，≤ 20 字符 |
| `groups[].items` | array | 是 | 最多 200 条 |
| `groups[].items[].id` | string | 是 | 同 `id` 规则，在分组内唯一 |
| `groups[].items[].title` | string | 是 | 非空，≤ 40 字符 |
| `groups[].items[].url` | string | 是 | 必须是 `http://` 或 `https://` 绝对地址 |
| `groups[].items[].icon` | string | 否 | 空串表示由客户端自动取站点图标；也可为 `https://…` 或 `data:image/…;base64,…`，单条建议 ≤ 200 KiB |
| `activeGroupId` | string | 否 | 上次选中的分组 id，可能指向不存在的分组，客户端需自行兜底 |

### 6.2 明确不同步的内容

v1 中以下内容**只保存在本地**，不进入载荷：

- `settings`：搜索引擎、背景主题/自定义背景图、是否新标签页打开等本地偏好
- 登录令牌、服务器地址
- 侧栏展开状态、当前页码等界面状态

> 这样既避免每台设备的个性化设置互相覆盖，也避免把体积很大的背景图塞进同步载荷。

### 6.3 载荷校验（服务端必须）

服务端在写入前应校验：`schema === 1`、`groups` 为数组且长度合规、每个 `id` 符合正则、`url` 协议合法、字符串长度合规、序列化后 ≤ 2 MiB。校验失败返回 `400 BAD_REQUEST`，超限返回 `413 PAYLOAD_TOO_LARGE`。

---

## 7. 接口定义

### 7.1 健康检查

```
GET /api/v1/health
```

无需鉴权，用于客户端「测试连接」。

| 项 | 内容 |
| --- | --- |
| 成功 | `200` |

```json
{ "ok": true, "data": { "status": "ok", "time": "2026-11-06T08:30:00.000Z" } }
```

### 7.2 服务端信息

```
GET /api/v1/meta
```

无需鉴权。客户端可用它确认协议版本与限制。

```json
{
  "ok": true,
  "data": {
    "name": "启航示例服务器",
    "protocol": "qsp",
    "protocolVersion": 1,
    "server": "qihang-sample/1.1.0",
    "authScheme": "Bearer",
    "tokenTtlSeconds": 2592000,
    "maxPayloadBytes": 2097152
  }
}
```

### 7.3 注册

```
POST /api/v1/auth/register
Content-Type: application/json
```

```json
{ "username": "demo", "password": "demo1234" }
```

- `username`：3–32 位，`^[A-Za-z0-9_.-]{3,32}$`，大小写不敏感唯一
- `password`：6–128 位

**成功** `201`

```json
{
  "ok": true,
  "data": {
    "token": "qst_xxx",
    "expiresAt": "2026-12-06T08:30:00.000Z",
    "user": {
      "id": "u_1a2b3c4d5e6f7890",
      "username": "demo",
      "createdAt": "2026-11-06T08:30:00.000Z",
      "rev": 0,
      "updatedAt": null
    }
  }
}
```

**错误**：`400 BAD_REQUEST`（用户名/密码不合规）、`409 USER_EXISTS`

### 7.4 登录

```
POST /api/v1/auth/login
```

请求体与响应结构同注册，成功状态码为 `200`。

**错误**：`400 BAD_REQUEST`、`401 INVALID_CREDENTIALS`（用户名不存在与密码错误**必须**返回同一错误，避免账号枚举）

### 7.5 校验会话

```
GET /api/v1/auth/session
Authorization: Bearer <token>
```

```json
{ "ok": true, "data": { "user": { "id": "u_…", "username": "demo", "rev": 3, "updatedAt": "…" } } }
```

用于扩展启动时确认令牌是否仍有效。`401` 表示需要重新登录。

### 7.6 退出登录

```
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

服务端吊销当前令牌，返回 `{ "ok": true, "data": { "loggedOut": true } }`。

### 7.7 拉取数据

```
GET /api/v1/sync
Authorization: Bearer <token>
```

**从未同步过的账号**返回 `rev: 0`、`payload: null`：

```json
{ "ok": true, "data": { "rev": 0, "updatedAt": null, "payload": null } }
```

**已同步**：

```json
{
  "ok": true,
  "data": {
    "rev": 3,
    "updatedAt": "2026-11-06T08:31:00.000Z",
    "payload": { "schema": 1, "groups": [], "activeGroupId": "g_home_001" }
  }
}
```

### 7.8 写入数据

```
PUT /api/v1/sync
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "baseRev": 3,
  "payload": { "schema": 1, "groups": [], "activeGroupId": "g_home_001" }
}
```

`baseRev` 语义：

| 取值 | 语义 | 服务端行为 |
| --- | --- | --- |
| `null`（或不提供） | **强制覆盖** | 忽略版本校验，直接写入，`rev = 当前 rev + 1` |
| 数字 | **乐观锁** | 与当前 `rev` 比较，相等才写入，否则返回 `409 CONFLICT` |

**成功** `200`

```json
{ "ok": true, "data": { "rev": 4, "updatedAt": "2026-11-06T08:33:00.000Z" } }
```

**冲突** `409`（注意 `ok: false` 且带 `data`，客户端可据此立即重试）

```json
{
  "ok": false,
  "error": { "code": "CONFLICT", "message": "数据版本冲突，请先拉取最新数据后重试" },
  "data": { "rev": 5, "updatedAt": "2026-11-06T08:32:00.000Z" }
}
```

**错误**：`400 BAD_REQUEST`、`401 UNAUTHORIZED`、`413 PAYLOAD_TOO_LARGE`

### 7.9 清空数据

```
DELETE /api/v1/sync
Authorization: Bearer <token>
```

清空载荷但继续递增 `rev`（避免旧版本被回写），返回新的 `rev` 与 `updatedAt`。扩展 v1 暂未使用该接口，服务端可选择实现。

---

## 8. 同步流程

### 8.1 首次配置

```
客户端                                  服务端
  │  POST /auth/login  ─────────────────▶ │ 校验密码，签发 token
  │  ◀───────────── 200 {token, user}     │
  │  GET /sync                            │
  │  ◀───────────── 200 {rev:0,payload:null}
  │  PUT /sync {baseRev:null, payload}    │
  │  ◀───────────── 200 {rev:1}           │
```

### 8.2 三种操作语义（扩展内置）

| 操作 | 请求序列 | 说明 |
| --- | --- | --- |
| 上传到服务器 | `PUT`，`baseRev: null` | 用本机数据强制覆盖服务端 |
| 从服务器恢复 | `GET` → 覆盖本地 | 危险操作，扩展会二次确认 |
| 智能合并 | `GET` → 本地合并 → `PUT baseRev = 远端 rev` | 正常的多设备同步路径 |

### 8.3 智能合并（客户端规则）

QSP 不规定合并算法，但扩展实现采用以下确定性规则，其它客户端可参考：

1. 分组按 `id` 对齐；先放本地分组（保持本地顺序），再追加仅远端存在的分组。
2. 同名但 `id` 不同的分组**不自动合并**（避免误合并）。
3. 分组内条目按 `id` 去重；再按 `url` 去重（防止不同设备重复添加同一站点）。
4. 冲突时**本地优先**（同 `id` 条目保留本地 `title`/`icon`）。
5. `activeGroupId` 采用本地值；本地值不存在时由客户端兜底为第一个分组。

### 8.4 冲突处理决策

收到 `409 CONFLICT` 时客户端应：

1. 用响应中的 `data.rev` 更新本地记录的 `rev`；
2. 重新 `GET /sync` 获取远端最新载荷；
3. 让用户选择「用远端覆盖本地」还是「合并后重试」，**不要**静默强制覆盖。

---

## 9. 版本与兼容

- `X-QSP-Version` 表示**主版本**。主版本不同（如 `2`）视为不兼容，服务端返回 `400 UNSUPPORTED_VERSION`。
- 次版本演进遵循「向后兼容」：只允许**新增可选字段**，不得改变既有字段语义与类型。
- 客户端解析响应时必须**忽略未知字段**；服务端解析载荷时同理。
- `payload.schema` 独立演进：客户端支持 `1`；服务端遇到未知 `schema` 应返回 `400 BAD_REQUEST` 而不是静默丢弃。

---

## 10. 安全要求清单

部署真实服务端时至少满足：

- [x] 强制 HTTPS（证书有效），HSTS
- [x] 密码使用 `scrypt`/`argon2` + 随机盐；禁止明文存储与日志输出
- [x] 令牌足够随机（≥ 128 bit），可吊销、可过期
- [x] 登录接口限流（如 5 次/分钟/IP），失败响应不区分「用户不存在/密码错误」
- [x] 请求体大小限制（2 MiB），防止内存放大攻击
- [x] 不记录完整令牌与密码到日志
- [x] 数据库文件权限最小化（示例为本地 JSON，生产建议换 SQLite/Postgres）
- [x] CORS 白名单：生产环境建议只允许 `chrome-extension://<你的扩展 ID>`

---

## 11. 附录

### 11.1 完整 curl 会话

```bash
# 健康检查
curl -s http://127.0.0.1:8787/api/v1/health

# 注册（返回 token）
curl -s -X POST http://127.0.0.1:8787/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo1234"}'

# 登录
curl -s -X POST http://127.0.0.1:8787/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo1234"}'

# 上传（强制覆盖）
curl -s -X PUT http://127.0.0.1:8787/api/v1/sync \
  -H 'Content-Type: application/json' \
  -H 'X-QSP-Version: 1' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"baseRev":null,"payload":{"schema":1,"groups":[{"id":"g_1","name":"首页","items":[{"id":"i_1","title":"掘金","url":"https://juejin.cn/","icon":""}]}],"activeGroupId":"g_1"}}'

# 拉取
curl -s http://127.0.0.1:8787/api/v1/sync -H "Authorization: Bearer $TOKEN"

# 触发冲突（baseRev 落后）
curl -s -X PUT http://127.0.0.1:8787/api/v1/sync \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"baseRev":0,"payload":{"schema":1,"groups":[],"activeGroupId":""}}'
```

### 11.2 典型错误排查

| 现象 | 原因 |
| --- | --- |
| 浏览器控制台报 CORS 错误 | 服务端未返回 `Access-Control-Allow-*`，或扩展未授权该 origin |
| 连接超时 | 地址写错 / 端口未放通 / 服务端只监听 127.0.0.1 而访问的是局域网 IP |
| 一直 401 | 令牌过期或被覆盖，重新登录即可 |
| 上传后另一台设备看不到 | 对方执行的是「强制覆盖」旧数据，或未执行「从服务器恢复/合并」 |

### 11.3 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| 1 | 2026-11-06 | 首版：认证、`GET/PUT/DELETE /sync`、`schema: 1` 载荷 |
