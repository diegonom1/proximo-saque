// Fechas y horas en pantalla. Sin `zona`, todo sale en la hora del dispositivo del visitante.

import { DIA_MS, DURACION_MS } from '../../scripts/lib/tiempo.mjs';

interface ConInicio {
  inicio: string;
}

const LOCALE = 'es-MX';
const cache = new Map<string, Intl.DateTimeFormat>();

function formato(tipo: string, opciones: Intl.DateTimeFormatOptions, zona?: string, locale = LOCALE) {
  const clave = `${tipo}|${zona ?? ''}`;
  let f = cache.get(clave);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opciones, timeZone: zona });
    cache.set(clave, f);
  }
  return f;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const limpiarFecha = (s: string) => s.replace(',', '').replace(/\./g, '');
const dos = (n: number) => String(n).padStart(2, '0');

export const msDe = (p: ConInicio) => Date.parse(p.inicio);

export const hora = (ms: number, zona?: string) => formato('hora', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, zona).format(ms);

export const diaLargo = (ms: number, zona?: string) => cap(limpiarFecha(
  formato('largo', { weekday: 'long', day: 'numeric', month: 'long' }, zona).format(ms),
));

export const diaCorto = (ms: number, zona?: string) => cap(limpiarFecha(
  formato('corto', { weekday: 'short', day: 'numeric', month: 'short' }, zona).format(ms),
));

export const ymd = (ms: number, zona?: string) => formato('ymd', { year: 'numeric', month: '2-digit', day: '2-digit' }, zona, 'en-CA').format(ms);

// "allá serán las 21:00": `inicio` trae la hora de la sede solo si `zonaSede` es conocida.
export const horaDelLugar = (p: ConInicio & { zonaSede: string | null }) => (p.zonaSede ? p.inicio.slice(11, 16) : null);

// "2026-09-21" -> "21.09.26"
export const fechaGrande = (fecha: string) => {
  const [a, m, d] = fecha.split('-');
  return `${d}.${m}.${a.slice(2)}`;
};

// Días de calendario entre hoy y `ms`.
export function diasHasta(ms: number, ahora: number, zona?: string) {
  const a = ymd(ms, zona).split('-').map(Number);
  const b = ymd(ahora, zona).split('-').map(Number);
  return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / DIA_MS);
}

export const relativo = (d: number) => (d <= 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`);

/* ---------- Estados de un partido ---------- */

export const enJuego = (p: ConInicio, ahora: number) => msDe(p) <= ahora && ahora < msDe(p) + DURACION_MS;

// Quita lo que ya terminó y ordena por inicio.
export const vigentes = <T extends ConInicio>(lista: T[], ahora: number) => lista
  .filter((p) => msDe(p) + DURACION_MS > ahora)
  .sort((a, b) => msDe(a) - msDe(b));

/* ---------- Cuenta regresiva ---------- */

export function cuentaRegresiva(ms: number, ahora: number) {
  const falta = Math.max(0, ms - ahora);
  return {
    dias: Math.floor(falta / DIA_MS),
    horas: Math.floor((falta % DIA_MS) / 36e5),
    minutos: Math.floor((falta % 36e5) / 6e4),
    segundos: Math.floor((falta % 6e4) / 1e3),
    terminada: falta === 0,
  };
}

// Texto corto del botón flotante: "2d 4h".
export function cuentaCorta(ms: number, ahora: number) {
  const c = cuentaRegresiva(ms, ahora);
  if (c.dias > 0) return `${c.dias}d ${c.horas}h`;
  if (c.horas > 0) return `${c.horas}h ${dos(c.minutos)}m`;
  return `${c.minutos}m`;
}

/* ---------- Agenda ---------- */

// Agrupa por día en la zona indicada; la lista debe venir ordenada.
// El bloque de fecha de la agenda: "SÁB", "07", "NOV".
export function partesDelDia(ms: number, zona?: string) {
  const corto = (opciones: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...opciones, timeZone: zona }).format(ms).replace('.', '').toUpperCase();
  return { semana: corto({ weekday: 'short' }), dia: corto({ day: '2-digit' }), mes: corto({ month: 'short' }) };
}

export function agruparPorDia<T extends ConInicio>(lista: T[], zona?: string) {
  const dias = new Map<string, T[]>();
  for (const p of lista) {
    const dia = ymd(msDe(p), zona);
    const grupo = dias.get(dia);
    if (grupo) grupo.push(p);
    else dias.set(dia, [p]);
  }
  return [...dias].map(([dia, partidos]) => ({ dia, titulo: diaLargo(msDe(partidos[0]), zona), partes: partesDelDia(msDe(partidos[0]), zona), partidos }));
}

// Para la tarjeta sin foto.
export const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
