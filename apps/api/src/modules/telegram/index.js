const crypto = require('crypto');
const express = require('express');
const pool = require('../../db/pool');
const config = require('../../config');
const { logActivity } = require('../../lib/ai-client');
const { publishProposal, returnProposal } = require('../../lib/editorial-review');
const { sendMessage, editMessageText, answerCallbackQuery } = require('../../lib/telegram-client');
const { reviewKeyboard } = require('../../lib/telegram-review-cron');

const router = express.Router();

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAuthorized(chatId, userId) {
  const chat = Number(chatId); const user = Number(userId);
  return Number.isSafeInteger(chat) && chat === user && config.telegramDirectorChatIds.includes(chat);
}

function originLabel(code) {
  return ({ h: '100% humano', a: 'Asistido por IA', g: 'Generado con IA' })[code] || null;
}

async function audit(action, detail, status, metadata) {
  await logActivity(pool, action, detail, null, status, metadata);
}

async function handleCallback(callback) {
  const chatId = callback.message && callback.message.chat && callback.message.chat.id;
  const messageId = callback.message && callback.message.message_id;
  const userId = callback.from && callback.from.id;
  if (!isAuthorized(chatId, userId)) return;
  const [action, rawId, code] = String(callback.data || '').split(':');
  const proposalId = Number(rawId);
  if (!Number.isInteger(proposalId) || proposalId < 1) return;
  if (action === 'approve') {
    await editMessageText(chatId, messageId, '<b>Elige el origen del contenido antes de publicar.</b>', { inline_keyboard: [
      [{ text: '100% humano', callback_data: `origin:${proposalId}:h` }],
      [{ text: 'Asistido por IA', callback_data: `origin:${proposalId}:a` }],
      [{ text: 'Generado con IA', callback_data: `origin:${proposalId}:g` }],
    ] });
    return;
  }
  if (action === 'origin') {
    const origin = originLabel(code); if (!origin) return;
    await editMessageText(chatId, messageId, `<b>Origen:</b> ${origin}\n\n¿Confirmas la publicación?`, { inline_keyboard: [[
      { text: 'Confirmar publicación', callback_data: `publish:${proposalId}:${code}` },
      { text: 'Cancelar', callback_data: `cancel:${proposalId}` },
    ]] });
    return;
  }
  if (action === 'publish') {
    const origin = originLabel(code); if (!origin) return;
    const proposal = await publishProposal(pool, proposalId, origin);
    await audit('telegram_publish', `Nota publicada desde Telegram: ${proposal.title}`, 'exito', { chat_id: chatId, telegram_user_id: userId, proposal_id: proposal.id, origin });
    await editMessageText(chatId, messageId, `<b>Publicada</b>\n${String(proposal.title).replace(/&/g, '&amp;').replace(/</g, '&lt;')}`);
    return;
  }
  if (action === 'return') {
    await pool.query(`INSERT INTO telegram_pending_returns (chat_id, proposal_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes') ON CONFLICT (chat_id) DO UPDATE SET proposal_id = EXCLUDED.proposal_id, expires_at = EXCLUDED.expires_at, created_at = now()`, [chatId, proposalId]);
    await sendMessage(chatId, 'Escribe el comentario para devolver esta nota a borrador. Envía /cancel para cancelar.');
    return;
  }
  if (action === 'cancel') {
    await pool.query('DELETE FROM telegram_pending_returns WHERE chat_id = $1', [chatId]);
    await editMessageText(chatId, messageId, 'Acción cancelada.', reviewKeyboard(proposalId));
  }
}

async function handleMessage(message) {
  const chatId = message.chat && message.chat.id;
  const userId = message.from && message.from.id;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!isAuthorized(chatId, userId)) return;
  if (text === '/start') return sendMessage(chatId, 'CREA_BOT listo. Recibirás las notas pendientes de revisión a las 08:00 CDMX.');
  if (text === '/cancel') { await pool.query('DELETE FROM telegram_pending_returns WHERE chat_id = $1', [chatId]); return sendMessage(chatId, 'Devolución cancelada.'); }
  if (!text || text.length > 2000) return;
  const { rows } = await pool.query('SELECT proposal_id FROM telegram_pending_returns WHERE chat_id = $1 AND expires_at > now()', [chatId]);
  if (!rows[0]) return;
  const proposal = await returnProposal(pool, rows[0].proposal_id, text);
  await pool.query('DELETE FROM telegram_pending_returns WHERE chat_id = $1', [chatId]);
  await audit('telegram_return', `Nota devuelta desde Telegram: ${proposal.title}`, 'exito', { chat_id: chatId, telegram_user_id: userId, proposal_id: proposal.id, comment: text });
  return sendMessage(chatId, `<b>Devuelta a borrador</b>\n${String(proposal.title).replace(/&/g, '&amp;').replace(/</g, '&lt;')}`);
}

router.post('/webhook', async (req, res, next) => {
  if (!config.telegramWebhookSecret || !safeEqual(req.get('X-Telegram-Bot-Api-Secret-Token'), config.telegramWebhookSecret)) return res.status(401).json({ error: 'Webhook no autorizado' });
  try {
    const update = req.body || {};
    if (!Number.isSafeInteger(update.update_id)) return res.status(400).json({ error: 'Update inválido' });
    const alreadyHandled = await pool.query('SELECT 1 FROM telegram_updates WHERE update_id = $1', [update.update_id]);
    if (alreadyHandled.rowCount) return res.json({ ok: true });
    if (update.callback_query) await handleCallback(update.callback_query);
    if (update.message) await handleMessage(update.message);
    await pool.query('INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING', [update.update_id]);
    if (update.callback_query) await answerCallbackQuery(update.callback_query.id).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    await audit('telegram_webhook', err.message, 'fallo', { update_id: req.body && req.body.update_id }).catch(() => {});
    if (err.status && req.body && req.body.callback_query) {
      await answerCallbackQuery(req.body.callback_query.id, err.message).catch(() => {});
      return res.json({ ok: true });
    }
    next(err);
  }
});

module.exports = router;
