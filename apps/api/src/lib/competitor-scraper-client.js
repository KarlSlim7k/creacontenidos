// Thin client for the competitor-scraper microservice (apps/competitor-scraper/).
// Used by the listening module when the API is asked to scrape Facebook with
// a logged-in session (source: 'facebook' in /api/listening/competitors/detect).
//
// The scraper lives on the same Dokploy network as the API; no auth header is
// required because the service is only reachable on the internal Docker network
// (expose:, not ports:). The API aborts if the call exceeds SCRAPE_TIMEOUT_MS.
//
// Never log the response body — it may contain post text scraped from Facebook.

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

async function scrapeCompetitorPosts({ baseUrl, accounts, maxPostsPerAccount, sinceDate, signal, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console }) {
  if (!baseUrl) {
    throw new Error('scrapeCompetitorPosts: baseUrl is required');
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('scrapeCompetitorPosts: accounts must be a non-empty array');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/scrape`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('scraper timeout')), timeoutMs);

  // Chain external signal into our internal controller so a client disconnect
  // also aborts the upstream fetch.
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accounts, maxPostsPerAccount, sinceDate }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`competitor-scraper responded ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const items = Array.isArray(json.items) ? json.items : [];
    if (logger && logger.info) {
      logger.info(`competitor-scraper returned ${items.length} item(s) for ${accounts.length} account(s) in ${Date.now() - startedAt}ms`);
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { scrapeCompetitorPosts, DEFAULT_TIMEOUT_MS };
