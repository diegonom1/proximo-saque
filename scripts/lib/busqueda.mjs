// Búsqueda hecha por el código. Gemini recibe lo que se encontró y solo extrae el JSON.
// Tavily: 1 crédito por búsqueda básica y 1 por cada 5 páginas extraídas con éxito.

import { normalizar } from './evidencia.mjs';
import { REDES_SOCIALES, esDominio, esVideoSuelto, filasDePagina, fuenteAdmisible, urlValida } from './fuentes.mjs';

const API = 'https://api.tavily.com';
const MAX_PAGINAS = 5; // una sola extracción: 1 crédito
const MAX_FRAGMENTO = 6000; // lo que devuelve una búsqueda
const MAX_PAGINA = 20000; // una página leída completa: un calendario de temporada no cabe en menos
// Las reglas comunes prohíben usarlos como fuente: ni siquiera se le muestran a Gemini.
const EXCLUIDOS = ['wikipedia.org', 'reddit.com', 'quora.com', ...REDES_SOCIALES];

export const LIMITE_MENSUAL = 800;
export const LIMITE_CORRIDA = 180; // el mes tiene más de 4 corridas

// Para reconocer una URL aunque cambie en detalles que no la hacen otra página.
export function normalizarUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function sinCuota(mensaje) {
  return Object.assign(new Error(mensaje), { sinCuota: true });
}

const recortar = (texto) => (texto ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FRAGMENTO);
// Los saltos de línea se conservan: separan las filas de un calendario.
const textoDePagina = (texto) => (texto ?? '').replace(/[^\S\n]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

export function crearBuscadorTavily({ clave, fetch: pedir = globalThis.fetch, limiteMensual = LIMITE_MENSUAL, limiteCorrida = LIMITE_CORRIDA, creditosPrevios = 0 }) {
  if (!clave) throw new Error('falta TAVILY_API_KEY');
  const encabezados = { authorization: `Bearer ${clave}`, 'content-type': 'application/json' };
  const guardadas = new Map();
  let usadosAlInicio = null;
  let creditos = 0;
  let previos = creditosPrevios;

  async function consumo() {
    const r = await pedir(`${API}/usage`, { headers: encabezados, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`/usage respondió ${r.status}`);
    const { account, key } = await r.json();
    return account?.plan_usage ?? key?.usage ?? 0;
  }

  // Sin saber cuánto se ha gastado no se busca: el límite de 800 es duro.
  async function preparar() {
    if (usadosAlInicio !== null) return;
    try {
      // /usage va atrasado (marcó 9 con 107 gastados): vale el mayor de los dos.
      usadosAlInicio = Math.max(await consumo(), previos);
    } catch (error) {
      throw sinCuota(`no pude leer los créditos de Tavily: ${error.message}`);
    }
  }

  function reservar(costo) {
    if (usadosAlInicio + creditos + costo > limiteMensual) throw sinCuota(`Tavily: se llegó al límite de ${limiteMensual} créditos del mes`);
    if (creditos + costo > limiteCorrida) throw sinCuota(`Tavily: se llegó al límite de ${limiteCorrida} créditos por corrida`);
    creditos += costo;
  }

  async function post(ruta, cuerpo) {
    const r = await pedir(`${API}${ruta}`, { method: 'POST', headers: encabezados, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(60000) });
    if ([401, 429, 432, 433].includes(r.status)) throw sinCuota(`Tavily respondió ${r.status}`);
    if (!r.ok) throw new Error(`Tavily respondió ${r.status} en ${ruta}`);
    return r.json();
  }

  async function buscar({ texto, dominios = [], max = 5 }) {
    const clave2 = JSON.stringify([texto, dominios, max]);
    if (guardadas.has(clave2)) return guardadas.get(clave2);
    reservar(1);
    const { results = [] } = await post('/search', {
      query: texto,
      search_depth: 'basic',
      max_results: max,
      ...(dominios.length ? { include_domains: dominios } : { exclude_domains: EXCLUIDOS }),
    });
    guardadas.set(clave2, results);
    return results;
  }

  // `avanzado` lee tablas y contenido incrustado; cuesta el doble.
  // Sin `query`: con ella Tavily devuelve solo unos fragmentos y deja fuera filas del calendario.
  async function extraer(urls, avanzado) {
    if (urls.length === 0) return { results: [] };
    reservar(avanzado ? 2 : 1);
    return post('/extract', { urls, extract_depth: avanzado ? 'advanced' : 'basic', format: 'text' });
  }

  // Filas que solo existen en los atributos del HTML. Abrir la página no gasta créditos.
  async function filasDe(url, terminos) {
    const palabras = terminos.map(normalizar);
    const filas = await filasDePagina(url, pedir);
    return palabras.length ? filas.filter((f) => palabras.some((p) => normalizar(f).includes(p))) : filas;
  }

  // plan: { consultas: [{ texto, dominios, max }], paginas: [url], mejores: n, avanzado, filas: [términos] }
  // `filas` pide además las filas de los atributos que mencionen esos términos, antes del texto.
  async function investigar({ consultas = [], paginas = [], mejores = 2, avanzado = false, filas = null }) {
    await preparar();
    const porUrl = new Map();
    for (const consulta of consultas) {
      for (const r of await buscar(consulta)) {
        const id = normalizarUrl(r.url);
        if (id && !esDominio(r.url, REDES_SOCIALES) && !esVideoSuelto(r.url) && !porUrl.has(id)) porUrl.set(id, { url: r.url, titulo: r.title ?? null, contenido: recortar(r.content) });
      }
    }
    const fijas = paginas.filter(urlValida);
    const encontradas = [...porUrl.values()].slice(0, mejores).map((r) => r.url);
    const urls = [...new Set([...fijas, ...encontradas])].slice(0, MAX_PAGINAS);
    const { results = [] } = await extraer(urls, avanzado);
    const extraidas = new Map(results.map((r) => [normalizarUrl(r.url), r]));
    for (const url of urls) {
      const id = normalizarUrl(url);
      const extra = filas ? await filasDe(url, filas) : [];
      const contenido = [...extra, textoDePagina(extraidas.get(id)?.raw_content)].filter(Boolean).join('\n').slice(0, MAX_PAGINA);
      if (id && contenido) porUrl.set(id, { url, titulo: porUrl.get(id)?.titulo ?? null, contenido });
    }
    return { resultados: [...porUrl.values()] };
  }

  async function resumen() {
    const estimado = (usadosAlInicio ?? 0) + creditos;
    const mes = await consumo().catch(() => estimado);
    return { proveedor: 'Tavily', corrida: creditos, mes: Math.max(mes, estimado), limite: limiteMensual };
  }

  return {
    investigar,
    resumen,
    usarPrevios(n) {
      previos = Math.max(previos, n);
    },
  };
}

// Una fuente vale solo si su URL vino en los resultados y es admisible; `exige` agrega una condición
// sobre el resultado (por ejemplo, que mencione a la jugadora). Devuelve la URL tal como llegó.
export function verificadorDeResultados(resultados, exige = () => true) {
  const validos = new Map(resultados.filter(exige).map((r) => [normalizarUrl(r.url), r.url]));
  return async (url) => {
    const final = urlValida(url) ? validos.get(normalizarUrl(url)) ?? null : null;
    return final && fuenteAdmisible(final) ? final : null;
  };
}
