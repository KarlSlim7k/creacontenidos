// RADAR 2.0, backlog nuevo (R2-50): mide qué tanto cambió un texto respecto al
// borrador original de IA. Distancia a nivel de PALABRA (no de carácter): mover
// una coma no debe pesar igual que reescribir una oración. Puro, sin red ni
// DB — testeable con dos strings fijos, mismo patrón que sanitizeAnalysis()
// en editorial-engine.js.

function tokenize(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

// Distancia de edición (Levenshtein) a nivel de palabra. O(n*m), aceptable
// para cuerpos de nota (cientos de palabras, no miles).
function wordEditDistance(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
}

/**
 * % de palabras que cambiaron entre el borrador de IA y el texto final
 * (0 = idéntico, 100 = completamente distinto). null si ambos vienen vacíos
 * (nada que comparar — no es lo mismo que "0% de corrección").
 */
function correctionRate(aiText, finalText) {
  const a = tokenize(aiText);
  const b = tokenize(finalText);
  if (!a.length && !b.length) return null;
  const distance = wordEditDistance(a, b);
  const denom = Math.max(a.length, b.length, 1);
  return Math.round((distance / denom) * 1000) / 10; // un decimal
}

module.exports = { correctionRate, wordEditDistance, tokenize };
