// Páginas públicas y verificación de fuentes.

export const urlValida = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) ? u : null);

export const limpiarHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const AGENTE_HTTP = 'ProximoSaque/2.0 (calendario de aficionados; una consulta por semana)';

const decodificar = (texto) => texto.replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Hay calendarios que guardan la hora solo en atributos de accesibilidad, y el texto visible no la trae.
// `aria-label="Vandœuvre Nancy contre Béziers, samedi 21 novembre, 20:00"` es la fila completa del partido.
export function filasDeAtributos(html) {
  const filas = [...html.matchAll(/\b(?:aria-label|title)="([^"]{12,200})"/g)].map(([, valor]) => decodificar(valor).trim());
  return [...new Set(filas.filter((f) => /\d/.test(f)))];
}

export async function textoDePagina(url, pedir = globalThis.fetch) {
  const r = await pedir(url, {
    headers: { 'user-agent': AGENTE_HTTP, 'accept-language': 'es,en;q=0.8' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  const html = await r.text();
  const limpio = limpiarHtml(html);
  if (limpio.length < 400) throw new Error('la página casi no trae texto (seguramente se arma con JavaScript)');
  return [...filasDeAtributos(html), limpio].join('\n').slice(0, 60000);
}

// Lo mismo, solo las filas: lo que el extractor de Tavily no ve. Si la página no abre, no hay filas.
export async function filasDePagina(url, pedir = globalThis.fetch) {
  try {
    const r = await pedir(url, { headers: { 'user-agent': AGENTE_HTTP, 'accept-language': 'es,en;q=0.8' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok || !/html/i.test(r.headers?.get('content-type') ?? '')) return [];
    return filasDeAtributos(await r.text());
  } catch {
    return [];
  }
}

export function dominio(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const REDES_SOCIALES = ['instagram.com', 'linkedin.com', 'x.com', 'twitter.com', 'facebook.com', 'tiktok.com', 'threads.com', 'threads.net'];

export const esDominio = (url, lista) => {
  const propio = dominio(url);
  return Boolean(propio) && lista.some((d) => propio === d || propio.endsWith(`.${d}`));
};

// Un video suelto no se puede citar: el dato no se lee en la página. El canal (`/@nombre`) sí vale.
export function esVideoSuelto(url) {
  if (!urlValida(url) || !esDominio(url, ['youtube.com', 'youtu.be'])) return false;
  const { hostname, pathname } = new URL(url);
  return hostname.endsWith('youtu.be') || /^\/(watch|shorts|live|embed)(\/|$)/.test(pathname);
}

// Ni las redes sociales, ni los videos sueltos, ni la portada de un sitio sirven como fuente de un dato.
export function fuenteAdmisible(url) {
  if (!urlValida(url) || esDominio(url, REDES_SOCIALES) || esVideoSuelto(url)) return false;
  const { pathname, search } = new URL(url);
  return pathname.replace(/\/+$/, '') !== '' || search !== '';
}

// Búsquedas, filtros y listas de jugadoras: nombrar a alguien no las vuelve una ficha suya.
const SEGMENTOS_LISTADO = /^(players?|jugadoras?|atletas?|athletes?|roster|rosters|squad|team|teams|equipos?|plantilla|plantel|elenco|search|buscar|busqueda|tag|tags|category|categoria|clubs?|clubes)$/i;
const PARAMETROS_LISTADO = /^(country|pais|nationality|q|s|search|query|filter|sort|page|gender)$/i;

export function esListado(url) {
  if (!urlValida(url)) return false;
  const { pathname, searchParams } = new URL(url);
  const segmentos = pathname.split('/').filter(Boolean);
  if ([...searchParams.keys()].some((k) => PARAMETROS_LISTADO.test(k))) return true;
  return segmentos.length > 0 && (SEGMENTOS_LISTADO.test(segmentos.at(-1)) || /^(search|buscar|tag|tags|category)$/i.test(segmentos[0]));
}

const mismoDominio = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

export const esRedireccionGoogle = (url) => dominio(url) === 'vertexaisearch.cloud.google.com';

async function abrir(url, metodo, pedir) {
  return pedir(url, { method: metodo, redirect: 'manual', headers: { 'user-agent': AGENTE_HTTP }, signal: AbortSignal.timeout(15000) });
}

// Sigue un enlace de redirección de Google hasta su URL real.
async function urlFinal(url, pedir) {
  if (!esRedireccionGoogle(url)) return url;
  try {
    return (await abrir(url, 'GET', pedir)).headers.get('location');
  } catch {
    return null;
  }
}

// `red: false` (modo simulado) solo acepta lo que venga en las fuentes de la respuesta.
export function crearVerificador({ fetch: pedir = globalThis.fetch, red = true } = {}) {
  const abiertas = new Map();

  async function responde(url) {
    if (!red) return false;
    if (!abiertas.has(url)) {
      abiertas.set(url, (async () => {
        try {
          let r = await abrir(url, 'HEAD', pedir);
          if (r.status === 405 || r.status === 501) r = await abrir(url, 'GET', pedir);
          return r.status >= 200 && r.status < 400;
        } catch {
          return false;
        }
      })());
    }
    return abiertas.get(url);
  }

  async function dominios(fuentes) {
    const lista = await Promise.all(fuentes.map(async ({ uri, titulo }) => {
      const final = red ? await urlFinal(uri, pedir) : uri;
      // Google suele poner el dominio en el título del enlace.
      return dominio(final ?? '') ?? (titulo ? titulo.toLowerCase().replace(/^www\./, '') : null);
    }));
    return lista.filter((d) => d && d !== 'vertexaisearch.cloud.google.com');
  }

  // Devuelve la URL que se debe guardar, o null si la fuente no pasa.
  return async function verificar(url, fuentes = []) {
    if (!urlValida(url)) return null;
    const final = red ? await urlFinal(url, pedir) : url;
    const propio = final ? dominio(final) : null;
    if (!propio || !fuenteAdmisible(final)) return null;
    if ((await dominios(fuentes)).some((d) => mismoDominio(d, propio))) return final;
    return (await responde(final)) ? final : null;
  };
}
