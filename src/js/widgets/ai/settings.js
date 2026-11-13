/* ============================================================
 * AI 弹窗内的设置页：左侧分类 + 右侧内容
 *   模型设置：增删改查（接口地址 / 模型名 / API Key）
 *   提示词：增删改查，可一键插入到输入框
 *   通用：默认开关、清空会话
 * ============================================================ */

let aiSettingsTab = 'models';

function aiRenderSettings(tab) {
  if (tab) aiSettingsTab = tab;

  const nav = $('aiSetNav');
  if (nav) {
    nav.querySelectorAll('button[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === aiSettingsTab);
    });
  }

  const body = $('aiSetBody');
  if (!body || !aiData) return;
  body.innerHTML = '';

  if (aiSettingsTab === 'models') aiRenderModelSettings(body);
  else if (aiSettingsTab === 'prompts') aiRenderPromptSettings(body);
  else aiRenderGeneralSettings(body);
}

/* ---------------- 模型设置 ---------------- */
function aiRenderModelSettings(body) {
  const bar = document.createElement('div');
  bar.className = 'ai-set-titlebar';
  bar.innerHTML = '<h3>' + esc(i18n('ai.tabModels')) + '</h3>';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini-btn primary';
  addBtn.textContent = i18n('ai.addModel');
  addBtn.addEventListener('click', () => aiModelForm(null));
  bar.appendChild(addBtn);
  body.appendChild(bar);

  const tip = document.createElement('p');
  tip.className = 'ai-form-tip';
  tip.textContent = i18n('ai.modelsTip');
  body.appendChild(tip);

  const list = document.createElement('div');
  list.className = 'ai-model-list';

  aiData.models.forEach((model) => {
    const card = document.createElement('div');
    card.className = 'ai-model-card' + (model.id === aiData.activeModelId ? ' active' : '');

    const info = document.createElement('div');
    info.className = 'ai-model-info';
    info.innerHTML =
      '<div class="ai-model-name">' + esc(model.name) +
        (model.id === aiData.activeModelId ? '<span class="ai-model-badge">' + esc(i18n('ai.inUse')) + '</span>' : '') +
      '</div>' +
      '<div class="ai-model-meta">' + esc(model.model) + ' · ' + esc(model.base) + '</div>';

    const actions = document.createElement('div');
    actions.className = 'ai-model-actions';

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'mini-btn';
    useBtn.textContent = i18n('ai.useModel');
    useBtn.addEventListener('click', () => {
      aiData.activeModelId = model.id;
      const conv = aiActiveConv();
      if (conv) conv.modelId = model.id;
      saveAiDataNow();
      aiRenderToolbar();
      aiRenderSettings('models');
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mini-btn';
    editBtn.textContent = i18n('common.edit');
    editBtn.addEventListener('click', () => aiModelForm(model));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = i18n('common.delete');
    delBtn.addEventListener('click', () => {
      if (aiData.models.length <= 1) {
        toast(i18n('ai.keepOneModel'));
        return;
      }
      if (!window.confirm(i18n('ai.deleteModelConfirm', { name: model.name }))) return;
      aiData.models = aiData.models.filter((m) => m.id !== model.id);
      if (aiData.activeModelId === model.id) aiData.activeModelId = aiData.models[0].id;
      saveAiDataNow();
      aiRenderToolbar();
      aiRenderSettings('models');
    });

    actions.append(useBtn, editBtn, delBtn);
    card.append(info, actions);
    list.appendChild(card);
  });

  body.appendChild(list);
}

function aiModelForm(model) {
  const body = $('aiSetBody');
  if (!body) return;
  const isNew = !model;

  body.innerHTML =
    '<div class="ai-form">' +
      '<h3>' + esc(isNew ? i18n('ai.addModel') : i18n('ai.editModel')) + '</h3>' +
      '<label class="ai-field"><span>' + esc(i18n('ai.fieldName')) + '</span>' +
        '<input id="aiMName" type="text" maxlength="30" placeholder="' + esc(i18n('ai.namePh')) + '" /></label>' +
      '<label class="ai-field"><span>' + esc(i18n('ai.fieldBase')) + '</span>' +
        '<input id="aiMBase" type="text" placeholder="https://api.deepseek.com/v1" spellcheck="false" /></label>' +
      '<label class="ai-field"><span>' + esc(i18n('ai.fieldModel')) + '</span>' +
        '<input id="aiMModel" type="text" placeholder="deepseek-chat" spellcheck="false" /></label>' +
      '<label class="ai-field"><span>' + esc(i18n('ai.fieldKey')) + '</span>' +
        '<input id="aiMKey" type="password" placeholder="' + esc(i18n('ai.keyPh')) + '" spellcheck="false" /></label>' +
      '<div class="ai-form-actions">' +
        '<button class="mini-btn" id="aiMCancel" type="button">' + esc(i18n('common.cancel')) + '</button>' +
        '<button class="mini-btn primary" id="aiMSave" type="button">' + esc(i18n('common.save')) + '</button>' +
      '</div>' +
    '</div>';

  $('aiMName').value = isNew ? '' : model.name;
  $('aiMBase').value = isNew ? 'https://api.deepseek.com/v1' : model.base;
  $('aiMModel').value = isNew ? '' : model.model;
  $('aiMKey').value = isNew ? '' : model.key;

  $('aiMCancel').addEventListener('click', () => aiRenderSettings('models'));

  $('aiMSave').addEventListener('click', () => {
    const name = $('aiMName').value.trim();
    const base = $('aiMBase').value.trim().replace(/\/+$/, '');
    const modelName = $('aiMModel').value.trim();
    const key = $('aiMKey').value.trim();

    if (!base || !modelName) {
      toast(i18n('ai.needBaseModel'));
      return;
    }

    if (isNew) {
      const item = {
        id: uid('m'),
        name: name || modelName,
        base,
        model: modelName,
        key,
        temperature: 0.7
      };
      aiData.models.push(item);
      if (!aiData.activeModelId) aiData.activeModelId = item.id;
    } else {
      model.name = name || modelName;
      model.base = base;
      model.model = modelName;
      model.key = key;
    }

    saveAiDataNow();
    aiRenderToolbar();
    aiRenderSettings('models');
    toast(i18n('common.saved'));
  });
}

/* ---------------- 提示词 ---------------- */
function aiRenderPromptSettings(body) {
  const bar = document.createElement('div');
  bar.className = 'ai-set-titlebar';
  bar.innerHTML = '<h3>' + esc(i18n('ai.tabPrompts')) + '</h3>';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mini-btn primary';
  addBtn.textContent = i18n('ai.addPrompt');
  addBtn.addEventListener('click', () => aiPromptForm(null));
  bar.appendChild(addBtn);
  body.appendChild(bar);

  const tip = document.createElement('p');
  tip.className = 'ai-form-tip';
  tip.textContent = i18n('ai.promptsTip');
  body.appendChild(tip);

  const list = document.createElement('div');
  list.className = 'ai-prompt-list';

  aiData.prompts.forEach((prompt) => {
    const card = document.createElement('div');
    card.className = 'ai-prompt-card';

    const info = document.createElement('div');
    info.className = 'ai-prompt-info';
    info.innerHTML =
      '<div class="ai-prompt-title">' + esc(prompt.title) + '</div>' +
      '<div class="ai-prompt-text">' + esc(prompt.content) + '</div>';

    const actions = document.createElement('div');
    actions.className = 'ai-model-actions';

    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.className = 'mini-btn';
    insertBtn.textContent = i18n('ai.insert');
    insertBtn.addEventListener('click', () => {
      const input = $('aiInput');
      if (!input) return;
      input.value = input.value ? input.value + '\n' + prompt.content : prompt.content;
      $('aiShell').classList.remove('show-settings');
      aiResizeInput();
      input.focus();
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mini-btn';
    editBtn.textContent = i18n('common.edit');
    editBtn.addEventListener('click', () => aiPromptForm(prompt));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = i18n('common.delete');
    delBtn.addEventListener('click', () => {
      if (!window.confirm(i18n('ai.deletePromptConfirm', { name: prompt.title }))) return;
      aiData.prompts = aiData.prompts.filter((p) => p.id !== prompt.id);
      saveAiDataNow();
      aiRenderSettings('prompts');
    });

    actions.append(insertBtn, editBtn, delBtn);
    card.append(info, actions);
    list.appendChild(card);
  });

  if (!aiData.prompts.length) {
    const empty = document.createElement('p');
    empty.className = 'ai-form-tip';
    empty.textContent = i18n('ai.noPrompts');
    list.appendChild(empty);
  }

  body.appendChild(list);
}

function aiPromptForm(prompt) {
  const body = $('aiSetBody');
  if (!body) return;
  const isNew = !prompt;

  body.innerHTML =
    '<div class="ai-form">' +
      '<h3>' + esc(isNew ? i18n('ai.addPrompt') : i18n('ai.editPrompt')) + '</h3>' +
      '<label class="ai-field"><span>' + esc(i18n('ai.fieldTitle')) + '</span>' +
        '<input id="aiPTitle" type="text" maxlength="30" placeholder="' + esc(i18n('ai.titlePh')) + '" /></label>' +
      '<label class="ai-field"><span>' + esc(i18n('ai.fieldContent')) + '</span>' +
        '<textarea id="aiPContent" rows="6" placeholder="' + esc(i18n('ai.contentPh')) + '"></textarea></label>' +
      '<div class="ai-form-actions">' +
        '<button class="mini-btn" id="aiPCancel" type="button">' + esc(i18n('common.cancel')) + '</button>' +
        '<button class="mini-btn primary" id="aiPSave" type="button">' + esc(i18n('common.save')) + '</button>' +
      '</div>' +
    '</div>';

  $('aiPTitle').value = isNew ? '' : prompt.title;
  $('aiPContent').value = isNew ? '' : prompt.content;

  $('aiPCancel').addEventListener('click', () => aiRenderSettings('prompts'));

  $('aiPSave').addEventListener('click', () => {
    const title = $('aiPTitle').value.trim();
    const content = $('aiPContent').value.trim();
    if (!content) {
      toast(i18n('ai.promptEmpty'));
      return;
    }

    if (isNew) {
      aiData.prompts.push({ id: uid('p'), title: title || i18n('ai.untitledPrompt'), content });
    } else {
      prompt.title = title || i18n('ai.untitledPrompt');
      prompt.content = content;
    }

    saveAiDataNow();
    aiRenderSettings('prompts');
    toast(i18n('common.saved'));
  });
}

/* ---------------- 通用 ---------------- */
function aiRenderGeneralSettings(body) {
  const bar = document.createElement('div');
  bar.className = 'ai-set-titlebar';
  bar.innerHTML = '<h3>' + esc(i18n('ai.tabGeneral')) + '</h3>';
  body.appendChild(bar);

  const wrap = document.createElement('div');
  wrap.className = 'ai-general';

  wrap.innerHTML =
    '<label class="switch-row">' +
      '<span>' + esc(i18n('ai.defaultWeb')) + '</span>' +
      '<input type="checkbox" id="aiOptWeb" />' +
      '<i class="switch"></i>' +
    '</label>' +
    '<label class="switch-row">' +
      '<span>' + esc(i18n('ai.defaultThink')) + '</span>' +
      '<input type="checkbox" id="aiOptThink" />' +
      '<i class="switch"></i>' +
    '</label>' +
    '<p class="ai-form-tip">' + esc(i18n('ai.optionsTip')) + '</p>' +
    '<div class="ai-danger-zone">' +
      '<button class="mini-btn danger" id="aiClearConvs" type="button">' + esc(i18n('ai.clearConvs')) + '</button>' +
    '</div>';

  body.appendChild(wrap);

  const web = $('aiOptWeb');
  const think = $('aiOptThink');
  web.checked = !!aiData.options.webSearch;
  think.checked = !!aiData.options.deepThink;

  web.addEventListener('change', () => {
    aiData.options.webSearch = web.checked;
    saveAiDataNow();
    aiRenderToolbar();
  });
  think.addEventListener('change', () => {
    aiData.options.deepThink = think.checked;
    saveAiDataNow();
    aiRenderToolbar();
  });

  $('aiClearConvs').addEventListener('click', () => {
    if (!window.confirm(i18n('ai.clearConvsConfirm'))) return;
    aiData.conversations = [];
    aiData.activeConvId = '';
    aiEnsureConversation();
    saveAiDataNow();
    aiRenderAll();
    toast(i18n('ai.clearConvsDone'));
  });
}
