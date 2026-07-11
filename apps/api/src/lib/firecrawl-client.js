// Cliente Firecrawl para scrape de web pública (RADAR / listening).
// scrapeMarkdown + helpers de config. Enganchado en topic-detection (Fase 2).
// Docs: docs/ia/firecrawl-integracion.md
//
// Auth: Bearer FIRECRAWL_API_KEY. Base default https://api.firecrawl.dev/v1.
// Sin key → Error con código firecrawl_not_configured (mismo estilo que
// competitor_scraper_not_configured).

const config = require('../config');

const DEFAULT_BASE_URL = 'https://api.firecrawl.dev/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2; // 1 intento + 1 reintento

function getApiKey() {
  return config.firecrawlApiKey || null;
}

function getBaseUrl() {
  return (config.firecrawlBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

/** @returns {string[]} URLs de fuentes web para detección de topics (env CSV o []). */
function getSourceUrls() {
  const raw = config.firecrawlSourceUrls;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Scrapea una URL y devuelve markdown limpio.
 * @param {string} url
 * @param {{ timeoutMs?: number, formats?: string[] }} [opts]
 * @returns {Promise<{ markdown: string, metadata: object|null, url: string }>}
 */
async function scrapeMarkdown(url, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('FIRECRAWL_API_KEY no está configurado en el API');
    err.code = 'firecrawl_not_configured';
    throw err;
  }
  if (!url || typeof url !== 'string') {
    throw new Error('scrapeMarkdown: url is required');
  }

  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const formats = opts.formats || ['markdown'];
  const endpoint = `${getBaseUrl()}/scrape`;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('firecrawl timeout')), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, formats }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Firecrawl respondió ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json();
      const data = json.data || json;
      const markdown = data.markdown != null ? String(data.markdown) : '';
      if (!markdown && json.success === false) {
        throw new Error(`Firecrawl scrape falló: ${(json.error || 'sin markdown').toString().slice(0, 200)}`);
      }

      return {
        markdown,
        metadata: data.metadata || null,
        url: (data.metadata && data.metadata.sourceURL) || url,
      };
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_ATTEMPTS) break;
      // reintento solo en timeout / red; 4xx de config no vale reintentar
      const msg = String(err && err.message || err);
      if (/respondió 4\d\d/.test(msg) && !/429/.test(msg)) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

module.exports = {
  scrapeMarkdown,
  getSourceUrls,
  getApiKey,
  getBaseUrl,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
};
