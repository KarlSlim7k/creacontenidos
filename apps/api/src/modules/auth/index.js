const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../../db/pool');
const config = require('../../config');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLE_MODULES } = require('./role-modules');

const router = express.Router();

// Intentos de login: límite estricto por IP, mismo espíritu que leadsLimiter en public.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

// POST /api/auth/login — email+password contra users. Sin distinguir "no existe" de
// "password incorrecto" en la respuesta (no dar pistas).
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, password_hash, role, active FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, config.jwtSecret, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
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
    res.json({ id: user.id, name: user.name, role: user.role, allowedModules: ROLE_MODULES[user.role] || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/roles — mapa rol → módulos para la tabla de Configuración → Permisos.
// Se sirve desde ROLE_MODULES para que la UI nunca mantenga una copia que pueda divergir.
router.get('/roles', requireAuth, requireRole('director'), (req, res) => {
  res.json(ROLE_MODULES);
});

// --- Usuarios (Configuración → Usuarios, solo director) ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    const { name, email, password, role } = req.body || {};
    const errors = {};
    if (typeof name !== 'string' || !name.trim()) errors.name = 'Campo requerido';
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) errors.email = 'Formato de email inválido';
    if (typeof password !== 'string' || password.length < 8) errors.password = 'Mínimo 8 caracteres';
    if (!VALID_ROLES.includes(role)) errors.role = 'Rol inválido';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Datos inválidos', fields: errors });

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
  try {
    const { active, role } = req.body || {};
    if (active === undefined && role === undefined) return res.status(400).json({ error: 'Nada que actualizar' });
    if (role !== undefined && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Datos inválidos', fields: { role: 'Rol inválido' } });

    const { rows } = await pool.query(
      `UPDATE users SET active = COALESCE($1, active), role = COALESCE($2, role) WHERE id = $3
       RETURNING id, name, email, role, active, created_at`,
      [active === undefined ? null : Boolean(active), role === undefined ? null : role, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
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
