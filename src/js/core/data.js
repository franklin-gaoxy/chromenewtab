/* 导航数据读写辅助 */

/* ---------------- 数据取值 ---------------- */
function groupById(id) {
  return state.groups.find((g) => g.id === id) || null;
}

function currentGroup() {
  return groupById(state.activeGroupId) || state.groups[0];
}

function totalItems() {
  return state.groups.reduce((sum, g) => sum + g.items.length, 0);
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
