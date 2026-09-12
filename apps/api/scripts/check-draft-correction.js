#!/usr/bin/env node
// RADAR 2.0, backlog nuevo (R2-50): check de función pura, sin red ni DB.
const assert = require('node:assert');
const { correctionRate, wordEditDistance } = require('../src/lib/draft-correction');

// Idéntico → 0.
assert.strictEqual(correctionRate('Uno dos tres', 'Uno dos tres'), 0);

// Ambos vacíos → null (nada que comparar, no es "0% de corrección").
assert.strictEqual(correctionRate('', ''), null);
assert.strictEqual(correctionRate(null, undefined), null);

// Vacío → algo: 100% (todo es nuevo).
assert.strictEqual(correctionRate('', 'Todo nuevo aquí'), 100);

// Una palabra distinta de tres → ~33.3%.
assert.strictEqual(correctionRate('Uno dos tres', 'Uno dos cuatro'), 33.3);

// Espacios/saltos de línea de más no cuentan como cambio.
assert.strictEqual(correctionRate('Uno   dos\ntres', 'Uno dos tres'), 0);

// wordEditDistance: caso base directo (sin pasar por el % de correctionRate).
assert.strictEqual(wordEditDistance(['a', 'b'], ['a', 'b', 'c']), 1);
assert.strictEqual(wordEditDistance(['a', 'b', 'c'], ['x', 'y', 'z']), 3);
assert.strictEqual(wordEditDistance([], []), 0);

console.log('✔ check-draft-correction pasó: correctionRate() (R2-50) — función pura sin red ni DB.');
