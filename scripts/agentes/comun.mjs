// Piezas que comparten los agentes.

import { z } from 'zod';
import { extraerJSON } from '../lib/gemini.mjs';

export const textoN = z.string().nullable().optional();
export const fechaN = z.iso.date().nullable().optional();
export const confianza = z.enum(['alta', 'media', 'baja']).nullable().optional();

// Pregunta a un agente y valida la forma de la respuesta. `verificar` devuelve la URL a guardar o null.
export async function consultar(ctx, agente, clave, entrada, esquema) {
  const r = await ctx.llamar({ agente, clave, mensaje: JSON.stringify(entrada, null, 2) });
  const respuesta = esquema.parse(extraerJSON(r.texto));
  return { respuesta, verificar: (url) => ctx.verificar(url, r.fuentes) };
}

// Un elemento mal formado se descarta solo; no tira la respuesta completa.
export function validos(lista, esquema, alDescartar) {
  return (lista ?? []).flatMap((x) => {
    const r = esquema.safeParse(x);
    if (r.success) return [r.data];
    alDescartar(x);
    return [];
  });
}

export function restarMeses(fecha, meses) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 - meses, d)).toISOString().slice(0, 10);
}

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Todo cambio que va al PR pasa por aquí. Devuelve false si ya se rechazó con esa misma evidencia:
// lo rechazado solo vuelve con una fuente nueva.
export function proponer(ctx, agente, { clave, seccion, texto, fuente = null }) {
  const { propuestas, rechazos } = ctx.datos.estado;
  const rechazo = rechazos.find((r) => r.clave === clave);
  if (rechazo && (!fuente || rechazo.evidencias.includes(fuente))) {
    ctx.reporte.descarto(agente, texto, 'se rechazó en un PR y no hay evidencia nueva');
    return false;
  }
  const propuesta = { clave, seccion, texto, fuente, fecha: ctx.hoy };
  const i = propuestas.findIndex((p) => p.clave === clave);
  if (i >= 0) propuestas[i] = propuesta;
  else propuestas.push(propuesta);
  return true;
}
