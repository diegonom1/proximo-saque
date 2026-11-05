// Piezas que comparten los agentes.

import { z } from 'zod';
import { verificadorDeResultados } from '../lib/busqueda.mjs';
import { extraerJSON } from '../lib/gemini.mjs';

export const textoN = z.string().nullable().optional();
export const fechaN = z.iso.date().nullable().optional();
export const confianza = z.enum(['alta', 'media', 'baja']).nullable().optional();

// Pregunta a un agente y valida la forma de la respuesta. `verificar` devuelve la URL a guardar o null.
// Con buscador, el código busca primero y una fuente vale solo si su URL vino en esos resultados.
export async function consultar(ctx, agente, clave, entrada, esquema, plan) {
  const registrar = (r, resultados) => {
    const crudo = extraerJSON(r.texto);
    ctx.reporte.modelo(agente, r.modelo);
    ctx.diagnostico?.push({ agente, clave, modelo: r.modelo, urls: resultados?.map((x) => x.url) ?? null, respuesta: crudo });
    return esquema.parse(crudo);
  };
  if (ctx.buscador) {
    const { resultados } = await ctx.buscador.investigar(plan);
    if (resultados.length === 0) throw new Error('la búsqueda no trajo resultados');
    const mensaje = JSON.stringify({ ...entrada, resultadosBusqueda: resultados }, null, 2);
    const r = await ctx.llamar({ agente, clave, mensaje, conBusqueda: false });
    return { respuesta: registrar(r, resultados), verificar: verificadorDeResultados(resultados, plan.exige) };
  }
  const r = await ctx.llamar({ agente, clave, mensaje: JSON.stringify(entrada, null, 2) });
  return { respuesta: registrar(r), verificar: (url) => ctx.verificar(url, r.fuentes) };
}

// Un elemento mal formado se descarta solo; no tira la respuesta completa.
export function validos(lista, esquema, alDescartar) {
  return (lista ?? []).flatMap((x) => {
    const r = esquema.safeParse(x);
    if (r.success) return [r.data];
    alDescartar(x, r.error.issues.map((i) => `${i.path.join('.') || 'elemento'}: ${i.message}`).join('; '));
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
