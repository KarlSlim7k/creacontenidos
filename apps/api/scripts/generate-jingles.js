#!/usr/bin/env node
// Genera las cortinillas fijas de entrada/salida del podcast "Buenos días,
// Perote" con ElevenLabs Music. Se corre UNA VEZ (o cuando se quiera cambiar
// el jingle) — no en cada episodio. Los MP3 resultantes se commitean en
// apps/api/assets/podcast/ y sirven de bookends fijos alrededor del guion
// narrado (ver lib/podcast-audio.js).
// Uso: node scripts/generate-jingles.js
const fs = require('node:fs');
const path = require('node:path');
const { generateMusic } = require('../src/lib/elevenlabs-client');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'podcast');

const JINGLES = [
  {
    file: 'jingle-intro.mp3',
    durationMs: 6000,
    prompt: 'Upbeat cheerful short morning news radio jingle, acoustic guitar and light percussion, warm and inviting, instrumental only, no vocals, energetic sting',
  },
  {
    file: 'jingle-outro.mp3',
    durationMs: 5000,
    prompt: 'Warm gentle closing radio jingle, soft acoustic guitar, calm outro that fades out naturally, instrumental only, no vocals',
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const j of JINGLES) {
    console.log(`Generando ${j.file}…`);
    const audio = await generateMusic(j.prompt, j.durationMs);
    fs.writeFileSync(path.join(OUT_DIR, j.file), audio);
    console.log(`  OK (${audio.length} bytes)`);
  }
}

main().catch((err) => {
  console.error('✘ generate-jingles falló:', err.message);
  process.exit(1);
});
