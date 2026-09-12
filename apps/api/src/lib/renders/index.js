// R2-36 (fase 6): barril de los renders puros por canal + el normalizador
// de entrada. Generaliza lib/newsletter-template.js (que sigue intacto y
// solo sirve al newsletter) al resto del sistema. Ningún archivo de este
// directorio hace pool.query ni llama a un modelo de IA — eso vive en
// lib/render-service.js, el orquestador impuro que sí toca DB.
const { buildMasterObject } = require('./master');
const { renderWeb } = require('./web');
const { renderWhatsapp } = require('./whatsapp');
const { renderSocial } = require('./social');
const { renderAudio } = require('./audio');

module.exports = { buildMasterObject, renderWeb, renderWhatsapp, renderSocial, renderAudio };
