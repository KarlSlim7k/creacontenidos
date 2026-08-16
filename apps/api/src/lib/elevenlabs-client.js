// Cliente de ElevenLabs: voz (TTS) y música instrumental.
const config = require('../config');

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

// Devuelve un Buffer con el audio MP3.
async function synthesizeSpeech(text) {
  const res = await fetch(`${ELEVEN_BASE}/text-to-speech/${config.elevenlabsVoiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': config.apiKeys.elevenlabs,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(`ElevenLabs respondió ${res.status}: ${(detail && detail.detail && detail.detail.message) || 'error desconocido'}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Devuelve un Buffer con música instrumental (MP3). Usado para generar las
// cortinillas fijas de entrada/salida del podcast (una vez, no por episodio —
// ver scripts/generate-jingles.js).
async function generateMusic(prompt, durationMs) {
  const res = await fetch(`${ELEVEN_BASE}/music`, {
    method: 'POST',
    headers: {
      'xi-api-key': config.apiKeys.elevenlabs,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, music_length_ms: durationMs }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(`ElevenLabs música respondió ${res.status}: ${(detail && detail.detail && detail.detail.message) || 'error desconocido'}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { synthesizeSpeech, generateMusic };
