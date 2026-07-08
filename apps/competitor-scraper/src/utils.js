// Pure helpers kept separate from Playwright code so they can be unit-tested
// without spinning up a browser or hitting the network.

export function toStartUrl(account) {
    const trimmed = String(account).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://www.facebook.com/${trimmed.replace(/^@/, '')}`;
}

// Facebook renders engagement counts as free text like "12 reacciones",
// "3.4K comments" or "1,2 mil". This pulls out the leading number and
// applies the k/m suffix multiplier.
export function parseCount(raw) {
    if (!raw) return 0;
    const match = String(raw)
        .replace(/,/g, '.')
        .match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    if (Number.isNaN(value)) return 0;
    const suffix = match[2] ? match[2].toLowerCase() : null;
    if (suffix === 'k') return Math.round(value * 1_000);
    if (suffix === 'm') return Math.round(value * 1_000_000);
    return Math.round(value);
}

// data-utime is a legacy unix-seconds attribute; dateRaw is a free-text
// fallback (aria-label/title) that we try to Date.parse as a last resort.
export function parseFacebookDate({ utime, dateRaw }) {
    if (utime) {
        const seconds = Number(utime);
        if (!Number.isNaN(seconds) && seconds > 0) {
            return new Date(seconds * 1000).toISOString();
        }
    }
    if (dateRaw) {
        const parsed = Date.parse(dateRaw);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    return null;
}

export function detectMediaType({ hasVideo, hasImage, hasExternalLink }) {
    if (hasVideo) return 'video';
    if (hasImage) return 'imagen';
    if (hasExternalLink) return 'enlace';
    return 'texto';
}

export function isBeforeSinceDate(isoDate, sinceDate) {
    if (!sinceDate || !isoDate) return false;
    const postDate = new Date(isoDate);
    if (Number.isNaN(postDate.getTime())) return false;
    return postDate < sinceDate;
}
