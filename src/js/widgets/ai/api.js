/* ============================================================
 * AI 请求层：兼容 OpenAI Chat Completions 协议
 * 支持自定义接口地址 / 模型名 / API Key
 * ============================================================ */

function aiEndpoint(model) {
  let base = String((model && model.base) || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error(i18n('ai.noBase'));
  if (/\/chat\/completions$/.test(base)) return base;
  return base + '/chat/completions';
}

/* 扩展环境下请求外部接口需要动态申请该域名权限 */
async function aiEnsurePermission(url) {
  if (typeof IS_EXT === 'undefined' || !IS_EXT || !chrome.permissions) return true;
  let origin = '';
  try {
    origin = new URL(url).origin + '/*';
  } catch (e) {
    return false;
  }
  try {
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch (e) {
    return false;
  }
}

/* 单次请求，返回 { res, payload }；网络异常直接抛出 */
async function aiPostChat(url, headers, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(i18n('ai.network'));
  }

  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    payload = null;
  }
  return { res, payload };
}

function aiPayloadMessage(payload) {
  return String(
    (payload && payload.error && payload.error.message) || (payload && payload.message) || ''
  );
}

/* 部分新模型（如 GPT-5 系列）只接受默认温度，传任何值都会 400 */
function aiIsTemperatureError(payload, status) {
  if (status !== 400 && status !== 422) return false;
  return /temperature/i.test(aiPayloadMessage(payload));
}

async function aiChatCompletion(options) {
  const { model, messages, webSearch, deepThink } = options;
  const url = aiEndpoint(model);

  const granted = await aiEnsurePermission(url);
  if (!granted) throw new Error(i18n('ai.noPermission'));

  const headers = { 'Content-Type': 'application/json' };
  if (model.key) headers.Authorization = 'Bearer ' + model.key;

  const body = { model: model.model, messages, stream: false };

  // 温度：null / 未设置表示不发送，交给接口使用自身默认值
  if (typeof model.temperature === 'number' && Number.isFinite(model.temperature)) {
    body.temperature = model.temperature;
  }

  // 联网与深度思考：按常见兼容接口约定传参，不支持的网关会忽略
  if (webSearch) body.enable_search = true;
  if (deepThink) body.reasoning_effort = 'high';

  let { res, payload } = await aiPostChat(url, headers, body);

  // 兜底：模型只支持默认温度时，去掉该参数自动重试一次
  if (!res.ok && body.temperature !== undefined && aiIsTemperatureError(payload, res.status)) {
    delete body.temperature;
    ({ res, payload } = await aiPostChat(url, headers, body));
  }

  if (!res.ok) {
    throw new Error(aiPayloadMessage(payload) || i18n('ai.httpFail', { status: res.status }));
  }

  const content =
    payload &&
    payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    payload.choices[0].message.content;

  if (!content) throw new Error(i18n('ai.emptyReply'));
  return String(content);
}

/* 组装发送给模型的消息（最近 20 轮 + 系统提示） */
function aiBuildMessages(conv, useWeb, useThink) {
  const notes = [];
  if (useWeb) notes.push('用户已开启联网搜索，请在回答中尽量给出可核查的信息来源。');
  if (useThink) notes.push('请先进行充分的推理，再给出最终结论。');

  const messages = [];
  if (notes.length) messages.push({ role: 'system', content: notes.join('\n') });

  conv.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .forEach((m) => {
      messages.push({ role: m.role, content: m.content });
    });

  return messages;
}
