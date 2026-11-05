// Agente 03: partidos de un club.

import { z } from 'zod';
import { dominiosConfiables, planPartidos } from './busquedas.mjs';
import { consultar, sumarDias, textoN, validos } from './comun.mjs';
import { evidenciaPartido } from '../lib/evidencia.mjs';
import { normalizarUrl } from '../lib/busqueda.mjs';
import { esDominio } from '../lib/fuentes.mjs';
import { conMs, mismoCruce } from '../lib/fusion.mjs';
import { fechaEnZona } from '../lib/tiempo.mjs';
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

// Compara un partido encontrado con los que ya hay: 'nuevo', 'coincide' o 'cambia'.
export function clasificar(nuevo, previos, zona) {
  const dia = (p) => fechaEnZona(p.ms, zona);
  const previo = previos.find((p) => dia(p) === dia(nuevo)) ?? previos.find((p) => mismoCruce(p, nuevo));
  if (!previo) return { tipo: 'nuevo', previo: null };
  if (!mismoCruce(previo, nuevo)) return { tipo: 'cambia', previo };
  // "Sin hora" no es un cambio: solo se sabe menos que antes.
  if (!nuevo.horaConfirmada && previo.horaConfirmada && dia(previo) === dia(nuevo)) return { tipo: 'coincide', previo };
  return { tipo: previo.ms === nuevo.ms ? 'coincide' : 'cambia', previo };
}

const rivalDe = (p) => (p.nuestro === 'visita' ? p.local : p.visitante);
const horaDe = (p) => (p.horaConfirmada ? p.inicio.slice(11, 16) : 'por confirmar');

// Coteja un partido con el texto de su fuente. Sin texto (modo simulado) no hay nada que cotejar.
export function revisarEvidencia(textos, crudo, partido, propio, sinHora) {
  const texto = textos.get(normalizarUrl(partido.fuente));
  if (!texto) return null;
  const evidencia = evidenciaPartido(texto, { fecha: crudo.fecha, hora: crudo.hora, rival: rivalDe(partido), propio });
  return { evidencia, sinHora };
}

export const textosDe = (resultados = []) => new Map(resultados.map((r) => [normalizarUrl(r.url), r.contenido]));

// Un partido nuevo entra con cualquier fuente válida. Cambiar uno que ya existe exige la liga, el club o Volleybox.
// Y ninguno de los dos pasa si su fuente no muestra al rival y la fecha juntos (`revisiones`).
export function decidirPartidos(ctx, agente, nombre, nuevos, previosCrudos, zona, confiables, revisiones = new Map()) {
  const previos = previosCrudos.map(conMs).filter(Boolean);
  const aceptados = [];
  const vistos = new Set();
  const anotar = (n, resultado, previo) => ctx.comparacion?.push({
    club: nombre, fecha: n.inicio.slice(0, 10), hora: horaDe(n), rival: rivalDe(n), fuente: n.fuente, resultado,
    guardado: previo ? `${previo.inicio.slice(0, 10)} ${horaDe(previo)} vs ${rivalDe(previo)}` : null,
  });
  for (const original of nuevos) {
    let n = original;
    let { tipo, previo } = clasificar(n, previos, zona);
    if (previo) vistos.add(previo.id);
    const revision = revisiones.get(original);
    let horaDudosa = false;
    if (tipo !== 'coincide' && revision?.evidencia === 'nada') {
      const motivo = `el rival y la fecha no aparecen juntos en ${n.fuente}`;
      if (previo) ctx.reporte.porRevisar(agente, `${nombre}: ${n.inicio.slice(0, 10)} vs ${rivalDe(n)}: ${motivo}`);
      else ctx.reporte.descarto(agente, `${nombre}: ${n.inicio.slice(0, 10)} vs ${rivalDe(n)}`, motivo);
      anotar(n, 'Sin evidencia', previo);
      continue;
    }
    if (tipo !== 'coincide' && revision?.evidencia === 'sinHora' && n.horaConfirmada && revision.sinHora) {
      // La hora no está junto al rival: vale la fecha y la hora queda por confirmar.
      ctx.reporte.noConfirmado(agente, `${nombre}: ${n.inicio.slice(0, 10)} vs ${rivalDe(n)}: la hora ${horaDe(n)} no aparece junto al rival`);
      n = revision.sinHora;
      horaDudosa = true;
      ({ tipo, previo } = clasificar(n, previos, zona));
    }
    const confiable = esDominio(n.fuente, confiables);
    let resultado = { nuevo: 'Nuevo', coincide: 'Coincide', cambia: 'Cambia' }[tipo];
    if (tipo === 'cambia' && !confiable) {
      resultado = 'Por revisar';
      ctx.reporte.porRevisar(agente, `${nombre}: ${previo.inicio.slice(0, 10)} ${horaDe(previo)} vs ${rivalDe(previo)} → ${n.inicio.slice(0, 10)} ${horaDe(n)} vs ${rivalDe(n)} (${n.fuente})`);
    } else if (!(tipo === 'coincide' && !n.horaConfirmada)) {
      aceptados.push(n);
    }
    anotar(n, horaDudosa ? `${resultado} (hora sin verificar)` : resultado, previo);
  }
  for (const p of previos) {
    if (vistos.has(p.id)) continue;
    ctx.comparacion?.push({ club: nombre, fecha: p.inicio.slice(0, 10), hora: horaDe(p), rival: rivalDe(p), fuente: p.fuente, resultado: 'Sin confirmar', guardado: 'ya estaba' });
  }
  return aceptados;
}

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
  const { respuesta, verificar, resultados } = await consultar(ctx, AGENTE, clubId, entrada, esquema, planPartidos(ctx, club, liga));
  const textos = textosDe(resultados);
  if (textoPagina) textos.set(normalizarUrl(club.calendarioUrl), textoPagina);
  const revisiones = new Map();

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
    const sinHora = convertir({ ...p, hora: null, fuente, transmision }, { id: clubId, ...club }, 'ia', ctx.ahora);
    revisiones.set(partido, revisarEvidencia(textos, p, partido, [club.nombre, ...club.alias], sinHora));
  }

  for (const n of respuesta.noEncontrados ?? []) ctx.reporte.noConfirmado(AGENTE, `${club.nombre}: ${n.rival} (${n.fecha}): ${n.motivo ?? 'no apareció en ninguna fuente'}`);

  const estado = respuesta.estadoTemporada;
  if (estado?.texto) {
    const fuente = await verificar(estado.fuente);
    if (fuente) datos.partidos.estados[clubId] = { texto: estado.texto, fuente, revisado: ctx.hoy };
    else ctx.reporte.descarto(AGENTE, `estado de ${club.nombre}`, 'sin fuente verificable');
  }

  ctx.reporte.encontro(AGENTE, `${club.nombre}: ${nuevos.length} partido(s)${respuesta.motivo ? ` (${respuesta.motivo})` : ''}`);
  const previos = datos.partidos.partidos.filter((p) => p.clubId === clubId);
  ctx.nuevos[clubId] = decidirPartidos(ctx, AGENTE, club.nombre, nuevos, previos, club.zona, dominiosConfiables(club, liga, club.ligaId), revisiones);
}
