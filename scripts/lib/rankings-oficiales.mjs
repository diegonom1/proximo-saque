// Lee los rankings de México directo de sus fuentes oficiales, sin IA.
//
// FIVB: la página carga la tabla con JavaScript desde un API público que responde JSON.
// NORCECA: publica una página HTML fija por año; su menú dice cuál es la más reciente.
//
// Si algo no coincide con lo esperado se lanza un error: mejor conservar el dato anterior que
// guardar uno equivocado porque cambió la página.

import { z } from 'zod';

export const PAGINA_FIVB = 'https://en.volleyballworld.com/volleyball/world-ranking/women';
export const INICIO_NORCECA = 'https://norceca.net/';

const FEMENIL = 0; // el API usa 0 para femenil y 1 para varonil
const POR_PAGINA = 50;
const PAGINAS_FIVB = 4;
const urlFivb = (pagina) => `https://en.volleyballworld.com/api/v1/worldranking/volleyball/${FEMENIL}/${pagina}/${POR_PAGINA}`;

const MESES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const esquema = z.object({
  posicion: z.number().int().positive(),
  puntos: z.number().nonnegative(),
  fecha: z.iso.date(),
  fuente: z.url(),
});

// "15 Oct 2026 - 10:40 am UTC" y "31 December 2025" son 2026-10-15 y 2025-12-31.
export function fechaEnIngles(texto) {
  const m = texto?.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  const mes = m ? MESES.indexOf(m[2].toLowerCase()) + 1 : 0;
  if (!mes) throw new Error(`no entendí la fecha "${texto}"`);
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/* ---------- FIVB ---------- */

// Devuelve null si México no está en esta página del ranking.
export function fivbDeJson(doc) {
  if (doc.gender !== FEMENIL) throw new Error(`el API devolvió gender ${doc.gender}, no el femenil`);
  if (!Array.isArray(doc.teams)) throw new Error('el API no trae equipos');
  const mexico = doc.teams.find((t) => t.federationCode === 'MEX');
  if (!mexico) return null;
  return esquema.parse({ posicion: mexico.rank, puntos: mexico.decimalPoints, fecha: fechaEnIngles(doc.date), fuente: PAGINA_FIVB });
}

export async function leerFivb(descargar) {
  for (let pagina = 0; pagina < PAGINAS_FIVB; pagina += 1) {
    const resultado = fivbDeJson(JSON.parse(await descargar(urlFivb(pagina))));
    if (resultado) return resultado;
  }
  throw new Error('México no aparece en el ranking');
}

/* ---------- NORCECA ---------- */

const sinEtiquetas = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#0?39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();

// El menú enlaza la página de rankings del año; si hay varias, gana la más reciente.
export function paginaDeRankings(html, base) {
  const enlaces = [...html.matchAll(/href="([^"]*\/Ranking\/Volleyball\/[^"]*Ranking%20Pages\.htm)"/g)].map((m) => m[1]).sort();
  if (!enlaces.length) throw new Error('el menú de NORCECA no enlaza su página de rankings');
  return new URL(enlaces.at(-1), base).href;
}

// Solo la mayor femenil: los enlaces de U17 a U23 empiezan distinto.
export function paginaFemenil(html, base) {
  const m = html.match(/href="(Women%20Rankings[^"]*\.htm)"/);
  if (!m) throw new Error('no encontré el enlace al ranking femenil mayor');
  return new URL(m[1], base).href;
}

export function norcecaDeHtml(html, fuente) {
  const texto = sinEtiquetas(html);
  if (!/Women'?s Senior Ranking/i.test(texto)) throw new Error('la página no es el ranking femenil mayor');
  const fecha = texto.match(/As per\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (!fecha) throw new Error('la página no dice a qué fecha corresponde');
  const fila = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map(([tr]) => [...tr.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map(([celda]) => sinEtiquetas(celda)))
    .find((celdas) => celdas[1] === 'MEX');
  if (!fila) throw new Error('México no aparece en el ranking');
  return esquema.parse({ posicion: Number(fila[0]), puntos: Number(fila.at(-1)), fecha: fechaEnIngles(fecha[1]), fuente });
}

export async function leerNorceca(descargar) {
  const rankings = paginaDeRankings(await descargar(INICIO_NORCECA), INICIO_NORCECA);
  const femenil = paginaFemenil(await descargar(rankings), rankings);
  return norcecaDeHtml(await descargar(femenil), femenil);
}

/* ---------- Descarga ---------- */

export async function descargarOficial(url) {
  const respuesta = await fetch(url, { headers: { 'user-agent': 'proximo-saque' }, signal: AbortSignal.timeout(30_000) });
  if (!respuesta.ok) throw new Error(`${url} respondió ${respuesta.status}`);
  return respuesta.text();
}

// Copias recortadas de las respuestas reales: las pruebas y el modo simulado no usan la red.
export function crearDescargaSimulada(leer) {
  return async (url) => {
    if (url === urlFivb(0)) return leer('fivb-ranking.json');
    if (url === INICIO_NORCECA) return leer('norceca-inicio.html');
    if (url.endsWith('Ranking%20Pages.htm')) return leer('norceca-rankings.html');
    if (url.includes('Women%20Rankings')) return leer('norceca-femenil.html');
    throw new Error(`sin copia guardada de ${url}`);
  };
}
