/* 备份导出 / 导入（JSON 与浏览器书签） */

/* ---------------- 数据导入导出 ---------------- */
function exportData() {
  const payload = {
    app: 'qihang-nav',
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: state.groups,
    activeGroupId: state.activeGroupId,
    settings: state.settings
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    'qihang-nav-' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json'
  );
  toast('插件备份已导出');
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

  state.groups.forEach((g) => {
    const items = g.items.filter((it) => normalizeUrl(it.url));
    if (!items.length) return;
    folders += 1;
    lines.push(
      '        <DT><H3 ADD_DATE="' + now + '" LAST_MODIFIED="' + now + '">' +
        escapeBookmark(g.name) + '</H3>'
    );
    lines.push('        <DL><p>');
    items.forEach((it) => {
      const url = normalizeUrl(it.url);
      lines.push(
        '            <DT><A HREF="' + escapeBookmark(url) + '" ADD_DATE="' + now + '">' +
          escapeBookmark(it.title || hostOf(url) || url) + '</A>'
      );
      links += 1;
    });
    lines.push('        </DL><p>');
  });

  lines.push('    </DL><p>', '</DL><p>', '');
  return { html: lines.join('\n'), folders, links };
}

function exportBookmarks() {
  const { html, folders, links } = buildBookmarksHtml('启航导航');
  if (!links) {
    toast('当前没有可导出的站点');
    return;
  }
  downloadBlob(
    html,
    'qihang-bookmarks-' + new Date().toISOString().slice(0, 10) + '.html',
    'text/html;charset=utf-8'
  );
  toast('已导出 ' + folders + ' 个文件夹 / ' + links + ' 个书签');
}

async function importData(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.groups)) throw new Error('bad');
    state = normalizeData(parsed);
    ui.page = 0;
    save();
    applySettings();
    renderAll();
    syncSettingsUI();
    toast('导入成功，共 ' + totalItems() + ' 个站点');
  } catch (e) {
    toast('导入失败：文件格式不正确');
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
    if (!window.confirm('导入会覆盖当前全部分组与设置，确定继续？')) return;
    await importData(file);
  });

  $('dataReset').addEventListener('click', () => {
    if (!window.confirm('确定恢复默认数据吗？当前的分组和站点会被清空。')) return;
    state = normalizeData(defaultData());
    ui.page = 0;
    save();
    applySettings();
    renderAll();
    syncSettingsUI();
    toast('已恢复默认');
  });
}

