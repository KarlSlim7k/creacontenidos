const jwt = require('jsonwebtoken');
const config = require('../config');
const pool = require('../db/pool');
const { tokenFrom, csrfIsValid } = require('../lib/auth-session');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TWO_FA_ENROLLMENT_PATHS = new Set([
  'GET /api/auth/session', 'GET /api/auth/me',
  'POST /api/auth/2fa/setup', 'POST /api/auth/2fa/enable', 'POST /api/auth/logout',
]);

async function requireAuth(req, res, next) {
  // Routers con gate de familia ejecutan requireAuth antes del middleware de la
  // ruta concreta; reutilizar la identidad ya verificada evita dos queries.
  if (req.user) return next();
  const auth = tokenFrom(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(auth.token, config.jwtSecret, { algorithms: ['HS256'] });
    // Token emitido tras password OK pero con 2FA aún sin verificar (ver login en
    // modules/auth/index.js): no autoriza nada salvo POST /auth/2fa/verify (abajo).
    // Gate único acá cubre TODA ruta que ya usa requireAuth, sin tocar cada handler.
    if (decoded.pending2fa) return res.status(401).json({ error: 'Verificación en dos pasos pendiente' });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (auth.cookie && !SAFE_METHODS.has(req.method) && !csrfIsValid(req)) {
    return res.status(403).json({ error: 'Solicitud inválida (CSRF)' });
  }

  try {
    // El JWT prueba la sesión, pero rol/active viven en DB: una baja o cambio de
    // permisos debe aplicar ahora, no cuando el token de 8h finalmente expire.
    const { rows } = await pool.query('SELECT id, name, role, active, two_factor_enabled, session_version FROM users WHERE id = $1', [decoded.id]);
    const user = rows[0];
    if (!user || !user.active || decoded.sv !== user.session_version) return res.status(401).json({ error: 'Invalid token' });
    // Sólo los procesos de checks automatizados se exentan para poder usar los
    // fixtures; desarrollo interactivo y producción obligan a enrolar 2FA.
    const requires2faSetup = config.nodeEnv !== 'test' && user.role === 'director' && !user.two_factor_enabled;
    if (requires2faSetup && !TWO_FA_ENROLLMENT_PATHS.has(`${req.method} ${req.originalUrl.split('?')[0]}`)) {
      return res.status(403).json({ error: 'Activa la verificación en dos pasos para continuar' });
    }
    req.user = { id: user.id, name: user.name, role: user.role, requires2faSetup };
    next();
  } catch (err) {
    next(err);
  }
}

// Para POST /auth/2fa/verify: la única ruta que debe aceptar el token "pendiente"
// que emite login() cuando el usuario tiene 2FA activo.
function requirePending2fa(req, res, next) {
  const auth = tokenFrom(req, true);
  if (!auth) {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (auth.cookie && !csrfIsValid(req)) return res.status(403).json({ error: 'Solicitud inválida (CSRF)' });
  try {
    const decoded = jwt.verify(auth.token, config.jwtSecret, { algorithms: ['HS256'] });
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
