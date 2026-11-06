// Vigila las ligas, sin IA ni créditos: avisa si una temporada guardada ya debería haber terminado o
// si su calendario oficial dejó de responder. No cambia datos: las actualiza una persona.

export const AGENTE = 'temporadas';

// Las ligas de voleibol de "2026-27" acaban en primavera. Después de esta fecha ya es otra temporada.
const FIN_DE_TEMPORADA = '06-30';
const ESPERA_REINTENTO_MS = 5000;

// "2026-27" y "2026/27" terminan el 30 de junio de 2027; "2026", al acabar el año. Si no se entiende, null.
export function finDeTemporada(temporada) {
  const doble = temporada?.match(/^(\d{4})[-/](\d{2}|\d{4})$/);
  if (doble) return `${Number(doble[1]) + 1}-${FIN_DE_TEMPORADA}`;
  return /^\d{4}$/.test(temporada ?? '') ? `${temporada}-12-31` : null;
}

// Un 401, 403 o 429 es un sitio vivo que no deja pasar bots: eso no es que deje de responder.
export const estadoResponde = (status) => status < 400 || [401, 403, 429].includes(status);

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'proximo-saque' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    await r.body?.cancel();
    return { responde: estadoResponde(r.status), detalle: `respondió ${r.status}` };
  } catch (error) {
    return { responde: false, detalle: error.name === 'TimeoutError' ? 'no respondió en 20 segundos' : 'no se pudo conectar' };
  }
}

// Un tropiezo de la red no es un aviso: se intenta una segunda vez.
export async function comprobarUrl(url, espera = ESPERA_REINTENTO_MS) {
  const primero = await pedir(url);
  if (primero.responde) return primero;
  await new Promise((listo) => { setTimeout(listo, espera); });
  return pedir(url);
}

const ligasConSeleccionadas = ({ jugadoras, clubes }) => new Set(jugadoras
  .filter((j) => j.estado === 'activa' && j.clubId)
  .map((j) => clubes[j.clubId]?.ligaId)
  .filter(Boolean));

export async function revisar(ctx) {
  const avisar = (texto, fuente = null) => {
    ctx.reporte.porRevisar(AGENTE, texto);
    ctx.reporte.duda(texto, fuente);
  };
  for (const id of ligasConSeleccionadas(ctx.datos)) {
    const liga = ctx.datos.ligas[id];
    if (!liga) continue;
    const fin = finDeTemporada(liga.temporada);
    if (liga.temporada && !fin) avisar(`${liga.nombre}: no entiendo la temporada "${liga.temporada}"; revísala en ligas.json.`);
    if (fin && fin < ctx.hoy) avisar(`${liga.nombre}: la temporada ${liga.temporada} ya debería haber terminado (${fin}). Actualiza temporada y calendarioOficialUrl en ligas.json.`, liga.calendarioOficialUrl);
    if (!liga.calendarioOficialUrl) continue;
    const { responde, detalle } = await ctx.comprobarUrl(liga.calendarioOficialUrl);
    if (!responde) avisar(`${liga.nombre}: el calendario oficial ${detalle}. Revisa calendarioOficialUrl en ligas.json.`, liga.calendarioOficialUrl);
  }
}
