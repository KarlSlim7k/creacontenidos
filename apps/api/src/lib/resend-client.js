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

async function addContact(email) {
  return resendFetch(`/audiences/${config.resendAudienceId}/contacts`, {
    method: 'POST',
    body: { email, unsubscribed: false },
  });
}

async function removeContact(email) {
  return resendFetch(`/audiences/${config.resendAudienceId}/contacts/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

async function countActiveSubscribers() {
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

module.exports = { addContact, removeContact, countActiveSubscribers, sendBroadcast };
