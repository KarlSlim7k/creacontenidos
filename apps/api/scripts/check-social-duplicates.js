#!/usr/bin/env node
// Regresión sin red ni DB real: llama al helper compartido con límites simulados.
const assert = require('node:assert/strict');
const poolPath = require.resolve('../src/db/pool');
let query;
require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { query: (...args) => query(...args) } };
const { insertSocialPost } = require('../src/modules/social');
let fetches = 0;
global.fetch = async () => {
  fetches += 1;
  return { ok: true, json: async () => ({ title: 'Fixture', author_name: 'Fixture', thumbnail_url: 'https://example.test/thumbnail.jpg' }) };
};

(async () => {
  const existingUrl = 'https://youtu.be/aaaaaaaaaaa';
  query = async (sql, params) => {
    assert.match(sql, /^SELECT/);
    assert.deepEqual(params, [existingUrl]);
    return { rows: [{ id: 1 }] };
  };
  assert.deepEqual(await insertSocialPost(existingUrl), { duplicate: true });
  assert.equal(fetches, 0, 'Un duplicado conocido no consulta oEmbed');

  for (const raced of [false, true]) {
    let calls = 0;
    const url = raced ? 'https://youtu.be/bbbbbbbbbbb' : 'https://youtu.be/ccccccccccc';
    query = async (sql, params) => {
      calls += 1;
      if (calls === 1) return { rows: [] };
      assert.match(sql, /ON CONFLICT \(external_url\) DO NOTHING/);
      assert.equal(params[1], url);
      return { rows: raced ? [] : [{ id: 2, external_url: url }] };
    };
    const result = await insertSocialPost(url);
    assert.equal(calls, 2);
    if (raced) assert.deepEqual(result, { duplicate: true }, 'La carrera conserva el registro existente');
    else assert.equal(result.row.external_url, url);
  }
  const failure = Object.assign(new Error('Fixture DB failure'), { code: '23503' });
  query = async () => { throw failure; };
  await assert.rejects(insertSocialPost(existingUrl), (err) => err === failure);
  console.log('✔ Duplicados conocidos, nuevos, concurrentes y errores reales: OK');
})().catch((err) => { console.error(err); process.exitCode = 1; });
