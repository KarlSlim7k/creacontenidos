const { BlockList, isIP } = require('node:net');
const { ipKeyGenerator } = require('express-rate-limit');

// Fuente oficial: https://api.cloudflare.com/client/v4/ips (2026-08-12).
// ponytail: lista local; si Cloudflare cambia sus rangos, actualizarla desde ese
// endpoint. Evita una llamada de red y una dependencia en cada arranque.
const CLOUDFLARE_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_CIDRS) {
  const [address, prefix] = cidr.split('/');
  cloudflare.addSubnet(address, Number(prefix), isIP(address) === 4 ? 'ipv4' : 'ipv6');
}

function isCloudflareProxy(ip) {
  const address = String(ip || '').replace(/^::ffff:/, '');
  const version = isIP(address);
  return !!version && cloudflare.check(address, version === 4 ? 'ipv4' : 'ipv6');
}

// Traefik reemplaza X-Forwarded-For con la IP del salto anterior: Cloudflare para
// tráfico legítimo, o la IP del atacante si llega directo. CF-Connecting-IP solo
// se acepta en el primer caso; una conexión directa ya no puede falsificarlo.
function rateLimitKey(req) {
  const cloudflareIp = req.headers['cf-connecting-ip'];
  const clientIp = isCloudflareProxy(req.ip) && typeof cloudflareIp === 'string'
    ? cloudflareIp
    : req.ip;
  return ipKeyGenerator(clientIp || '');
}

module.exports = { rateLimitKey, isCloudflareProxy };
