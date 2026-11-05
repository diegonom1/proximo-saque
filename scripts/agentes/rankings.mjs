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
    const cambio = posicion !== actual.posicion || puntos !== actual.puntos;
    if (cambio && (actual.posicion !== null || actual.puntos !== null)) {
      rankings.historial.push({ ranking: clave, posicion: actual.posicion, puntos: actual.puntos, fecha: actual.fecha });
    }
    rankings[clave] = { posicion, puntos, fecha: nuevo.fecha ?? null, fuente };
    ctx.reporte.encontro(AGENTE, `${clave}: lugar ${posicion ?? 'por confirmar'}, ${puntos} puntos${cambio ? '' : ' (sin cambios)'}`);
  }
}
