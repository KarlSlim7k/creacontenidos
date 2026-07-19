import { test, expect } from '@playwright/test';
import { DIRECTOR } from './helpers';

test.describe('H. Smoke API (request context, not UI)', () => {
  let token: string;

  test.beforeAll(async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/auth/login`, { data: DIRECTOR });
    expect(res.ok()).toBeTruthy();
    token = (await res.json()).token;
    expect(token).toBeTruthy();
  });

  test('GET /api/listening/topics returns confidence + verification_status', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/listening/topics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const topics = await res.json();
    expect(Array.isArray(topics)).toBeTruthy();
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]).toHaveProperty('confidence');
    expect(topics[0]).toHaveProperty('verification_status');
  });

  test('GET /api/listening/radar-stats?days=30 returns topics/hints/knobs shape', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/listening/radar-stats?days=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats.topics).toHaveProperty('total');
    expect(Array.isArray(stats.hints)).toBeTruthy();
    expect(stats).toHaveProperty('knobs');
  });

  test('GET /api/listening/radar-sources returns seeded domains', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/listening/radar-sources`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const sources = await res.json();
    expect(sources.length).toBeGreaterThan(0);
  });

  test('POST /api/content/generate-proposal on a risk topic without force → 409 verification_risk', async ({ request, baseURL }) => {
    const topicsRes = await request.get(`${baseURL}/api/listening/topics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const topics = await topicsRes.json();
    const riskTopic = topics.find((t: any) => t.verification_status === 'risk');
    expect(riskTopic, 'seed debe tener al menos un topic con verification_status=risk').toBeTruthy();

    const res = await request.post(`${baseURL}/api/content/generate-proposal`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { topic_id: riskTopic.id, format: 'nota' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('verification_risk');
  });
});
