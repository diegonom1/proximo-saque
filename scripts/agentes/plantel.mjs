// Agente 01: listas oficiales, altas y bajas. El agente reporta; estas reglas deciden.

import { z } from 'zod';
import { planPlantel } from './busquedas.mjs';
import { confianza, consultar, fechaN, proponer, restarMeses, textoN, validos } from './comun.mjs';
import { dominio } from '../lib/fuentes.mjs';
import { normal } from '../lib/fusion.mjs';
import { resolverJugadora, slugDe } from '../lib/nombres.mjs';

export const AGENTE = '01-plantel';

const OFICIALES = ['fmvb.org', 'norceca.net', 'norceca.info', 'fivb.com', 'fivb.org', 'volleyballworld.com', 'panamsports.org', 'centrocaribesports.org'];
const esOficial = (url) => OFICIALES.some((d) => dominio(url) === d || dominio(url)?.endsWith(`.${d}`));

const POSICIONES = ['Acomodadora', 'Opuesta', 'Atacante', 'Central', 'Líbero'];
const esquemaIntegrante = z.object({
  nombre: z.string().min(1),
  numero: z.number().int().nonnegative().nullable().optional(),
  posicion: z.enum(POSICIONES).nullable().optional(),
  capitana: z.boolean().nullable().optional(),
  club: textoN,
  slug: textoN,
});
const esquemaLista = z.object({
  torneo: z.string().min(1),
  tipo: z.enum(['torneo', 'convocatoria', 'amistoso']),
  fechaFin: z.iso.date(),
  fuente: textoN,
  completa: z.boolean().nullable().optional(),
  jugadoras: z.array(z.unknown()),
});
const esquemaAparicion = z.object({ slug: z.string(), torneo: z.string().min(1), fechaFin: z.iso.date(), fuente: textoN });
const esquemaBaja = z.object({
  slug: z.string(),
  tipo: z.enum(['retiro', 'anuncio-federacion', 'otra']),
  evidencia: textoN,
  fecha: fechaN,
  fuente: textoN,
  confianza,
});
const esquema = z.object({
  listas: z.array(z.unknown()).nullable().optional(),
  ultimasApariciones: z.array(z.unknown()).nullable().optional(),
  bajas: z.array(z.unknown()).nullable().optional(),
  entrenador: z.object({ nombre: textoN, fuente: textoN }).nullable().optional(),
  dudas: z.array(z.object({ nombre: textoN, motivo: textoN })).nullable().optional(),
});

const jugadoraNueva = (slug, i, lista, fuente) => ({
  slug,
  nombre: i.nombre,
  nombreCompleto: null,
  estado: 'propuesta',
  posicion: i.posicion ?? null,
  numero: i.numero ?? null,
  capitana: i.capitana ?? false,
  fechaNacimiento: null,
  origen: null,
  estaturaCm: null,
  clubId: null,
  historialClubes: [],
  redes: [],
  destacados: [],
  fotos: { foco: '50% 30%' },
  ultimaListaOficial: { torneo: lista.torneo, fecha: lista.fechaFin, fuente },
  fuentes: { numero: fuente, posicion: fuente },
  revisado: null,
});

function registrarLista(ctx, j, i, lista, fuente) {
  const masLargo = i.nombre.trim().split(/\s+/).length > j.nombre.trim().split(/\s+/).length;
  if (masLargo && proponer(ctx, AGENTE, { clave: `nombre:${j.slug}:${normal(i.nombre)}`, seccion: 'Perfiles', texto: `Se confirmó el nombre de ${j.nombre}: ${i.nombre}. Falta renombrar su slug y su carpeta de fotos.`, fuente })) {
    j.nombre = i.nombre;
  }
  if (!esOficial(fuente)) return;
  const previa = j.ultimaListaOficial?.fecha;
  if (previa && previa > lista.fechaFin) return;
  const igual = j.ultimaListaOficial?.torneo === lista.torneo && previa === lista.fechaFin && (i.numero ?? j.numero) === j.numero && (i.posicion ?? j.posicion) === j.posicion;
  if (igual && j.estado !== 'exseleccionada') return;
  if (!proponer(ctx, AGENTE, { clave: `lista:${j.slug}:${slugDe(lista.torneo)}`, seccion: j.estado === 'exseleccionada' ? 'Altas' : 'Perfiles', texto: `${j.nombre} aparece en ${lista.torneo}${j.estado === 'exseleccionada' ? ' y regresa a la plantilla' : ''}`, fuente })) return;
  j.ultimaListaOficial = { torneo: lista.torneo, fecha: lista.fechaFin, fuente };
  if (i.numero != null) {
    j.numero = i.numero;
    j.fuentes.numero = fuente;
  }
  if (i.posicion) {
    j.posicion = i.posicion;
    j.fuentes.posicion = fuente;
  }
  if (j.estado === 'exseleccionada') j.estado = 'activa';
}

function darDeAlta(ctx, i, lista, fuente) {
  const { jugadoras } = ctx.datos;
  if (!esOficial(fuente)) {
    ctx.reporte.descarto(AGENTE, `alta de ${i.nombre}`, `${dominio(fuente)} no es una fuente oficial`);
    return;
  }
  if (lista.fechaFin < restarMeses(ctx.hoy, 12)) {
    ctx.reporte.descarto(AGENTE, `alta de ${i.nombre}`, `la lista ${lista.torneo} tiene más de 12 meses`);
    return;
  }
  const slug = slugDe(i.nombre);
  if (jugadoras.some((j) => j.slug === slug)) {
    ctx.reporte.duda(`Ya existe el slug ${slug}; revisar a ${i.nombre}`, fuente);
    return;
  }
  if (!proponer(ctx, AGENTE, { clave: `alta:${slug}`, seccion: 'Altas', texto: `${i.nombre} (${lista.torneo})`, fuente })) return;
  jugadoras.push(jugadoraNueva(slug, i, lista, fuente));
  ctx.altas.push(slug);
}

async function procesarListas(ctx, crudas, verificar) {
  const listas = validos(crudas, esquemaLista, () => ctx.reporte.descarto(AGENTE, 'lista', 'formato inválido'))
    .filter((l) => l.fechaFin <= ctx.hoy)
    .sort((a, b) => a.fechaFin.localeCompare(b.fechaFin));
  for (const lista of listas) {
    const fuente = await verificar(lista.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, lista.torneo, lista.fuente ? `no se pudo verificar ${lista.fuente}` : 'sin fuente');
      continue;
    }
    const integrantes = validos(lista.jugadoras, esquemaIntegrante, () => ctx.reporte.descarto(AGENTE, lista.torneo, 'integrante inválido'));
    for (const i of integrantes) {
      const r = resolverJugadora(i.nombre, i.slug, ctx.datos.jugadoras);
      if (r.duda) ctx.reporte.duda(`${lista.torneo}: ${r.duda}`, fuente);
      else if (r.jugadora) registrarLista(ctx, r.jugadora, i, lista, fuente);
      else darDeAlta(ctx, i, lista, fuente);
    }
    ctx.reporte.encontro(AGENTE, `lista ${lista.torneo}: ${integrantes.length} jugadora(s)`);
  }
}

async function procesarApariciones(ctx, crudas, verificar) {
  for (const a of validos(crudas, esquemaAparicion, () => {})) {
    const j = ctx.datos.jugadoras.find((x) => x.slug === a.slug);
    const fuente = await verificar(a.fuente);
    if (!j || !fuente || !esOficial(fuente) || a.fechaFin > ctx.hoy) continue;
    const previa = j.ultimaListaOficial?.fecha;
    const nueva = !previa || previa < a.fechaFin;
    if (nueva && proponer(ctx, AGENTE, { clave: `lista:${j.slug}:${slugDe(a.torneo)}`, seccion: 'Perfiles', texto: `${j.nombre} aparece en ${a.torneo}`, fuente })) {
      j.ultimaListaOficial = { torneo: a.torneo, fecha: a.fechaFin, fuente };
    }
  }
}

// Una baja necesita anuncio explícito. Faltar a un torneo nunca es baja.
async function procesarBajas(ctx, crudas, verificar) {
  for (const b of validos(crudas, esquemaBaja, () => ctx.reporte.descarto(AGENTE, 'baja', 'formato inválido'))) {
    const j = ctx.datos.jugadoras.find((x) => x.slug === b.slug);
    const fuente = await verificar(b.fuente);
    if (!j) {
      ctx.reporte.descarto(AGENTE, `baja de ${b.slug}`, 'no está en la plantilla');
    } else if (!fuente || !b.evidencia?.trim()) {
      ctx.reporte.descarto(AGENTE, `baja de ${j.nombre}`, 'sin evidencia o sin fuente verificable');
    } else if (b.tipo === 'otra' || b.confianza === 'baja') {
      ctx.reporte.duda(`Posible baja de ${j.nombre}: ${b.evidencia}`, fuente);
    } else if (proponer(ctx, AGENTE, { clave: `baja:${j.slug}`, seccion: 'Bajas', texto: `${j.nombre}: ${b.evidencia}`, fuente })) {
      j.estado = 'exseleccionada';
    }
  }
}

function bajasPorInactividad(ctx) {
  const limite = restarMeses(ctx.hoy, 24);
  for (const j of ctx.datos.jugadoras) {
    const fecha = j.ultimaListaOficial?.fecha;
    // Sin fecha nunca hay baja por inactividad.
    if (j.estado === 'activa' && fecha && fecha < limite) {
      const texto = `${j.nombre}: 24 meses sin aparecer en listas oficiales (última: ${j.ultimaListaOficial.torneo})`;
      if (proponer(ctx, AGENTE, { clave: `baja:${j.slug}`, seccion: 'Bajas', texto })) j.estado = 'exseleccionada';
    }
  }
}

export async function correr(ctx) {
  const { datos } = ctx;
  const plantelActual = datos.jugadoras.filter((j) => j.estado !== 'exseleccionada').map((j) => ({
    slug: j.slug, nombre: j.nombre, ultimaLista: j.ultimaListaOficial?.torneo ?? null, fecha: j.ultimaListaOficial?.fecha ?? null,
  }));
  const listasConocidas = [...new Set(datos.jugadoras.flatMap((j) => (j.ultimaListaOficial ? [j.ultimaListaOficial.torneo] : [])))];
  const { respuesta, verificar } = await consultar(ctx, AGENTE, null, { plantelActual, listasConocidas }, esquema, planPlantel(ctx));

  await procesarListas(ctx, respuesta.listas, verificar);
  await procesarApariciones(ctx, respuesta.ultimasApariciones, verificar);
  await procesarBajas(ctx, respuesta.bajas, verificar);
  bajasPorInactividad(ctx);

  const { entrenador } = respuesta;
  if (entrenador?.nombre) {
    const fuente = await verificar(entrenador.fuente);
    if (fuente) datos.seleccion.entrenador = { nombre: entrenador.nombre, fuente };
    else ctx.reporte.descarto(AGENTE, 'entrenador', 'sin fuente verificable');
  }
  for (const d of respuesta.dudas ?? []) ctx.reporte.duda(`${d.nombre ?? 'Sin nombre'}: ${d.motivo ?? 'sin motivo'}`);
}
