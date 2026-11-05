#!/usr/bin/env node
// Actualiza data/partidos.json con los próximos partidos de cada equipo.
//
// Orden de confianza:
//   1. data/manual.json  -> lo que fijen a mano siempre gana.
//   2. Agente de IA (Gemini) -> lee el calendario oficial del club o lo busca en Google.
//   3. Lo que ya estaba en data/partidos.json -> se conserva si la IA no encuentra nada nuevo.
//
// Variables de entorno:
//   GEMINI_API_KEY  clave gratuita de Google AI Studio. Sin ella solo se limpian los partidos ya jugados.
//   GEMINI_MODEL    modelo a usar (por defecto gemini-2.5-flash).
//   DIAS_ADELANTE   cuántos días hacia adelante buscar (por defecto 21).
//   IA_SIMULADA     ruta a un JSON { "idEquipo": "respuesta de la IA" } para probar sin gastar llamadas.

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DIR_DATOS = new URL('../data/', import.meta.url);
const AHORA = Date.now();
const DIA = 864e5;
const DURACION = 150 * 60 * 1000; // un partido se considera "en juego" hasta 2 h 30 min después del inicio
const DIAS_ADELANTE = Number(process.env.DIAS_ADELANTE || 21);
const MODELO = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CLAVE = process.env.GEMINI_API_KEY || '';
const PAUSA_MS = Number(process.env.PAUSA_MS || 8000); // respiro entre llamadas para no topar el límite gratuito
const ZONA_SITIO = 'America/Mexico_City';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function leer(nombre, defecto) {
  try {
    return JSON.parse(await readFile(new URL(nombre, DIR_DATOS), 'utf8'));
  } catch (e) {
    if (defecto !== undefined && e.code === 'ENOENT') return defecto;
    throw new Error(`No pude leer data/${nombre}: ${e.message}`);
  }
}
const escribir = (nombre, datos) => writeFile(new URL(nombre, DIR_DATOS), JSON.stringify(datos, null, 2) + '\n');

/* ---------- Zonas horarias ---------- */

export function zonaValida(zona) {
  if (typeof zona !== 'string' || !zona) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zona }); return true; } catch { return false; }
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

const fechaEnZona = (ms, zona) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/* ---------- Nombres de equipos ---------- */

const normal = (s) => String(s ?? '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
const VACIAS = new Set(['volley', 'volei', 'voley', 'voleibol', 'volleyball', 'ball', 'club', 'clube', 'team', 'women', 'femminile',
  'feminino', 'femenil', 'feminine', 'pro', 'vbc', 'asd', 'ssd', 'the', 'del', 'des']);
const fichas = (s) => normal(s).split(' ').filter((t) => (t.length >= 3 || /[一-鿿]/.test(t)) && !VACIAS.has(t));

// ¿Cuál lado es el equipo de la seleccionada? -> 'local' | 'visita' | null
export function ladoNuestro(p, equipo) {
  const nuestras = new Set([equipo.nombre, equipo.corto, ...(equipo.alias || [])].flatMap(fichas));
  const puntos = (lado) => fichas(lado).filter((t) => nuestras.has(t)).length;
  const l = puntos(p.local);
  const v = puntos(p.visitante);
  if (l === v) return null;
  return l > v ? 'local' : 'visita';
}

const rival = (p) => (p.nuestro === 'local' ? p.visitante : p.nuestro === 'visita' ? p.local : `${p.local} ${p.visitante}`);
// Mismo cruce reprogramado: comparten rival y están a menos de 10 días.
const mismoCruce = (a, b) => {
  const rb = new Set(fichas(rival(b)));
  return fichas(rival(a)).some((t) => rb.has(t)) && Math.abs(a.ms - b.ms) < 10 * DIA;
};

/* ---------- Validación ---------- */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{1,2}:\d{2}$/;
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const texto = (s, max = 120) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const urlValida = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) ? u : null);

// Convierte una respuesta (de la IA o de manual.json) en un partido limpio, o null si no sirve.
export function convertir(p, equipo, origen) {
  if (!p || typeof p !== 'object') return null;
  let ms;
  let zona = zonaValida(p.zonaHoraria) ? p.zonaHoraria : equipo.zona;
  let confirmada = p.horaConfirmada !== false;
  if (typeof p.inicio === 'string' && RE_ISO.test(p.inicio)) {
    ms = Date.parse(p.inicio);
  } else if (RE_FECHA.test(p.fecha || '')) {
    const hora = RE_HORA.test(p.hora || '') ? p.hora.padStart(5, '0') : '12:00';
    if (!RE_HORA.test(p.hora || '')) confirmada = false;
    ms = relojLocalAUtc(p.fecha, hora, zona);
  } else {
    return null;
  }
  if (!Number.isFinite(ms)) return null;
  if (!p.eliminar) {
    if (ms + DURACION < AHORA) return null; // ya se jugó
    if (ms > AHORA + 120 * DIA) return null; // demasiado lejos: sospechoso
    if (!texto(p.local) || !texto(p.visitante)) return null;
  }
  // Si llegó como ISO con desfase lo conservamos (es la hora del lugar); si llegó en UTC ("Z"), lo pasamos a la zona del partido.
  let inicio = isoEnZona(ms, zona);
  if (typeof p.inicio === 'string' && RE_ISO.test(p.inicio) && !p.inicio.endsWith('Z')) {
    inicio = p.inicio.length === 22 ? p.inicio.replace(/(T\d{2}:\d{2})/, '$1:00') : p.inicio;
  }
  const partido = {
    id: `${equipo.id}-${fechaEnZona(ms, equipo.zona)}`,
    equipo: equipo.id,
    inicio,
    local: texto(p.local),
    visitante: texto(p.visitante),
    competencia: texto(p.competencia) || null,
    sede: texto(p.sede, 80) || null,
    fuente: urlValida(p.fuente),
    origen,
  };
  if (!confirmada) partido.horaConfirmada = false;
  const lado = p.nuestro === 'local' || p.nuestro === 'visita' ? p.nuestro : ladoNuestro(partido, equipo);
  if (lado) partido.nuestro = lado;
  if (p.eliminar) partido.eliminar = true;
  Object.defineProperty(partido, 'ms', { value: ms, enumerable: false });
  return partido;
}

const conMs = (p) => {
  const ms = Date.parse(p.inicio);
  return Number.isFinite(ms) ? Object.defineProperty({ ...p }, 'ms', { value: ms, enumerable: false }) : null;
};

/* ---------- Fusión ---------- */

const PRIORIDAD = { manual: 3, ia: 2, inicial: 1 };

export function fusionar(equipo, previos, nuevos, manuales) {
  const clave = (p) => `${equipo.id}|${fechaEnZona(p.ms, equipo.zona)}`;
  // Lo que ya teníamos se queda, salvo que la IA traiga ese mismo cruce (quizá reprogramado).
  let lista = previos.filter((p) => !nuevos.some((n) => clave(n) === clave(p) || mismoCruce(p, n)));
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

/* ---------- Agente de IA ---------- */

function instrucciones(equipo, paginaOficial) {
  const hoy = new Date(AHORA).toISOString().slice(0, 10);
  const limite = new Date(AHORA + DIAS_ADELANTE * DIA).toISOString().slice(0, 10);
  const lineas = [
    `Hoy es ${hoy}. Necesito los partidos oficiales programados del equipo de voleibol FEMENIL "${equipo.nombre}" (${equipo.liga}, ${equipo.pais}) entre ${hoy} y ${limite}.`,
    'Incluye liga, copas nacionales y torneos internacionales. No incluyas amistosos ni partidos ya jugados.',
  ];
  if (paginaOficial) {
    lineas.push('Usa SOLO el siguiente texto de su calendario. Si ahí no aparece algo, no lo agregues.', '<<<', paginaOficial, '>>>');
  } else {
    lineas.push(`Búscalo en internet y prioriza fuentes oficiales${equipo.verificar ? ` como ${equipo.verificar}` : ''} o de la liga.`);
  }
  lineas.push(
    'Responde únicamente con JSON válido, sin texto antes ni después, con esta forma exacta:',
    '{"partidos":[{"fecha":"AAAA-MM-DD","hora":"HH:MM","zonaHoraria":"zona IANA del lugar del partido, por ejemplo Europe/Rome","horaConfirmada":true,"local":"equipo local","visitante":"equipo visitante","competencia":"competencia y jornada","sede":"ciudad","fuente":"URL exacta donde lo leíste"}]}',
    'Reglas: "fecha" y "hora" son las LOCALES del lugar donde se juega, en formato de 24 horas. Si no hay hora publicada usa "12:00" y "horaConfirmada": false.',
    'Si no encuentras partidos programados en ese periodo responde {"partidos":[]}. No inventes datos.',
  );
  return lineas.join('\n');
}

async function gemini(prompt, conBusqueda) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODELO)}:generateContent`;
  const cuerpo = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } };
  if (conBusqueda) cuerpo.tools = [{ google_search: {} }];
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': CLAVE },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(120000),
    });
    const crudo = await r.text();
    if (r.status === 429 || r.status >= 500) {
      if (intento < 3) { await dormir(30000 * intento); continue; }
      throw new Error(`Gemini respondió ${r.status} (límite o saturación). Prueben más tarde.`);
    }
    if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${crudo.slice(0, 300)}`);
    const datos = JSON.parse(crudo);
    const c = datos.candidates?.[0];
    return {
      texto: (c?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      fuentes: (c?.groundingMetadata?.groundingChunks ?? []).map((g) => g.web?.uri).filter(Boolean),
    };
  }
  throw new Error('Gemini no respondió');
}

export function extraerJSON(salida) {
  const bloque = salida.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const crudo = bloque ? bloque[1] : salida;
  const a = crudo.indexOf('{');
  const b = crudo.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('la respuesta no trae JSON');
  return JSON.parse(crudo.slice(a, b + 1));
}

async function textoDePagina(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': 'ProximoSaque/1.0 (calendario personal; una consulta por semana)', 'accept-language': 'es,en;q=0.8' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  const html = await r.text();
  const limpio = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
  if (limpio.length < 400) throw new Error('la página casi no trae texto (seguramente se arma con JavaScript)');
  return limpio.slice(0, 60000);
}

async function consultar(equipo, simulada) {
  if (simulada) {
    const salida = simulada[equipo.id] ?? '{"partidos":[]}';
    const lista = extraerJSON(salida).partidos ?? [];
    return { partidos: lista.map((p) => convertir(p, equipo, 'ia')).filter(Boolean), modo: 'simulada' };
  }
  let pagina = null;
  if (equipo.calendario) {
    try { pagina = await textoDePagina(equipo.calendario); } catch (e) { console.log(`  · no pude leer ${equipo.calendario}: ${e.message}; uso búsqueda`); }
  }
  const { texto: salida, fuentes } = await gemini(instrucciones(equipo, pagina), !pagina);
  const lista = extraerJSON(salida).partidos ?? [];
  const respaldo = pagina ? equipo.calendario : fuentes[0] ?? null;
  const partidos = lista.map((p) => convertir({ ...p, fuente: urlValida(p.fuente) || respaldo }, equipo, 'ia')).filter(Boolean);
  return { partidos, modo: pagina ? 'calendario oficial' : 'búsqueda en Google' };
}

/* ---------- Principal ---------- */

async function main() {
  const equipos = await leer('equipos.json');
  const doc = await leer('partidos.json', { partidos: [] });
  const manualDoc = await leer('manual.json', { partidos: [] });
  const simulada = process.env.IA_SIMULADA ? JSON.parse(await readFile(process.env.IA_SIMULADA, 'utf8')) : null;
  const usarIA = Boolean(CLAVE || simulada);
  if (!usarIA) console.log('Sin GEMINI_API_KEY: solo limpio partidos pasados y aplico data/manual.json.');

  const resumen = [];
  const todos = [];
  const ids = Object.keys(equipos);
  for (const [i, id] of ids.entries()) {
    const equipo = { id, ...equipos[id] };
    console.log(`> ${equipo.nombre}`);
    const previos = (doc.partidos || []).filter((p) => p.equipo === id && p.origen !== 'manual').map(conMs).filter((p) => p && p.ms + DURACION > AHORA);
    const manuales = (manualDoc.partidos || []).filter((p) => p.equipo === id).map((p) => convertir(p, equipo, 'manual')).filter(Boolean);
    let nuevos = [];
    let nota = usarIA ? '' : 'sin IA';
    if (usarIA && equipo.activo !== false) {
      try {
        const r = await consultar(equipo, simulada);
        nuevos = r.partidos;
        nota = `IA (${r.modo}): ${nuevos.length} partido(s)`;
      } catch (e) {
        nota = `IA falló: ${e.message}`;
        console.log(`::warning title=${equipo.corto || id}::${e.message.replace(/\n/g, ' ')}`);
      }
      if (!simulada && i < ids.length - 1) await dormir(PAUSA_MS);
    }
    const lista = fusionar(equipo, previos, nuevos, manuales);
    console.log(`  ${nota || 'sin cambios'} → ${lista.length} en agenda`);
    todos.push(...lista);
    resumen.push(`| ${equipo.corto || equipo.nombre} | ${nota || '—'} | ${lista.length} |`);
  }

  todos.sort((a, b) => a.ms - b.ms);
  const salida = { actualizado: isoEnZona(AHORA, ZONA_SITIO), partidos: todos.map((p) => ({ ...p })) };
  await escribir('partidos.json', salida);
  console.log(`Listo: ${todos.length} partidos guardados en data/partidos.json`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Próximo Saque · actualización', '',
      '| Equipo | Resultado | En agenda |', '|---|---|---|', ...resumen, '',
      `Modelo: \`${MODELO}\` · ventana: ${DIAS_ADELANTE} días`, '',
    ].join('\n'));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
