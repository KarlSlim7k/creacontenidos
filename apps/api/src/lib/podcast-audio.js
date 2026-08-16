// Arma el audio final del podcast: cortinilla fija de entrada + voz narrada
// (ElevenLabs TTS) + cortinilla fija de salida, concatenadas con ffmpeg.
// Los jingles son estáticos (assets/podcast/, generados una vez con
// scripts/generate-jingles.js) — nunca se regeneran por episodio.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'podcast');
const INTRO = path.join(ASSETS_DIR, 'jingle-intro.mp3');
const OUTRO = path.join(ASSETS_DIR, 'jingle-outro.mp3');

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => reject(new Error(`ffmpeg no disponible: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg salió con código ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Concatena intro + voz + outro re-codificando a MP3 (filter_complex concat,
// no el demuxer concat — evita mismatches de formato entre los 3 inputs).
async function mixPodcast(voiceBuffer) {
  if (!fs.existsSync(INTRO) || !fs.existsSync(OUTRO)) {
    throw new Error('Faltan los jingles (assets/podcast/). Corre scripts/generate-jingles.js primero.');
  }
  const tmpId = crypto.randomUUID();
  const voicePath = path.join(os.tmpdir(), `podcast-voice-${tmpId}.mp3`);
  const outPath = path.join(os.tmpdir(), `podcast-mix-${tmpId}.mp3`);
  fs.writeFileSync(voicePath, voiceBuffer);
  try {
    await runFfmpeg([
      '-y',
      '-i', INTRO,
      '-i', voicePath,
      '-i', OUTRO,
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]',
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(voicePath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

module.exports = { mixPodcast };
