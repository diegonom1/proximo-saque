// Agente 04: próximo compromiso de la Selección y torneos terminados.

import { z } from 'zod';
import { FEDERACIONES, planProximo, planTorneo } from './busquedas.mjs';
import { confianza, consultar, fechaN, proponer, sumarDias, textoN, validos } from './comun.mjs';
import { decidirPartidos, proximos, revisarEvidencia, textosDe } from './partidos.mjs';
import { normalizarUrl } from '../lib/busqueda.mjs';
import { evidenciaParticipacion } from '../lib/evidencia.mjs';
import { resolverJugadora } from '../lib/nombres.mjs';
import { delCatalogo, fechasDeCatalogo, idTorneo, mismoTorneo, nombreCanonico, nombresDe } from '../lib/torneos.mjs';
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

const MEXICO = ['México', 'Mexico', 'MEX'];
const deSeleccion = (datos) => datos.partidos.partidos.filter((p) => p.tipo === 'seleccion');
const hastaVerificar = (ctx) => sumarDias(ctx.hoy, ctx.diasVerificar);

// ¿La Selección juega dentro de la ventana de verificación?
export const juegaPronto = (datos, ahora, hasta) => proximos(deSeleccion(datos), ahora, hasta).length > 0;

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

async function proximoTorneo(ctx, crudo, verificar, resultados = []) {
  const { seleccion } = ctx.datos;
  const guardado = seleccion.proximoTorneo;
  const yaTermino = guardado && (guardado.fechaFin ?? guardado.fechaInicio ?? ctx.hoy) < ctx.hoy;
  if (yaTermino) {
    seleccion.proximoTorneo = null;
    if (guardado.edicion) ctx.torneosDetectados.push({ nombre: guardado.nombre, edicion: guardado.edicion, fechaInicio: guardado.fechaInicio, fechaFin: guardado.fechaFin });
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
  // Como con los partidos: sin el texto de la fuente (modo simulado) no se coteja.
  const pagina = resultados.find((r) => normalizarUrl(r.url) === normalizarUrl(fuente));
  if (pagina && !evidenciaParticipacion(pagina, nombresDe(t.nombre), t.edicion)) {
    ctx.reporte.descarto(AGENTE, t.nombre, `${fuente} no dice que México (mayor femenil) participe o haya clasificado`);
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
  ctx.proximoHallado = seleccion.proximoTorneo; // manual.json puede ganarle: se compara al final
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
    if (ctx.soloVerificar && partido.inicio.slice(0, 10) > hastaVerificar(ctx)) continue;
    nuevos.push(partido);
    const sinHora = convertirSeleccion({ ...p, hora: null, fuente, convocadas }, torneoId, 'ia', ctx.ahora);
    revisiones.set(partido, revisarEvidencia(textos, p, partido, MEXICO, sinHora));
  }
  ctx.reporte.encontro(AGENTE, `${nuevos.length} partido(s) de la Selección`);
  return decidirPartidos(ctx, AGENTE, 'Selección', nuevos, deSeleccion(ctx.datos), 'America/Mexico_City', [...FEDERACIONES, 'volleybox.net'], revisiones, { textos, propio: MEXICO, hasta: hastaVerificar(ctx) });
}

// Si Gemini no trae las fechas de un torneo que ya conocemos, se usan las que tenemos.
function conFechas(t, conocidos) {
  if (!t?.nombre || (t.fechaInicio && t.fechaFin)) return t;
  const f = conocidos.find((c) => mismoTorneo({ nombre: t.nombre, edicion: t.edicion }, c)) ?? fechasDeCatalogo(t.nombre, t.edicion);
  return f ? { ...t, fechaInicio: t.fechaInicio ?? f.fechaInicio ?? null, fechaFin: t.fechaFin ?? f.fechaFin ?? null } : t;
}

async function torneos(ctx, lista, verificar, conocidos = []) {
  const { torneos: doc } = ctx.datos;
  const completos = (lista ?? []).map((t) => conFechas(t, [...conocidos, ...doc.torneos]));
  const terminados = validos(completos, esquemaTerminado, (x, motivo) => ctx.reporte.descarto(AGENTE, `${x?.nombre ?? 'torneo'} ${x?.edicion ?? ''}`.trim(), `formato inválido (${motivo})`));
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
  const porId = new Map();
  for (const t of ctx.torneosDetectados) {
    if (!delCatalogo(t.nombre) || t.edicion > anio || t.edicion < masViejo) continue;
    const id = idTorneo(t.nombre, t.edicion);
    if (doc.torneos.some((g) => mismoTorneo(g, t)) || reciente(id)) continue;
    const previo = porId.get(id);
    porId.set(id, { ...t, fechaInicio: t.fechaInicio ?? previo?.fechaInicio, fechaFin: t.fechaFin ?? previo?.fechaFin });
  }
  // Las fechas conocidas viajan en la clave: una tarea pendiente se puede correr hasta la semana siguiente.
  return [...porId.values()].slice(0, MAX_TORNEOS).map((t) => [nombreCanonico(t.nombre), t.edicion, ...(t.fechaFin ? [t.fechaInicio ?? '', t.fechaFin] : [])].join('|'));
}

async function revisarTorneo(ctx, clave) {
  const [nombre, edicion, fechaInicio, fechaFin] = clave.split('|');
  const torneo = { nombre, edicion: Number(edicion) };
  const entrada = { tarea: 'torneo', torneo, plantel: ctx.datos.jugadoras.filter((j) => j.estado !== 'exseleccionada').map((j) => j.nombre) };
  const { respuesta, verificar } = await consultar(ctx, AGENTE, clave, entrada, esquema, planTorneo(ctx, torneo));
  const lista = (respuesta.torneosTerminados ?? []).filter((t) => {
    const es = t?.nombre && mismoTorneo({ nombre: t.nombre, edicion: t.edicion }, torneo);
    if (!es) ctx.reporte.descarto(AGENTE, `${t?.nombre ?? 'torneo'} ${t?.edicion ?? ''}`.trim(), `se preguntó por ${nombre} ${edicion}`);
    return es;
  });
  if (lista.length === 0) ctx.reporte.noConfirmado(AGENTE, `${nombre} ${edicion}: ${respuesta.motivo ?? 'sin resultado en las fuentes'}`);
  await torneos(ctx, lista, verificar, fechaFin ? [{ ...torneo, fechaInicio: fechaInicio || null, fechaFin }] : []);
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
  const pronto = proximos(deSeleccion(datos), ctx.ahora, hastaVerificar(ctx));
  const { respuesta, verificar, resultados } = await consultar(ctx, AGENTE, null, entrada, esquema, planProximo(ctx, pronto));
  if (ctx.soloVerificar) {
    ctx.nuevos.seleccion = await partidos(ctx, respuesta, verificar, resultados);
    return;
  }
  const conocido = datos.seleccion.proximoTorneo;
  await proximoTorneo(ctx, respuesta.proximoTorneo, verificar, resultados);
  const nuevos = await partidos(ctx, respuesta, verificar, resultados);
  await torneos(ctx, respuesta.torneosTerminados, verificar, conocido ? [conocido] : []);
  ctx.torneosDetectados.push(...validos(respuesta.torneosMencionados, esquemaMencion, () => {}));
  datos.seleccion.revisado = ctx.hoy;
  ctx.nuevos.seleccion = nuevos;
}
