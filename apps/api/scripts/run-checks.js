#!/usr/bin/env node
// Runner de checks por grupos. Ejecuta los scripts existentes como procesos
// separados (evita contaminación de rate limits en memoria del server).
// Uso:
//   node scripts/run-checks.js <grupo> [--continue]
//   node scripts/run-checks.js --list
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const GROUPS = {
  unit: ['check-nota-ssr.js', 'check-admin-panel.js'],
  public: ['check-public-api.js', 'check-leads.js'],
  integration: ['check-newsletter.js', 'check-content-engine.js', 'check-listening.js', 'check-social.js', 'check-competitor-scraper.js'],
  e2e: ['verify-e2e.js', 'check-admin-api.js'],
};
GROUPS.all = [...GROUPS.unit, ...GROUPS.public, ...GROUPS.integration, ...GROUPS.e2e];

function listChecks() {
  for (const [group, scripts] of Object.entries(GROUPS)) {
    console.log(`${group}:`);
    for (const s of scripts) console.log(`  ${s}`);
  }
}

function runScript(script) {
  console.log(`\n--- ${script} ---`);
  const result = spawnSync('node', [path.join('scripts', script)], { cwd: ROOT, stdio: 'inherit' });
  return result.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    listChecks();
    return;
  }

  const continueOnFail = args.includes('--continue');
  const groupArgIdx = args.indexOf('--group');
  const group = groupArgIdx !== -1 ? args[groupArgIdx + 1] : args.find((a) => !a.startsWith('--'));

  if (!group || !GROUPS[group]) {
    console.error(`Grupo inválido: "${group}". Usa uno de: ${Object.keys(GROUPS).join(', ')}, o --list.`);
    process.exit(1);
  }

  const scripts = GROUPS[group];
  const failed = [];
  for (const script of scripts) {
    const ok = runScript(script);
    if (!ok) {
      failed.push(script);
      if (!continueOnFail) break;
    }
  }

  if (failed.length) {
    console.error(`\nFAIL: ${failed.length} check(s) fallaron: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nOK: grupo "${group}" (${scripts.length} check(s)) pasó.`);
}

main();
