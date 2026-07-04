// Clima real para Perote, Veracruz (no Puebla — corrección del spec original).
// wttr.in: sin API key, sin registro. Los datos numéricos se arman aquí, NUNCA
// se le pasan a un LLM para redactar — evita que un modelo "reinterprete" o
// invente temperaturas.
const LAT = 19.5667;
const LON = -97.2333;

function detectAlerta(descripcion, tempMin, precipMM) {
  const d = descripcion.toLowerCase();
  if (tempMin <= 3) return ' Alerta de helada.';
  if (d.includes('niebla') || d.includes('bruma')) return ' Alerta de niebla.';
  if (precipMM > 5 || d.includes('lluvia') || d.includes('tormenta')) return ' Posibilidad de lluvia, lleva paraguas.';
  return '';
}

async function getPeroteClima() {
  const res = await fetch(`https://wttr.in/${LAT},${LON}?format=j1&lang=es`, {
    headers: { 'User-Agent': 'curl' },
  });
  if (!res.ok) throw new Error(`wttr.in respondió ${res.status}`);
  const json = await res.json();
  const current = json.current_condition[0];
  const today = json.weather[0];
  const tempActual = Number(current.temp_C);
  const tempMax = Number(today.maxtempC);
  const tempMin = Number(today.mintempC);
  const descripcion = (current.lang_es && current.lang_es[0] && current.lang_es[0].value) || current.weatherDesc[0].value;
  const alerta = detectAlerta(descripcion, tempMin, Number(current.precipMM));
  const texto = `Amanece a ${tempActual} grados con ${descripcion.toLowerCase()}. Máxima de ${tempMax} grados, mínima de ${tempMin}.${alerta}`;
  return { tempActual, tempMax, tempMin, descripcion, texto };
}

module.exports = { getPeroteClima };
