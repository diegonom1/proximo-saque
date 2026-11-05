// Contratos de datos (Zod) y conversión de partidos. Lo usan el orquestador y el sitio.

import { z } from 'zod';
import { DIA_MS, DURACION_MS, fechaEnZona, isoEnZona, relojLocalAUtc, zonaValida } from './tiempo.mjs';
import { ladoNuestro } from './fusion.mjs';
import { urlValida } from './fuentes.mjs';

/* ---------- Piezas ---------- */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const RE_ISO_DESFASE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

const url = z.url({ protocol: /^https?$/ });
const urlN = url.nullable();
const fecha = z.iso.date();
const fechaN = fecha.nullable();
const texto = z.string().min(1);
const textoN = texto.nullable();
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
// Nunca se guarda una hora sin desfase.
const instante = z.string().regex(RE_ISO_DESFASE).refine((s) => Number.isFinite(Date.parse(s)), 'fecha imposible');
const zonaIana = z.string().refine(zonaValida, 'zona IANA inválida');
const confianza = z.enum(['alta', 'media', 'baja']).nullable();

/* ---------- Jugadoras ---------- */

export const esquemaJugadora = z.strictObject({
  slug,
  nombre: texto,
  nombreCompleto: textoN,
  estado: z.enum(['activa', 'propuesta', 'exseleccionada']),
  posicion: z.enum(['Acomodadora', 'Opuesta', 'Atacante', 'Central', 'Líbero']).nullable(),
  numero: z.number().int().nonnegative().nullable(),
  capitana: z.boolean().nullable(),
  fechaNacimiento: fechaN,
  origen: z.strictObject({ ciudad: textoN, estado: textoN, pais: textoN }).nullable(),
  estaturaCm: z.number().int().positive().nullable(),
  clubId: textoN,
  historialClubes: z.array(z.strictObject({ club: texto, pais: textoN, temporada: textoN, fuente: urlN })),
  redes: z.array(z.strictObject({ red: z.enum(['instagram', 'tiktok', 'x', 'facebook', 'youtube']), url, fuente: url })),
  destacados: z.array(z.strictObject({ texto, anio: z.number().int().nullable(), fuente: url })),
  fotos: z.strictObject({ foco: textoN }),
  ultimaListaOficial: z.strictObject({ torneo: texto, fecha: fechaN, fuente: urlN }).nullable(),
  fuentes: z.record(z.string(), url),
  revisado: fechaN,
});

/* ---------- Clubes y ligas ---------- */

export const esquemaClub = z.strictObject({
  nombre: texto,
  alias: z.array(texto),
  ligaId: textoN,
  pais: textoN,
  ciudad: textoN,
  zona: zonaIana,
  volleybox: z.strictObject({ url: urlN, widgetId: z.number().int().nullable() }),
  sitio: urlN,
  calendarioUrl: urlN,
});

export const esquemaPlataforma = z.strictObject({
  nombre: texto,
  tipo: z.enum(['youtube', 'streaming', 'tv', 'app']),
  url,
  alcance: textoN,
  costo: z.enum(['gratis', 'pago']).nullable(),
  notas: textoN,
  fuente: url,
  revisado: fechaN,
});

export const esquemaLiga = z.strictObject({
  nombre: texto,
  pais: textoN,
  temporada: textoN,
  calendarioOficialUrl: urlN,
  plataformas: z.array(esquemaPlataforma),
  revisado: fechaN,
});

/* ---------- Partidos ---------- */

export const esquemaPartido = z.strictObject({
  id: texto,
  tipo: z.enum(['club', 'seleccion']),
  clubId: textoN,
  torneoId: textoN,
  ligaId: textoN,
  inicio: instante,
  zonaSede: zonaIana.nullable(),
  horaConfirmada: z.boolean(),
  local: texto,
  visitante: texto,
  nuestro: z.enum(['local', 'visita']).nullable(),
  competencia: textoN,
  sede: textoN,
  convocadas: z.array(slug).nullable(),
  transmision: z.array(z.strictObject({ nombre: texto, url, fuente: url })),
  fuente: urlN,
  confianza,
  origen: z.enum(['manual', 'ia', 'inicial']),
}).refine((p) => {
  const ms = Date.parse(p.inicio);
  // Las zonas y fechas inválidas ya las reportan sus propios campos.
  if (!p.zonaSede || !zonaValida(p.zonaSede) || !Number.isFinite(ms)) return true;
  return isoEnZona(ms, p.zonaSede) === p.inicio;
}, {
  path: ['inicio'],
  error: 'inicio no está en la zona de la sede',
});

export const esquemaPartidos = z.strictObject({
  actualizado: instante.nullable(),
  partidos: z.array(esquemaPartido),
  estados: z.record(z.string(), z.strictObject({ texto, fuente: urlN, revisado: fechaN })),
});

/* ---------- Selección, torneos y rankings ---------- */

export const esquemaSeleccion = z.strictObject({
  entrenador: z.strictObject({ nombre: textoN, fuente: urlN }).nullable(),
  proximoTorneo: z.strictObject({
    id: texto, nombre: texto, edicion: z.number().int().nullable(), ciudad: textoN, pais: textoN,
    fechaInicio: fechaN, fechaFin: fechaN, fuente: url,
  }).nullable(),
  plataformas: z.array(esquemaPlataforma),
  revisado: fechaN,
});

export const esquemaTorneo = z.strictObject({
  id: texto,
  nombre: texto,
  edicion: z.number().int(),
  ciudad: textoN,
  pais: textoN,
  fechaInicio: fechaN,
  fechaFin: fecha,
  posicion: z.number().int().positive().nullable(),
  medalla: z.enum(['oro', 'plata', 'bronce']).nullable(),
  record: z.string().regex(/^\d+-\d+$/).nullable(),
  premios: z.array(z.strictObject({ jugadora: slug, premio: texto })),
  fuente: url,
});

export const esquemaTorneos = z.strictObject({
  maximo: z.number().int().positive(),
  torneos: z.array(esquemaTorneo),
});

const esquemaRanking = z.strictObject({
  posicion: z.number().int().positive().nullable(),
  puntos: z.number().nullable(),
  fecha: fechaN,
  fuente: urlN,
});

export const esquemaRankings = z.strictObject({
  fivb: esquemaRanking,
  norceca: esquemaRanking,
  historial: z.array(z.strictObject({
    ranking: z.enum(['fivb', 'norceca']),
    posicion: z.number().int().positive().nullable(),
    puntos: z.number().nullable(),
    fecha: fechaN,
  })),
});

/* ---------- Estado y correcciones ---------- */

export const esquemaEstadoAgentes = z.strictObject({
  ultimaCorrida: instante.nullable(),
  revisado: z.record(z.string(), fecha),
  pendientes: z.array(z.unknown()),
});

export const esquemaManual = z.strictObject({
  partidos: z.array(z.looseObject({})), // pasan por convertir(), que decide si sirven
  jugadoras: z.record(slug, esquemaJugadora.partial()),
});

/* ---------- Todo junto ---------- */

// Referencias entre archivos que Zod no ve. Devuelve la lista de problemas.
export function revisarReferencias({ jugadoras, clubes, ligas, partidos, torneos }) {
  const problemas = [];
  const slugs = new Set(jugadoras.map((j) => j.slug));
  const repetidos = (lista) => lista.filter((x, i) => lista.indexOf(x) !== i);

  for (const s of repetidos(jugadoras.map((j) => j.slug))) problemas.push(`slug repetido: ${s}`);
  for (const id of repetidos(partidos.partidos.map((p) => p.id))) problemas.push(`partido repetido: ${id}`);
  for (const id of repetidos(torneos.torneos.map((t) => t.id))) problemas.push(`torneo repetido: ${id}`);

  for (const j of jugadoras) {
    if (j.clubId && !clubes[j.clubId]) problemas.push(`${j.slug}: club desconocido ${j.clubId}`);
  }
  for (const [id, c] of Object.entries(clubes)) {
    if (c.ligaId && !ligas[c.ligaId]) problemas.push(`club ${id}: liga desconocida ${c.ligaId}`);
  }
  for (const p of partidos.partidos) {
    if (p.tipo === 'club' && !clubes[p.clubId]) problemas.push(`${p.id}: club desconocido ${p.clubId}`);
    if (p.ligaId && !ligas[p.ligaId]) problemas.push(`${p.id}: liga desconocida ${p.ligaId}`);
    for (const s of p.convocadas ?? []) if (!slugs.has(s)) problemas.push(`${p.id}: convocada desconocida ${s}`);
  }
  for (const id of Object.keys(partidos.estados)) {
    if (!clubes[id]) problemas.push(`estado de club desconocido: ${id}`);
  }
  for (const t of torneos.torneos) {
    for (const { jugadora } of t.premios) if (!slugs.has(jugadora)) problemas.push(`${t.id}: jugadora desconocida ${jugadora}`);
  }
  return problemas;
}

/**
 * @template T
 * @param {string} nombre
 * @param {z.ZodType<T>} esquema
 * @param {unknown} crudo
 * @returns {T}
 */
function parsear(nombre, esquema, crudo) {
  const r = esquema.safeParse(crudo);
  if (!r.success) throw new Error(`data/${nombre}.json no cumple el contrato:\n${z.prettifyError(r.error)}`);
  return r.data;
}

// Valida todo lo que lee el sitio. Si algo no cumple el contrato, truena el build.
export function validarDatos(crudos) {
  const datos = {
    jugadoras: parsear('jugadoras', z.array(esquemaJugadora), crudos.jugadoras),
    clubes: parsear('clubes', z.record(z.string(), esquemaClub), crudos.clubes),
    ligas: parsear('ligas', z.record(z.string(), esquemaLiga), crudos.ligas),
    partidos: parsear('partidos', esquemaPartidos, crudos.partidos),
    seleccion: parsear('seleccion', esquemaSeleccion, crudos.seleccion),
    torneos: parsear('torneos', esquemaTorneos, crudos.torneos),
    rankings: parsear('rankings', esquemaRankings, crudos.rankings),
  };
  const problemas = revisarReferencias(datos);
  if (problemas.length) throw new Error(`Referencias rotas en data/:\n- ${problemas.join('\n- ')}`);
  return datos;
}

/* ---------- Conversión de partidos ---------- */

const limpio = (s, max = 120) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// "2026-02-31" pasa la expresión regular, pero no existe.
const fechaReal = (s) => {
  if (!RE_FECHA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

// Convierte una respuesta (de la IA o de manual.json) en un partido de club limpio, o null si no sirve.
// El instante sale de hora + zonaHoraria; `inicio` se guarda en zonaSede. Sin zonaSede: en partidos de
// local vale la zona del club y, si no, queda null y se usa zonaHoraria (el sitio omite "allá serán las…").
// `club` lleva su `id`. `ahora` se puede fijar para probar.
export function convertir(p, club, origen, ahora = Date.now()) {
  if (!p || typeof p !== 'object') return null;
  if (p.zonaHoraria != null && !zonaValida(p.zonaHoraria)) return null;
  if (p.zonaSede != null && !zonaValida(p.zonaSede)) return null;

  const local = limpio(p.local);
  const visitante = limpio(p.visitante);
  const nuestro = p.nuestro === 'local' || p.nuestro === 'visita' ? p.nuestro : ladoNuestro({ local, visitante }, club);
  const zonaFuente = p.zonaHoraria ?? club.zona;
  const zonaLocal = 'zonaLocal' in club ? club.zonaLocal : club.zona;
  const zonaSede = p.zonaSede ?? (nuestro === 'local' ? zonaLocal : null);

  const conDesfase = typeof p.inicio === 'string' && RE_ISO.test(p.inicio);
  let confirmada = p.horaConfirmada !== false;
  let ms;
  if (conDesfase) {
    ms = Date.parse(p.inicio);
  } else if (fechaReal(p.fecha)) {
    const conHora = RE_HORA.test(p.hora ?? '');
    if (!conHora) confirmada = false;
    // Sin hora se usa mediodía de la sede, para no cambiar de día al convertir.
    ms = conHora ? relojLocalAUtc(p.fecha, p.hora.padStart(5, '0'), zonaFuente) : relojLocalAUtc(p.fecha, '12:00', zonaSede ?? zonaFuente);
  } else {
    return null;
  }
  if (!Number.isFinite(ms)) return null;
  if (!p.eliminar) {
    if (ms + DURACION_MS < ahora) return null; // ya se jugó
    if (ms > ahora + 120 * DIA_MS) return null; // demasiado lejos: sospechoso
    if (!local || !visitante) return null;
  }

  let inicio = isoEnZona(ms, zonaSede ?? zonaFuente);
  // Sin zona de la sede, un desfase escrito a mano es lo más cercano a la hora del lugar: se conserva.
  if (!zonaSede && conDesfase && !p.inicio.endsWith('Z')) {
    inicio = p.inicio.length === 22 ? p.inicio.replace(/(T\d{2}:\d{2})/, '$1:00') : p.inicio;
  }
  const competencia = [limpio(p.competencia), limpio(p.fase)].filter(Boolean).join(' · ');
  const partido = {
    id: `club-${club.id}-${fechaEnZona(ms, club.zona)}`,
    tipo: 'club',
    clubId: club.id,
    torneoId: null,
    ligaId: club.ligaId ?? null,
    inicio,
    zonaSede,
    horaConfirmada: confirmada,
    local,
    visitante,
    nuestro,
    competencia: competencia || null,
    sede: limpio(p.sede, 80) || null,
    convocadas: null,
    transmision: Array.isArray(p.transmision) ? p.transmision : [],
    fuente: urlValida(p.fuente),
    confianza: ['alta', 'media', 'baja'].includes(p.confianza) ? p.confianza : null,
    origen,
  };
  if (p.eliminar) partido.eliminar = true;
  Object.defineProperty(partido, 'ms', { value: ms, enumerable: false });
  return partido;
}

// Partido de la Selección: mismas reglas, sin club. México no tiene una zona propia:
// sin zonaSede queda null aunque juegue de local. `mexico` es el lado de México.
export function convertirSeleccion(p, torneoId, origen, ahora = Date.now()) {
  if (!p || typeof p !== 'object') return null;
  const zona = zonaValida(p.zonaHoraria) ? p.zonaHoraria : (zonaValida(p.zonaSede) ? p.zonaSede : 'America/Mexico_City');
  const entidad = { id: 'seleccion', zona, zonaLocal: null, nombre: 'México', alias: [], ligaId: null };
  const partido = convertir({ ...p, competencia: p.competencia ?? p.torneo, nuestro: p.mexico ?? p.nuestro }, entidad, origen, ahora);
  if (!partido) return null;
  return Object.defineProperty({
    ...partido,
    id: `seleccion-${fechaEnZona(partido.ms, partido.zonaSede ?? zona)}`,
    tipo: 'seleccion',
    clubId: null,
    torneoId,
    convocadas: Array.isArray(p.convocadas) ? p.convocadas : null,
  }, 'ms', { value: partido.ms, enumerable: false });
}
