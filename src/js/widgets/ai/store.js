/* ============================================================
 * AI 组件数据层：模型列表、提示词、会话历史、开关选项
 * 独立存储（不进入导航备份），key = qihang-ai-v1
 * ============================================================ */

const AI_STORE_KEY = 'qihang-ai-v1';

function aiDefaults() {
  return {
    models: [
      {
        id: 'model_deepseek',
        name: 'DeepSeek Chat',
        base: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        key: '',
        temperature: 0.7
      }
    ],
    activeModelId: 'model_deepseek',
    prompts: [
      {
        id: 'prompt_summarize',
        title: '总结要点',
        content: '请用简洁的要点形式总结下面的内容：'
      },
      {
        id: 'prompt_translate',
        title: '翻译成英文',
        content: '请把下面的内容翻译成地道的英文，只输出译文：'
      }
    ],
    conversations: [],
    activeConvId: '',
    options: { webSearch: false, deepThink: false }
  };
}

let aiData = null;
let aiSaveTimer = 0;

function normalizeAiData(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const base = aiDefaults();

  const models = (Array.isArray(data.models) ? data.models : [])
    .filter((m) => m && m.base && m.model)
    .map((m) => ({
      id: m.id || uid('m'),
      name: String(m.name || m.model).slice(0, 30),
      base: String(m.base).trim(),
      model: String(m.model).trim(),
      key: typeof m.key === 'string' ? m.key : '',
      temperature: Number.isFinite(Number(m.temperature)) ? Number(m.temperature) : 0.7
    }));

  const prompts = (Array.isArray(data.prompts) ? data.prompts : [])
    .filter((p) => p && p.content)
    .map((p) => ({
      id: p.id || uid('p'),
      title: String(p.title || i18n('ai.untitledPrompt')).slice(0, 30),
      content: String(p.content)
    }));

  const conversations = (Array.isArray(data.conversations) ? data.conversations : [])
    .filter((c) => c && Array.isArray(c.messages))
    .map((c) => ({
      id: c.id || uid('c'),
      title: String(c.title || i18n('ai.newChatTitle')).slice(0, 40),
      modelId: c.modelId || '',
      updatedAt: Number(c.updatedAt) || Date.now(),
      messages: c.messages
        .filter((m) => m && m.content)
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: String(m.content),
          at: Number(m.at) || Date.now()
        }))
    }));

  const out = {
    models: models.length ? models : base.models,
    prompts: prompts.length ? prompts : base.prompts,
    conversations,
    activeConvId: String(data.activeConvId || ''),
    options: Object.assign({ webSearch: false, deepThink: false }, data.options || {})
  };

  out.activeModelId = models.some((m) => m.id === data.activeModelId)
    ? data.activeModelId
    : out.models[0].id;

  return out;
}

async function loadAiData() {
  if (aiData) return aiData;
  let raw = null;
  try {
    raw = await store.get(AI_STORE_KEY);
  } catch (e) {
    raw = null;
  }
  aiData = normalizeAiData(raw);
  return aiData;
}

function saveAiData() {
  if (!aiData) return;
  clearTimeout(aiSaveTimer);
  aiSaveTimer = setTimeout(() => {
    store.set(AI_STORE_KEY, aiData);
  }, 180);
}

function saveAiDataNow() {
  if (!aiData) return;
  clearTimeout(aiSaveTimer);
  store.set(AI_STORE_KEY, aiData);
}

function aiActiveModel() {
  if (!aiData) return null;
  return aiData.models.find((m) => m.id === aiData.activeModelId) || aiData.models[0] || null;
}

function aiActiveConv() {
  if (!aiData) return null;
  return aiData.conversations.find((c) => c.id === aiData.activeConvId) || null;
}

function aiNewConversation() {
  if (!aiData) return null;
  const model = aiActiveModel();
  const conv = {
    id: uid('c'),
    title: i18n('ai.newChatTitle'),
    modelId: model ? model.id : '',
    updatedAt: Date.now(),
    messages: []
  };
  aiData.conversations.unshift(conv);
  aiData.activeConvId = conv.id;
  saveAiData();
  return conv;
}

/* 打开弹窗时保证至少有一个会话 */
function aiEnsureConversation() {
  if (!aiData) return null;
  const current = aiActiveConv();
  if (current) return current;
  if (aiData.conversations.length) {
    aiData.activeConvId = aiData.conversations[0].id;
    return aiActiveConv();
  }
  return aiNewConversation();
}

function aiDeleteConversation(id) {
  if (!aiData) return;
  aiData.conversations = aiData.conversations.filter((c) => c.id !== id);
  if (aiData.activeConvId === id) {
    aiData.activeConvId = aiData.conversations.length ? aiData.conversations[0].id : '';
  }
  saveAiDataNow();
}
