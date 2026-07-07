const { ipKeyGenerator } = require('express-rate-limit');

// Detrás de Cloudflare (verificado en prod: Traefik NO preserva el XFF del
// cliente, el X-Forwarded-For que llega es la IP del edge de CF) la IP real del
// visitante solo viene en el header CF-Connecting-IP. Sin usarlo, el rate limit
// agrupa a todos los visitantes de un mismo edge de CF bajo una sola clave —
// que es justo el fallo A2 que se quería corregir.
//
// ipKeyGenerator normaliza IPv6 a /56 (evita que un cliente con un /64 rote de
// dirección para saltarse el límite). En dev (sin CF) cae a req.ip.
//
// ponytail: la IP real solo es de fiar mientras el tráfico entre por Cloudflare.
// Si alguien descubre la IP de origen y la pega directo, puede falsear
// CF-Connecting-IP; cerrarlo del todo requiere firewall del origen a rangos de
// Cloudflare (tarea de infra, fuera del código).
function rateLimitKey(req) {
  return ipKeyGenerator(req.headers['cf-connecting-ip'] || req.ip || '');
}

module.exports = { rateLimitKey };
