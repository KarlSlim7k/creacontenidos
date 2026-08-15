const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const pool = require('../../db/pool');
const config = require('../../config');
const totpCrypto = require('../../lib/totp-crypto');
const { requireAuth, requireRole, requirePending2fa } = require('../../middleware/auth');
const { ROLE_MODULES } = require('./role-modules');
const { rateLimitKey } = require('../../lib/client-ip');
const { setSession, clearSession, deviceTokenFrom, setDeviceCookie } = require('../../lib/auth-session');
const { makeToken, readToken, resetEmailHtml } = require('../../lib/password-reset');
const { sendEmail } = require('../../lib/resend-client');
const { hashDeviceToken, createTrustedDevice, matchTrustedDevice, revokeAllTrustedDevices } = require('../../lib/trusted-devices');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Intentos de login: límite estricto por IP, mismo espíritu que leadsLimiter en public.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });
// Segundo eje: frena ataques distribuidos contra una sola cuenta. Hash para no
// guardar correos en claro dentro del almacén en memoria del limiter.
const accountLoginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => crypto.createHash('sha256').update(String(req.body?.email || '').trim().toLowerCase()).digest('hex'),
  validate: { keyGeneratorIpFallback: false },
});
// Intentos de código 2FA: mismo espíritu, ventana propia (no consume el cupo de /login).
const twoFaVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });
// Recuperar contraseña: por IP (pedir el link) y por cuenta (probar tokens), ventanas
// propias — no comparten cupo con /login para no bloquear un login legítimo por esto.
const forgotPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });
const forgotPasswordAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => crypto.createHash('sha256').update(String(req.body?.email || '').trim().toLowerCase()).digest('hex'),
  validate: { keyGeneratorIpFallback: false },
});
const resetPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });

function signSession(user) {
  return jwt.sign({ id: user.id, name: user.name, role: user.role, sv: user.session_version }, config.jwtSecret, { expiresIn: '8h', algorithm: 'HS256' });
}

function sessionResponse(token, body) {
  // Bearer queda sólo para checks/automatizaciones locales. En producción el JWT
  // nunca entra al JavaScript del navegador: viaja exclusivamente en HttpOnly.
  return config.nodeEnv === 'production' ? body : { ...body, token };
}

const passwordIsValid = (value) => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Códigos de respaldo: comparación secuencial contra los hashes bcrypt guardados
// (mismo mecanismo que password_hash) — O(n) sobre ~8 códigos, sin indexar.
async function findBackupCodeMatch(hashedCodes, candidate) {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(candidate, hashedCodes[i])) return i;
  }
  return -1;
}

async function verifySecondFactor(userId, candidate) {
  const { rows } = await pool.query(
    'SELECT two_factor_enabled, two_factor_secret, two_factor_backup_codes FROM users WHERE id = $1',
    [userId]
  );
  const user = rows[0];
  if (!user || !user.two_factor_enabled) return true;
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > 64) return false;
  const code = candidate.trim();
  if (authenticator.check(code, totpCrypto.decrypt(user.two_factor_secret))) return true;
  const hashes = Array.isArray(user.two_factor_backup_codes) ? user.two_factor_backup_codes : [];
  const idx = await findBackupCodeMatch(hashes, code);
  if (idx < 0) return false;
  await pool.query('UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2', [JSON.stringify(hashes.filter((_, i) => i !== idx)), userId]);
  return true;
}

// POST /api/auth/login — email+password contra users. Sin distinguir "no existe" de
// "password incorrecto" en la respuesta (no dar pistas). Si el usuario tiene 2FA
// activo, no emite la sesión completa: emite un token "pendiente" (claim
// pending2fa) de 5 min, que requireAuth rechaza en cualquier otra ruta — el
// cliente debe pasar por POST /2fa/verify para canjearlo por la sesión real.
router.post('/login', loginLimiter, accountLoginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, password_hash, role, active, two_factor_enabled, session_version FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (user.two_factor_enabled) {
      // "Confiar en este dispositivo" (2fa/verify): salta el paso si la cookie de
      // dispositivo coincide con una fila viva en trusted_devices. La contraseña ya
      // se validó arriba — esto nunca sustituye password, solo el código 2FA.
      const rawDevice = deviceTokenFrom(req);
      const trusted = rawDevice ? await matchTrustedDevice(pool, user.id, rawDevice) : null;
      if (!trusted) {
        const pendingToken = jwt.sign({ id: user.id, sv: user.session_version, pending2fa: true }, config.jwtSecret, { expiresIn: '5m', algorithm: 'HS256' });
        setSession(res, pendingToken, { pending: true });
        return res.json(sessionResponse(pendingToken, { requires_2fa: true }));
      }
    }
    const token = signSession(user);
    setSession(res, token);
    res.json(sessionResponse(token, { user: { id: user.id, name: user.name, role: user.role } }));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password — siempre 200, exista o no la cuenta (no dar
// pistas de qué correos están registrados). Si existe y está activa, manda el
// link por Resend; un fallo del proveedor de correo se registra pero no cambia
// la respuesta.
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordAccountLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'Correo inválido' });
    const { rows } = await pool.query('SELECT id, session_version, active FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (user && user.active) {
      const token = makeToken(user.id, user.session_version);
      const resetUrl = `${config.publicSiteUrl.replace(/\/$/, '')}/admin/#reset/${token}`;
      if (config.nodeEnv !== 'production') console.log(`[forgot-password] link de reset: ${resetUrl}`);
      sendEmail({ to: email.trim().toLowerCase(), subject: 'Recuperar contraseña — Panel CREA', html: resetEmailHtml(resetUrl) })
        .catch((err) => console.error('forgot-password: fallo enviando correo', err.message));
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — el token trae el session_version vigente al
// pedir el link; si no coincide con el actual (contraseña ya cambiada, sesión
// cerrada, o un segundo uso del mismo token) se rechaza. Guardar la nueva
// contraseña vuelve a incrementar session_version, así que el token usado deja
// de servir y cualquier sesión abierta con la contraseña vieja se cae.
router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!passwordIsValid(password)) return res.status(400).json({ error: 'Entre 8 caracteres y 72 bytes' });
    const decoded = readToken(token);
    if (!decoded) return res.status(400).json({ error: 'El enlace no es válido o venció' });
    const { rows } = await pool.query('SELECT id, session_version, active FROM users WHERE id = $1', [decoded.userId]);
    const user = rows[0];
    if (!user || !user.active || user.session_version !== decoded.sessionVersion) {
      return res.status(400).json({ error: 'El enlace no es válido o venció' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // El WHERE sobre session_version vuelve el token realmente de un solo uso:
    // dos requests concurrentes pueden pasar el SELECT, pero sólo uno gana el UPDATE.
    const changed = await pool.query(
      `UPDATE users SET password_hash = $1, session_version = session_version + 1
       WHERE id = $2 AND session_version = $3`,
      [passwordHash, user.id, decoded.sessionVersion]
    );
    if (changed.rowCount !== 1) return res.status(400).json({ error: 'El enlace no es válido o venció' });
    // Recuperación de cuenta: un dispositivo confiable de antes de perder el acceso
    // no debe seguir saltando el 2FA después de un reset.
    await revokeAllTrustedDevices(pool, user.id);
    clearSession(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/verify — canjea el token pendiente por la sesión real. Acepta
// un código TOTP de 6 dígitos o, si no matchea, un código de respaldo de un solo uso
// (se consume: se quita del array al usarlo).
router.post('/2fa/verify', twoFaVerifyLimiter, requirePending2fa, async (req, res, next) => {
  try {
    const { code, remember_device } = req.body || {};
    if (typeof code !== 'string' || !code.trim() || code.length > 64) return res.status(400).json({ error: 'Código inválido' });
    const { rows } = await pool.query(
      'SELECT id, name, role, active, two_factor_secret, two_factor_backup_codes, session_version FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = rows[0];
    if (!user || !user.active || !user.two_factor_secret) return res.status(401).json({ error: 'Sesión inválida' });

    const trimmed = code.trim();
    const secret = totpCrypto.decrypt(user.two_factor_secret);
    let ok = authenticator.check(trimmed, secret);
    if (!ok && Array.isArray(user.two_factor_backup_codes)) {
      const idx = await findBackupCodeMatch(user.two_factor_backup_codes, trimmed);
      if (idx !== -1) {
        ok = true;
        const remaining = user.two_factor_backup_codes.filter((_, i) => i !== idx);
        await pool.query('UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2', [JSON.stringify(remaining), user.id]);
      }
    }
    if (!ok) return res.status(401).json({ error: 'Código incorrecto' });
    if (req.user.sv !== user.session_version) return res.status(401).json({ error: 'Sesión inválida' });
    const token = signSession(user);
    setSession(res, token);
    if (remember_device === true) {
      const rawDevice = await createTrustedDevice(pool, user.id, req);
      setDeviceCookie(res, rawDevice);
    }
    res.json(sessionResponse(token, { user: { id: user.id, name: user.name, role: user.role } }));
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/session — identidad + módulos permitidos, releída de DB (respeta
// un `active = false` aplicado después de emitir el token).
router.get('/session', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, role, active FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Sesión inválida' });
    res.json({
      id: user.id, name: user.name, role: user.role,
      allowedModules: req.user.requires2faSetup ? ['configuracion'] : (ROLE_MODULES[user.role] || []),
      requires_2fa_setup: req.user.requires2faSetup,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [req.user.id]);
    clearSession(res);
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/auth/roles — mapa rol → módulos para la tabla de Configuración → Permisos.
// Se sirve desde ROLE_MODULES para que la UI nunca mantenga una copia que pueda divergir.
router.get('/roles', requireAuth, requireRole('director'), (req, res) => {
  res.json(ROLE_MODULES);
});

// --- Perfil propio (Configuración → Perfil, cualquier usuario autenticado) ---

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role, created_at, two_factor_enabled FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/me — a diferencia de PATCH /users/:id (director editando a otros),
// nunca acepta `role` ni `active`: un usuario no se autoasciende ni se reactiva.
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, email, password, current_password, code } = req.body || {};
    if ([name, email, password].every((v) => v === undefined)) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    const errors = {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) errors.name = 'Campo requerido';
    if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email.trim()))) errors.email = 'Formato de email inválido';
    if (password !== undefined && !passwordIsValid(password)) errors.password = 'Entre 8 caracteres y 72 bytes';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Datos inválidos', fields: errors });

    const credentialsChange = email !== undefined || password !== undefined;
    if (credentialsChange) {
      const { rows: currentRows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (!currentRows[0] || typeof current_password !== 'string' || !(await bcrypt.compare(current_password, currentRows[0].password_hash))) {
        return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      }
      if (!(await verifySecondFactor(req.user.id, code))) return res.status(401).json({ error: 'Código de verificación incorrecto' });
    }

    const passwordHash = password === undefined ? null : await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         password_hash = COALESCE($3, password_hash),
         session_version = session_version + $4
       WHERE id = $5
       RETURNING id, name, email, role, created_at, session_version`,
      [name === undefined ? null : name.trim(), email === undefined ? null : email.trim().toLowerCase(),
        passwordHash, credentialsChange ? 1 : 0, req.user.id]
    );
    if (credentialsChange) setSession(res, signSession(rows[0]));
    // Cambiar la contraseña es un evento de seguridad — no dejar un dispositivo
    // confiable de antes saltándose el 2FA con la contraseña nueva.
    if (password !== undefined) await revokeAllTrustedDevices(pool, req.user.id);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Datos inválidos', fields: { email: 'Ya existe un usuario con ese correo' } });
    next(err);
  }
});

// --- 2FA (Configuración → Perfil, cualquier usuario autenticado) ---

// POST /api/auth/2fa/setup — genera un secret nuevo (sobreescribe cualquier setup sin
// confirmar previo: cancelar en el frontend es simplemente no llamar a /enable, no
// hace falta un endpoint aparte) y devuelve el QR para escanear. two_factor_enabled
// sigue en false hasta /enable — el secret solo no autoriza nada.
router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT email, two_factor_enabled FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (rows[0].two_factor_enabled) return res.status(409).json({ error: 'Desactiva primero la verificación actual' });
    const secret = authenticator.generateSecret();
    await pool.query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [totpCrypto.encrypt(secret), req.user.id]);
    const otpauth = authenticator.keyuri(rows[0].email, 'CREA Panel', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ secret, qr_data_url: qrDataUrl });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/enable — confirma el setup con un código válido y activa 2FA.
// Genera 8 códigos de respaldo de un solo uso (se muestran una única vez acá,
// hasheados con bcrypt antes de guardarse — igual que password_hash).
router.post('/2fa/enable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code.trim() || code.length > 64) return res.status(400).json({ error: 'Código inválido' });
    const { rows } = await pool.query('SELECT two_factor_secret FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !rows[0].two_factor_secret) return res.status(400).json({ error: 'Primero genera el código QR' });
    const secret = totpCrypto.decrypt(rows[0].two_factor_secret);
    if (!authenticator.check(code.trim(), secret)) return res.status(401).json({ error: 'Código incorrecto' });

    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    const { rows: enabledRows } = await pool.query(
      `UPDATE users SET two_factor_enabled = true, two_factor_backup_codes = $1,
         session_version = session_version + 1
       WHERE id = $2 RETURNING id, name, role, session_version`,
      [JSON.stringify(hashed), req.user.id]
    );
    const token = signSession(enabledRows[0]);
    setSession(res, token);
    res.json(sessionResponse(token, { backup_codes: backupCodes }));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/2fa/disable — pide un código vigente (TOTP o de respaldo) antes de
// apagar: sin esto, una sesión robada apagaría 2FA sin fricción.
router.post('/2fa/disable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (req.user.role === 'director') return res.status(403).json({ error: 'La verificación en dos pasos es obligatoria para directores' });
    if (typeof code !== 'string' || !code.trim() || code.length > 64) return res.status(400).json({ error: 'Código inválido' });
    const { rows } = await pool.query('SELECT two_factor_enabled FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]?.two_factor_enabled) return res.status(400).json({ error: '2FA no está activo' });
    if (!(await verifySecondFactor(req.user.id, code))) return res.status(401).json({ error: 'Código incorrecto' });

    const { rows: disabledRows } = await pool.query(
      `UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL,
         two_factor_backup_codes = NULL, session_version = session_version + 1
       WHERE id = $1 RETURNING id, name, role, session_version`,
      [req.user.id]
    );
    // Sin esto, un 2FA reactivado después heredaría dispositivos confiables viejos
    // y saltaría el código sin haber pasado nunca por un /2fa/verify con el 2FA nuevo.
    await revokeAllTrustedDevices(pool, req.user.id);
    const token = signSession(disabledRows[0]);
    setSession(res, token);
    res.json(sessionResponse(token, { ok: true }));
  } catch (err) {
    next(err);
  }
});

// --- Dispositivos confiables (Configuración → Perfil, panel de revocación) ---

// GET /api/auth/devices — marca `current` comparando el hash de la cookie de este
// navegador contra los guardados, sin exponer el hash en la respuesta.
router.get('/devices', requireAuth, async (req, res, next) => {
  try {
    const rawDevice = deviceTokenFrom(req);
    const currentHash = rawDevice ? hashDeviceToken(rawDevice) : null;
    const { rows } = await pool.query(
      'SELECT id, label, created_at, last_used_at, expires_at, token_hash FROM trusted_devices WHERE user_id = $1 ORDER BY last_used_at DESC',
      [req.user.id]
    );
    res.json(rows.map(({ token_hash, ...d }) => ({ ...d, current: token_hash === currentHash })));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/devices/:id — revoca uno. Scoped a user_id: no se puede revocar
// el dispositivo de otro usuario adivinando el id.
router.delete('/devices/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM trusted_devices WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/devices — revoca todos (ej. "no reconozco ninguno de estos").
router.delete('/devices', requireAuth, async (req, res, next) => {
  try {
    await revokeAllTrustedDevices(pool, req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Usuarios (Configuración → Usuarios, solo director) ---

const VALID_ROLES = Object.keys(ROLE_MODULES);

router.get('/users', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role, active, created_at FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/users', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { name, email, password, role, code } = req.body || {};
    const errors = {};
    if (typeof name !== 'string' || !name.trim()) errors.name = 'Campo requerido';
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) errors.email = 'Formato de email inválido';
    if (!passwordIsValid(password)) errors.password = 'Entre 8 caracteres y 72 bytes';
    if (!VALID_ROLES.includes(role)) errors.role = 'Rol inválido';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Datos inválidos', fields: errors });
    if (!(await verifySecondFactor(req.user.id, code))) return res.status(401).json({ error: 'Código de verificación incorrecto' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, active, created_at',
      [name.trim(), email.trim().toLowerCase(), passwordHash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Datos inválidos', fields: { email: 'Ya existe un usuario con ese correo' } });
    next(err);
  }
});

router.patch('/users/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  let client;
  try {
    const { active, role, name, email, password, code } = req.body || {};
    if ([active, role, name, email, password].every((v) => v === undefined)) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    const errors = {};
    if (active !== undefined && typeof active !== 'boolean') errors.active = 'Debe ser booleano';
    if (role !== undefined && !VALID_ROLES.includes(role)) errors.role = 'Rol inválido';
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) errors.name = 'Campo requerido';
    if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email.trim()))) errors.email = 'Formato de email inválido';
    if (password !== undefined && !passwordIsValid(password)) errors.password = 'Entre 8 caracteres y 72 bytes';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Datos inválidos', fields: errors });
    const sensitiveChange = [active, role, email, password].some((v) => v !== undefined);
    if (sensitiveChange && !(await verifySecondFactor(req.user.id, code))) return res.status(401).json({ error: 'Código de verificación incorrecto' });

    const passwordHash = password === undefined ? null : await bcrypt.hash(password, 10);
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: directorRows } = await client.query("SELECT id FROM users WHERE role = 'director' AND active = true ORDER BY id FOR UPDATE");
    const { rows: targetRows } = await client.query('SELECT id, role, active FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
    const target = targetRows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (target.active && target.role === 'director' && (active === false || (role !== undefined && role !== 'director'))) {
      if (directorRows.length <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Debe permanecer al menos un director activo' });
      }
    }
    const { rows } = await client.query(
      `UPDATE users SET
         active = COALESCE($1, active),
         role = COALESCE($2, role),
         name = COALESCE($3, name),
         email = COALESCE($4, email),
         password_hash = COALESCE($5, password_hash),
         session_version = session_version + $6
       WHERE id = $7
       RETURNING id, name, email, role, active, created_at`,
      [active === undefined ? null : active, role === undefined ? null : role,
        name === undefined ? null : name.trim(), email === undefined ? null : email.trim().toLowerCase(),
        passwordHash, sensitiveChange ? 1 : 0, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(400).json({ error: 'Datos inválidos', fields: { email: 'Ya existe un usuario con ese correo' } });
    next(err);
  } finally {
    if (client) client.release();
  }
});

// --- Bitácora / integraciones (Hermes, notificaciones, Configuración → Integraciones) ---
// Montado aparte en /api/admin (no /api/auth) — ver adminRouter más abajo.

const adminRouter = express.Router();

// GET /api/admin/activity?limit= — solo director.
adminRouter.get('/activity', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const { rows } = await pool.query(
      `SELECT al.*, u.name AS user_name FROM activity_log al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --- Web Push (notificaciones panel admin) ---

// GET /api/admin/push/vapid-public-key — el cliente la usa para suscribirse
// (PushManager.subscribe). null si el servidor no tiene VAPID configurado: el
// cliente oculta el toggle en vez de ofrecer algo que va a fallar.
adminRouter.get('/push/vapid-public-key', requireAuth, (req, res) => {
  res.json({ publicKey: config.vapidPublicKey || null });
});

// POST /api/admin/push/subscribe — guarda/actualiza la suscripción del navegador
// actual, atada a req.user.id (nunca a un user_id del body). ON CONFLICT por
// endpoint: reinstalar/resuscribirse en el mismo navegador no duplica filas.
adminRouter.post('/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { endpoint: 'Suscripción inválida' } });
    }
    const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh : null;
    const auth = keys && typeof keys.auth === 'string' ? keys.auth : null;
    if (!p256dh || !auth) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { keys: 'Faltan p256dh/auth' } });
    }
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
      [req.user.id, endpoint, p256dh, auth]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/push/subscribe — desuscribe el navegador actual (botón
// "Desactivar notificaciones" o cleanup si el usuario revocó el permiso).
adminRouter.delete('/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Datos inválidos', fields: { endpoint: 'Requerido' } });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET/PATCH /api/admin/site-metrics — Configuración → Métricas del sitio (solo director).
adminRouter.get('/site-metrics', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM site_metrics WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/site-metrics', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE site_metrics SET
         monthly_reach_label = COALESCE($1, monthly_reach_label),
         municipalities_count = COALESCE($2, municipalities_count),
         tercer_tiempo_listeners_label = COALESCE($3, tercer_tiempo_listeners_label),
         audience_age_18_24_pct = COALESCE($4, audience_age_18_24_pct),
         audience_age_25_44_pct = COALESCE($5, audience_age_25_44_pct),
         audience_age_45_plus_pct = COALESCE($6, audience_age_45_plus_pct),
         updated_at = now()
       WHERE id = 1 RETURNING *`,
      [
        b.monthly_reach_label || null,
        Number.isFinite(Number(b.municipalities_count)) ? Number(b.municipalities_count) : null,
        b.tercer_tiempo_listeners_label || null,
        Number.isFinite(Number(b.audience_age_18_24_pct)) ? Number(b.audience_age_18_24_pct) : null,
        Number.isFinite(Number(b.audience_age_25_44_pct)) ? Number(b.audience_age_25_44_pct) : null,
        Number.isFinite(Number(b.audience_age_45_plus_pct)) ? Number(b.audience_age_45_plus_pct) : null,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET/PATCH /api/admin/editorial-settings — Configuración → Perfil → Directriz editorial
// (default_directive global, precarga el campo por-nota cuando esta no trae la suya).
adminRouter.get('/editorial-settings', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM editorial_settings WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/editorial-settings', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { default_directive } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE editorial_settings SET default_directive = $1, updated_at = now() WHERE id = 1 RETURNING *`,
      [default_directive == null ? null : String(default_directive).trim() || null]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/integrations — estado por presencia de env vars, cualquier usuario autenticado.
adminRouter.get('/integrations', requireAuth, async (req, res, next) => {
  try {
    res.json([
      { name: 'Nous Portal', desc: 'Fuente de temas del RADAR', connected: Boolean(process.env.NOUS_PORTAL_API_KEY) },
      { name: 'WordPress', desc: 'Publicación del sitio', connected: Boolean(process.env.WORDPRESS_URL) },
      { name: 'Meta', desc: 'Publicación en Facebook', connected: Boolean(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) },
      { name: 'ElevenLabs', desc: 'Generación de audio', connected: Boolean(process.env.ELEVENLABS_API_KEY) },
    ]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.adminRouter = adminRouter;
