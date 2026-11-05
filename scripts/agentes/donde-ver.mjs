// Agente 05: dónde ver una liga o el próximo torneo desde México.

import { z } from 'zod';
import { confianza, consultar, textoN, validos } from './comun.mjs';

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
  const { respuesta, verificar } = await consultar(ctx, AGENTE, id, { competencia, clubes, espectador: 'México' }, esquema);

  const plataformas = [];
  for (const p of validos(respuesta.plataformas, esquemaPlataforma, (x) => ctx.reporte.descarto(AGENTE, x?.nombre ?? 'plataforma', 'formato inválido'))) {
    const fuente = await verificar(p.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, p.nombre, 'sin fuente verificable');
      continue;
    }
    plataformas.push({
      nombre: p.nombre, tipo: p.tipo, url: p.url, alcance: p.alcance ?? null, costo: p.costo ?? null, notas: p.notas ?? null, fuente, revisado: ctx.hoy,
    });
  }

  const destino = esTorneo ? datos.seleccion : liga;
  const nuevas = plataformas.filter((p) => !destino.plataformas.some((x) => x.url === p.url));
  if (plataformas.length) destino.plataformas = plataformas;
  destino.revisado = ctx.hoy;
  datos.estado.revisado[`dondever:${id}`] = ctx.hoy;
  if (!esTorneo) {
    if (respuesta.temporada) liga.temporada = respuesta.temporada;
    const calendario = await verificar(respuesta.calendarioOficialUrl);
    if (calendario) liga.calendarioOficialUrl = calendario;
    for (const p of nuevas) ctx.reporte.agregarPr('Plataformas nuevas', `${liga.nombre}: ${p.nombre}`, p.fuente);
  }
  ctx.reporte.encontro(AGENTE, `${competencia.nombre}: ${plataformas.length} plataforma(s)`);
}
