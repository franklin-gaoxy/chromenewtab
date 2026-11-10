/* ============================================================
 * AI 组件：网格磁贴，点击打开对话弹窗
 * 其余逻辑拆分在 ai/store.js、ai/api.js、ai/chat.js、ai/settings.js
 * ============================================================ */

const AI_TILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20.5 12.2c0 3.9-3.8 7.1-8.5 7.1-1 0-2-.15-2.9-.42L4 20.5l1.4-3.4c-1.2-1.3-1.9-3-1.9-4.9 0-3.9 3.8-7.1 8.5-7.1s8.5 3.2 8.5 7.1Z"/>' +
    '<path d="M12 8.6l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" fill="currentColor" stroke="none"/>' +
  '</svg>';

WidgetRegistry.register({
  type: 'ai',
  name: 'AI 助手',
  desc: '多模型对话、会话历史、提示词与联网开关',
  icon: AI_TILE_ICON,
  span: 1,

  mount(el, ctx) {
    el.classList.add('tile-ai');
    el.innerHTML =
      '<div class="tile-icon ai-tile-icon">' + AI_TILE_ICON + '</div>' +
      '<div class="tile-name"></div>';
    el.querySelector('.tile-name').textContent = ctx.item.title || 'AI';
  },

  open() {
    openAiChat();
  }
});
