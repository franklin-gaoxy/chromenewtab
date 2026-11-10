/* 左侧常驻分组栏 */

/* ---------------- 分组栏（常驻图标栏） ---------------- */
const GROUP_ICONS = [
  '<svg viewBox="0 0 24 24"><path d="M4 10.4 12 4l8 6.4V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19v-8.6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3.6" y="4.6" width="16.8" height="14.8" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.6 9.4h16.8" stroke="currentColor" stroke-width="1.6"/><path d="M7.6 13.4h4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4.2 8.6a2 2 0 0 1 2-2h3l1.6 2h6.9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2V8.6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.9 12h16.2" stroke="currentColor" stroke-width="1.5"/><path d="M12 3.9c2.3 2.4 3.3 5.3 3.3 8.1s-1 5.7-3.3 8.1c-2.3-2.4-3.3-5.3-3.3-8.1S9.7 6.3 12 3.9Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M7.2 3.6v6a2.4 2.4 0 0 0 4.8 0v-6M9.6 11.8v8.6M16.8 3.6c-1.5 1.2-2.2 2.9-2.2 4.7 0 1.6.7 2.6 2.2 3.2v9.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.6" height="6.6" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="m12 4.4 2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.8L12 4.4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M3.6 7.2a2 2 0 0 1 2-2h3.1l1.7 2.1h7.9a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V7.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
];

function groupIcon(index) {
  return GROUP_ICONS[index % GROUP_ICONS.length];
}

function renderSidebar() {
  const wrap = $('groupList');
  wrap.innerHTML = '';

  state.groups.forEach((g, index) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'rail-item' + (g.id === state.activeGroupId ? ' active' : '');
    node.dataset.id = g.id;
    node.title = g.name + ' · ' + g.items.length + ' 个站点';
    node.innerHTML =
      '<span class="rail-icon">' + groupIcon(index) + '</span>' +
      '<span class="rail-label">' + esc(g.name) + '</span>';

    node.addEventListener('click', () => {
      if (node.classList.contains('editing')) return;
      selectGroup(g.id);
    });

    node.addEventListener('dragover', (e) => {
      if (!dragState) return;
      e.preventDefault();
      if (g.id !== state.activeGroupId) node.classList.add('drop-target');
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      node.classList.remove('drop-target');
      if (!dragState) return;
      const from = groupById(dragState.groupId);
      if (!from || from.id === g.id) return;
      const idx = from.items.findIndex((it) => it.id === dragState.itemId);
      if (idx < 0) return;
      const [item] = from.items.splice(idx, 1);
      g.items.unshift(item);
      toast('已移动到「' + g.name + '」');
      save();
      renderAll();
    });

    wrap.appendChild(node);
  });
}

function selectGroup(id) {
  if (state.activeGroupId === id) return;
  state.activeGroupId = id;
  ui.page = 0;
  save();
  renderAll();
}

function startRename(g, node) {
  const label = node.querySelector('.rail-label');
  if (!label || node.querySelector('.rail-input')) return;

  const input = document.createElement('input');
  input.className = 'rail-input';
  input.value = g.name;
  input.maxLength = 16;
  node.classList.add('editing');
  label.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (commit && val) g.name = val.slice(0, 16);
    save();
    renderAll();
  };

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function createGroup() {
  const g = { id: uid('g'), name: '新分组', items: [] };
  state.groups.push(g);
  state.activeGroupId = g.id;
  ui.page = 0;
  save();
  renderAll();

  const node = document.querySelector('.rail-item[data-id="' + g.id + '"]');
  if (node) startRename(g, node);
}

/* ---------------- 事件绑定 ---------------- */
function bindRailEvents() {
  $('addGroup').addEventListener('click', createGroup);
}

