/* ============================================================
 * AI 对话弹窗：会话历史 + 消息区 + 输入区（含设置入口）
 * 设置内容见 ai/settings.js，请求逻辑见 ai/api.js
 * ============================================================ */

let aiBusy = false;

/* 会话标题是否仍是「新对话」的默认值（任意语言） */
function aiIsDefaultTitle(title) {
  return !title || i18nAll('ai.newChatTitle').indexOf(title) >= 0;
}

/* ---------------- 弹窗外壳 ---------------- */
function ensureAiShell() {
  if ($('aiMask')) return;

  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.id = 'aiMask';
  mask.hidden = true;

  mask.innerHTML =
    '<div class="ai-shell" id="aiShell">' +
      '<aside class="ai-side">' +
        '<div class="ai-side-head">' +
          '<button class="ai-new" id="aiNewChat" type="button">' + ICONS.plus + '<span data-i18n="ai.newChat">新建对话</span></button>' +
        '</div>' +
        '<div class="ai-conv-list" id="aiConvList"></div>' +
        '<div class="ai-side-foot" data-i18n="ai.brand">启航 AI</div>' +
      '</aside>' +

      '<section class="ai-main">' +
        '<header class="ai-topbar">' +
          '<div class="ai-title" id="aiTitle">' + esc(i18n('ai.newChatTitle')) + '</div>' +
          '<div class="ai-top-actions">' +
            '<button class="ai-icon-btn" id="aiOpenSettings" type="button" data-i18n-title="ai.settings" title="设置">' + ICONS.gear + '</button>' +
            '<button class="ai-icon-btn" id="aiCloseChat" type="button" data-i18n-title="common.close" title="关闭">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' +
            '</button>' +
          '</div>' +
        '</header>' +
        '<div class="ai-messages" id="aiMessages"></div>' +
        '<div class="ai-composer">' +
          '<textarea id="aiInput" rows="1" data-i18n-ph="ai.placeholder" placeholder="给 AI 发送消息，Enter 发送 / Shift + Enter 换行"></textarea>' +
          '<div class="ai-toolbar">' +
            '<select class="ai-model-select" id="aiModelSelect" data-i18n-title="ai.pickModel" title="选择模型"></select>' +
            '<button class="ai-toggle" id="aiWebToggle" type="button" data-i18n="ai.web">联网</button>' +
            '<button class="ai-toggle" id="aiThinkToggle" type="button" data-i18n="ai.think">深度思考</button>' +
            '<span class="ai-spacer"></span>' +
            '<button class="ai-send" id="aiSend" type="button" data-i18n="ai.send">发送</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="ai-settings" id="aiSettings">' +
        '<aside class="ai-set-side">' +
          '<div class="ai-set-head">' +
            '<button class="ai-back" id="aiCloseSettings" type="button">' + ICONS.logout + '<span data-i18n="ai.backToChat">返回对话</span></button>' +
          '</div>' +
          '<nav class="ai-set-nav" id="aiSetNav">' +
            '<button type="button" data-tab="models" data-i18n="ai.tabModels" class="active">模型设置</button>' +
            '<button type="button" data-tab="prompts" data-i18n="ai.tabPrompts">提示词</button>' +
            '<button type="button" data-tab="general" data-i18n="ai.tabGeneral">通用</button>' +
          '</nav>' +
        '</aside>' +
        '<div class="ai-set-body" id="aiSetBody"></div>' +
      '</section>' +
    '</div>';

  document.body.appendChild(mask);
  applyI18n(mask);
  bindAiShellEvents();
}

async function openAiChat() {
  ensureAiShell();
  await loadAiData();
  aiEnsureConversation();
  aiRenderAll();
  openModal('aiMask');
  setTimeout(() => {
    const input = $('aiInput');
    if (input) input.focus();
  }, 80);
}

/* ---------------- 渲染 ---------------- */
function aiRenderAll() {
  aiRenderConvList();
  aiRenderMessages();
  aiRenderToolbar();
  const conv = aiActiveConv();
  const title = $('aiTitle');
  if (title) title.textContent = conv && conv.title ? conv.title : i18n('ai.newChatTitle');
}

function aiRenderConvList() {
  const box = $('aiConvList');
  if (!box || !aiData) return;
  box.innerHTML = '';

  if (!aiData.conversations.length) {
    box.innerHTML = '<p class="ai-conv-empty">' + esc(i18n('ai.noConv')) + '</p>';
    return;
  }

  aiData.conversations.forEach((conv) => {
    const row = document.createElement('div');
    row.className = 'ai-conv' + (conv.id === aiData.activeConvId ? ' active' : '');
    row.dataset.id = conv.id;

    const title = document.createElement('span');
    title.className = 'ai-conv-title';
    title.textContent = conv.title || i18n('ai.newChatTitle');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ai-conv-del';
    del.title = i18n('ai.deleteConv');
    del.innerHTML = ICONS.trash;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window.confirm(i18n('ai.deleteConvConfirm'))) return;
      aiDeleteConversation(conv.id);
      aiEnsureConversation();
      aiRenderAll();
    });

    row.append(title, del);
    row.addEventListener('click', () => {
      aiData.activeConvId = conv.id;
      saveAiData();
      aiRenderAll();
    });
    box.appendChild(row);
  });
}

function aiRenderMessages() {
  const box = $('aiMessages');
  if (!box) return;
  const conv = aiActiveConv();
  box.innerHTML = '';

  if (!conv || !conv.messages.length) {
    box.innerHTML =
      '<div class="ai-empty">' +
        '<p class="ai-empty-title">' + esc(i18n('ai.empty')) + '</p>' +
        '<p class="ai-empty-sub">' + esc(i18n('ai.emptySub')) + '</p>' +
      '</div>';
    return;
  }

  conv.messages.forEach((msg) => {
    const row = document.createElement('div');
    row.className = 'ai-msg ' + (msg.role === 'assistant' ? 'ai-msg-bot' : 'ai-msg-user');
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    bubble.textContent = msg.content;
    row.appendChild(bubble);
    box.appendChild(row);
  });

  aiScrollBottom();
}

function aiRenderToolbar() {
  if (!aiData) return;

  const select = $('aiModelSelect');
  if (select) {
    select.innerHTML = '';
    aiData.models.forEach((model) => {
      const opt = document.createElement('option');
      opt.value = model.id;
      opt.textContent = model.name || model.model;
      select.appendChild(opt);
    });
    select.value = aiData.activeModelId;
  }

  const web = $('aiWebToggle');
  const think = $('aiThinkToggle');
  if (web) web.classList.toggle('active', !!aiData.options.webSearch);
  if (think) think.classList.toggle('active', !!aiData.options.deepThink);
}

function aiScrollBottom() {
  const box = $('aiMessages');
  if (box) box.scrollTop = box.scrollHeight;
}

function aiSetTyping(on) {
  const box = $('aiMessages');
  if (!box) return;
  const old = box.querySelector('.ai-typing');
  if (old) old.remove();
  if (!on) return;

  const row = document.createElement('div');
  row.className = 'ai-msg ai-msg-bot ai-typing';
  row.innerHTML = '<div class="ai-bubble"><i></i><i></i><i></i></div>';
  box.appendChild(row);
  aiScrollBottom();
}

function aiResizeInput() {
  const input = $('aiInput');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(160, Math.max(44, input.scrollHeight)) + 'px';
}

/* ---------------- 发送消息 ---------------- */
async function aiSendMessage() {
  if (aiBusy || !aiData) return;

  const input = $('aiInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const conv = aiActiveConv();
  const model = aiActiveModel();
  if (!conv) return;
  if (!model) {
    toast(i18n('ai.needModel'));
    return;
  }

  conv.messages.push({ role: 'user', content: text, at: Date.now() });
  if (aiIsDefaultTitle(conv.title)) conv.title = text.slice(0, 20);
  conv.updatedAt = Date.now();
  conv.modelId = model.id;

  input.value = '';
  aiResizeInput();
  aiBusy = true;
  const sendBtn = $('aiSend');
  if (sendBtn) sendBtn.disabled = true;

  aiRenderAll();
  aiSetTyping(true);

  try {
    const reply = await aiChatCompletion({
      model,
      messages: aiBuildMessages(conv, aiData.options.webSearch, aiData.options.deepThink),
      webSearch: !!aiData.options.webSearch,
      deepThink: !!aiData.options.deepThink
    });
    conv.messages.push({ role: 'assistant', content: reply, at: Date.now() });
    conv.updatedAt = Date.now();
  } catch (err) {
    conv.messages.push({
      role: 'assistant',
      content: i18n('ai.requestFailed', {
        msg: err && err.message ? err.message : i18n('common.unknownError')
      }),
      at: Date.now()
    });
  } finally {
    aiBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    saveAiDataNow();
    aiRenderAll();
  }
}

/* ---------------- 事件绑定 ---------------- */
function bindAiShellEvents() {
  const mask = $('aiMask');
  if (mask) {
    mask.addEventListener('mousedown', (e) => {
      if (e.target === mask) closeModal('aiMask');
    });
  }

  $('aiNewChat').addEventListener('click', () => {
    aiNewConversation();
    aiRenderAll();
    const input = $('aiInput');
    if (input) input.focus();
  });

  $('aiSend').addEventListener('click', () => aiSendMessage());

  const input = $('aiInput');
  input.addEventListener('input', aiResizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    aiSendMessage();
  });

  $('aiModelSelect').addEventListener('change', (e) => {
    aiData.activeModelId = e.target.value;
    const conv = aiActiveConv();
    if (conv) conv.modelId = e.target.value;
    saveAiData();
    aiRenderToolbar();
  });

  $('aiWebToggle').addEventListener('click', () => {
    aiData.options.webSearch = !aiData.options.webSearch;
    saveAiData();
    aiRenderToolbar();
  });

  $('aiThinkToggle').addEventListener('click', () => {
    aiData.options.deepThink = !aiData.options.deepThink;
    saveAiData();
    aiRenderToolbar();
  });

  $('aiCloseChat').addEventListener('click', () => closeModal('aiMask'));

  $('aiOpenSettings').addEventListener('click', () => {
    $('aiShell').classList.add('show-settings');
    aiRenderSettings('models');
  });

  $('aiCloseSettings').addEventListener('click', () => {
    $('aiShell').classList.remove('show-settings');
    aiRenderAll();
  });

  $('aiSetNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    aiRenderSettings(btn.dataset.tab);
  });
}
