// Fusión de partidos (lógica probada del v1): manual > ia > inicial.

import { DIA_MS, fechaEnZona } from './tiempo.mjs';

/* ---------- Nombres de equipos ---------- */

export const normal = (s) => String(s ?? '').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();

const VACIAS = new Set(['volley', 'volei', 'voley', 'voleibol', 'volleyball', 'ball', 'club', 'clube', 'team', 'women', 'femminile',
  'feminino', 'femenil', 'feminine', 'pro', 'vbc', 'asd', 'ssd', 'the', 'del', 'des']);

export const fichas = (s) => normal(s).split(' ')
  .filter((t) => (t.length >= 3 || /[一-鿿]/.test(t)) && !VACIAS.has(t));

// ¿Cuál lado es el club de la seleccionada? -> 'local' | 'visita' | null
export function ladoNuestro(p, club) {
  const nuestras = new Set([club.nombre, ...(club.alias || [])].flatMap(fichas));
  const puntos = (lado) => fichas(lado).filter((t) => nuestras.has(t)).length;
  const l = puntos(p.local);
  const v = puntos(p.visitante);
  if (l === v) return null;
  return l > v ? 'local' : 'visita';
}

const rival = (p) => (p.nuestro === 'local' ? p.visitante : p.nuestro === 'visita' ? p.local : `${p.local} ${p.visitante}`);

// Mismo cruce reprogramado: comparten rival y están a menos de 10 días.
export const mismoCruce = (a, b) => {
  const rb = new Set(fichas(rival(b)));
  return fichas(rival(a)).some((t) => rb.has(t)) && Math.abs(a.ms - b.ms) < 10 * DIA_MS;
};

// Agrega `ms` sin que se guarde en el JSON. Devuelve null si `inicio` no se puede leer.
export const conMs = (p) => {
  const ms = Date.parse(p.inicio);
  return Number.isFinite(ms) ? Object.defineProperty({ ...p }, 'ms', { value: ms, enumerable: false }) : null;
};

/* ---------- Fusión ---------- */

const PRIORIDAD = { manual: 3, ia: 2, inicial: 1 };

// `entidad`: { id, zona }. Todas las listas traen `ms` (ver conMs y convertir).
export function fusionar(entidad, previos, nuevos, manuales) {
  const clave = (p) => `${entidad.id}|${fechaEnZona(p.ms, entidad.zona)}`;
  // Lo que ya teníamos se queda, salvo que la IA traiga ese mismo cruce (quizá reprogramado).
  const lista = previos.filter((p) => !nuevos.some((n) => clave(n) === clave(p) || mismoCruce(p, n)));
  lista.push(...nuevos);
  const mejor = new Map();
  for (const p of lista) {
    const k = clave(p);
    const actual = mejor.get(k);
    if (!actual || (PRIORIDAD[p.origen] ?? 1) >= (PRIORIDAD[actual.origen] ?? 1)) mejor.set(k, p);
  }
  for (const m of manuales) {
    if (m.eliminar) mejor.delete(clave(m));
    else mejor.set(clave(m), m);
  }
  return [...mejor.values()].sort((a, b) => a.ms - b.ms);
}
