// POST /api/signals — ingesta push de señales externas (RADAR 2.0, R2-12).
// Auth de máquina (signal-auth.js), no JWT de usuario — mismo principio que
// /api/telegram/webhook. Escribe EXCLUSIVAMENTE vía insertTopicIfNew(): toda
// la verificación, dedupe y merge ya existentes se heredan sin reescribirlos.
//
// Límite de payload propio (512kb, no el global de 100kb en server.js) — un
// lote con conversationSnapshot puede pesar más que una señal suelta. El
// router se monta ANTES del express.json() global (ver server.js) para que
// este límite aplique de verdad, no se herede por accidente.
const express = require('express');
const pool = require('../../db/pool');
const { logActivity } = require('../../lib/ai-client');
const { authenticateProvider, extractBearerKey } = require('../../lib/signal-auth');
const { validateEnvelope, adaptSignal } = require('../../lib/signal-adapter');
const { insertTopicIfNew, loadActiveRadarSources } = require('../../lib/topic-detection');

const router = express.Router();
const MAX_BATCH = 20;

router.use(express.json({ limit: '512kb' }));

async function authProvider(req, res, next) {
  try {
    const rawKey = extractBearerKey(req);
    if (!rawKey) return res.status(401).json({ error: 'Falta Authorization: Bearer <api key>' });
    const provider = await authenticateProvider(pool, rawKey);
    if (!provider) return res.status(401).json({ error: 'API key inválida o revocada' });
    req.signalProvider = provider;
    next();
  } catch (err) {
    next(err);
  }
}

// Procesa un envelope ya autenticado. No lanza por errores de validación/
// negocio (esos se reportan como { action: 'rejected'|'duplicate', ... }) —
// solo relanza fallos de infraestructura reales (DB caída, etc.).
async function processOne(envelope, dbProvider, trustSources) {
  const validation = validateEnvelope(envelope);
  if (!validation.ok) {
    return { action: 'rejected', status: 400, fields: validation.fields };
  }
  // La key autentica a un proveedor; el envelope no puede declararse como
  // otro — si no, cualquier key válida podría firmar a nombre de cualquiera.
  if (envelope.provider !== dbProvider.name) {
    return {
      action: 'rejected', status: 400,
      fields: { provider: `Debe coincidir con el proveedor autenticado ("${dbProvider.name}")` },
    };
  }

  const { rows: dupe } = await pool.query(
    `SELECT id FROM topics WHERE provider = $1 AND external_id = $2`,
    [envelope.provider, envelope.signal.signalId]
  );
  if (dupe.length) return { action: 'duplicate', status: 200, topic_id: dupe[0].id };

  const { topicRaw, trustEntry } = adaptSignal(envelope, dbProvider.trust);
  // La lista editorial (radar_sources) va primero: si un dominio ya está
  // curado por CREA, gana sobre lo que el proveedor declare de sí mismo para
  // ese mismo host (empate de especificidad → resolveSourceTrust conserva el
  // primer match, ver topic-verification.js).
  const combinedTrust = trustEntry ? [...trustSources, trustEntry] : trustSources;

  let row;
  try {
    row = await insertTopicIfNew(topicRaw, {}, { trustSources: combinedTrust });
  } catch (err) {
    if (err && err.code === '23505') {
      // Carrera: dos envíos casi simultáneos de la misma (provider, external_id).
      return { action: 'duplicate', status: 200 };
    }
    throw err;
  }
  if (!row) {
    // Tema similar reciente y el nuevo NO es mejor (mismo criterio que el
    // resto de RADAR, ver isBetterTopic()) — no se inserta nada. Desde afuera
    // el efecto es el mismo que un duplicado: sin fila nueva, nada cambió.
    return { action: 'duplicate', status: 200, reason: 'similar_topic_not_better' };
  }
  return {
    action: row._action === 'upgraded' ? 'upgraded' : 'inserted',
    status: row._action === 'upgraded' ? 200 : 201,
    topic_id: row.id,
  };
}

router.post('/', authProvider, async (req, res, next) => {
  try {
    const body = req.body || {};
    const isBatch = Array.isArray(body.signals);
    const envelopes = isBatch ? body.signals : [body];
    if (!envelopes.length) return res.status(400).json({ error: 'Sin señales en el payload' });
    if (envelopes.length > MAX_BATCH) {
      return res.status(400).json({ error: `Máximo ${MAX_BATCH} señales por request` });
    }

    const trustSources = await loadActiveRadarSources();
    // Cada envelope es independiente — en paralelo. El duplicado EXACTO
    // (mismo provider+external_id) ya lo cubre el catch de 23505 en
    // processOne(); el merge por título similar entre dos entradas del MISMO
    // lote pasa a ser best-effort bajo concurrencia (como ya lo es entre
    // requests distintos hoy — insertTopicIfNew() nunca asumió exclusión
    // mutua entre llamadas concurrentes).
    const results = await Promise.all(
      envelopes.map((envelope) => processOne(envelope, req.signalProvider, trustSources))
    );

    const byAction = {};
    for (const r of results) byAction[r.action] = (byAction[r.action] || 0) + 1;
    await logActivity(pool, 'signal_ingest', `${results.length} señal(es) de ${req.signalProvider.name}`, null, 'exito', {
      provider_id: req.signalProvider.id,
      provider: req.signalProvider.name,
      count: results.length,
      by_action: byAction,
    });

    if (!isBatch) {
      const only = results[0];
      return res.status(only.status).json(only);
    }
    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
