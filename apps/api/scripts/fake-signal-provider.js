#!/usr/bin/env node
// Proveedor simulado de señales externas (RADAR 2.0, R2-41). Empuja señales
// de prueba a POST /api/signals con una API key de proveedor REAL (creada
// vía POST /api/listening/signal-providers, R2-11) — permite recorrer el
// flujo completo ingesta → verificación → análisis → score → boletín con
// datos de prueba, sin depender de que la investigación sobre Grok (fase 07)
// haya terminado. Formato: docs/ia/contrato-senales-externas.md.
//
// Uso:
//   node scripts/fake-signal-provider.js --api-key csig_... --provider mi-proveedor
//   node scripts/fake-signal-provider.js --api-key csig_... --provider mi-proveedor --count 3
//   node scripts/fake-signal-provider.js --api-key csig_... --provider mi-proveedor --with-conversation
//   node scripts/fake-signal-provider.js --api-key csig_... --provider mi-proveedor --title "Mi tema" --dry-run
//   node scripts/fake-signal-provider.js --api-key csig_... --provider mi-proveedor --base http://localhost:3010
//
// La API key la da el propio panel/API al crear el proveedor
// (POST /api/listening/signal-providers, requiere sesión de director) — este
// script no la genera, solo la usa.

function parseArgs(argv) {
  const out = { base: 'http://localhost:3000', count: 1, withConversation: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--api-key') out.apiKey = argv[++i];
    else if (a === '--provider') out.provider = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--count') out.count = Math.max(1, Math.min(20, Number(argv[++i]) || 1));
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--with-conversation') out.withConversation = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Uso: node scripts/fake-signal-provider.js --api-key <key> --provider <nombre> [opciones]

Opciones:
  --base <url>          Base del API (default http://localhost:3000)
  --count <n>            Cuántas señales generar en un solo POST batch (default 1, máx 20)
  --title <texto>        Título fijo para una sola señal (ignora --count > 1)
  --with-conversation     Adjunta un conversationSnapshot de ejemplo a cada señal
  --dry-run               Imprime el payload sin enviarlo
`);
}

// Fixtures realistas de Perote/Veracruz — rotan si --count > 1. Cubren los
// campos opcionales del contrato con variedad (categoría, alcance, tipo de
// fuente) para que un recorrido de prueba no vea siempre la misma forma.
const FIXTURES = [
  {
    title: 'CMAS confirma corte de agua en cuatro colonias de Perote',
    locality: 'Perote', territorialScope: 'local', category: 'servicios_publicos',
    sourceName: 'CMAS Perote — comunicado oficial', sourceUrl: 'https://cmas-perote.example.mx/comunicados/corte-agua',
    sourceType: 'primary', confidence: 82, mediaAvailable: false,
    factualSummary: 'CMAS publicó un comunicado confirmando corte de agua en cuatro colonias por mantenimiento a la red, con restablecimiento estimado antes de las 20:00.',
    potentialRelevance: 'Afecta directamente a vecinos de cuatro colonias; recurrente en la temporada.',
  },
  {
    title: 'Ayuntamiento de Perote anuncia feria del libro para octubre',
    locality: 'Perote', territorialScope: 'local', category: 'cultura',
    sourceName: 'Página de Facebook del Ayuntamiento de Perote', sourceUrl: 'https://facebook.com/AyuntamientoPerote/posts/feria-libro',
    sourceType: 'social', confidence: 40, mediaAvailable: true,
    factualSummary: 'Una publicación oficial anuncia una feria del libro en Perote en octubre; no hay fecha exacta ni confirmación de sede todavía.',
    potentialRelevance: 'Evento cultural local, relevante para agenda de eventos.',
  },
  {
    title: 'Reportan bache de gran tamaño en la carretera federal Perote-Xalapa',
    locality: 'Perote', territorialScope: 'regional', category: 'infraestructura',
    sourceName: 'Grupo vecinal de Facebook', sourceUrl: 'https://facebook.com/groups/vecinosperote/posts/bache',
    sourceType: 'social', confidence: 28, mediaAvailable: true,
    factualSummary: 'Varios comentarios reportan un bache de gran tamaño en la carretera; sin confirmación de autoridad vial todavía.',
    potentialRelevance: 'Afecta el tránsito diario hacia Xalapa; recurrente en temporada de lluvias.',
  },
];

function conversationSnapshotFixture(nowIso) {
  return {
    period: { from: nowIso, to: nowIso, timezone: 'America/Mexico_City' },
    sourcesObserved: ['Página de Facebook oficial (fixture)'],
    sampleMethod: 'Muestra sintética generada por fake-signal-provider.js (R2-41) — no es un análisis real.',
    postsAnalyzed: 1,
    commentsAnalyzed: 12,
    themes: ['horario', 'colonias afectadas'],
    recurringQuestions: ['¿Hasta qué hora va a durar?'],
    concerns: ['Negocios que dependen del servicio durante el día'],
    supportFrames: ['Agradecen el aviso anticipado'],
    criticismFrames: ['Reclaman que ya es la segunda vez este mes'],
    claimsToVerify: [],
    amplificationSignals: [],
    limitations: 'Fixture de prueba (fake-signal-provider.js): no representa conversación real.',
  };
}

function buildSignal(provider, fixture, index, opts) {
  const now = new Date();
  const nowIso = now.toISOString();
  const envelope = {
    schemaVersion: '1.0',
    provider,
    botRunId: `fake-run-${now.toISOString().slice(0, 10)}`,
    sourceId: null,
    accessStatus: 'ok',
    signal: {
      signalId: `fake-${now.getTime()}-${index}`,
      title: opts.title || fixture.title,
      description: null,
      detectedAt: nowIso,
      eventDate: nowIso.slice(0, 10),
      locality: fixture.locality,
      territorialScope: fixture.territorialScope,
      category: fixture.category,
      source: { name: fixture.sourceName, url: fixture.sourceUrl },
      sourceType: fixture.sourceType,
      factualSummary: fixture.factualSummary,
      confidence: fixture.confidence,
      corroboratingSources: [],
      potentialRelevance: fixture.potentialRelevance,
      commentsAvailable: opts.withConversation,
      mediaAvailable: fixture.mediaAvailable,
      verificationStatus: fixture.confidence >= 40 ? 'checking' : 'signal',
    },
  };
  if (opts.withConversation) envelope.conversationSnapshot = conversationSnapshotFixture(nowIso);
  return envelope;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.apiKey || !opts.provider) {
    usage();
    process.exit(opts.help ? 0 : 1);
  }

  const count = opts.title ? 1 : opts.count;
  const envelopes = Array.from({ length: count }, (_, i) => buildSignal(opts.provider, FIXTURES[i % FIXTURES.length], i, opts));
  const body = count === 1 ? envelopes[0] : { signals: envelopes };

  if (opts.dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const res = await fetch(`${opts.base}/api/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + opts.apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok && res.status !== 200 && res.status !== 201) process.exitCode = 1;
}

main().catch((err) => {
  console.error('fake-signal-provider falló:', err.message);
  process.exit(1);
});
