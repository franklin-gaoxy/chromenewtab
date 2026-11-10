// 点击工具栏图标 → 在新标签页打开导航页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/newtab.html') });
});

// 首次安装时自动打开一次，方便用户立刻上手
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/newtab.html') });
  }
});
