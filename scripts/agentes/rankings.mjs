// Agente 06: lugar y puntos de México en los rankings FIVB y NORCECA. Lee las fuentes oficiales con
// código, sin IA: no gasta llamadas ni créditos, así que corre cada lunes.

import { leerFivb, leerNorceca } from '../lib/rankings-oficiales.mjs';

export const AGENTE = '06-rankings';

const LECTORES = { fivb: leerFivb, norceca: leerNorceca };

// El registro que se reemplaza pasa al historial, salvo que no tuviera nada.
export function archivar(rankings, clave) {
  const { posicion, puntos, fecha } = rankings[clave];
  if (posicion !== null || puntos !== null) rankings.historial.push({ ranking: clave, posicion, puntos, fecha });
}

export async function correr(ctx) {
  const { rankings } = ctx.datos;
  for (const [clave, leer] of Object.entries(LECTORES)) {
    let nuevo;
    try {
      nuevo = await leer(ctx.descargar);
    } catch (error) {
      // Una fuente caída no tira la corrida ni toca lo guardado.
      ctx.reporte.fallo(AGENTE, `${clave}: ${error.message.split('\n')[0]}`);
      continue;
    }
    const actual = rankings[clave];
    const fijo = ctx.manual.rankings?.[clave];
    if (fijo) {
      // Lo escrito a mano gana; si la fuente dice otra cosa, decide una persona.
      if (nuevo.posicion !== fijo.posicion || nuevo.puntos !== fijo.puntos) {
        ctx.reporte.porRevisar(AGENTE, `${clave}: manual.json dice lugar ${fijo.posicion ?? 'por confirmar'} y ${fijo.puntos ?? 'sin'} puntos (${fijo.fecha ?? 'sin fecha'}); ${nuevo.fuente} dice lugar ${nuevo.posicion} y ${nuevo.puntos} puntos (${nuevo.fecha})`);
      }
      continue;
    }
    const cambio = nuevo.posicion !== actual.posicion || nuevo.puntos !== actual.puntos;
    if (cambio) archivar(rankings, clave);
    rankings[clave] = nuevo;
    ctx.reporte.encontro(AGENTE, `${clave}: lugar ${nuevo.posicion}, ${nuevo.puntos} puntos al ${nuevo.fecha}${cambio ? '' : ' (sin cambios)'}`);
  }
  ctx.datos.estado.revisado.rankings = ctx.hoy;
}
