// Agente 03: partidos de un club.

import { z } from 'zod';
import { planPartidos } from './busquedas.mjs';
import { consultar, sumarDias, textoN, validos } from './comun.mjs';
import { esquemaPartido, convertir } from '../lib/validar.mjs';

export const AGENTE = '03-partidos-club';

const esquema = z.object({
  clubId: textoN,
  partidos: z.array(z.unknown()).nullable().optional(),
  noEncontrados: z.array(z.object({ fecha: textoN, rival: textoN, motivo: textoN })).nullable().optional(),
  estadoTemporada: z.object({ texto: textoN, fuente: textoN }).nullable().optional(),
  motivo: textoN,
});
const esquemaTransmision = z.object({ nombre: z.string().min(1), url: z.url(), fuente: z.string() });

// Clubes con seleccionadas activas y ya aprobados: partidos.json se guarda directo y clubes.json va por
// PR, así que un club recién encontrado empieza a tener partidos cuando el PR se aprueba.
export const clubesPorRevisar = (datos, aprobados) => [...new Set(datos.jugadoras.flatMap((j) => (j.estado === 'activa' && aprobados.has(j.clubId) ? [j.clubId] : [])))];

async function pagina(ctx, club) {
  if (!club.calendarioUrl || !ctx.leerPagina) return null;
  try {
    return await ctx.leerPagina(club.calendarioUrl);
  } catch (error) {
    ctx.reporte.descarto(AGENTE, club.nombre, `no pude leer ${club.calendarioUrl}: ${error.message}; se usa la búsqueda`);
    return null;
  }
}

export async function correr(ctx, clubId) {
  const { datos } = ctx;
  const club = datos.clubes[clubId];
  if (!club) throw new Error(`no existe el club ${clubId}`);
  const liga = club.ligaId ? datos.ligas[club.ligaId] : null;
  const hasta = sumarDias(ctx.hoy, ctx.diasAdelante);
  const textoPagina = await pagina(ctx, club);
  const entrada = {
    club: { id: clubId, nombre: club.nombre, alias: club.alias, liga: liga?.nombre ?? null, pais: club.pais, ciudad: club.ciudad, zona: club.zona, calendarioUrl: club.calendarioUrl },
    jugadoras: datos.jugadoras.filter((j) => j.clubId === clubId && j.estado === 'activa').map((j) => j.nombre),
    desde: ctx.hoy,
    hasta,
    conocidos: datos.partidos.partidos.filter((p) => p.clubId === clubId).map((p) => ({
      fecha: p.inicio.slice(0, 10), rival: p.nuestro === 'visita' ? p.local : p.visitante, hora: p.horaConfirmada ? p.inicio.slice(11, 16) : null,
    })),
    ...(textoPagina ? { textoPagina, urlPagina: club.calendarioUrl } : {}),
  };
  const { respuesta, verificar } = await consultar(ctx, AGENTE, clubId, entrada, esquema, planPartidos(ctx, club, liga));

  const nuevos = [];
  for (const p of respuesta.partidos ?? []) {
    const etiqueta = `${club.nombre}: ${p?.local} vs ${p?.visitante} (${p?.fecha})`;
    // El calendario que descargó el programa ya está verificado.
    const fuente = textoPagina && p?.fuente === club.calendarioUrl ? p.fuente : await verificar(p?.fuente);
    if (!fuente) {
      ctx.reporte.descarto(AGENTE, etiqueta, p?.fuente ? `no se pudo verificar ${p.fuente}` : 'sin fuente');
      continue;
    }
    const transmision = [];
    for (const t of validos(p.transmision, esquemaTransmision, () => {})) {
      const url = await verificar(t.fuente);
      if (url) transmision.push({ ...t, fuente: url });
    }
    const partido = convertir({ ...p, fuente, transmision }, { id: clubId, ...club }, 'ia', ctx.ahora);
    if (!partido || !esquemaPartido.safeParse({ ...partido }).success) {
      ctx.reporte.descarto(AGENTE, etiqueta, 'fecha, zona horaria o equipos inválidos');
      continue;
    }
    nuevos.push(partido);
  }

  for (const n of respuesta.noEncontrados ?? []) ctx.reporte.descarto(AGENTE, `${club.nombre}: ${n.rival} (${n.fecha})`, n.motivo ?? 'no apareció en ninguna fuente');

  const estado = respuesta.estadoTemporada;
  if (estado?.texto) {
    const fuente = await verificar(estado.fuente);
    if (fuente) datos.partidos.estados[clubId] = { texto: estado.texto, fuente, revisado: ctx.hoy };
    else ctx.reporte.descarto(AGENTE, `estado de ${club.nombre}`, 'sin fuente verificable');
  }

  ctx.reporte.encontro(AGENTE, `${club.nombre}: ${nuevos.length} partido(s)${respuesta.motivo ? ` (${respuesta.motivo})` : ''}`);
  ctx.nuevos[clubId] = nuevos;
}
