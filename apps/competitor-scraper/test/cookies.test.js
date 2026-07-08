import { describe, expect, it } from 'vitest';

import { hasMinimumAuthCookies, normalizeCookies } from '../src/cookies.js';

describe('normalizeCookies - Netscape cookies.txt', () => {
    it('parses standard Netscape rows including #HttpOnly_ rows', () => {
        const netscape = [
            '# Netscape HTTP Cookie File',
            '#HttpOnly_.facebook.com\tTRUE\t/\tTRUE\t1700000000\txs\tabc123',
            '.facebook.com\tTRUE\t/\tFALSE\t1700000000\tc_user\t123456789',
            '.facebook.com\tTRUE\t/\tFALSE\t1700000000\tfr\tzzzz',
        ].join('\n');

        const cookies = normalizeCookies(netscape);
        const names = cookies.map((c) => c.name).sort();
        expect(names).toEqual(['c_user', 'fr', 'xs']);
        expect(cookies.find((c) => c.name === 'c_user').value).toBe('123456789');
        expect(cookies.find((c) => c.name === 'xs').httpOnly).toBe(true);
        expect(cookies.every((c) => c.domain === '.facebook.com')).toBe(true);
    });
});

describe('normalizeCookies - JSON array', () => {
    it('accepts a JSON-stringified array of Playwright cookies', () => {
        const json = JSON.stringify([
            { name: 'c_user', value: '999', domain: '.facebook.com', path: '/', secure: true, httpOnly: true },
            { name: 'xs', value: 'aaa:bbb' },
        ]);
        const cookies = normalizeCookies(json);
        expect(cookies).toHaveLength(2);
        expect(cookies[0].sameSite).toBe('Lax');
        expect(cookies[1].value).toBe('aaa:bbb');
    });
});

describe('normalizeCookies - shorthand', () => {
    it('parses "name=value; name2=value2" pairs', () => {
        const cookies = normalizeCookies('c_user=123; xs=abc%3Adef; fr=zzz');
        expect(cookies.map((c) => c.name)).toEqual(['c_user', 'xs', 'fr']);
        expect(cookies.find((c) => c.name === 'xs').value).toBe('abc%3Adef');
    });
});

describe('hasMinimumAuthCookies', () => {
    it('returns true when c_user and xs are present', () => {
        expect(hasMinimumAuthCookies([{ name: 'c_user', value: '1' }, { name: 'xs', value: '2' }])).toBe(true);
    });

    it('returns false when one of c_user/xs is missing', () => {
        expect(hasMinimumAuthCookies([{ name: 'c_user', value: '1' }])).toBe(false);
        expect(hasMinimumAuthCookies([{ name: 'xs', value: '2' }])).toBe(false);
    });
});
