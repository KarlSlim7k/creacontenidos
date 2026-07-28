const cron = require('node-cron');
const config = require('../config');
const pool = require('../db/pool');
const { sendMessage } = require('./telegram-client');
const { logActivity } = require('./ai-client');

const TIMEZONE = 'America/Mexico_City';
let running = false;

function esc(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function currentHourMinute() {
  const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE }).formatToParts(new Date());
  return { hour: Number(parts.find((p) => p.type === 'hour').value), minute: Number(parts.find((p) => p.type === 'minute').value) };
}

function reviewMessage(proposal) {
  const dek = proposal.dek ? `\n${esc(String(proposal.dek).slice(0, 500))}` : '';
  return `<b>Pendiente de revisión</b>\n<b>${esc(proposal.title)}</b>${proposal.section ? `\n${esc(proposal.section)}` : ''}${dek}`;
}

function reviewKeyboard(proposalId) {
  return { inline_keyboard: [
    [{ text: 'Aprobar', callback_data: `approve:${proposalId}` }, { text: 'Devolver', callback_data: `return:${proposalId}` }],
    [{ text: 'Abrir panel', url: `${config.publicSiteUrl.replace(/\/$/, '')}/admin` }],
  ] };
}

async function tick() {
  if (running || !config.telegramReviewEnabled || !config.telegramDirectorChatIds.length) return;
  const { hour, minute } = currentHourMinute();
  if (hour * 60 + minute < config.telegramReviewHour * 60 + config.telegramReviewMinute) return;
  running = true;
  try {
    const { rows: proposals } = await pool.query("SELECT id, title, dek, section FROM content_proposals WHERE status = 'en_revision' ORDER BY updated_at ASC");
    for (const chatId of config.telegramDirectorChatIds) {
      for (const proposal of proposals) {
        const claim = await pool.query(
          `INSERT INTO telegram_review_notifications (chat_id, proposal_id, notification_date)
           VALUES ($1, $2, CURRENT_DATE) ON CONFLICT DO NOTHING RETURNING proposal_id`,
          [chatId, proposal.id]
        );
        if (!claim.rowCount) continue;
        try {
          const sent = await sendMessage(chatId, reviewMessage(proposal), reviewKeyboard(proposal.id));
          await pool.query('UPDATE telegram_review_notifications SET message_id = $1, sent_at = now() WHERE chat_id = $2 AND proposal_id = $3 AND notification_date = CURRENT_DATE', [sent.message_id, chatId, proposal.id]);
          await logActivity(pool, 'telegram_review_sent', `Borrador enviado a Telegram: ${proposal.title}`, null, 'exito', { chat_id: chatId, proposal_id: proposal.id });
        } catch (err) {
          await pool.query('DELETE FROM telegram_review_notifications WHERE chat_id = $1 AND proposal_id = $2 AND notification_date = CURRENT_DATE', [chatId, proposal.id]);
          await logActivity(pool, 'telegram_review_sent', err.message, null, 'fallo', { chat_id: chatId, proposal_id: proposal.id });
        }
      }
    }
  } finally { running = false; }
}

function startTelegramReviewCron() {
  cron.schedule('* * * * *', () => { tick().catch(() => {}); }, { timezone: TIMEZONE });
}

module.exports = { startTelegramReviewCron, tick, reviewKeyboard };
