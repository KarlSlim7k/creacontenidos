// Adaptador de señal externa → forma interna de `topics` (RADAR 2.0, R2-13).
// Traduce el contrato versionado (docs/ia/contrato-senales-externas.md, R2-03)
// al objeto que espera insertTopicIfNew()/normalizeVerification() — puro, sin
// DB, mismo espíritu que topic-verification.js.
const { urlHost } = require('./topic-verification');

const SCHEMA_VERSION_RE = /^\d+\.\d+$/;
const ACCESS_STATUS = new Set(['ok', 'login_required', 'captcha', 'blocked', 'error']);
const SOURCE_TYPES = new Set(['primary', 'secondary', 'social', 'other']);
const TERRITORIAL_SCOPES = new Set(['local', 'regional', 'estatal', 'nacional', 'internacional']);
// El contrato solo permite checking|signal en la entrada (regla no negociable:
// una señal externa nunca entra como verified) — 'verified' se acepta y se
// reescribe, no se rechaza (ver validateEnvelope).
const INPUT_VERIFICATION_STATUSES = new Set(['checking', 'signal', 'verified']);

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isValidHttpUrl(v) {
  if (typeof v !== 'string' || !v.trim()) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isIsoDateTime(v) {
  return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Date.parse(v));
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
}

/**
 * Valida un envelope contra el contrato. No muta la entrada.
 * @returns {{ ok: true, envelope: object } | { ok: false, fields: Record<string,string> }}
 */
function validateEnvelope(payload) {
  const fields = {};
  if (!isPlainObject(payload)) return { ok: false, fields: { _: 'El payload debe ser un objeto' } };

  if (typeof payload.schemaVersion !== 'string' || !SCHEMA_VERSION_RE.test(payload.schemaVersion)) {
    fields.schemaVersion = 'Requerido, formato MAJOR.MINOR (ej. "1.0")';
  }
  if (typeof payload.provider !== 'string' || !payload.provider.trim()) {
    fields.provider = 'Requerido';
  }
  if (!ACCESS_STATUS.has(payload.accessStatus)) {
    fields.accessStatus = `Requerido, uno de: ${[...ACCESS_STATUS].join(', ')}`;
  }
  if (payload.botRunId != null && typeof payload.botRunId !== 'string') fields.botRunId = 'Debe ser string';
  if (payload.sourceId != null && typeof payload.sourceId !== 'string') fields.sourceId = 'Debe ser string';

  const s = payload.signal;
  if (!isPlainObject(s)) {
    fields.signal = 'Requerido, objeto con los 17 campos del contrato';
  } else {
    if (typeof s.signalId !== 'string' || !s.signalId.trim()) fields['signal.signalId'] = 'Requerido';
    if (typeof s.title !== 'string' || !s.title.trim()) fields['signal.title'] = 'Requerido';
    if (!isIsoDateTime(s.detectedAt)) fields['signal.detectedAt'] = 'Requerido, datetime ISO 8601';
    if (s.eventDate != null && !isIsoDate(s.eventDate)) fields['signal.eventDate'] = 'Debe ser date ISO 8601 (YYYY-MM-DD) o null';
    if (s.territorialScope != null && !TERRITORIAL_SCOPES.has(s.territorialScope)) {
      fields['signal.territorialScope'] = `Uno de: ${[...TERRITORIAL_SCOPES].join(', ')}, o null`;
    }
    if (!isPlainObject(s.source) || typeof s.source.name !== 'string' || !s.source.name.trim()) {
      fields['signal.source'] = 'Requerido, objeto { name, url }';
    }
    if (!SOURCE_TYPES.has(s.sourceType)) fields['signal.sourceType'] = `Requerido, uno de: ${[...SOURCE_TYPES].join(', ')}`;
    if (typeof s.factualSummary !== 'string' || !s.factualSummary.trim()) fields['signal.factualSummary'] = 'Requerido';
    if (!Number.isFinite(Number(s.confidence)) || Number(s.confidence) < 0 || Number(s.confidence) > 100) {
      fields['signal.confidence'] = 'Requerido, integer 0-100';
    }
    if (s.corroboratingSources != null && !Array.isArray(s.corroboratingSources)) {
      fields['signal.corroboratingSources'] = 'Debe ser un array, u omitirse';
    }
    if (typeof s.commentsAvailable !== 'boolean') fields['signal.commentsAvailable'] = 'Requerido, boolean';
    if (typeof s.mediaAvailable !== 'boolean') fields['signal.mediaAvailable'] = 'Requerido, boolean';
    if (!INPUT_VERIFICATION_STATUSES.has(s.verificationStatus)) {
      fields['signal.verificationStatus'] = 'Requerido, uno de: checking, signal (verified se acepta pero se reescribe)';
    }
  }

  if (payload.conversationSnapshot != null) {
    const cs = payload.conversationSnapshot;
    if (!isPlainObject(cs)) {
      fields.conversationSnapshot = 'Debe ser un objeto, u omitirse por completo';
    } else if (typeof cs.sampleMethod !== 'string' || !cs.sampleMethod.trim() || typeof cs.limitations !== 'string' || !cs.limitations.trim()) {
      // Ambos obligatorios si el objeto está presente (contrato §conversationSnapshot).
      fields.conversationSnapshot = 'sampleMethod y limitations son obligatorios cuando se manda conversationSnapshot';
    }
  }

  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, envelope: payload };
}

/**
 * Adapta un envelope YA VALIDADO (validateEnvelope) a { topicRaw, trustEntry }.
 * topicRaw es lo que espera insertTopicIfNew()/normalizeVerification().
 * trustEntry es una entrada { domain, trust, label } opcional para sumar al
 * trustSources de insertTopicIfNew — el trust declarado del proveedor
 * participa vía applyTrustFromSources() igual que un dominio de
 * radar_sources, aplicado al host de la fuente primaria de ESTA señal.
 */
function adaptSignal(envelope, providerTrust) {
  const s = envelope.signal;

  const evidence = [];
  if (isPlainObject(s.source)) {
    evidence.push({
      label: s.source.name,
      url: isValidHttpUrl(s.source.url) ? s.source.url : null,
      kind: s.sourceType,
      supports: null,
      reliable: null,
    });
  }
  if (Array.isArray(s.corroboratingSources)) {
    for (const c of s.corroboratingSources.slice(0, 12)) {
      if (!c || typeof c !== 'object' || !c.label) continue;
      evidence.push({
        label: String(c.label),
        url: isValidHttpUrl(c.url) ? c.url : null,
        kind: SOURCE_TYPES.has(c.kind) ? c.kind : 'other',
        supports: c.supports != null ? String(c.supports) : null,
        reliable: typeof c.reliable === 'boolean' ? c.reliable : null,
      });
    }
  }

  // Regla no negociable (contrato §"Regla no negociable"): nunca entra verified
  // por venir de un proveedor de confianza declarada. Se reescribe según
  // confidence, mismo umbral que deriveStatus() en topic-verification.js.
  const verificationStatus = s.verificationStatus === 'verified'
    ? (Number(s.confidence) >= 40 ? 'checking' : 'signal')
    : s.verificationStatus;

  const topicRaw = {
    title: s.title,
    source: envelope.provider,
    mentions: 0,
    known_facts: s.factualSummary,
    unknown_facts: null,
    confidence: s.confidence,
    verification_status: verificationStatus,
    evidence,
    risk_flags: [],
    editorial_decision: null,
    source_count: evidence.length,
    event_date: s.eventDate || null,
    locality: s.locality || null,
    territorial_scope: s.territorialScope || null,
    category: s.category || null,
    provider: envelope.provider,
    external_id: s.signalId,
    media_available: s.mediaAvailable,
  };

  let trustEntry = null;
  if (providerTrust && isPlainObject(s.source)) {
    const host = urlHost(s.source.url);
    if (host) trustEntry = { domain: host, trust: providerTrust, label: `${envelope.provider} (proveedor externo)` };
  }

  return { topicRaw, trustEntry };
}

module.exports = { validateEnvelope, adaptSignal, isValidHttpUrl };
