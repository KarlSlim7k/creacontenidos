const config = require('../config');

async function telegramRequest(method, body) {
  if (!config.telegramBotToken) throw new Error('Telegram no está configurado');
  const res = await fetch(`${config.telegramApiBaseUrl}/bot${config.telegramBotToken}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.description || `Telegram respondió ${res.status}`);
  return json.result;
}

function sendMessage(chatId, text, replyMarkup) {
  return telegramRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup });
}

function editMessageText(chatId, messageId, text, replyMarkup) {
  return telegramRequest('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup });
}

function answerCallbackQuery(callbackQueryId, text) {
  return telegramRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text || undefined });
}

module.exports = { sendMessage, editMessageText, answerCallbackQuery };
