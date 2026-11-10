/* 导航数据读写辅助 */

/* ---------------- 数据取值 ---------------- */
function groupById(id) {
  return state.groups.find((g) => g.id === id) || null;
}

function currentGroup() {
  return groupById(state.activeGroupId) || state.groups[0];
}

/* 站点总数：文件夹算一个图标，内部的站点也计入 */
function totalItems() {
  return state.groups.reduce(
    (sum, g) =>
      sum +
      g.items.reduce((n, it) => n + 1 + (it.kind === 'folder' ? it.items.length : 0), 0),
    0
  );
}

/* 按 id 定位条目（会进入文件夹一层）；返回可直接修改的数组与下标 */
function findItemEntry(groupId, itemId) {
  const group = groupById(groupId);
  if (!group) return null;

  const index = group.items.findIndex((it) => it.id === itemId);
  if (index >= 0) {
    return { group, folder: null, list: group.items, index, item: group.items[index] };
  }

  for (const it of group.items) {
    if (it.kind !== 'folder') continue;
    const j = it.items.findIndex((x) => x.id === itemId);
    if (j >= 0) return { group, folder: it, list: it.items, index: j, item: it.items[j] };
  }
  return null;
}

/* 分组内全部网址（含文件夹内的站点），用于导入去重 */
function collectGroupUrls(group) {
  const set = new Set();
  if (!group) return set;
  group.items.forEach((it) => {
    if (it.kind === 'folder') it.items.forEach((x) => x.url && set.add(x.url));
    else if (it.url) set.add(it.url);
  });
  return set;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.set(STORE_KEY, {
      groups: state.groups,
      activeGroupId: state.activeGroupId,
      settings: state.settings
    });
  }, 160);
}
