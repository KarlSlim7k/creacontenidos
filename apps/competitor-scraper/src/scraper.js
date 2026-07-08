import { PlaywrightCrawler, log as crawleeLog } from 'crawlee';
import { setTimeout as sleep } from 'node:timers/promises';

import { extractPostsFromPage } from './facebook.js';
import { hasMinimumAuthCookies, resolveFacebookCookies } from './cookies.js';
import { isBeforeSinceDate, toStartUrl } from './utils.js';

// Shared scraper logic, consumed by both the HTTP server (src/server.js) and
// the CLI (src/main.js). Returns the array of normalized items; the caller is
// responsible for serializing them (HTTP body / stdout) — this keeps the
// function easy to unit-test and to call from a future job runner.
//
// `cookies` is an array of Playwright cookie objects (already resolved by
// resolveFacebookCookies). `logger` is any object with .info/.warning/.debug
// methods (crawlee's logger works; console does too).
export async function runScrape({ accounts, maxPostsPerAccount = 10, sinceDate = null, cookies = [], logger = crawleeLog }) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error('runScrape: accounts must be a non-empty array');
    }

    if (cookies.length > 0 && !hasMinimumAuthCookies(cookies)) {
        logger.warning('Cookies provided are missing c_user and/or xs. Login will likely fail.');
    }

    const seenPostUrls = new Set();
    const items = [];

    const requests = accounts.map((account) => ({
        url: toStartUrl(account),
        userData: { account },
    }));

    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 1,
        requestHandlerTimeoutSecs: 90,
        preNavigationHooks:
            cookies.length > 0
                ? [
                      async ({ page }) => {
                          await page.context().addCookies(cookies);
                      },
                  ]
                : undefined,
        requestHandler: async ({ page, request, log: crawlerLog }) => {
            const { account } = request.userData;
            crawlerLog.info(`Scraping Facebook page for account "${account}"`, { url: request.url });

            const posts = await extractPostsFromPage({ page, log: crawlerLog, maxPosts: maxPostsPerAccount });

            for (const post of posts) {
                if (isBeforeSinceDate(post.post_date, sinceDate)) continue;
                if (post.post_url) {
                    if (seenPostUrls.has(post.post_url)) continue;
                    seenPostUrls.add(post.post_url);
                }

                items.push({
                    source_platform: 'facebook',
                    source_account: account,
                    post_url: post.post_url || null,
                    post_text: post.post_text || null,
                    post_date: post.post_date || null,
                    reactions: post.reactions || 0,
                    comments: post.comments || 0,
                    shares: post.shares || 0,
                    views: post.views || 0,
                    media_type: post.media_type || null,
                });
            }

            crawlerLog.info(`Extracted ${posts.length} post(s) for account "${account}"`);

            // Rate limiting: random 2-5s delay before the crawler picks up the next page.
            await sleep(2000 + Math.random() * 3000);
        },
        failedRequestHandler: async ({ request, log: crawlerLog }, error) => {
            crawlerLog.error(`Failed to scrape account "${request.userData.account}", skipping it: ${error.message}`, {
                url: request.url,
            });
        },
    });

    await crawler.run(requests);

    // Optional post-run session check: only if cookies were provided.
    if (cookies.length > 0) {
        const verificationCrawler = new PlaywrightCrawler({
            maxConcurrency: 1,
            maxRequestRetries: 0,
            requestHandlerTimeoutSecs: 30,
            preNavigationHooks: [
                async ({ page }) => {
                    await page.context().addCookies(cookies);
                },
            ],
            requestHandler: async ({ page, log: crawlerLog }) => {
                await page.goto('https://www.facebook.com/me/', { waitUntil: 'domcontentloaded' });
                const finalUrl = page.url();
                const isLogin = /\/login|checkpoint/i.test(finalUrl);
                if (isLogin) {
                    crawlerLog.warning('Session check FAILED. Facebook redirected to login or checkpoint. Cookies may be expired.', {
                        finalUrl,
                    });
                } else {
                    crawlerLog.info('Session check OK. You appear to be logged in.', { finalUrl });
                }
            },
        });
        await verificationCrawler.run([{ url: 'https://www.facebook.com/me/' }]);
    }

    return items;
}

// Thin CLI entry: reads input from SCRAPER_INPUT (JSON string) or
// --config <path>, calls runScrape, prints one item per line to stdout.
// Exits 0 on success, 1 on validation/error.
export async function runCli(argv = process.argv.slice(2)) {
    let input = null;
    const configIdx = argv.indexOf('--config');
    if (configIdx !== -1 && argv[configIdx + 1]) {
        const fs = await import('node:fs/promises');
        const text = await fs.readFile(argv[configIdx + 1], 'utf8');
        input = JSON.parse(text);
    } else if (process.env.SCRAPER_INPUT) {
        input = JSON.parse(process.env.SCRAPER_INPUT);
    }

    if (!input || !Array.isArray(input.accounts) || input.accounts.length === 0) {
        process.stderr.write('CLI: input must be a JSON object with a non-empty "accounts" array.\n');
        process.exit(1);
    }

    const { accounts, maxPostsPerAccount, sinceDate } = input;
    const { cookies } = await resolveFacebookCookies({ input, env: process.env });

    if (cookies.length > 0) {
        process.stderr.write(`CLI: loaded ${cookies.length} cookie(s) from env/file/input.\n`);
    } else {
        process.stderr.write('CLI: no cookies provided. Only public pages will be scraped.\n');
    }

    let sinceDateObj = null;
    if (sinceDate) {
        sinceDateObj = new Date(sinceDate);
        if (Number.isNaN(sinceDateObj.getTime())) {
            process.stderr.write(`CLI: sinceDate is not a valid ISO date: ${sinceDate}\n`);
            process.exit(1);
        }
    }

    try {
        const items = await runScrape({ accounts, maxPostsPerAccount, sinceDate: sinceDateObj, cookies, logger: crawleeLog });
        for (const item of items) {
            process.stdout.write(JSON.stringify(item) + '\n');
        }
        process.exit(0);
    } catch (err) {
        process.stderr.write(`CLI: scrape failed: ${err.message}\n`);
        process.exit(1);
    }
}
