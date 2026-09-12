#!/usr/bin/env node
// Check de función pura para lib/timing-safe-equal.js — sin red ni DB.
// Antes duplicada byte a byte en signal-auth.js y modules/telegram/index.js
// (hallado en revisión de código); ahora un solo helper compartido.
const assert = require('node:assert');
const { safeEqual } = require('../src/lib/timing-safe-equal');

assert.strictEqual(safeEqual('secreto123', 'secreto123'), true);
assert.strictEqual(safeEqual('secreto123', 'otro-secreto'), false);
assert.strictEqual(safeEqual('secreto123', 'secreto1234'), false, 'largos distintos → false, sin tirar por longitud diferente');
assert.strictEqual(safeEqual('', ''), true);
assert.strictEqual(safeEqual(null, 'secreto123'), false, 'null no es string → false, no revienta');
assert.strictEqual(safeEqual(undefined, undefined), false, 'undefined no es string → false');
assert.strictEqual(safeEqual(123, 123), false, 'números no son strings → false');

console.log('✔ check-timing-safe-equal pasó: safeEqual() — función pura sin red ni DB.');
