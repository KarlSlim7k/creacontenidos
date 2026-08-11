const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    // Token emitido tras password OK pero con 2FA aún sin verificar (ver login en
    // modules/auth/index.js): no autoriza nada salvo POST /auth/2fa/verify (abajo).
    // Gate único acá cubre TODA ruta que ya usa requireAuth, sin tocar cada handler.
    if (decoded.pending2fa) return res.status(401).json({ error: 'Verificación en dos pasos pendiente' });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Para POST /auth/2fa/verify: la única ruta que debe aceptar el token "pendiente"
// que emite login() cuando el usuario tiene 2FA activo.
function requirePending2fa(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (!decoded.pending2fa) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Se monta después de requireAuth. Ejemplo: router.get('/x', requireAuth, requireRole('director'), ...)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requirePending2fa };
