/* 全局状态（导航数据 / 同步状态 / 分页视图状态） */

let state = null;
let saveTimer = 0;
let dragState = null;
let editing = null; // { groupId, itemId | null }

// 远程同步状态（单独存储，不进入导航数据备份）
let syncState = {
  server: '',
  token: '',
  username: '',
  userId: '',
  lastSyncAt: 0,
  rev: 0
};

const ui = { page: 0, pages: 1, query: '' };
