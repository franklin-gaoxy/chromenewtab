#!/usr/bin/env node
/* ============================================================
 * 冒烟测试运行器
 *
 *   node tools/smoke/run.js
 *
 * 做法：读取 src/newtab.html，把 tools/smoke/cases.js 内联进去生成
 * src/__smoke.html，用无头 Chrome/Edge 打开并抓取 document.title，
 * 最后删除临时文件。用例内容全部在 cases.js 里，这里不写断言。
 *
 * 退出码：0 全部通过 / 1 有用例失败 / 2 环境问题（找不到浏览器等）
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'src', 'newtab.html');
const CASES = path.join(__dirname, 'cases.js');
const TEMP = path.join(ROOT, 'src', '__smoke.html');

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

function findBrowser() {
  const hit = CHROME_CANDIDATES.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (e) {
      return false;
    }
  });
  if (!hit) {
    console.error('[smoke] 找不到 Chrome / Edge，可用环境变量 CHROME_PATH 指定可执行文件路径');
    process.exit(2);
  }
  return hit;
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function run() {
  const browser = findBrowser();
  const html = fs.readFileSync(PAGE, 'utf8');
  const cases = fs.readFileSync(CASES, 'utf8');

  if (html.indexOf('</body>') < 0) {
    console.error('[smoke] src/newtab.html 里找不到 </body>，无法注入用例');
    process.exit(2);
  }

  const injected = html.replace(
    '</body>',
    '<script>\n' + cases + '\n</script>\n<script>runSmokeTests();</script>\n</body>'
  );
  fs.writeFileSync(TEMP, injected, 'utf8');

  let dom = '';
  try {
    dom = execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--virtual-time-budget=5000',
        '--dump-dom',
        pathToFileURL(TEMP).href
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (err) {
    fs.unlinkSync(TEMP);
    console.error('[smoke] 启动浏览器失败：' + err.message);
    process.exit(2);
  } finally {
    if (fs.existsSync(TEMP)) fs.unlinkSync(TEMP);
  }

  const matched = dom.match(/<title>([\s\S]*?)<\/title>/);
  const raw = matched ? decodeHtml(matched[1]).trim() : '';

  if (!raw) {
    console.error('[smoke] 没有拿到测试结果（页面初始化可能失败）');
    process.exit(1);
  }
  if (raw.indexOf('ERR:') === 0) {
    console.error('[smoke] ' + raw);
    process.exit(1);
  }

  const items = raw.split('|').map((s) => s.trim()).filter(Boolean);
  let failed = 0;

  items.forEach((item) => {
    const idx = item.indexOf(':');
    const name = idx >= 0 ? item.slice(0, idx) : item;
    const value = idx >= 0 ? item.slice(idx + 1) : '';
    const pass = value === 'ok';
    if (!pass) failed += 1;
    console.log((pass ? '[ok]   ' : '[FAIL] ') + name + (pass ? '' : '  ' + value));
  });

  console.log('\n' + (items.length - failed) + '/' + items.length + ' 通过');
  process.exit(failed ? 1 : 0);
}

run();
