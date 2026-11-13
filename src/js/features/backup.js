/* 备份导出 / 导入（JSON 与浏览器书签） */

/* ---------------- 数据导入导出 ---------------- */
function buildBackupPayload() {
  return {
    app: 'qihang-nav',
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: state.groups,
    activeGroupId: state.activeGroupId,
    settings: state.settings
  };
}

function exportData() {
  const payload = buildBackupPayload();
  downloadBlob(
    JSON.stringify(payload, null, 2),
    'qihang-nav-' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json'
  );
  toast(i18n('settings.exportDone'));
}

/* ---------------- 导出为浏览器书签（Netscape Bookmark File） ---------------- */

function escapeBookmark(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBookmarksHtml(rootName) {
  const now = Math.floor(Date.now() / 1000);
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    '    <DT><H3 ADD_DATE="' + now + '" LAST_MODIFIED="' + now + '">' + escapeBookmark(rootName) + '</H3>',
    '    <DL><p>'
  ];

  let folders = 0;
  let links = 0;

  const pushFolder = (indent, name) => {
    lines.push(
      indent + '<DT><H3 ADD_DATE="' + now + '" LAST_MODIFIED="' + now + '">' +
        escapeBookmark(name) + '</H3>'
    );
    lines.push(indent + '<DL><p>');
    folders += 1;
  };

  const pushLink = (indent, site) => {
    const url = normalizeUrl(site.url);
    if (!url) return;
    lines.push(
      indent + '<DT><A HREF="' + escapeBookmark(url) + '" ADD_DATE="' + now + '">' +
        escapeBookmark(site.title || hostOf(url) || url) + '</A>'
    );
    links += 1;
  };

  state.groups.forEach((g) => {
    const sites = g.items.filter((it) => it.kind !== 'folder' && normalizeUrl(it.url));
    const subFolders = g.items.filter((it) => it.kind === 'folder' && it.items.length);
    if (!sites.length && !subFolders.length) return;

    // 分组 → 一层文件夹；分组里的文件夹 → 再一层（与书签同步的层级一致）
    pushFolder('        ', g.name);
    sites.forEach((it) => pushLink('            ', it));
    subFolders.forEach((folder) => {
      pushFolder('            ', folder.title);
      folder.items.forEach((it) => pushLink('                ', it));
      lines.push('            </DL><p>');
    });
    lines.push('        </DL><p>');
  });

  lines.push('    </DL><p>', '</DL><p>', '');
  return { html: lines.join('\n'), folders, links };
}

function exportBookmarks() {
  const { html, folders, links } = buildBookmarksHtml(i18n('app.brand'));
  if (!links) {
    toast(i18n('settings.noSites'));
    return;
  }
  downloadBlob(
    html,
    'qihang-bookmarks-' + new Date().toISOString().slice(0, 10) + '.html',
    'text/html;charset=utf-8'
  );
  toast(i18n('settings.bookmarksExported', { folders, links }));
}

async function importData(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.groups)) throw new Error('bad');
    state = normalizeData(parsed);
    ui.page = 0;
    save();
    applyLanguage(state.settings.lang);
    applySettings();
    renderAll();
    syncSettingsUI();
    toast(i18n('settings.importDone', { n: totalItems() }));
  } catch (e) {
    toast(i18n('settings.importFailed'));
  }
}

/* ---------------- 事件绑定 ---------------- */
function bindBackupEvents() {
  $('dataExport').addEventListener('click', exportData);
  $('dataExportBookmarks').addEventListener('click', exportBookmarks);
  $('dataImportBtn').addEventListener('click', () => $('dataImport').click());
  $('dataImport').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm(i18n('settings.importConfirm'))) return;
    await importData(file);
  });

  $('dataReset').addEventListener('click', () => {
    if (!window.confirm(i18n('settings.resetConfirm'))) return;
    state = normalizeData(defaultData());
    ui.page = 0;
    save();
    applyLanguage(state.settings.lang);
    applySettings();
    renderAll();
    syncSettingsUI();
    toast(i18n('settings.resetDone'));
  });
}

