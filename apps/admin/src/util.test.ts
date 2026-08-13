// Test de los helpers puros de util.ts. Corre con Node nativo (--experimental-strip-types),
// sin runner ni deps: node --test src/util.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { esc, greeting, safeHttpUrl } from './util.ts';

test('esc escapa los cinco caracteres peligrosos en HTML', () => {
  assert.strictEqual(esc('<b>'), '&lt;b&gt;');
  assert.strictEqual(esc('a & b'), 'a &amp; b');
  assert.strictEqual(esc('di "hola"'), 'di &quot;hola&quot;');
  // La comilla simple es la que faltaba: sin ella, un valor de la DB dentro de un
  // atributo con comillas simples se escapa del atributo.
  assert.strictEqual(esc("O'Higgins"), 'O&#39;Higgins');
  assert.strictEqual(esc("' onerror='alert(1)"), '&#39; onerror=&#39;alert(1)');
});

test('esc escapa & primero, sin doble escape', () => {
  // Si & se escapara al final, '&lt;' se volvería '&amp;lt;' y se vería el markup crudo.
  assert.strictEqual(esc('&lt;'), '&amp;lt;');
});

test('esc trata null/undefined como cadena vacía', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  assert.strictEqual(esc(0), '0');
});

test('greeting cambia con la hora local', () => {
  const at = (h: number) => greeting(new Date(2026, 7, 11, h, 0, 0));
  assert.strictEqual(at(0), 'Buenos días');
  assert.strictEqual(at(11), 'Buenos días');
  assert.strictEqual(at(12), 'Buenas tardes');
  assert.strictEqual(at(18), 'Buenas tardes');
  assert.strictEqual(at(19), 'Buenas noches');
  assert.strictEqual(at(23), 'Buenas noches');
});

test('safeHttpUrl permite HTTP(S)/rutas y bloquea esquemas activos', () => {
  assert.strictEqual(safeHttpUrl('https://example.com/x'), 'https://example.com/x');
  assert.strictEqual(safeHttpUrl('/api/public/images/123'), '/api/public/images/123');
  assert.strictEqual(safeHttpUrl('javascript:alert(1)'), '');
  assert.strictEqual(safeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.strictEqual(safeHttpUrl('not a valid url'), '');
});
