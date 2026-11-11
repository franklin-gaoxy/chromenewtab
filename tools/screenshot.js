#!/usr/bin/env node
/* ============================================================
 * README 效果图生成器
 *
 *   node tools/screenshot.js
 *
 * 用无头 Chrome/Edge 打开 src/newtab.html（非扩展环境，图标走公共
 * favicon 接口），按需注入一小段脚本切换界面状态，然后截图到
 * doc/images/。浏览器路径可用环境变量 CHROME_PATH 指定。
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'src', 'newtab.html');
const OUT_DIR = path.join(ROOT, 'doc', 'images');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const SIZE = '1440,900';

const SHOTS = [
  {
    name: 'home',
    inject: ''
  },
  {
    name: 'settings',
    inject: `
      window.addEventListener('load', function () {
        state.settings.autoBackupEnabled = true;
        state.settings.expandedSections = ['data'];
        syncCollapseUI();
        openSettingsPanel('data');
        setTimeout(function () {
          var body = document.querySelector('.drawer-body');
          var anchor = null;
          document.querySelectorAll('.setting-block[data-section="data"] .sub-label').forEach(function (n) {
            if (n.textContent.trim() === '定时备份') anchor = n;
          });
          if (body && anchor) {
            var delta = anchor.getBoundingClientRect().top - body.getBoundingClientRect().top;
            body.scrollTop += delta - 190;
          }
        }, 200);
      });
    `
  }
];

function findBrowser() {
  const hit = CHROME_CANDIDATES.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (e) {
      return false;
    }
  });
  if (!hit) {
    console.error('[shot] 找不到 Chrome / Edge，可用环境变量 CHROME_PATH 指定可执行文件路径');
    process.exit(2);
  }
  return hit;
}

function shoot(browser, shot) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const injected = shot.inject
    ? html.replace('</body>', '<script>\n' + shot.inject + '\n</script>\n</body>')
    : html;

  const temp = path.join(ROOT, 'src', '__shot_' + shot.name + '.html');
  const out = path.join(OUT_DIR, shot.name + '.png');
  fs.writeFileSync(temp, injected, 'utf8');

  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=' + SIZE,
        '--virtual-time-budget=8000',
        '--screenshot=' + out,
        pathToFileURL(temp).href
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }

  if (!fs.existsSync(out)) {
    console.error('[shot] 没有生成 ' + out);
    return false;
  }
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('[shot] ' + path.relative(ROOT, out) + '  ' + kb + ' KB');
  return true;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = findBrowser();
  let failed = 0;
  SHOTS.forEach((shot) => {
    if (!shoot(browser, shot)) failed += 1;
  });
  console.log('\n' + (SHOTS.length - failed) + '/' + SHOTS.length + ' 张已生成');
  process.exit(failed ? 1 : 0);
}

main();
