// Agente 05: dónde ver una liga o el próximo torneo desde México.

import { z } from 'zod';
import { planDondeVer } from './busquedas.mjs';
import { confianza, consultar, proponer, textoN, validos } from './comun.mjs';

export const AGENTE = '05-donde-ver';
export const MAXIMO = 2;
export const TORNEO = 'proximo-torneo';

const esquemaPlataforma = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['youtube', 'streaming', 'tv', 'app']),
  url: z.url({ protocol: /^https?$/ }),
  alcance: textoN,
  costo: z.enum(['gratis', 'pago']).nullable().optional(),
  notas: textoN,
  fuente: z.string(),
  confianza,
});
const esquema = z.object({
  competencia: textoN,
  temporada: textoN,
  plataformas: z.array(z.unknown()).nullable().optional(),
  calendarioOficialUrl: textoN,
  motivo: textoN,
});

const hace30 = (hoy) => {
  const [a, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - 30)).toISOString().slice(0, 10);
};


// Máximo 2 por corrida: primero lo que nunca se ha revisado o lleva más tiempo sin revisar.
// La fecha sale de estado-agentes.json: ligas.json va por PR y puede tardar en aprobarse.
export function porRevisar(datos, hoy) {
  const fecha = (id) => datos.estado.revisado[`dondever:${id}`] ?? '';
  const reciente = (id) => fecha(id) >= hace30(hoy);
  const conSeleccionadas = new Set(datos.jugadoras.flatMap((j) => (j.estado === 'activa' && j.clubId ? [datos.clubes[j.clubId]?.ligaId] : [])));
  const ligas = Object.entries(datos.ligas)
    .filter(([id]) => conSeleccionadas.has(id) && !reciente(id))
    .map(([id]) => id);
  const torneo = datos.seleccion.proximoTorneo && !reciente(TORNEO);
  const lista = torneo ? [TORNEO, ...ligas] : ligas;
  return lista.sort((a, b) => fecha(a).localeCompare(fecha(b))).slice(0, MAXIMO);
}

export async function correr(ctx, id) {
  const { datos } = ctx;
  const esTorneo = id === TORNEO;
  const torneo = datos.seleccion.proximoTorneo;
  const liga = datos.ligas[id];
  if (esTorneo ? !torneo : !liga) throw new Error(`no existe ${id}`);

  const competencia = esTorneo
    ? { tipo: 'torneo', nombre: torneo.nombre, pais: torneo.pais, temporada: String(torneo.edicion ?? '') }
    : { tipo: 'liga', nombre: liga.nombre, pais: liga.pais, temporada: liga.temporada };
  const clubes = esTorneo ? [] : Object.values(datos.clubes).filter((c) => c.ligaId === id).map((c) => c.nombre);
  const { respuesta, verificar } = await consultar(ctx, AGENTE, id, { competencia, clubes, espectador: 'México' }, esquema, planDondeVer(ctx, competencia, liga));

  const destino = esTorneo ? datos.seleccion : liga;
  const plataformas = [];
  for (const p of validos(respuesta.plataformas, esquemaPlataforma, (x, motivo) => ctx.reporte.descarto(AGENTE, x?.nombre ?? 'plataforma', `formato inválido (${motivo})`))) {
    const fuente = await verificar(p.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, p.nombre, `la fuente no pasó (${p.fuente})`);
      continue;
    }
    const guardada = destino.plataformas.find((x) => x.url === p.url);
    if (guardada) {
      plataformas.push(guardada);
      continue;
    }
    // seleccion.json va directo; solo lo de las ligas pasa por el PR.
    const pasa = esTorneo || proponer(ctx, AGENTE, { clave: `plataforma:${id}:${p.url}`, seccion: 'Plataformas nuevas', texto: `${liga.nombre}: ${p.nombre}`, fuente });
    if (pasa) {
      plataformas.push({
        nombre: p.nombre, tipo: p.tipo, url: p.url, alcance: p.alcance ?? null, costo: p.costo ?? null, notas: p.notas ?? null, fuente, revisado: ctx.hoy,
      });
    }
  }

  let cambio = false;
  const igual = (a, b) => a.length === b.length && a.every((x) => b.some((y) => y.url === x.url));
  if (plataformas.length && !igual(plataformas, destino.plataformas)) {
    destino.plataformas = plataformas;
    cambio = true;
  }
  datos.estado.revisado[`dondever:${id}`] = ctx.hoy;
  if (!esTorneo) {
    if (respuesta.temporada && respuesta.temporada !== liga.temporada && proponer(ctx, AGENTE, { clave: `temporada:${id}:${respuesta.temporada}`, seccion: 'Plataformas nuevas', texto: `${liga.nombre}: temporada ${respuesta.temporada}` })) {
      liga.temporada = respuesta.temporada;
      cambio = true;
    }
    const calendario = await verificar(respuesta.calendarioOficialUrl);
    if (calendario && calendario !== liga.calendarioOficialUrl && proponer(ctx, AGENTE, { clave: `calendario:${id}:${calendario}`, seccion: 'Plataformas nuevas', texto: `${liga.nombre}: calendario oficial`, fuente: calendario })) {
      liga.calendarioOficialUrl = calendario;
      cambio = true;
    }
  }
  // `revisado` solo cambia si hubo novedades: la rotación usa estado-agentes.json.
  if (cambio) destino.revisado = ctx.hoy;
  ctx.reporte.encontro(AGENTE, `${competencia.nombre}: ${plataformas.length} plataforma(s)`);
}
