// Agente 06: lugar y puntos de México en los rankings FIVB y NORCECA.

import { z } from 'zod';
import { planRankings } from './busquedas.mjs';
import { consultar, confianza, fechaN, textoN } from './comun.mjs';

export const AGENTE = '06-rankings';
const DIAS_ENTRE_REVISIONES = 28;

// Una vez al mes: los rankings cambian después de los torneos, no cada semana.
export function toca(estado, hoy) {
  const ultima = estado.revisado.rankings;
  if (!ultima) return true;
  return (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${ultima}T00:00:00Z`)) / 864e5 >= DIAS_ENTRE_REVISIONES;
}

// El registro que se reemplaza pasa al historial, salvo que no tuviera nada.
export function archivar(rankings, clave) {
  const { posicion, puntos, fecha } = rankings[clave];
  if (posicion !== null || puntos !== null) rankings.historial.push({ ranking: clave, posicion, puntos, fecha });
}

const esquemaRanking = z.object({
  posicion: z.number().int().positive().nullable().optional(),
  puntos: z.number().nullable().optional(),
  fecha: fechaN,
  fuente: textoN,
  confianza,
  motivo: textoN,
});
const esquema = z.object({ fivb: esquemaRanking, norceca: esquemaRanking });

export async function correr(ctx) {
  const { rankings } = ctx.datos;
  const { fivb, norceca } = rankings;
  const { respuesta, verificar } = await consultar(ctx, AGENTE, null, { guardado: { fivb, norceca } }, esquema, planRankings());
  ctx.datos.estado.revisado.rankings = ctx.hoy;

  for (const clave of ['fivb', 'norceca']) {
    const nuevo = respuesta[clave];
    const actual = rankings[clave];
    if (nuevo.posicion == null && nuevo.puntos == null) {
      ctx.reporte.descarto(AGENTE, clave, nuevo.motivo ?? 'sin lugar ni puntos');
      continue;
    }
    const fuente = await verificar(nuevo.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, clave, nuevo.fuente ? `no se pudo verificar ${nuevo.fuente}` : 'sin fuente');
      continue;
    }
    const posicion = nuevo.posicion ?? actual.posicion;
    const puntos = nuevo.puntos ?? actual.puntos;
    const fijo = ctx.manual.rankings?.[clave];
    if (fijo) {
      // Lo escrito a mano gana; si la fuente dice otra cosa, decide una persona.
      if (posicion !== fijo.posicion || puntos !== fijo.puntos) {
        ctx.reporte.porRevisar(AGENTE, `${clave}: manual.json dice lugar ${fijo.posicion ?? 'por confirmar'} y ${fijo.puntos ?? 'sin'} puntos (${fijo.fecha ?? 'sin fecha'}); ${fuente} dice lugar ${posicion ?? 'por confirmar'} y ${puntos ?? 'sin'} puntos (${nuevo.fecha ?? 'sin fecha'})`);
      }
      continue;
    }
    const cambio = posicion !== actual.posicion || puntos !== actual.puntos;
    if (cambio) archivar(rankings, clave);
    rankings[clave] = { posicion, puntos, fecha: nuevo.fecha ?? null, fuente };
    ctx.reporte.encontro(AGENTE, `${clave}: lugar ${posicion ?? 'por confirmar'}, ${puntos} puntos${cambio ? '' : ' (sin cambios)'}`);
  }
}
