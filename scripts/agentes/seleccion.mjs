// Agente 04: próximo compromiso de la Selección y torneos terminados.

import { z } from 'zod';
import { FEDERACIONES, planProximo, planTorneo } from './busquedas.mjs';
import { confianza, consultar, fechaN, proponer, sumarDias, textoN, validos } from './comun.mjs';
import { decidirPartidos, revisarEvidencia, textosDe } from './partidos.mjs';
import { resolverJugadora } from '../lib/nombres.mjs';
import { delCatalogo, idTorneo, mismoTorneo, nombreCanonico } from '../lib/torneos.mjs';
import { convertirSeleccion, esquemaPartido, esquemaTorneo } from '../lib/validar.mjs';

export const AGENTE = '04-seleccion-torneos';

const esquemaProximo = z.object({
  nombre: z.string().min(1),
  edicion: z.number().int().nullable().optional(),
  ciudad: textoN,
  pais: textoN,
  fechaInicio: fechaN,
  fechaFin: fechaN,
  fuente: textoN,
  confianza,
});
const esquemaTerminado = esquemaProximo.extend({
  edicion: z.number().int(),
  fechaFin: z.iso.date(),
  posicion: z.number().int().positive().nullable().optional(),
  medalla: z.enum(['oro', 'plata', 'bronce']).nullable().optional(),
  fase: textoN,
  record: z.string().regex(/^\d+-\d+$/).nullable().optional(),
  premios: z.array(z.object({ jugadora: z.string(), premio: z.string().min(1) })).default([]),
});
const esquema = z.object({
  proximoTorneo: z.unknown().nullable().optional(),
  partidos: z.array(z.unknown()).nullable().optional(),
  convocadas: z.object({ torneo: textoN, fuente: textoN, jugadoras: z.array(z.string()) }).nullable().optional(),
  torneosTerminados: z.array(z.unknown()).nullable().optional(),
  torneosMencionados: z.array(z.unknown()).nullable().optional(),
  motivo: textoN,
});
const esquemaMencion = z.object({ nombre: z.string().min(1), edicion: z.number().int() });

const MAX_TORNEOS = 2; // por corrida; lo demás se vuelve a detectar la semana siguiente
const DIAS_ENTRE_REVISIONES = 30;

function resolverNombres(ctx, nombres, contexto, jugadoras = ctx.datos.jugadoras) {
  return nombres.flatMap((nombre) => {
    const r = resolverJugadora(nombre, null, jugadoras);
    if (r.jugadora) return [r.jugadora.slug];
    ctx.reporte.duda(`${contexto}: ${r.duda ?? `"${nombre}" no está en la plantilla`}`);
    return [];
  });
}

async function proximoTorneo(ctx, crudo, verificar) {
  const { seleccion } = ctx.datos;
  const guardado = seleccion.proximoTorneo;
  const yaTermino = guardado && (guardado.fechaFin ?? guardado.fechaInicio ?? ctx.hoy) < ctx.hoy;
  if (yaTermino) {
    seleccion.proximoTorneo = null;
    if (guardado.edicion) ctx.torneosDetectados.push({ nombre: guardado.nombre, edicion: guardado.edicion });
  }
  if (!crudo) return;

  const r = esquemaProximo.safeParse(crudo);
  if (!r.success) {
    ctx.reporte.descarto(AGENTE, `proximoTorneo ${crudo?.nombre ?? ''}`.trim(), r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return;
  }
  const t = r.data;
  const fuente = await verificar(t.fuente);
  if (!fuente) {
    ctx.reporte.descarto(AGENTE, t.nombre, t.fuente ? `no se pudo verificar ${t.fuente}` : 'sin fuente');
    return;
  }
  seleccion.proximoTorneo = {
    id: idTorneo(t.nombre, t.edicion),
    nombre: nombreCanonico(t.nombre),
    edicion: t.edicion ?? null,
    ciudad: t.ciudad ?? null,
    pais: t.pais ?? null,
    fechaInicio: t.fechaInicio ?? null,
    fechaFin: t.fechaFin ?? null,
    fuente,
  };
  ctx.reporte.encontro(AGENTE, `próximo torneo: ${nombreCanonico(t.nombre)} ${t.edicion ?? ''}`.trim());
}

async function partidos(ctx, respuesta, verificar, resultados) {
  const { proximoTorneo: torneo } = ctx.datos.seleccion;
  let convocadas = null;
  if (respuesta.convocadas?.jugadoras?.length) {
    if (await verificar(respuesta.convocadas.fuente)) {
      // partidos.json va directo a main: solo puede citar a jugadoras ya aprobadas.
      const aprobadas = ctx.datos.jugadoras.filter((j) => ctx.aprobados.jugadoras.has(j.slug));
      convocadas = resolverNombres(ctx, respuesta.convocadas.jugadoras, 'Convocadas', aprobadas);
    } else {
      ctx.reporte.descarto(AGENTE, 'convocadas', 'sin fuente verificable');
    }
  }

  const nuevos = [];
  const textos = textosDe(resultados);
  const revisiones = new Map();
  for (const p of respuesta.partidos ?? []) {
    const etiqueta = `${p?.local} vs ${p?.visitante}`;
    const fuente = await verificar(p?.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, etiqueta, p?.fuente ? `no se pudo verificar ${p.fuente}` : 'sin fuente');
      continue;
    }
    const torneoId = torneo && nombreCanonico(p.torneo ?? '') === torneo.nombre ? torneo.id : idTorneo(p.torneo ?? 'amistoso', p.fecha?.slice(0, 4));
    const partido = convertirSeleccion({ ...p, fuente, convocadas }, torneoId, 'ia', ctx.ahora);
    if (!partido || !esquemaPartido.safeParse({ ...partido }).success) {
      ctx.reporte.descarto(AGENTE, etiqueta, 'fecha, zona horaria o equipos inválidos');
      continue;
    }
    nuevos.push(partido);
    const sinHora = convertirSeleccion({ ...p, hora: null, fuente, convocadas }, torneoId, 'ia', ctx.ahora);
    revisiones.set(partido, revisarEvidencia(textos, p, partido, ['México', 'Mexico', 'MEX'], sinHora));
  }
  ctx.reporte.encontro(AGENTE, `${nuevos.length} partido(s) de la Selección`);
  const previos = ctx.datos.partidos.partidos.filter((p) => p.tipo === 'seleccion');
  return decidirPartidos(ctx, AGENTE, 'Selección', nuevos, previos, 'America/Mexico_City', [...FEDERACIONES, 'volleybox.net'], revisiones);
}

async function torneos(ctx, lista, verificar) {
  const { torneos: doc } = ctx.datos;
  const terminados = validos(lista, esquemaTerminado, (x, motivo) => ctx.reporte.descarto(AGENTE, `${x?.nombre ?? 'torneo'} ${x?.edicion ?? ''}`.trim(), `formato inválido (${motivo})`));
  for (const t of terminados) {
    if (t.fechaFin >= ctx.hoy) {
      ctx.reporte.descarto(AGENTE, t.nombre, 'todavía no termina');
      continue;
    }
    const fuente = await verificar(t.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, t.nombre, t.fuente ? `no se pudo verificar ${t.fuente}` : 'sin fuente');
      continue;
    }
    const premios = t.premios.flatMap(({ jugadora, premio }) => resolverNombres(ctx, [jugadora], `Premio de ${t.nombre}`).map((slug) => ({ jugadora: slug, premio })));
    const id = idTorneo(t.nombre, t.edicion);
    const guardado = doc.torneos.find((x) => mismoTorneo(x, t));
    if (guardado) {
      // Solo completa lo que faltaba; lo que ya estaba aprobado no se pisa.
      const faltaba = (guardado.record === null && t.record) || (guardado.posicion === null && t.posicion) || (!guardado.fase && t.fase) || (guardado.medalla === null && t.medalla) || (guardado.premios.length === 0 && premios.length);
      if (faltaba && proponer(ctx, AGENTE, { clave: `torneo:${guardado.id}:completar`, seccion: 'Torneos nuevos', texto: `${guardado.nombre} ${guardado.edicion}: datos que faltaban`, fuente })) {
        guardado.record ??= t.record ?? null;
        guardado.posicion ??= t.posicion ?? null;
        guardado.medalla ??= t.medalla ?? null;
        guardado.fase ??= t.fase ?? null;
        if (guardado.premios.length === 0) guardado.premios = premios;
      }
      continue;
    }
    const nuevo = {
      id, nombre: nombreCanonico(t.nombre), edicion: t.edicion, ciudad: t.ciudad ?? null, pais: t.pais ?? null, fechaInicio: t.fechaInicio ?? null, fechaFin: t.fechaFin,
      posicion: t.posicion ?? null, medalla: t.medalla ?? null, record: t.record ?? null, premios, fase: t.fase ?? null, fuente,
    };
    if (!esquemaTorneo.safeParse(nuevo).success) {
      ctx.reporte.descarto(AGENTE, t.nombre, 'no cumple el contrato');
      continue;
    }
    const texto = `${nuevo.nombre} ${t.edicion}: ${t.medalla ?? (t.posicion ? `lugar ${t.posicion}` : t.fase ?? 'resultado por confirmar')}`;
    if (proponer(ctx, AGENTE, { clave: `torneo:${id}`, seccion: 'Torneos nuevos', texto, fuente })) doc.torneos.push(nuevo);
  }
  // Regla en código: los más recientes por fecha de fin.
  doc.torneos.sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));
  doc.torneos.length = Math.min(doc.torneos.length, doc.maximo);
}

// Torneos terminados que aún no están guardados. Cada uno es una llamada aparte (`nombre|edicion`):
// gemini-3.1-flash-lite extrae bien un torneo y mal cinco a la vez.
export function torneosPorRevisar(ctx) {
  const { torneos: doc, estado } = ctx.datos;
  const anio = Number(ctx.hoy.slice(0, 4));
  const masViejo = doc.torneos.length >= doc.maximo ? Number(doc.torneos.at(-1).fechaFin.slice(0, 4)) : 0;
  const reciente = (id) => estado.revisado[`torneo:${id}`] && sumarDias(estado.revisado[`torneo:${id}`], DIAS_ENTRE_REVISIONES) > ctx.hoy;
  const claves = ctx.torneosDetectados
    .filter((t) => delCatalogo(t.nombre) && t.edicion <= anio && t.edicion >= masViejo)
    .filter((t) => !doc.torneos.some((g) => mismoTorneo(g, t)) && !reciente(idTorneo(t.nombre, t.edicion)))
    .map((t) => `${nombreCanonico(t.nombre)}|${t.edicion}`);
  return [...new Set(claves)].slice(0, MAX_TORNEOS);
}

async function revisarTorneo(ctx, clave) {
  const [nombre, edicion] = clave.split('|');
  const torneo = { nombre, edicion: Number(edicion) };
  const entrada = { tarea: 'torneo', torneo, plantel: ctx.datos.jugadoras.filter((j) => j.estado !== 'exseleccionada').map((j) => j.nombre) };
  const { respuesta, verificar } = await consultar(ctx, AGENTE, clave, entrada, esquema, planTorneo(ctx, torneo));
  const lista = (respuesta.torneosTerminados ?? []).filter((t) => {
    const es = t?.nombre && mismoTorneo({ nombre: t.nombre, edicion: t.edicion }, torneo);
    if (!es) ctx.reporte.descarto(AGENTE, `${t?.nombre ?? 'torneo'} ${t?.edicion ?? ''}`.trim(), `se preguntó por ${nombre} ${edicion}`);
    return es;
  });
  if (lista.length === 0) ctx.reporte.noConfirmado(AGENTE, `${nombre} ${edicion}: ${respuesta.motivo ?? 'sin resultado en las fuentes'}`);
  await torneos(ctx, lista, verificar);
  ctx.datos.estado.revisado[`torneo:${idTorneo(nombre, torneo.edicion)}`] = ctx.hoy;
}

export async function correr(ctx, clave = null) {
  if (clave) {
    await revisarTorneo(ctx, clave);
    return;
  }
  const { datos } = ctx;
  const entrada = {
    tarea: 'proximo',
    torneosGuardados: datos.torneos.torneos.map(({ id, nombre, edicion, fechaFin }) => ({ id, nombre, edicion, fechaFin })),
    proximoGuardado: datos.seleccion.proximoTorneo,
    plantel: datos.jugadoras.filter((j) => j.estado !== 'exseleccionada').map((j) => j.nombre),
  };
  const { respuesta, verificar, resultados } = await consultar(ctx, AGENTE, null, entrada, esquema, planProximo(ctx));
  await proximoTorneo(ctx, respuesta.proximoTorneo, verificar);
  const nuevos = await partidos(ctx, respuesta, verificar, resultados);
  await torneos(ctx, respuesta.torneosTerminados, verificar);
  ctx.torneosDetectados.push(...validos(respuesta.torneosMencionados, esquemaMencion, () => {}));
  datos.seleccion.revisado = ctx.hoy;
  ctx.nuevos.seleccion = nuevos;
}
