/* 搜索分类与搜索引擎切换 */

/* ---------------- 搜索栏与分类 ---------------- */
function renderEngines() {
  const nav = $('engines');
  nav.innerHTML = '';
  CATS.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'engine-tab' + (state.settings.cat === cat.key ? ' active' : '');
    const key = 'search.cat.' + cat.key;
    btn.textContent = i18nHas(key) ? i18n(key) : cat.label;
    btn.addEventListener('click', () => {
      state.settings.cat = cat.key;
      save();
      renderEngines();
    });
    nav.appendChild(btn);
  });
}

function renderSearchEngine() {
  const engine = ENGINES[state.settings.engine] || ENGINES.bing;
  const badge = $('engineBadge');
  badge.textContent = engine.badge;
  $('searchInput').placeholder = i18n('search.placeholderWith', { engine: engine.label });
}


function doSearch() {
  const q = $('searchInput').value.trim();
  if (!q) return;
  openUrl(buildSearchUrl(q, state.settings.engine, state.settings.cat));
}

/* ---------------- 事件绑定 ---------------- */
function bindSearchEvents() {
  $('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    doSearch();
  });

  const input = $('searchInput');
  input.addEventListener('input', () => {
    ui.query = input.value;
    ui.page = 0;
    $('clearBtn').hidden = !input.value;
    renderGrid();
  });

  $('clearBtn').addEventListener('click', () => {
    input.value = '';
    ui.query = '';
    ui.page = 0;
    $('clearBtn').hidden = true;
    renderGrid();
    input.focus();
  });

  $('enginePick').addEventListener('click', (e) => {
    e.stopPropagation();
    const items = Object.keys(ENGINES).map((key) => ({
      label: (key === state.settings.engine ? '✓ ' : '') + ENGINES[key].label,
      run: () => {
        state.settings.engine = key;
        save();
        renderSearchEngine();
        syncSettingsUI();
      }
    }));
    showMenu(e, items);
  });
}

