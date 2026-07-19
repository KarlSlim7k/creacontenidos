// Normalización de ficha de verificación RADAR (post-IA).
// Plan: docs/ia/radar-verificacion-plan.md — Fases 2–3.
// Puro (sin DB): la detección y Facebook llaman esto antes del INSERT/UPDATE.

const VALID_STATUS = new Set(['verified', 'checking', 'signal', 'risk']);
const HARD_RISK_RE = /\b(rumor|clickbait|fake|engagement_?bait|sin_fundamento|titular_alarmista)\b/i;

/** Orden de calidad editorial (mayor = mejor). */
const STATUS_RANK = { risk: 0, signal: 1, checking: 2, verified: 3 };

function clampInt(n, lo, hi) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function normalizeEvidence(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const label = String(item.label || item.name || item.source || '').trim();
    if (!label) continue;
    let url = item.url != null ? String(item.url).trim() : null;
    // No persistir URLs inventadas tipo placeholder
    if (url && !/^https?:\/\//i.test(url)) url = null;
    const kind = item.kind != null ? String(item.kind).toLowerCase().slice(0, 32) : null;
    out.push({
      label: label.slice(0, 200),
      url,
      kind: kind || null,
      supports: item.supports != null ? String(item.supports).slice(0, 300) : null,
      reliable: typeof item.reliable === 'boolean' ? item.reliable : null,
    });
  }
  return out;
}

function normalizeRiskFlags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 20)) {
    if (typeof item === 'string') {
      const s = item.trim().slice(0, 120);
      if (s) out.push(s);
      continue;
    }
    if (item && typeof item === 'object') {
      const code = item.code != null ? String(item.code).trim() : '';
      const message = item.message != null ? String(item.message).trim() : '';
      if (code || message) out.push({ code: code.slice(0, 64) || undefined, message: message.slice(0, 200) || undefined });
    }
  }
  return out;
}

function flagText(flag) {
  if (typeof flag === 'string') return flag;
  return [flag.code, flag.message].filter(Boolean).join(' ');
}

function hasHardRisk(flags) {
  return flags.some((f) => HARD_RISK_RE.test(flagText(f)));
}

function hasPrimary(evidence) {
  return evidence.some((e) => e.kind === 'primary');
}

function deriveStatus(confidence, flags) {
  if (hasHardRisk(flags) || confidence <= 39) return 'risk';
  if (confidence >= 75) return 'verified';
  if (confidence >= 40) return 'checking';
  return 'risk';
}

/** Host sin www, o null si URL inválida. */
function urlHost(url) {
  if (!url) return null;
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Fuentes independientes estructurales: hosts distintos en evidence.url,
 * o labels distintos si no hay URL.
 */
function countIndependentSources(evidence) {
  const keys = new Set();
  for (const e of evidence || []) {
    const host = urlHost(e.url);
    if (host) keys.add('h:' + host);
    else if (e.label) keys.add('l:' + String(e.label).toLowerCase().trim());
  }
  return keys.size;
}

/**
 * Cuántas URLs de scrape (Firecrawl) aparecen citadas en evidence (url exacta o mismo host).
 * @param {Array} evidence
 * @param {string[]} scrapeUrls
 * @returns {string[]} urls de scrape matcheadas (únicas)
 */
function matchScrapeSources(evidence, scrapeUrls) {
  if (!Array.isArray(scrapeUrls) || !scrapeUrls.length) return [];
  const scrape = scrapeUrls.map((u) => ({ url: String(u), host: urlHost(u) })).filter((s) => s.url);
  const matched = [];
  const seen = new Set();
  for (const s of scrape) {
    const hit = (evidence || []).some((e) => {
      if (!e.url) return false;
      if (e.url === s.url || e.url.startsWith(s.url) || s.url.startsWith(e.url)) return true;
      const eh = urlHost(e.url);
      return eh && s.host && eh === s.host;
    });
    if (hit && !seen.has(s.url)) {
      seen.add(s.url);
      matched.push(s.url);
    }
  }
  return matched;
}

/**
 * Refuerzo multi-fuente ANTES de normalizeVerification.
 * Si el topic cita ≥2 URLs del scrape Firecrawl → sube source_count y confidence.
 * @param {object} topicRaw
 * @param {string[]} [scrapeUrls]
 * @returns {object} topic crudo enriquecido
 */
function applyScrapeMultiSource(topicRaw, scrapeUrls) {
  if (!topicRaw || typeof topicRaw !== 'object') return topicRaw;
  if (!Array.isArray(scrapeUrls) || scrapeUrls.length < 2) return topicRaw;

  const evidence = normalizeEvidence(topicRaw.evidence);
  const matched = matchScrapeSources(evidence, scrapeUrls);
  if (matched.length < 2) return topicRaw;

  const prevCount = Number(topicRaw.source_count);
  const source_count = Math.max(
    Number.isFinite(prevCount) ? prevCount : 0,
    matched.length,
    countIndependentSources(evidence)
  );
  const prevConf = Number(topicRaw.confidence);
  const confidence = Math.min(100, (Number.isFinite(prevConf) ? prevConf : 0) + 10);

  // Quitar single_source si ya hay multi-scrape
  let risk_flags = topicRaw.risk_flags;
  if (Array.isArray(risk_flags)) {
    risk_flags = risk_flags.filter((f) => {
      const t = flagText(f).toLowerCase();
      return t !== 'single_source' && !t.includes('single_source');
    });
  }

  return {
    ...topicRaw,
    source_count,
    confidence,
    risk_flags,
    _multi_source_scrape_matches: matched.length,
  };
}

/**
 * ¿host cae bajo domain de lista editorial? (exacto o subdominio)
 * @param {string} host
 * @param {string} domain
 */
function hostMatchesDomain(host, domain) {
  if (!host || !domain) return false;
  const h = String(host).replace(/^www\./i, '').toLowerCase();
  const d = String(domain).replace(/^www\./i, '').toLowerCase().replace(/^\./, '');
  return h === d || h.endsWith('.' + d);
}

/**
 * Resuelve trust de un host contra la lista editorial.
 * Preferencia: match más largo (más específico) gana.
 * @param {string|null} host
 * @param {Array<{ domain: string, trust: string, label?: string }>} sources
 * @returns {{ trust: string, domain: string, label?: string }|null}
 */
function resolveSourceTrust(host, sources) {
  if (!host || !Array.isArray(sources) || !sources.length) return null;
  let best = null;
  for (const s of sources) {
    if (!s || !s.domain || !s.trust) continue;
    if (!hostMatchesDomain(host, s.domain)) continue;
    if (!best || String(s.domain).length > String(best.domain).length) best = s;
  }
  return best ? { trust: String(best.trust).toLowerCase(), domain: best.domain, label: best.label } : null;
}

/**
 * Ajusta confidence / risk_flags según trust de dominios en evidence.
 * high: +8 conf por host high (cap +16); low: -12 conf y flag low_trust_source.
 * Si solo hay low y no high/medium → no puede quedar verified (se baja en normalize).
 * @param {object} topicRaw
 * @param {Array<{ domain: string, trust: string, label?: string }>} trustSources
 */
function applyTrustFromSources(topicRaw, trustSources) {
  if (!topicRaw || typeof topicRaw !== 'object') return topicRaw;
  if (!Array.isArray(trustSources) || !trustSources.length) return topicRaw;

  const evidence = normalizeEvidence(topicRaw.evidence);
  if (!evidence.length) return topicRaw;

  let highHits = 0;
  let lowHits = 0;
  let mediumHits = 0;
  const matchedDomains = [];

  for (const e of evidence) {
    const host = urlHost(e.url);
    if (!host) continue;
    const hit = resolveSourceTrust(host, trustSources);
    if (!hit) continue;
    matchedDomains.push(hit.domain);
    if (hit.trust === 'high') highHits += 1;
    else if (hit.trust === 'low') lowHits += 1;
    else if (hit.trust === 'medium') mediumHits += 1;
  }

  if (!highHits && !lowHits && !mediumHits) return topicRaw;

  let confidence = Number(topicRaw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence += Math.min(16, highHits * 8);
  confidence += Math.min(6, mediumHits * 2);
  confidence -= Math.min(24, lowHits * 12);
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  let risk_flags = Array.isArray(topicRaw.risk_flags) ? [...topicRaw.risk_flags] : [];
  if (lowHits > 0) {
    const hasLow = risk_flags.some((f) => flagText(f).toLowerCase().includes('low_trust'));
    if (!hasLow) risk_flags.push('low_trust_source');
  }
  // Marcar evidence.reliable según trust del dominio
  const evidenceTagged = evidence.map((e) => {
    const host = urlHost(e.url);
    const hit = host ? resolveSourceTrust(host, trustSources) : null;
    if (!hit) return e;
    if (hit.trust === 'high') return { ...e, reliable: true };
    if (hit.trust === 'low') return { ...e, reliable: false };
    return e;
  });

  const out = {
    ...topicRaw,
    confidence,
    risk_flags,
    evidence: evidenceTagged,
    _trust_hits: { high: highHits, medium: mediumHits, low: lowHits, domains: matchedDomains },
  };
  // Solo low, sin high: no dejar que el modelo se auto-verifique
  if (lowHits > 0 && highHits === 0 && String(topicRaw.verification_status || '').toLowerCase() === 'verified') {
    out.verification_status = 'checking';
  }
  return out;
}

/**
 * Rank de verification_status (0 risk … 3 verified).
 * @param {string|null} status
 */
function verificationRank(status) {
  if (status == null) return 1;
  return STATUS_RANK[status] != null ? STATUS_RANK[status] : 1;
}

/**
 * ¿El topic nuevo es mejor agenda que la fila existente?
 * (status más alto, o mismo status con más confidence / source_count)
 */
function isBetterTopic(next, existing) {
  if (!next || !existing) return false;
  const nr = verificationRank(next.verification_status);
  const or = verificationRank(existing.verification_status);
  if (nr !== or) return nr > or;
  const nc = Number(next.confidence) || 0;
  const oc = Number(existing.confidence) || 0;
  if (nc !== oc) return nc > oc;
  return (Number(next.source_count) || 0) > (Number(existing.source_count) || 0);
}

/** Fusiona arrays de evidence por clave label|url. */
function mergeEvidenceLists(a, b) {
  const out = [];
  const seen = new Set();
  for (const e of [...normalizeEvidence(a), ...normalizeEvidence(b)]) {
    const key = `${(e.label || '').toLowerCase()}|${e.url || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.slice(0, 12);
}

/**
 * Normaliza un topic crudo del modelo a filas insertables en `topics`.
 * Aplica caps: verified sin multi-fuente/primaria; risk flags duros.
 * source_count se eleva al conteo estructural de hosts/labels si el modelo subreporta.
 * @param {object} topic
 * @returns {object|null} null si no hay title
 */
function normalizeVerification(topic) {
  if (!topic || typeof topic !== 'object') return null;
  const title = String(topic.title || '').trim();
  if (!title) return null;

  const evidence = normalizeEvidence(topic.evidence);
  const risk_flags = normalizeRiskFlags(topic.risk_flags);
  const structural = countIndependentSources(evidence);

  let source_count = Number(topic.source_count);
  if (!Number.isFinite(source_count) || source_count < 0) {
    source_count = structural || evidence.length;
  }
  source_count = clampInt(Math.max(source_count, structural), 0, 99);

  let confidence = clampInt(topic.confidence != null ? topic.confidence : 0, 0, 100);

  let verification_status = String(topic.verification_status || '').toLowerCase().trim();
  if (!VALID_STATUS.has(verification_status)) {
    verification_status = deriveStatus(confidence, risk_flags);
  }

  // Cap verified: hace falta ≥2 fuentes independientes O al menos una primaria
  if (verification_status === 'verified' && source_count < 2 && !hasPrimary(evidence)) {
    verification_status = confidence >= 40 ? 'checking' : 'signal';
    if (confidence > 74) confidence = 74;
  }

  if (hasHardRisk(risk_flags)) {
    verification_status = 'risk';
    if (confidence > 39) confidence = 39;
  }

  // Alinear bandas suaves: verified con score bajo no cuadra
  if (verification_status === 'verified' && confidence < 75) {
    verification_status = confidence >= 40 ? 'checking' : 'signal';
  }
  if (verification_status === 'risk' && confidence > 39 && !hasHardRisk(risk_flags)) {
    confidence = 39;
  }

  return {
    title: title.slice(0, 500),
    source: topic.source ? String(topic.source).slice(0, 80) : 'Web Search',
    mentions: clampInt(topic.mentions != null ? topic.mentions : 0, 0, 1_000_000),
    sentiment: topic.sentiment != null ? String(topic.sentiment).slice(0, 40) : null,
    antecedentes: topic.antecedentes != null ? String(topic.antecedentes) : null,
    actores: topic.actores != null ? String(topic.actores) : null,
    angulos: topic.angulos != null ? String(topic.angulos) : null,
    audiencia: topic.audiencia != null ? String(topic.audiencia) : null,
    confidence,
    verification_status,
    known_facts: topic.known_facts != null ? String(topic.known_facts) : null,
    unknown_facts: topic.unknown_facts != null ? String(topic.unknown_facts) : null,
    evidence,
    risk_flags,
    editorial_decision: topic.editorial_decision != null ? String(topic.editorial_decision) : null,
    source_count,
  };
}

/** Bloque de prompt reutilizable (detect web/markdown/Facebook). */
const VERIFICATION_JSON_SPEC = `Campos de verificación editorial (obligatorios en cada objeto):
- confidence (0-100): defensibilidad del hecho para publicar, NO copiar viralidad/mentions
- verification_status: uno de verified | checking | signal | risk
  · verified: fuente primaria y/o ≥2 independientes, hecho fechado, sin especulación
  · checking: plausible pero falta corroboración o dato clave
  · signal: interés local incompleto (falta fecha/sede/cifra)
  · risk: rumor, clickbait, engagement bait, sin fundamento, titular alarmista sin autoridad
- known_facts: qué se sabe (2-4 oraciones)
- unknown_facts: qué no se sabe o falta confirmar (1-3 oraciones o null)
- evidence: array de {label, url, kind, supports, reliable}. kind: primary|secondary|social|other. url SOLO si aparece en la entrada; si no, null. NO inventes URLs.
- risk_flags: array de strings (ej. single_source, rumor, clickbait, titular_alarmista, sin_fecha, geoloc_pendiente) o []
- editorial_decision: una oración (apto / condicionado / no titular como hecho)
- source_count: número de fuentes independientes contadas
Penaliza rumor y clickbait. Sin fuente primaria y una sola fuente → no uses verified.`;

module.exports = {
  normalizeVerification,
  normalizeEvidence,
  normalizeRiskFlags,
  applyScrapeMultiSource,
  applyTrustFromSources,
  matchScrapeSources,
  countIndependentSources,
  urlHost,
  hostMatchesDomain,
  resolveSourceTrust,
  isBetterTopic,
  verificationRank,
  mergeEvidenceLists,
  VERIFICATION_JSON_SPEC,
  VALID_STATUS,
  STATUS_RANK,
};
