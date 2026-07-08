import { detectMediaType, parseCount, parseFacebookDate } from './utils.js';

const LOGIN_WALL_PATTERNS = [
    'log in to see more',
    'you must log in',
    'inicia sesión para ver más',
    'inicia sesion para ver mas',
    'debes iniciar sesión',
];

export async function isLoginWall(page) {
    const bodyText = await page
        .locator('body')
        .innerText()
        .then((text) => text.toLowerCase())
        .catch(() => '');
    return LOGIN_WALL_PATTERNS.some((pattern) => bodyText.includes(pattern));
}

// Runs entirely inside the browser context: pulls raw text/attributes off
// each `[role="article"]` post. Numbers/dates are parsed afterwards in
// Node (see extractPostsFromPage) so the parsing logic stays unit-testable.
async function collectRawArticles(page) {
    return page.evaluate(() => {
        // Facebook nests comment blocks inside the post's [role="article"] using
        // the same role, so a plain querySelectorAll would also return every
        // comment as if it were its own post. Keep only the outermost matches.
        const allArticles = Array.from(document.querySelectorAll('[role="article"]'));
        const articles = allArticles.filter((el) => !allArticles.some((other) => other !== el && other.contains(el)));

        const findByAriaLabel = (root, keywords) => {
            const node = Array.from(root.querySelectorAll('[aria-label]')).find((el) =>
                keywords.some((kw) => el.getAttribute('aria-label').toLowerCase().includes(kw)),
            );
            return node ? node.getAttribute('aria-label') : null;
        };

        return articles.map((article) => {
            const linkSelectors = [
                'a[href*="/posts/"]',
                'a[href*="/videos/"]',
                'a[href*="/photos/"]',
                'a[href*="story.php"]',
                'a[href*="/reel/"]',
                'a[href*="pfbid"]',
            ];
            let urlEl = null;
            for (const sel of linkSelectors) {
                urlEl = article.querySelector(sel);
                if (urlEl) break;
            }
            const url = urlEl ? urlEl.href.split('?')[0] : null;

            const abbr = article.querySelector('abbr[data-utime]');
            const utime = abbr ? abbr.getAttribute('data-utime') : null;
            let dateRaw = null;
            if (urlEl) dateRaw = urlEl.getAttribute('aria-label') || urlEl.title || null;
            if (!dateRaw && abbr) dateRaw = abbr.getAttribute('title') || abbr.textContent || null;

            const textCandidates = Array.from(article.querySelectorAll('div[dir="auto"]'))
                .map((el) => (el.innerText ? el.innerText.trim() : ''))
                .filter((t) => t && t.length > 0);
            const text =
                textCandidates.length > 0
                    ? textCandidates.reduce(
                          (longest, current) => (current.length > longest.length ? current : longest),
                          '',
                      )
                    : null;

            const reactionsRaw = findByAriaLabel(article, ['reaction', 'reaccion', 'me gusta', 'like']);
            const commentsRaw = findByAriaLabel(article, ['comment', 'comentario']);
            const sharesRaw = findByAriaLabel(article, ['share', 'compar']);
            const viewsRaw = findByAriaLabel(article, ['view', 'reproducc', 'vista']);

            const hasVideo = !!article.querySelector('video');
            const hasImage = !hasVideo && !!article.querySelector('img[src*="scontent"]');
            const hasExternalLink =
                !hasVideo && !hasImage && !!article.querySelector('a[target="_blank"][rel*="nofollow"]');

            return {
                url,
                dateRaw,
                utime,
                text,
                reactionsRaw,
                commentsRaw,
                sharesRaw,
                viewsRaw,
                hasVideo,
                hasImage,
                hasExternalLink,
            };
        });
    });
}

async function autoScrollUntilEnoughPosts(page, minPosts, log) {
    let previousCount = 0;
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const articleCount = await page.locator('[role="article"]').count();
        if (articleCount >= minPosts) break;
        if (articleCount === previousCount && attempt > 2) {
            if (log && log.debug) log.debug('Scroll stopped producing new posts, stopping early.', { articleCount, attempt });
            break;
        }
        previousCount = articleCount;

        await page.mouse.wheel(0, 2500);

        await page.waitForTimeout(1500 + Math.random() * 1500);
    }
}

export async function extractPostsFromPage({ page, log, maxPosts }) {
    await page.waitForLoadState('domcontentloaded');

    if (await isLoginWall(page)) {
        if (log && log.warning) log.warning('Login wall detected, no public content available. Skipping this page.', { url: page.url() });
        return [];
    }

    await autoScrollUntilEnoughPosts(page, maxPosts, log);

    if (await isLoginWall(page)) {
        if (log && log.warning) log.warning('Login wall appeared while scrolling; extracting only the posts loaded so far.', {
            url: page.url(),
        });
    }

    const rawArticles = await collectRawArticles(page);
    // Some matched articles are unrelated widgets (e.g. "suggested for you")
    // with neither a permalink nor any text - not real posts, drop them.
    const nonEmptyArticles = rawArticles.filter((raw) => raw.url || raw.text);

    return nonEmptyArticles.slice(0, maxPosts).map((raw) => ({
        post_url: raw.url != null ? raw.url : null,
        post_text: raw.text != null ? raw.text : null,
        post_date: parseFacebookDate({ utime: raw.utime, dateRaw: raw.dateRaw }),
        reactions: parseCount(raw.reactionsRaw),
        comments: parseCount(raw.commentsRaw),
        shares: parseCount(raw.sharesRaw),
        views: parseCount(raw.viewsRaw),
        media_type: detectMediaType(raw),
    }));
}

export { LOGIN_WALL_PATTERNS };
