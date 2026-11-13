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

async function aiChatCompletion(options) {
  const { model, messages, webSearch, deepThink } = options;
  const url = aiEndpoint(model);

  const granted = await aiEnsurePermission(url);
  if (!granted) throw new Error(i18n('ai.noPermission'));

  const headers = { 'Content-Type': 'application/json' };
  if (model.key) headers.Authorization = 'Bearer ' + model.key;

  const body = {
    model: model.model,
    messages,
    stream: false,
    temperature:
      typeof model.temperature === 'number' && Number.isFinite(model.temperature)
        ? model.temperature
        : 0.7
  };

  // 联网与深度思考：按常见兼容接口约定传参，不支持的网关会忽略
  if (webSearch) body.enable_search = true;
  if (deepThink) body.reasoning_effort = 'high';

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

  if (!res.ok) {
    const msg =
      (payload && payload.error && payload.error.message) ||
      (payload && payload.message) ||
      i18n('ai.httpFail', { status: res.status });
    throw new Error(msg);
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
