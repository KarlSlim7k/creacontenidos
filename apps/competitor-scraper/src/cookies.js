import { readFile } from 'node:fs/promises';

// Parse a Netscape-format cookies.txt file (the format exported by
// "Get cookies.txt LOCALLY" and similar browser extensions).
// Example line: #HttpOnly_.facebook.com	TRUE	/	TRUE	1234567890	c_user	1234567890
function parseNetscapeCookies(text) {
    const cookies = [];
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('# ')) continue;

        // Skip the header comment lines but keep "#HttpOnly_" prefixed rows
        // (the leading "#HttpOnly_" is part of the domain spec, not a comment).
        const isHttpOnly = line.startsWith('#HttpOnly_');
        let cleaned;
        if (isHttpOnly) cleaned = line.slice('#HttpOnly_'.length);
        else if (line.startsWith('#')) cleaned = null;
        else cleaned = line;
        if (!cleaned) continue;

        const parts = cleaned.split('\t');
        if (parts.length < 7) continue;

        const [domain, , path, secureFlag, expiresRaw, name, value] = parts;
        if (!name || value === undefined) continue;

        const expires = Number(expiresRaw);
        // For Netscape exports, the domain field can be either ".facebook.com"
        // or "facebook.com". Playwright accepts both, so we keep it verbatim
        // (only forcing ".facebook.com" when the field is empty or unrelated).
        const normalizedDomain = /facebook\.com$/i.test(domain) ? domain : '.facebook.com';

        cookies.push({
            name,
            value,
            domain: normalizedDomain,
            path: path || '/',
            expires: Number.isFinite(expires) && expires > 0 ? expires : undefined,
            httpOnly: isHttpOnly,
            secure: secureFlag === 'TRUE',
            sameSite: 'Lax',
        });
    }
    return cookies;
}

// Accepts either:
//   - a plain array (already in Playwright cookie shape)
//   - a JSON string of an array
//   - an object map { name: value } limited to facebook.com essentials
//   - a string containing cookies in Netscape cookies.txt format
export function normalizeCookies(raw) {
    if (!raw) return [];

    if (Array.isArray(raw)) {
        return raw
            .filter((c) => c && c.name && c.value)
            .map((c) => ({
                name: String(c.name),
                value: String(c.value),
                domain: c.domain ? String(c.domain).replace(/^\./, '.facebook.com') : '.facebook.com',
                path: c.path || '/',
                expires: typeof c.expires === 'number' ? c.expires : undefined,
                httpOnly: Boolean(c.httpOnly),
                secure: c.secure !== false,
                sameSite: c.sameSite || 'Lax',
            }));
    }

    if (typeof raw === 'object') {
        return Object.entries(raw)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([name, value]) => ({
                name: String(name),
                value: String(value),
                domain: '.facebook.com',
                path: '/',
                secure: true,
                sameSite: 'Lax',
            }));
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];

        // JSON string
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                return normalizeCookies(parsed);
            } catch {
                // fall through to Netscape
            }
        }

        // Netscape cookies.txt
        if (trimmed.includes('\t') || trimmed.includes('#HttpOnly_')) {
            return parseNetscapeCookies(trimmed);
        }

        // "name=value; name2=value2" shorthand
        return trimmed
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((pair) => {
                const eq = pair.indexOf('=');
                if (eq === -1) return null;
                return {
                    name: pair.slice(0, eq).trim(),
                    value: pair.slice(eq + 1).trim(),
                };
            })
            .filter(Boolean)
            .map((c) => ({
                ...c,
                domain: '.facebook.com',
                path: '/',
                secure: true,
                sameSite: 'Lax',
            }));
    }

    return [];
}

// Resolve the cookies from (in order of priority):
//   1. input.facebookCookies
//   2. FB_COOKIES environment variable (string or JSON)
//   3. FB_COOKIES_FILE environment variable (path to cookies.json or cookies.txt)
export async function resolveFacebookCookies({ input, env }) {
    if (input && Array.isArray(input.facebookCookies) && input.facebookCookies.length > 0) {
        return { cookies: normalizeCookies(input.facebookCookies), source: 'input.facebookCookies' };
    }

    const fromEnv = env && env.FB_COOKIES;
    if (fromEnv) {
        const cookies = normalizeCookies(fromEnv);
        if (cookies.length > 0) return { cookies, source: 'env:FB_COOKIES' };
    }

    const fromFile = env && env.FB_COOKIES_FILE;
    if (fromFile) {
        const text = await readFile(fromFile, 'utf8');
        const cookies = normalizeCookies(text);
        if (cookies.length > 0) return { cookies, source: `file:${fromFile}` };
    }

    return { cookies: [], source: null };
}

// Lightweight validation: we need at least c_user and xs to be logged in.
export function hasMinimumAuthCookies(cookies) {
    const names = new Set(cookies.map((c) => c.name));
    return names.has('c_user') && names.has('xs');
}
