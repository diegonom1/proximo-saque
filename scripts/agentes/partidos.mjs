// Agente 03: partidos de un club.

import { z } from 'zod';
import { dominiosConfiables, planPartidos } from './busquedas.mjs';
import { consultar, sumarDias, textoN, validos } from './comun.mjs';
import { evidenciaPartido, fechasDeEquipo } from '../lib/evidencia.mjs';
import { normalizarUrl } from '../lib/busqueda.mjs';
import { esDominio } from '../lib/fuentes.mjs';
import { conMs, mismoCruce } from '../lib/fusion.mjs';
import { DURACION_MS, fechaEnZona } from '../lib/tiempo.mjs';
import { esquemaPartido, convertir, yaSeJugo } from '../lib/validar.mjs';

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

// Partidos guardados que faltan por jugarse y caen hasta el día `hasta`, inclusive.
export const proximos = (lista, ahora, hasta) => lista.map(conMs).filter((p) => p && p.ms + DURACION_MS > ahora && p.inicio.slice(0, 10) <= hasta);

// Clubes con algo por jugarse en la ventana de verificación.
export const clubesPorVerificar = (datos, aprobados, ahora, hasta) => clubesPorRevisar(datos, aprobados)
  .filter((id) => proximos(datos.partidos.partidos.filter((p) => p.clubId === id), ahora, hasta).length > 0);

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

const RANGO = { nada: 0, sinHora: 1, completa: 2 };

// Lo mejor que dicen las fuentes de un partido guardado. No depende de que Gemini lo haya reportado.
// Vale cualquiera de los dos equipos junto a la fecha y la hora: en una fuente en otro idioma quizá
// solo se reconozca uno (北京北冰洋 sí, "Tianjin Bohai Bank" no). Si una fila nombra a los dos, manda esa.
function evidenciaGuardado(p, textos, propio) {
  const dato = { fecha: p.inicio.slice(0, 10), hora: p.horaConfirmada ? p.inicio.slice(11, 16) : null };
  const rival = rivalDe(p);
  const consultas = [{ ...dato, rival, propio }, { ...dato, rival: propio, propio: rival }];
  return [...textos.values()].flatMap((t) => consultas.map((c) => evidenciaPartido(t, c)))
    .reduce((mejor, e) => (RANGO[e] > RANGO[mejor] ? e : mejor), 'nada');
}

// Vuelve a cotejar lo que está por jugarse aunque ya esté guardado. Solo informa: lo que no se confirma se conserva.
function verificarGuardados(ctx, agente, nombre, previos, reemplazados, { textos, propio, hasta }) {
  if (textos.size === 0) return; // sin texto de las fuentes no hay nada que cotejar
  for (const p of proximos(previos, ctx.ahora, hasta)) {
    if (reemplazados.has(p.id)) continue;
    const evidencia = evidenciaGuardado(p, textos, propio);
    const estado = evidencia === 'nada' ? 'noVerificado' : evidencia === 'completa' || !p.horaConfirmada ? 'verificado' : 'horaSinVerificar';
    ctx.reporte.verifico(agente, estado, `${nombre}: ${p.inicio.slice(0, 10)} ${horaDe(p)} vs ${rivalDe(p)}`);
  }
}

export const textosDe = (resultados = []) => new Map(resultados.map((r) => [normalizarUrl(r.url), r.contenido]));

// Un partido nuevo entra con cualquier fuente válida. Cambiar uno que ya existe exige la liga, el club o Volleybox.
// Y ninguno de los dos pasa si su fuente no muestra al rival y la fecha juntos (`revisiones`).
// `verificacion` ({ textos, propio, hasta }) vuelve a cotejar lo guardado que está por jugarse.
export function decidirPartidos(ctx, agente, nombre, nuevos, previosCrudos, zona, confiables, revisiones = new Map(), verificacion = null) {
  const previos = previosCrudos.map(conMs).filter(Boolean);
  const aceptados = [];
  const vistos = new Set();
  const reemplazados = new Set();
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
      if (tipo === 'cambia') reemplazados.add(previo.id);
    }
    anotar(n, horaDudosa ? `${resultado} (hora sin verificar)` : resultado, previo);
  }
  for (const p of previos) {
    if (vistos.has(p.id)) continue;
    ctx.comparacion?.push({ club: nombre, fecha: p.inicio.slice(0, 10), hora: horaDe(p), rival: rivalDe(p), fuente: p.fuente, resultado: 'Sin confirmar', guardado: 'ya estaba' });
  }
  if (verificacion) verificarGuardados(ctx, agente, nombre, previos, reemplazados, verificacion);
  return aceptados;
}

// Fechas que los calendarios muestran para el club entre `desde` y `hasta` y que la respuesta no trae.
export function fechasOmitidas(calendarios, propio, desde, hasta, reportadas) {
  const rango = new Map();
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) rango.set(d.slice(5), d);
  const vistas = new Set(reportadas.filter(Boolean).map((f) => f.slice(5)));
  const faltan = calendarios.flatMap((texto) => fechasDeEquipo(texto, propio))
    .map((fila) => fila.filter((f) => rango.has(f)))
    .filter((fila) => fila.length > 0 && !fila.some((f) => vistas.has(f)))
    .map(([f]) => rango.get(f));
  return [...new Set(faltan)].sort();
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
  const hastaVerificar = sumarDias(ctx.hoy, ctx.diasVerificar);
  const previos = datos.partidos.partidos.filter((p) => p.clubId === clubId);
  const textoPagina = await pagina(ctx, club);
  const entrada = {
    club: { id: clubId, nombre: club.nombre, alias: club.alias, liga: liga?.nombre ?? null, pais: club.pais, ciudad: club.ciudad, zona: club.zona, calendarioUrl: club.calendarioUrl },
    jugadoras: datos.jugadoras.filter((j) => j.clubId === clubId && j.estado === 'activa').map((j) => j.nombre),
    desde: ctx.hoy,
    hasta,
    conocidos: previos.filter((p) => p.inicio.slice(0, 10) <= hasta).map((p) => ({
      fecha: p.inicio.slice(0, 10), rival: p.nuestro === 'visita' ? p.local : p.visitante, hora: p.horaConfirmada ? p.inicio.slice(11, 16) : null,
    })),
    ...(textoPagina ? { textoPagina, urlPagina: club.calendarioUrl } : {}),
  };
  const { respuesta, verificar, resultados, repetir } = await consultar(ctx, AGENTE, clubId, entrada, esquema, planPartidos(ctx, club, liga, proximos(previos, ctx.ahora, hastaVerificar)));
  const textos = textosDe(resultados);
  if (textoPagina) textos.set(normalizarUrl(club.calendarioUrl), textoPagina);
  const revisiones = new Map();
  const propio = [club.nombre, ...club.alias];

  // Gemini a veces se queda en los partidos de `conocidos`: el calendario dice si le faltó alguno.
  const calendarios = [club.calendarioUrl, liga?.calendarioOficialUrl].map((u) => textos.get(normalizarUrl(u))).filter(Boolean);
  // Desde mañana: la fecha de hoy en una página suele ser la de una noticia, y esas nunca son futuras.
  const faltantes = () => fechasOmitidas(calendarios, propio, sumarDias(ctx.hoy, 1), hasta, (respuesta.partidos ?? []).map((p) => p?.fecha));
  if (faltantes().length > 0 && repetir) {
    try {
      const otra = await repetir({ fechasOmitidas: faltantes() });
      const vistas = new Set((respuesta.partidos ?? []).map((p) => p?.fecha));
      respuesta.partidos = [...(respuesta.partidos ?? []), ...(otra.partidos ?? []).filter((p) => !vistas.has(p?.fecha))];
    } catch (error) {
      ctx.reporte.descarto(AGENTE, `${club.nombre}: segunda lectura`, error.message.split('\n')[0]);
    }
  }
  for (const fecha of faltantes()) ctx.reporte.porRevisar(AGENTE, `${club.nombre}: el calendario muestra un partido el ${fecha} y Gemini no lo reportó`);

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
      if (yaSeJugo(convertir({ ...p, eliminar: true }, { id: clubId, ...club }, 'ia', ctx.ahora), ctx.ahora)) ctx.reporte.yaJugado(AGENTE, etiqueta);
      else ctx.reporte.descarto(AGENTE, etiqueta, 'fecha, zona horaria o equipos inválidos');
      continue;
    }
    if (ctx.soloVerificar && partido.inicio.slice(0, 10) > hasta) continue; // fuera de la ventana no se toca nada
    nuevos.push(partido);
    const sinHora = convertir({ ...p, hora: null, fuente, transmision }, { id: clubId, ...club }, 'ia', ctx.ahora);
    revisiones.set(partido, revisarEvidencia(textos, p, partido, propio, sinHora));
  }

  for (const n of respuesta.noEncontrados ?? []) ctx.reporte.noConfirmado(AGENTE, `${club.nombre}: ${n.rival} (${n.fecha}): ${n.motivo ?? 'no apareció en ninguna fuente'}`);

  const estado = respuesta.estadoTemporada;
  if (estado?.texto) {
    const fuente = await verificar(estado.fuente);
    if (fuente) datos.partidos.estados[clubId] = { texto: estado.texto, fuente, revisado: ctx.hoy };
    else ctx.reporte.descarto(AGENTE, `estado de ${club.nombre}`, 'sin fuente verificable');
  }

  ctx.reporte.encontro(AGENTE, `${club.nombre}: ${nuevos.length} partido(s)${respuesta.motivo ? ` (${respuesta.motivo})` : ''}`);
  ctx.nuevos[clubId] = decidirPartidos(ctx, AGENTE, club.nombre, nuevos, previos, club.zona, dominiosConfiables(club, liga, club.ligaId), revisiones, { textos, propio, hasta: hastaVerificar });
}
