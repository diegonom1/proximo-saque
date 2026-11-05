// Agente 02: ficha de una jugadora.

import { z } from 'zod';
import { planPerfil } from './busquedas.mjs';
import { confianza, consultar, proponer, textoN, validos } from './comun.mjs';
import { normal } from '../lib/fusion.mjs';
import { slugDe } from '../lib/nombres.mjs';
import { zonaValida } from '../lib/tiempo.mjs';

export const AGENTE = '02-perfil';

const POSICIONES = ['Acomodadora', 'Opuesta', 'Atacante', 'Central', 'Líbero'];
const REDES = ['instagram', 'tiktok', 'x', 'facebook', 'youtube'];
const campo = z.object({ valor: z.unknown(), fuente: textoN, confianza, motivo: textoN }).nullable().optional();
const esquema = z.object({
  slug: z.string(),
  nombreCompleto: campo,
  fechaNacimiento: campo,
  origen: campo,
  estaturaCm: campo,
  posicion: campo,
  club: campo,
  historialClubes: z.array(z.unknown()).nullable().optional(),
  redes: z.array(z.unknown()).nullable().optional(),
  destacados: z.array(z.unknown()).nullable().optional(),
  dudas: z.array(z.unknown()).nullable().optional(),
});
const esquemaOrigen = z.object({ ciudad: textoN, estado: textoN, pais: textoN });
const esquemaClub = z.object({ nombre: z.string().min(1), liga: textoN, pais: textoN, ciudad: textoN, zonaHoraria: textoN, sitio: textoN, volleybox: textoN });
const esquemaHistorial = z.object({ club: z.string().min(1), pais: textoN, temporada: textoN, fuente: z.string() });
const esquemaRed = z.object({ red: z.enum(REDES), url: z.url(), fuente: z.string() });
const esquemaDestacado = z.object({ texto: z.string().min(1), anio: z.number().int().nullable().optional(), fuente: z.string() });

const VALIDADORES = {
  nombreCompleto: (v) => (typeof v === 'string' && v.trim().length > 3 ? v.trim() : null),
  fechaNacimiento(v, ctx) {
    if (!z.iso.date().safeParse(v).success) return null;
    const edad = Number(ctx.hoy.slice(0, 4)) - Number(v.slice(0, 4));
    return edad >= 15 && edad <= 50 ? v : null; // fuera de eso casi seguro es otra persona
  },
  origen(v) {
    const r = esquemaOrigen.safeParse(v);
    if (!r.success || !(r.data.ciudad || r.data.estado || r.data.pais)) return null;
    return { ciudad: r.data.ciudad ?? null, estado: r.data.estado ?? null, pais: r.data.pais ?? null };
  },
  estaturaCm: (v) => (Number.isInteger(v) && v >= 150 && v <= 215 ? v : null),
  posicion: (v) => (POSICIONES.includes(v) ? v : null),
};

function buscarClub(clubes, nombre) {
  const n = normal(nombre);
  return Object.entries(clubes).find(([, c]) => [c.nombre, ...c.alias].some((a) => normal(a) === n))?.[0] ?? null;
}

function buscarLiga(ligas, nombre) {
  const n = normal(nombre ?? '');
  return Object.entries(ligas).find(([, l]) => normal(l.nombre) === n)?.[0] ?? null;
}

function crearClub(ctx, valor) {
  const { clubes, ligas } = ctx.datos;
  let ligaId = buscarLiga(ligas, valor.liga);
  if (!ligaId && valor.liga) {
    ligaId = slugDe(`${valor.liga} ${valor.pais ?? ''}`);
    ligas[ligaId] = { nombre: valor.liga, pais: valor.pais ?? null, temporada: null, calendarioOficialUrl: null, plataformas: [], revisado: null };
  }
  const id = slugDe(valor.nombre);
  clubes[id] = {
    nombre: valor.nombre,
    alias: [],
    ligaId,
    pais: valor.pais ?? null,
    ciudad: valor.ciudad ?? null,
    zona: valor.zonaHoraria,
    volleybox: { url: valor.volleybox ?? null, widgetId: null },
    sitio: valor.sitio ?? null,
    calendarioUrl: null,
  };
  return id;
}

async function cambiarClub(ctx, j, c, verificar) {
  if (!c?.valor) return false;
  const r = esquemaClub.safeParse(c.valor);
  const fuente = await verificar(c.fuente);
  if (!r.success || !fuente) {
    ctx.reporte.descarto(AGENTE, `club de ${j.nombre}`, !r.success ? 'formato inválido' : 'sin fuente verificable');
    return false;
  }
  const valor = r.data;
  const id = buscarClub(ctx.datos.clubes, valor.nombre);
  if (id === j.clubId) return false;
  if (c.confianza === 'baja') {
    ctx.reporte.duda(`Posible cambio de club de ${j.nombre}: ${valor.nombre}`, fuente);
    return false;
  }
  if (!id && !zonaValida(valor.zonaHoraria)) {
    ctx.reporte.duda(`${j.nombre} estaría en ${valor.nombre}, pero falta su zona horaria`, fuente);
    return false;
  }
  const antes = j.clubId ? ctx.datos.clubes[j.clubId]?.nombre : 'sin club';
  if (!proponer(ctx, AGENTE, { clave: `club:${j.slug}:${normal(valor.nombre)}`, seccion: 'Cambios de club', texto: `${j.nombre}: ${antes} → ${valor.nombre}`, fuente })) return false;
  j.clubId = id ?? crearClub(ctx, valor);
  j.fuentes.clubId = fuente;
  return true;
}

// Agrega a una lista lo que trae el agente; lo que ya estaba se conserva.
async function agregar(ctx, j, { actual, nuevos, tipo, claveDe, etiqueta, formar, verificar }) {
  const lista = [...actual];
  let agregados = 0;
  for (const x of nuevos) {
    const clave = claveDe(x);
    if (actual.some((a) => claveDe(a) === clave)) continue;
    const fuente = await verificar(x.fuente);
    if (!fuente) ctx.reporte.descarto(AGENTE, `${tipo} de ${j.nombre}`, `la fuente no pasó (${x.fuente})`);
    if (fuente && proponer(ctx, AGENTE, { clave: `perfil:${j.slug}:${tipo}:${clave}`, seccion: 'Perfiles', texto: `${j.nombre}: ${etiqueta(x)}`, fuente })) {
      lista.push(formar({ ...x, fuente }));
      agregados += 1;
    }
  }
  return { lista, agregados };
}

export async function correr(ctx, slug) {
  const j = ctx.datos.jugadoras.find((x) => x.slug === slug);
  if (!j) throw new Error(`no existe ${slug}`);
  const club = j.clubId ? ctx.datos.clubes[j.clubId] : null;
  const campos = ['nombreCompleto', 'fechaNacimiento', 'origen', 'estaturaCm'];
  const entrada = {
    jugadora: { slug, nombre: j.nombre, posicion: j.posicion, club: club ? `${club.nombre} (${club.pais})` : null },
    conocido: {
      ...(club && j.fuentes.clubId ? { club: { valor: club.nombre, fuente: j.fuentes.clubId } } : {}),
      ...Object.fromEntries(campos.filter((c) => j[c] !== null).map((c) => [c, { valor: j[c], fuente: j.fuentes[c] ?? null }])),
    },
    faltan: [...campos.filter((c) => j[c] === null), ...(club ? [] : ['club']), 'historialClubes', 'redes', 'destacados'],
  };
  const { respuesta, verificar } = await consultar(ctx, AGENTE, slug, entrada, esquema, planPerfil(ctx, j, club));
  if (respuesta.slug !== slug) throw new Error(`la respuesta es de ${respuesta.slug}, no de ${slug}`);

  let datosNuevos = 0;
  for (const [nombre, validar] of Object.entries(VALIDADORES)) {
    const c = respuesta[nombre];
    if (c?.valor == null) continue;
    const valor = validar(c.valor, ctx);
    const fuente = await verificar(c.fuente);
    if (valor === null || !fuente) {
      ctx.reporte.descarto(AGENTE, `${nombre} de ${j.nombre}`, valor === null ? 'valor inválido' : `la fuente no pasó (${c.fuente ?? 'sin fuente'})`);
      continue;
    }
    if (JSON.stringify(valor) === JSON.stringify(j[nombre])) continue;
    const texto = `${j.nombre}: ${nombre} ${typeof valor === 'object' ? JSON.stringify(valor) : valor}`;
    if (!proponer(ctx, AGENTE, { clave: `perfil:${slug}:${nombre}:${JSON.stringify(valor)}`, seccion: 'Perfiles', texto, fuente })) continue;
    j[nombre] = valor;
    j.fuentes[nombre] = fuente;
    datosNuevos += 1;
  }
  if (await cambiarClub(ctx, j, respuesta.club, verificar)) datosNuevos += 1;

  const descartar = (etiqueta) => (x, motivo) => ctx.reporte.descarto(AGENTE, `${etiqueta} de ${j.nombre}`, `formato inválido (${motivo})`);
  const historial = await agregar(ctx, j, {
    actual: j.historialClubes,
    nuevos: validos(respuesta.historialClubes, esquemaHistorial, descartar('club')),
    tipo: 'club',
    claveDe: (h) => `${normal(h.club)}|${h.temporada ?? ''}`,
    etiqueta: (h) => `club ${h.club} (${h.temporada ?? 'temporada por confirmar'})`,
    formar: (h) => ({ club: h.club, pais: h.pais ?? null, temporada: h.temporada ?? null, fuente: h.fuente }),
    verificar,
  });
  // Una entrada sin temporada es la misma que la que ya trae temporada.
  j.historialClubes = historial.lista.filter((h, _, todos) => h.temporada || !todos.some((o) => o.temporada && normal(o.club) === normal(h.club)));
  const redes = await agregar(ctx, j, {
    actual: j.redes,
    nuevos: validos(respuesta.redes, esquemaRed, descartar('red')),
    tipo: 'red',
    claveDe: (r) => r.url,
    etiqueta: (r) => `${r.red} ${r.url}`,
    formar: (r) => r,
    verificar,
  });
  j.redes = redes.lista;
  const destacados = await agregar(ctx, j, {
    actual: j.destacados,
    nuevos: validos(respuesta.destacados, esquemaDestacado, descartar('destacado')),
    tipo: 'destacado',
    claveDe: (d) => normal(d.texto),
    etiqueta: (d) => d.texto,
    formar: (d) => ({ texto: d.texto, anio: d.anio ?? null, fuente: d.fuente }),
    verificar,
  });
  j.destacados = destacados.lista.slice(0, 6);
  datosNuevos += historial.agregados + redes.agregados + destacados.agregados;

  for (const d of respuesta.dudas ?? []) ctx.reporte.duda(`${j.nombre}: ${typeof d === 'string' ? d : JSON.stringify(d)}`);
  // `revisado` solo cambia si hubo novedades: si no, cada corrida abriría un PR sin nada que revisar.
  if (datosNuevos > 0) j.revisado = ctx.hoy;
  ctx.datos.estado.revisado[`perfil:${slug}`] = ctx.hoy;
  ctx.reporte.encontro(AGENTE, `${j.nombre}: ${datosNuevos} dato(s) verificado(s)`);
}

// Altas nuevas primero; luego las 4 con revisión más vieja. La fecha sale de estado-agentes.json,
// que se guarda directo: si un PR tarda en aprobarse, la rotación sigue avanzando.
export function porRevisar(jugadoras, altas, revisado) {
  const fecha = (j) => revisado[`perfil:${j.slug}`] ?? j.revisado ?? '';
  const viejas = jugadoras
    .filter((j) => j.estado === 'activa' && !altas.includes(j.slug))
    .sort((a, b) => fecha(a).localeCompare(fecha(b)))
    .slice(0, 4)
    .map((j) => j.slug);
  return [...altas, ...viejas];
}
