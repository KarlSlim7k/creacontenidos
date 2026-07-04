const express = require('express');
const router = express.Router();

// === Endpoints futuros (no implementar todavía) ===
//
// POST /distribution/facebook
//   Publica un artículo en Facebook Page via Meta Graph API.
//   Requiere: FACEBOOK_APP_TOKEN en .env
//   Body: { proposal_id, page_id }
//   Flujo: cargar propuesta → formatear para Facebook → POST a Graph API → registrar resultado
//
// POST /distribution/whatsapp
//   Genera un link de WhatsApp Newsletter para compartir.
//   Requiere: número de WhatsApp configurado
//   Body: { proposal_id }
//   Flujo: cargar propuesta → generar link wa.me/?text=... → devolver link
//
// POST /distribution/wordpress
//   Publica un artículo en WordPress via REST API.
//   Requiere: WORDPRESS_URL, WORDPRESS_USER, WORDPRESS_APP_PASSWORD en .env
//   Body: { proposal_id }
//   Flujo: cargar propuesta → POST a /wp-json/wp/v2/posts → registrar post_id externo

module.exports = router;
