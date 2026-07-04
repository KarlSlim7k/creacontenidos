// Cliente de ElevenLabs TTS. NO VERIFICADO en vivo: la cuenta free bloquea
// text-to-speech vía API con cualquier voz (402 payment_required, política de
// ElevenLabs, no de este código). Queda listo para cuando se suba de plan.
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

module.exports = { synthesizeSpeech };
