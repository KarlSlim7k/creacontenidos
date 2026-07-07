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
  // Resend pagina los contactos con ?limit + ?after=<id del último de la página>.
  // Iterar hasta has_more=false; sin esto, con la lista grande el panel muestra
  // solo la primera página (verificado contra la API: has_more y after funcionan).
  let count = 0;
  let after;
  for (let guard = 0; guard < 1000; guard++) { // tope de seguridad (~100k contactos)
    const qs = `?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const json = await resendFetch(`/audiences/${config.resendAudienceId}/contacts${qs}`);
    const data = json.data || [];
    count += data.filter((c) => !c.unsubscribed).length;
    if (!json.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return count;
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
