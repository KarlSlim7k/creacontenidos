// Web Push a la PWA del panel admin (Android y iOS 16.4+ standalone). Apagado solo si
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no están configuradas — no hay flag aparte.
const webpush = require('web-push');
const pool = require('../db/pool');
const config = require('../config');

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  configured = true;
  return true;
}

// Manda `payload` (título/cuerpo/url) a todo usuario activo con alguno de `roles` que
// tenga al menos una suscripción guardada. Best-effort: nunca tira — un push fallido
// no debe romper el flujo que lo dispara (crear lead, generar propuesta, etc).
// Suscripciones caducadas (404/410, el navegador las invalidó) se borran solas.
async function sendPushToRoles(roles, payload) {
  if (!ensureConfigured()) return;
  try {
    const { rows } = await pool.query(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.role = ANY($1) AND u.active = true`,
      [roles]
    );
    if (!rows.length) return;
    const body = JSON.stringify(payload);
    await Promise.all(rows.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
        }
      }
    }));
  } catch (err) {
    // No se loguea a activity_log a propósito: esto es best-effort de UX, no una
    // acción editorial — un fallo aquí no debe generar ruido en Hermes.
  }
}

module.exports = { sendPushToRoles, isConfigured: ensureConfigured };
