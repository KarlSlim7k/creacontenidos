import http from 'node:http';

import { log as crawleeLog } from 'crawlee';

import { hasMinimumAuthCookies, resolveFacebookCookies } from './cookies.js';
import { runScrape } from './scraper.js';

const PORT = Number(process.env.PORT) || 3015;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB cap — input is just a list of handles, this is generous
const DEFAULT_SCRAPE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — covers ~5-8 accounts at 30-60s each

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
                req.destroy();
                reject(new Error('request body too large'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }
            try {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve(text ? JSON.parse(text) : {});
            } catch (err) {
                reject(new Error('invalid JSON: ' + err.message));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(data),
    });
    res.end(data);
}

function sendError(res, status, message) {
    sendJson(res, status, { error: message });
}

// Load cookies once at startup so the file is mounted and readable before the
// first request. If the file is missing, we still come up — just refuse calls
// that require auth.
let cachedCookies = null;
let cachedCookiesSource = null;

async function loadCookies() {
    const env = process.env;
    const { cookies, source } = await resolveFacebookCookies({ input: null, env });
    cachedCookies = cookies;
    cachedCookiesSource = source;
    if (cookies.length > 0) {
        if (hasMinimumAuthCookies(cookies)) {
            crawleeLog.info(`Loaded ${cookies.length} cookie(s) from ${source}. Session check will pass.`);
        } else {
            crawleeLog.warning(`Loaded ${cookies.length} cookie(s) from ${source}, but c_user/xs missing. Login will fail.`);
        }
    } else {
        crawleeLog.info('No cookies configured. Only public pages will work.');
    }
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, {
            ok: true,
            uptime: process.uptime(),
            cookies: cachedCookies
                ? {
                      loaded: cachedCookies.length,
                      source: cachedCookiesSource,
                      authenticated: hasMinimumAuthCookies(cachedCookies),
                  }
                : { loaded: 0, source: null, authenticated: false },
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/scrape') {
        const startedAt = Date.now();
        let body;
        try {
            body = await readJsonBody(req);
        } catch (err) {
            sendError(res, 400, err.message);
            return;
        }

        const { accounts, maxPostsPerAccount, sinceDate } = body;

        if (!Array.isArray(accounts) || accounts.length === 0) {
            sendError(res, 400, 'accounts must be a non-empty array of Facebook handles or URLs');
            return;
        }

        let sinceDateObj = null;
        if (sinceDate) {
            sinceDateObj = new Date(sinceDate);
            if (Number.isNaN(sinceDateObj.getTime())) {
                sendError(res, 400, `sinceDate is not a valid ISO date: ${sinceDate}`);
                return;
            }
        }

        const max = Number.isFinite(maxPostsPerAccount) && maxPostsPerAccount > 0 ? maxPostsPerAccount : 10;

        // 5-minute timeout: AbortController signals the outer request. The
        // PlaywrightCrawler inside runScrape does not directly observe this
        // signal (crawlee doesn't expose a per-request abort today), so the
        // cap is enforced by checking elapsed time on the response side. In
        // practice the crawler.run() will return once all in-flight pages
        // finish, so the worst case is bounded by the slowest page (60s).
        const controller = new AbortController();
        const timeoutMs = Number(process.env.SCRAPE_TIMEOUT_MS) || DEFAULT_SCRAPE_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const items = await runScrape({
                accounts,
                maxPostsPerAccount: max,
                sinceDate: sinceDateObj,
                cookies: cachedCookies,
                logger: crawleeLog,
            });

            clearTimeout(timer);

            if (controller.signal.aborted) {
                sendError(res, 504, 'scrape exceeded timeout');
                return;
            }

            sendJson(res, 200, {
                items,
                meta: {
                    count: items.length,
                    accounts: accounts.length,
                    elapsedMs: Date.now() - startedAt,
                },
            });
        } catch (err) {
            clearTimeout(timer);
            crawleeLog.error(`scrape failed: ${err.message}`);
            sendError(res, 500, err.message);
        }
        return;
    }

    sendError(res, 404, 'not found');
});

(async () => {
    await loadCookies();
    server.listen(PORT, HOST, () => {
        crawleeLog.info(`competitor-scraper listening on http://${HOST}:${PORT} (scrape timeout ${DEFAULT_SCRAPE_TIMEOUT_MS}ms)`);
    });
})();

// Graceful shutdown
function shutdown(signal) {
    crawleeLog.info(`received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
