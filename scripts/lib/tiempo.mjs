// Zonas horarias (lógica probada del v1). Sin dependencias: también la usa el sitio.

export const DIA_MS = 864e5;
export const DURACION_MS = 150 * 60 * 1000; // un partido cuenta como "en juego" 150 minutos desde su inicio
export const ZONA_SITIO = 'America/Mexico_City';

export function zonaValida(zona) {
  if (typeof zona !== 'string' || !zona) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

// Minutos de diferencia con UTC que tiene `zona` en el instante `ms` (respeta horario de verano).
export function desfaseMin(zona, ms) {
  const valor = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = valor.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

// "2026-11-08" + "17:00" en "Europe/Rome" -> milisegundos UTC.
export function relojLocalAUtc(fecha, hora, zona) {
  const [a, mes, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const ingenuo = Date.UTC(a, mes - 1, d, h, mi);
  const primero = ingenuo - desfaseMin(zona, ingenuo) * 60000;
  return ingenuo - desfaseMin(zona, primero) * 60000;
}

// Milisegundos UTC -> "2026-11-08T17:00:00+01:00" con la hora local de `zona`.
export function isoEnZona(ms, zona) {
  const off = desfaseMin(zona, ms);
  const l = new Date(ms + off * 60000);
  const p2 = (n) => String(n).padStart(2, '0');
  const abs = Math.abs(off);
  return `${l.getUTCFullYear()}-${p2(l.getUTCMonth() + 1)}-${p2(l.getUTCDate())}T${p2(l.getUTCHours())}:${p2(l.getUTCMinutes())}:00`
    + `${off < 0 ? '-' : '+'}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`;
}

export const fechaEnZona = (ms, zona) => new Intl.DateTimeFormat('en-CA', {
  timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(ms);
