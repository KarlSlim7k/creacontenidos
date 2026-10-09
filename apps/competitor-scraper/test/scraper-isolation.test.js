import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionChecks = vi.hoisted(() => ({ count: 0 }));

// Crawlee real (colas, estado, Configuration); solo se sustituye el navegador: PlaywrightCrawler
// pasa a ser un BasicCrawler que inyecta una página falsa y ejecuta los preNavigationHooks.
vi.mock('crawlee', async (importOriginal) => {
    const crawlee = await importOriginal();
    const page = {
        context: () => ({ addCookies: async () => {} }),
        goto: async (url) => {
            if (url.includes('/me/')) sessionChecks.count += 1;
        },
        url: () => 'https://www.facebook.com/me/',
    };
    class FakePlaywrightCrawler extends crawlee.BasicCrawler {
        constructor({ preNavigationHooks = [], requestHandler, ...rest }, config) {
            super(
                {
                    ...rest,
                    requestHandler: async (ctx) => {
                        for (const hook of preNavigationHooks) await hook({ page });
                        await requestHandler({ ...ctx, page });
                    },
                },
                config,
            );
        }
    }
    return { ...crawlee, PlaywrightCrawler: FakePlaywrightCrawler };
});

vi.mock('node:timers/promises', () => ({ setTimeout: async () => {} }));
vi.mock('../src/facebook.js', () => ({
    extractPostsFromPage: async () => [{ post_url: 'https://facebook.com/acme/posts/1', post_text: 'hola' }],
    extractReelsFromPage: async () => [],
}));

const { runScrape } = await import('../src/scraper.js');

const logger = { info() {}, warning() {}, debug() {} };
const args = {
    accounts: ['acme'],
    cookies: [{ name: 'c_user', value: '1', domain: '.facebook.com', path: '/' }],
    logger,
};

describe('runScrape: aislamiento de storage por invocación', () => {
    beforeEach(() => {
        sessionChecks.count = 0;
    });

    it('llamadas consecutivas con la misma cuenta procesan requests y re-verifican la sesión', async () => {
        for (let run = 1; run <= 3; run++) {
            const items = await runScrape(args);
            expect(items).toHaveLength(1);
            expect(sessionChecks.count).toBe(run);
        }
    });

    it('llamadas concurrentes con la misma cuenta no se pisan', async () => {
        const results = await Promise.all([runScrape(args), runScrape(args), runScrape(args)]);
        for (const items of results) expect(items).toHaveLength(1);
        expect(sessionChecks.count).toBe(3);
    });
});
