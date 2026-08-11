// Cifrado en reposo del secret TOTP (users.two_factor_secret). Sin esto, un dump
// de la DB da 2FA de cualquier usuario gratis — bcrypt no sirve acá porque
// necesitamos leer el secret de vuelta (no es un hash de un solo sentido).
const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, config.totpEncryptionKey, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, config.totpEncryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
