// Cliente delgado sobre la API REST de Resend. Usa la Audiencia "General" ya
// creada en el dashboard de Resend como fuente de verdad de suscriptores (altas,
// bajas y unsubscribe los maneja Resend, no reinventamos esa parte).
const config = require('../config');

const RESEND_BASE = 'https://api.resend.com';

async function resendFetch(path, opts) {
  opts = opts || {};
  const res = await fetch(`${RESEND_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Resend respondió ${res.status}: ${(json && json.message) || 'error desconocido'}`);
  }
  return json;
}

// unsubscribed=true al alta pendiente (doble opt-in): no cuenta ni recibe hasta
// que confirma. updateContact lo pasa a false cuando el enlace del correo se abre.
async function addContact(email, unsubscribed = false) {
  return resendFetch(`/audiences/${config.resendAudienceId}/contacts`, {
    method: 'POST',
    body: { email, unsubscribed },
  });
}

async function updateContact(email, unsubscribed) {
  return resendFetch(`/audiences/${config.resendAudienceId}/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: { unsubscribed },
  });
}

async function removeContact(email) {
  return resendFetch(`/audiences/${config.resendAudienceId}/contacts/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

// Correo transaccional (confirmación de doble opt-in). Mismo remitente que el broadcast.
async function sendEmail({ to, subject, html, text }) {
  return resendFetch('/emails', {
    method: 'POST',
    body: { from: config.resendFrom, to, subject, html, text },
  });
}

async function countActiveSubscribers() {
  // ponytail: la API de contactos de Resend no expone cursor de paginación hoy
  // (devuelve la lista completa en `data`). Si Resend agrega paginación, iterar
  // aquí con el cursor — hasta entonces esto es lo correcto, no una sola página de N.
  const json = await resendFetch(`/audiences/${config.resendAudienceId}/contacts`);
  const contacts = json.data || [];
  return contacts.filter((c) => !c.unsubscribed).length;
}

// Crea y envía un broadcast a la Audiencia General. Resend inyecta el link de
// unsubscribe donde pongamos {{{RESEND_UNSUBSCRIBE_URL}}} en el HTML.
async function sendBroadcast({ subject, html, text }) {
  const broadcast = await resendFetch('/broadcasts', {
    method: 'POST',
    body: {
      audience_id: config.resendAudienceId,
      from: config.resendFrom,
      subject,
      html,
      text,
    },
  });
  await resendFetch(`/broadcasts/${broadcast.id}/send`, { method: 'POST' });
  return broadcast;
}

module.exports = { addContact, updateContact, removeContact, countActiveSubscribers, sendBroadcast, sendEmail };
