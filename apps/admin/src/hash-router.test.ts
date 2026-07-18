// Test del router por hash (hashFor / screenFromHash). Corre con Node nativo
// (--experimental-strip-types), sin runner ni deps nuevas: node --test src/hash-router.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashFor, screenFromHash } from './hash-router.ts';

test('hashFor arma #screen sin extra', () => {
  assert.equal(hashFor('radar'), '#radar');
});

test('hashFor arma #screen/id con extra', () => {
  assert.equal(hashFor('editor', 42), '#editor/42');
});

test('screenFromHash lee #screen simple', () => {
  assert.deepEqual(screenFromHash('#radar'), { screen: 'radar', extra: null });
});

test('screenFromHash lee #screen/id', () => {
  assert.deepEqual(screenFromHash('#editor/42'), { screen: 'editor', extra: 42 });
});

test('screenFromHash vacío devuelve null', () => {
  assert.equal(screenFromHash(''), null);
  assert.equal(screenFromHash('#'), null);
});

test('screenFromHash con extra no numérico cae a null', () => {
  assert.deepEqual(screenFromHash('#editor/abc'), { screen: 'editor', extra: null });
});
