import { describe, expect, it } from 'vitest';

import { detectMediaType, isBeforeSinceDate, parseCount, parseFacebookDate, toStartUrl } from '../src/utils.js';

describe('toStartUrl', () => {
    it('builds a facebook.com URL from a bare handle', () => {
        expect(toStartUrl('nike')).toBe('https://www.facebook.com/nike');
    });

    it('strips a leading @ from handles', () => {
        expect(toStartUrl('@nike')).toBe('https://www.facebook.com/nike');
    });

    it('passes full URLs through unchanged', () => {
        expect(toStartUrl('https://www.facebook.com/nike')).toBe('https://www.facebook.com/nike');
    });
});

describe('parseCount', () => {
    it('parses plain numbers', () => {
        expect(parseCount('42')).toBe(42);
    });

    it('parses K suffix', () => {
        expect(parseCount('3.4K comments')).toBe(3400);
    });

    it('parses M suffix', () => {
        expect(parseCount('1.2M reactions')).toBe(1_200_000);
    });

    it('returns 0 for missing or unparsable input', () => {
        expect(parseCount(null)).toBe(0);
        expect(parseCount('')).toBe(0);
        expect(parseCount('no number here')).toBe(0);
    });
});

describe('parseFacebookDate', () => {
    it('prefers the unix-seconds data-utime attribute', () => {
        expect(parseFacebookDate({ utime: '1700000000', dateRaw: 'garbage' })).toBe(
            new Date(1700000000 * 1000).toISOString(),
        );
    });

    it('falls back to parsing the free-text date', () => {
        expect(parseFacebookDate({ utime: null, dateRaw: '2024-01-15T10:00:00Z' })).toBe('2024-01-15T10:00:00.000Z');
    });

    it('returns null when nothing is parsable', () => {
        expect(parseFacebookDate({ utime: null, dateRaw: null })).toBeNull();
        expect(parseFacebookDate({ utime: 'abc', dateRaw: 'not a date' })).toBeNull();
    });
});

describe('detectMediaType', () => {
    it('prioritizes video over image and link', () => {
        expect(detectMediaType({ hasVideo: true, hasImage: true, hasExternalLink: true })).toBe('video');
    });

    it('falls back to imagen when only an image is present', () => {
        expect(detectMediaType({ hasVideo: false, hasImage: true, hasExternalLink: false })).toBe('imagen');
    });

    it('falls back to enlace when only an external link is present', () => {
        expect(detectMediaType({ hasVideo: false, hasImage: false, hasExternalLink: true })).toBe('enlace');
    });

    it('defaults to texto when no media is detected', () => {
        expect(detectMediaType({ hasVideo: false, hasImage: false, hasExternalLink: false })).toBe('texto');
    });
});

describe('isBeforeSinceDate', () => {
    const sinceDate = new Date('2024-06-01T00:00:00Z');

    it('returns true for posts older than sinceDate', () => {
        expect(isBeforeSinceDate('2024-01-01T00:00:00Z', sinceDate)).toBe(true);
    });

    it('returns false for posts on or after sinceDate', () => {
        expect(isBeforeSinceDate('2024-07-01T00:00:00Z', sinceDate)).toBe(false);
    });

    it('returns false when sinceDate or the post date is missing', () => {
        expect(isBeforeSinceDate(null, sinceDate)).toBe(false);
        expect(isBeforeSinceDate('2024-01-01T00:00:00Z', null)).toBe(false);
    });
});
