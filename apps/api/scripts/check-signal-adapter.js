#!/usr/bin/env node
// Check de función pura para lib/signal-adapter.js — sin red ni DB, mismo
// patrón que check-draft-body.js. Cubre específicamente el tope de
// corroboratingSources (docs/ia/contrato-senales-externas.md: "Máximo 12
// entradas — el resto se descarta"), que check-signals.js no puede probar
// end-to-end: normalizeEvidence() (topic-verification.js) aplica DESPUÉS su
// propio tope de 12 sobre el evidence TOTAL (fuente primaria + corroborantes),
// así que el resultado final vía la API es idéntico exista o no este bug —
// hay que probar adaptSignal() directo para que el bug (antes: slice(0, 11))
// sea observable.
const assert = require('node:assert');
const { adaptSignal } = require('../src/lib/signal-adapter');

function baseEnvelope(overrides = {}) {
  return {
    schemaVersion: '1.0',
    provider: 'check-provider',
    botRunId: null,
    sourceId: null,
    accessStatus: 'ok',
    signal: {
      signalId: 'check-1',
      title: 'Corte de agua en la colonia Reforma',
      description: null,
      detectedAt: new Date().toISOString(),
      eventDate: null,
      locality: 'Perote',
      territorialScope: 'local',
      category: 'servicios_publicos',
      source: { name: 'CMAS check', url: 'https://cmas-check.example.mx/comunicado' },
      sourceType: 'primary',
      factualSummary: 'CMAS confirmó el corte de agua vía comunicado oficial.',
      confidence: 80,
      corroboratingSources: [],
      potentialRelevance: 'Fixture de check.',
      commentsAvailable: false,
      mediaAvailable: false,
      verificationStatus: 'checking',
      ...overrides.signal,
    },
  };
}

function corroborantes(n) {
  return Array.from({ length: n }, (_, i) => ({
    label: `Corroborante ${i + 1}`, url: `https://ejemplo.mx/corr-${i + 1}`, kind: 'secondary', reliable: true,
  }));
}

// Exactamente 12 (el máximo del contrato): las 12 deben sobrevivir, más la
// fuente primaria = 13 en total en el evidence que arma adaptSignal().
{
  const { topicRaw } = adaptSignal(baseEnvelope({ signal: { corroboratingSources: corroborantes(12) } }), null);
  assert.strictEqual(topicRaw.evidence.length, 13, `12 corroboratingSources + 1 primaria = 13 en evidence (fue ${topicRaw.evidence.length})`);
  assert.strictEqual(topicRaw.evidence[12].label, 'Corroborante 12', 'la corroborante #12 (la última permitida) no se descarta');
}

// 13 (una de más): se descarta solo la última, no una de más ni de menos.
{
  const { topicRaw } = adaptSignal(baseEnvelope({ signal: { corroboratingSources: corroborantes(13) } }), null);
  assert.strictEqual(topicRaw.evidence.length, 13, `13ª corroboratingSource se descarta, quedan 12 + 1 primaria = 13 (fue ${topicRaw.evidence.length})`);
  assert.ok(!topicRaw.evidence.some((e) => e.label === 'Corroborante 13'), 'la 13ª corroborante (fuera del máximo) no entra');
}

// Sin corroborantes: solo la fuente primaria.
{
  const { topicRaw } = adaptSignal(baseEnvelope(), null);
  assert.strictEqual(topicRaw.evidence.length, 1, 'sin corroboratingSources, evidence trae solo la fuente primaria');
}

console.log('✔ check-signal-adapter pasó: tope de 12 corroboratingSources (signal-adapter.js) — función pura sin red ni DB.');
