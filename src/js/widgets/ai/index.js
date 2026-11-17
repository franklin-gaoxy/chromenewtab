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

/* 备份：只带配置元数据（模型 / API Key / 提示词 / 开关），会话历史留在本机 */
if (typeof registerWidgetMeta === 'function') {
  registerWidgetMeta('ai', {
    load() {
      return loadAiData();
    },

    export() {
      if (!aiData) return null;
      return {
        models: aiData.models,
        activeModelId: aiData.activeModelId,
        prompts: aiData.prompts,
        options: aiData.options
      };
    },

    async import(raw) {
      const meta = raw && typeof raw === 'object' ? raw : {};
      const cur = await loadAiData();
      aiData = normalizeAiData({
        models: Array.isArray(meta.models) ? meta.models : cur.models,
        activeModelId: meta.activeModelId || cur.activeModelId,
        prompts: Array.isArray(meta.prompts) ? meta.prompts : cur.prompts,
        options: Object.assign({}, cur.options, meta.options || {}),
        // 会话不随备份覆盖：保留本机现有对话
        conversations: cur.conversations,
        activeConvId: cur.activeConvId
      });
      saveAiDataNow();
      // 弹窗正开着时同步刷新，避免还显示旧的模型列表
      const mask = $('aiMask');
      if (mask && !mask.hidden) {
        aiRenderAll();
        if ($('aiSetBody')) aiRenderSettings();
      }
    }
  });
}
