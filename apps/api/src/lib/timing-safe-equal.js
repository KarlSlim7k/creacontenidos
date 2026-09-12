// Comparación de strings en tiempo constante — evita filtrar por timing
// cuánto coincide un secreto (API key, token de webhook) con el valor
// esperado. Compartido por signal-auth.js y modules/telegram/index.js
// (antes duplicado byte a byte en ambos, hallado en revisión de código).
const crypto = require('node:crypto');

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = { safeEqual };
