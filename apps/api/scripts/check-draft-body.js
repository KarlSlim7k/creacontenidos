#!/usr/bin/env node
const assert = require('node:assert');
const { stripLeadingDuplicateTitle } = require('../src/lib/ai-client');

const title = 'Arranca construcción en Telesecundaria';
const body = 'Primer párrafo.\n\nSegundo párrafo.';

assert.strictEqual(stripLeadingDuplicateTitle(`**${title}**\n\n${body}`, title), body);
assert.strictEqual(stripLeadingDuplicateTitle(`# ${title.toUpperCase()}\n${body}`, title), body);
assert.strictEqual(stripLeadingDuplicateTitle(`\n__${title}__\n\n${body}`, title), body);
assert.strictEqual(stripLeadingDuplicateTitle(`Un encabezado distinto\n\n${body}`, title), `Un encabezado distinto\n\n${body}`);
assert.strictEqual(stripLeadingDuplicateTitle(body, title), body);

console.log('✔ check-draft-body pasó: elimina solo un título inicial idéntico.');
