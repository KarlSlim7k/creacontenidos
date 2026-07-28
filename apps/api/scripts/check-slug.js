#!/usr/bin/env node
const assert = require('node:assert');
const { slugify } = require('../src/lib/slug');

assert.strictEqual(slugify('Hotel San Carlos abre nueva ala con vista al Cofre de Perote'), 'hotel-san-carlos-abre-nueva-ala-con-vista-al-cofre-de-perote');
assert.strictEqual(slugify('Árboles, niños & café'), 'arboles-ninos-cafe');
assert.strictEqual(slugify('---'), '');
console.log('OK: generación determinista de slug verificada.');
