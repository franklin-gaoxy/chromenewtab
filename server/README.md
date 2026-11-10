# QSP v1 示例服务器

零依赖 Node.js 实现，仅用于**本地联调与协议参考**，数据保存在 `data/users.json`。

> 协议规范见 [`../doc/PROTOCOL.md`](../doc/PROTOCOL.md)

## 运行

```bash
cd server
node server.js
# 默认监听 http://127.0.0.1:8787
```

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；局域网调试可设为 `0.0.0.0` |

要求 Node.js ≥ 18（使用了内置 `fetch`/`scrypt`/`base64url` 等能力，无需 npm install）。

## 数据文件

首次运行会自动创建 `data/users.json`：

```json
{
  "version": 1,
  "users": [
    {
      "id": "u_1a2b3c4d5e6f7890",
      "username": "demo",
      "salt": "随机盐",
      "passwordHash": "scrypt(password, salt) 十六进制",
      "createdAt": "2026-11-06T08:30:00.000Z",
      "sync": {
        "rev": 2,
        "updatedAt": "2026-11-06T08:35:00.000Z",
        "payload": { "schema": 1, "groups": [], "activeGroupId": "" }
      }
    }
  ],
  "tokens": [
    { "token": "qst_xxx", "userId": "u_1a2b…", "createdAt": "…", "expiresAt": 1794000000000 }
  ]
}
```

- 密码用 `scrypt` + 随机盐存储，存档里没有明文密码。
- 令牌默认 30 天有效，退出登录即吊销。
- 想清空所有账号，停服后删除 `data/users.json` 即可。

## 在扩展中连接

1. `node server.js` 启动服务
2. 打开导航页 → 右上角菜单/右键 → **设置 → 远程同步**
3. 服务器地址填 `http://localhost:8787`
4. 输入用户名与密码，点「注册」或「登录」
5. 之后可用「上传到服务器」「从服务器恢复」「智能合并」

> 首次连接时 Chrome 会弹出「读取和更改此站点数据」授权，这是扩展的 `optional_host_permissions` 机制，同意后才能请求该服务器。

## 接口速查

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | 否 | 健康检查 |
| GET | `/api/v1/meta` | 否 | 协议版本与限制 |
| POST | `/api/v1/auth/register` | 否 | 注册并返回令牌 |
| POST | `/api/v1/auth/login` | 否 | 登录并返回令牌 |
| POST | `/api/v1/auth/logout` | 是 | 吊销当前令牌 |
| GET | `/api/v1/auth/session` | 是 | 校验令牌 |
| GET | `/api/v1/sync` | 是 | 拉取载荷 |
| PUT | `/api/v1/sync` | 是 | 写入载荷（`baseRev` 冲突检测） |
| DELETE | `/api/v1/sync` | 是 | 清空载荷 |

## 安全提醒

这是**示例**服务：单进程内存 + 同步文件写入，无速率限制、无 HTTPS、无并发保护。

- 只在本地或受信任的内网使用
- 不要写入真实密码
- 对外部署请至少补齐：HTTPS、登录限流、SQLite/Postgres 存储、日志脱敏
