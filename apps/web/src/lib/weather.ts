// Puerto server-side de initDateAndWeather() (main.js) — antes corría en el
// navegador cada carga; ahora se calcula una vez por request en el frontmatter
// de la página, así que data-today/data-weather ya no necesitan JS de cliente.
const PEROTE_LAT = 19.5567;
const PEROTE_LON = -97.2506;

const WEATHER_CODES: Record<number, string> = {
  0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'niebla', 48: 'niebla', 51: 'llovizna', 53: 'llovizna', 55: 'llovizna',
  61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia fuerte', 71: 'nieve ligera', 73: 'nieve',
  75: 'nieve fuerte', 80: 'chubascos', 81: 'chubascos', 82: 'chubascos fuertes',
  95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo',
};

export function todayLabel(): string {
  const fecha = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return 'PEROTE, VER. · ' + fecha.toUpperCase();
}

export async function currentWeather(): Promise<string | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${PEROTE_LAT}&longitude=${PEROTE_LON}&current=temperature_2m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const current = data && data.current;
    if (!current) return null;
    const desc = WEATHER_CODES[current.weather_code] || 'clima variable';
    return Math.round(current.temperature_2m) + '°C, ' + desc.toUpperCase();
  } catch {
    return null; // sin clima no rompe la página, igual que el catch original
  }
}
