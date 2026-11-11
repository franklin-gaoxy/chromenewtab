#!/usr/bin/env node
'use strict';

/**
 * 启航 · QSP v1 示例服务器
 * 零依赖（Node.js 内置模块），数据以 JSON 文件保存在 server/data/users.json
 * 协议规范：../doc/PROTOCOL.md
 *
 *   node server.js
 *   PORT=9000 node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const PROTOCOL_VERSION = 1;
const SERVER_ID = 'qihang-sample/1.1.1';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_PAYLOAD_BYTES + 64 * 1024;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/* ---------------------------------------------------------------- 数据层 */

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    return {
      version: 1,
      users: Array.isArray(db.users) ? db.users : [],
      tokens: Array.isArray(db.tokens) ? db.tokens : []
    };
  } catch (e) {
    return { version: 1, users: [], tokens: [] };
  }
}

function saveDB(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------------------------------------------------------- 工具 */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function issueToken(db, userId) {
  const now = Date.now();
  db.tokens = db.tokens.filter((t) => t.expiresAt > now);
  const token = 'qst_' + crypto.randomBytes(24).toString('base64url');
  db.tokens.push({
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + TOKEN_TTL_MS
  });
  return { token, expiresAt: new Date(now + TOKEN_TTL_MS).toISOString() };
}

function authenticate(db, req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const token = match[1].trim();
  const record = db.tokens.find((t) => t.token === token);
  if (!record || record.expiresAt <= Date.now()) return null;
  const user = db.users.find((u) => u.id === record.userId);
  if (!user) return null;
  return { user, token };
}

function publicUser(user) {
  const sync = user.sync || {};
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    rev: sync.rev || 0,
    updatedAt: sync.updatedAt || null
  };
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-QSP-Version');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

function sendJSON(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'X-QSP-Server': SERVER_ID
  });
  res.end(text);
}

function ok(res, data, status) {
  sendJSON(res, status || 200, { ok: true, data });
}

function fail(res, status, code, message, data) {
  const body = { ok: false, error: { code, message } };
  if (data !== undefined) body.data = data;
  sendJSON(res, status, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('请求体超过 2 MiB 限制'), { code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { code: 'BAD_REQUEST' }));
      }
    });
    req.on('error', reject);
  });
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'payload 必须是对象';
  if (payload.schema !== 1) return 'payload.schema 必须为 1';
  if (!Array.isArray(payload.groups)) return 'payload.groups 必须是数组';
  if (payload.groups.length > 100) return '分组数量不能超过 100';

  for (const group of payload.groups) {
    if (!group || typeof group.id !== 'string' || !ID_RE.test(group.id)) return '分组 id 非法';
    if (typeof group.name !== 'string' || !group.name.trim()) return '分组 name 不能为空';
    if (group.name.length > 20) return '分组 name 超过 20 个字符';
    if (!Array.isArray(group.items)) return '分组 items 必须是数组';
    if (group.items.length > 200) return '单个分组的条目不能超过 200';

    for (const item of group.items) {
      if (!item || typeof item.id !== 'string' || !ID_RE.test(item.id)) return '条目 id 非法';
      if (typeof item.url !== 'string' || !isHttpUrl(item.url)) return '条目 url 必须是 http/https 绝对地址';
      if (typeof item.title !== 'string' || !item.title.trim()) return '条目 title 不能为空';
      if (item.title.length > 40) return '条目 title 超过 40 个字符';
      if (item.icon && typeof item.icon !== 'string') return '条目 icon 必须是字符串';
      if (item.icon.length > 200 * 1024) return '条目 icon 数据过大';
    }
  }
  return '';
}

/* ---------------------------------------------------------------- 路由 */

async function handleAuth(req, res, db, isRegister) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return fail(res, e.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, e.code || 'BAD_REQUEST', e.message);
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    return fail(res, 400, 'BAD_REQUEST', '用户名需为 3-32 位字母、数字、下划线、点或短横线');
  }
  if (password.length < 6 || password.length > 128) {
    return fail(res, 400, 'BAD_REQUEST', '密码长度需为 6-128 位');
  }

  if (isRegister) {
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return fail(res, 409, 'USER_EXISTS', '用户名已存在');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      username,
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
      sync: { rev: 0, updatedAt: null, payload: null }
    };
    db.users.push(user);
    const issued = issueToken(db, user.id);
    saveDB(db);
    console.log('[register]', username, user.id);
    return ok(res, { token: issued.token, expiresAt: issued.expiresAt, user: publicUser(user) }, 201);
  }

  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !safeEqual(hashPassword(password, user.salt), user.passwordHash)) {
    return fail(res, 401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }
  const issued = issueToken(db, user.id);
  saveDB(db);
  console.log('[login]', username);
  return ok(res, { token: issued.token, expiresAt: issued.expiresAt, user: publicUser(user) });
}

async function handleSync(req, res, db, user, method) {
  if (method === 'GET') {
    const sync = user.sync || { rev: 0, updatedAt: null, payload: null };
    return ok(res, {
      rev: sync.rev || 0,
      updatedAt: sync.updatedAt || null,
      payload: sync.payload || null
    });
  }

  if (method === 'PUT') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, e.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, e.code || 'BAD_REQUEST', e.message);
    }

    const message = validatePayload(body.payload);
    if (message) return fail(res, 400, 'BAD_REQUEST', message);

    const size = Buffer.byteLength(JSON.stringify(body.payload), 'utf8');
    if (size > MAX_PAYLOAD_BYTES) {
      return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'payload 超过 2 MiB 上限');
    }

    const current = (user.sync && user.sync.rev) || 0;
    const baseRev = body.baseRev === undefined ? null : body.baseRev;
    if (baseRev !== null && baseRev !== current) {
      return fail(res, 409, 'CONFLICT', '数据版本冲突，请先拉取最新数据后重试', {
        rev: current,
        updatedAt: (user.sync && user.sync.updatedAt) || null
      });
    }

    const updatedAt = new Date().toISOString();
    user.sync = { rev: current + 1, updatedAt, payload: body.payload };
    saveDB(db);
    console.log('[sync]', user.username, 'rev', user.sync.rev, size + 'B');
    return ok(res, { rev: user.sync.rev, updatedAt });
  }

  if (method === 'DELETE') {
    const current = (user.sync && user.sync.rev) || 0;
    const updatedAt = new Date().toISOString();
    user.sync = { rev: current + 1, updatedAt, payload: null };
    saveDB(db);
    return ok(res, { rev: user.sync.rev, updatedAt });
  }

  return fail(res, 405, 'METHOD_NOT_ALLOWED', '不支持的请求方法');
}

async function handle(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    return fail(res, 400, 'BAD_REQUEST', '非法的请求地址');
  }

  if (!pathname.startsWith('/api/v1/')) {
    return fail(res, 404, 'NOT_FOUND', '接口不存在');
  }

  const route = pathname.slice('/api/v1'.length);
  const method = req.method || 'GET';
  const db = loadDB();

  const declared = req.headers['x-qsp-version'];
  if (declared && Number(declared) !== PROTOCOL_VERSION) {
    return fail(res, 400, 'UNSUPPORTED_VERSION', '服务器仅支持 QSP v' + PROTOCOL_VERSION);
  }

  if (method === 'GET' && route === '/health') {
    return ok(res, { status: 'ok', time: new Date().toISOString() });
  }

  if (method === 'GET' && route === '/meta') {
    return ok(res, {
      name: '启航示例服务器',
      protocol: 'qsp',
      protocolVersion: PROTOCOL_VERSION,
      server: SERVER_ID,
      authScheme: 'Bearer',
      tokenTtlSeconds: Math.floor(TOKEN_TTL_MS / 1000),
      maxPayloadBytes: MAX_PAYLOAD_BYTES
    });
  }

  if (method === 'POST' && (route === '/auth/register' || route === '/auth/login')) {
    return handleAuth(req, res, db, route === '/auth/register');
  }

  const auth = authenticate(db, req);
  if (!auth) return fail(res, 401, 'UNAUTHORIZED', '登录状态已失效，请重新登录');

  if (method === 'POST' && route === '/auth/logout') {
    db.tokens = db.tokens.filter((t) => t.token !== auth.token);
    saveDB(db);
    return ok(res, { loggedOut: true });
  }

  if (method === 'GET' && route === '/auth/session') {
    return ok(res, { user: publicUser(auth.user) });
  }

  if (route === '/sync') {
    return handleSync(req, res, db, auth.user, method);
  }

  return fail(res, 404, 'NOT_FOUND', '接口不存在');
}

/* ---------------------------------------------------------------- 启动 */

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (res.headersSent) return;
    if (err && err.code === 'PAYLOAD_TOO_LARGE') {
      return fail(res, 413, 'PAYLOAD_TOO_LARGE', err.message);
    }
    if (err && err.code === 'BAD_REQUEST') {
      return fail(res, 400, 'BAD_REQUEST', err.message);
    }
    console.error('[error]', err);
    fail(res, 500, 'SERVER_ERROR', '服务器内部错误');
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  启航 · QSP v1 示例服务器已启动');
  console.log('  ------------------------------------------------');
  console.log('  监听地址 : http://' + HOST + ':' + PORT);
  console.log('  协议规范 : ../doc/PROTOCOL.md');
  console.log('  数据文件 : ' + DB_FILE);
  console.log('  健康检查 : GET /api/v1/health');
  console.log('');
  console.log('  在扩展「设置 → 远程同步」中填入上面的地址，即可注册/登录并同步。');
  console.log('  示例服务仅用于本地测试，请勿存放真实密码。');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n已停止');
  process.exit(0);
});
