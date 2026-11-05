#!/usr/bin/env node
// Orquestador semanal. Los agentes buscan; este programa decide qué se guarda.
//
// Variables de entorno:
//   GEMINI_API_KEY   clave de Google AI Studio. Sin ella solo limpia partidos pasados y aplica manual.json.
//   GEMINI_MODELOS   modelos separados por comas (ver MODELOS_DEFECTO).
//   BUSQUEDA         tavily (por defecto): busca el código y Gemini solo extrae.
//                    google: Gemini busca con google_search; necesita facturación activa.
//   TAVILY_API_KEY   clave de Tavily.
//   MAX_LLAMADAS     presupuesto por corrida (por defecto 20).
//   DIAS_ADELANTE    días hacia adelante para buscar partidos (por defecto 45).
//   IA_SIMULADA      carpeta con respuestas guardadas; no gasta llamadas ni usa la red.
//   PR_ESTADO        OPEN, MERGED o CLOSED: cómo quedó el último PR de revisión (lo da el workflow).
//   DIR_APROBADOS    carpeta con los datos de main. Hace falta si se parte de la rama del PR.
// Opción --seco: corre todo y muestra el resumen, pero no escribe nada.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as donde from './donde-ver.mjs';
import * as partidos from './partidos.mjs';
import * as perfil from './perfil.mjs';
import * as plantel from './plantel.mjs';
import * as rankings from './rankings.mjs';
import { crearReporte } from './reporte.mjs';
import * as seleccion from './seleccion.mjs';
import { crearBuscadorTavily } from '../lib/busqueda.mjs';
import { crearVerificador, textoDePagina } from '../lib/fuentes.mjs';
import { conMs, fusionar } from '../lib/fusion.mjs';
import { crearClienteGemini, crearClienteSimulado } from '../lib/gemini.mjs';
import { DURACION_MS, ZONA_SITIO, fechaEnZona, isoEnZona } from '../lib/tiempo.mjs';
import { convertir, convertirSeleccion, esquemaEstadoAgentes, esquemaManual, esquemaPartido, validarDatos } from '../lib/validar.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const MODELOS_DEFECTO = 'gemini-3.8-flash,gemini-3.5-flash,gemini-3.1-flash-lite';

const ARCHIVOS = {
  jugadoras: 'jugadoras.json',
  clubes: 'clubes.json',
  ligas: 'ligas.json',
  partidos: 'partidos.json',
  seleccion: 'seleccion.json',
  torneos: 'torneos.json',
  rankings: 'rankings.json',
  estado: 'estado-agentes.json',
};
// Estos cambios van a Pull Request; los demás se guardan directo.
export const ARCHIVOS_PR = ['jugadoras.json', 'clubes.json', 'ligas.json', 'torneos.json'];

const MODULOS = {
  [rankings.AGENTE]: rankings,
  [seleccion.AGENTE]: seleccion,
  [plantel.AGENTE]: plantel,
  [perfil.AGENTE]: perfil,
  [partidos.AGENTE]: partidos,
  [donde.AGENTE]: donde,
};

const leerJSON = async (dir, archivo) => JSON.parse(await readFile(join(dir, archivo), 'utf8'));
const aJSON = (datos) => `${JSON.stringify(datos, null, 2)}\n`;

async function cargar(dir) {
  const crudos = Object.fromEntries(await Promise.all(Object.entries(ARCHIVOS).map(async ([k, a]) => [k, await leerJSON(dir, a)])));
  const manual = esquemaManual.parse(await leerJSON(dir, 'manual.json'));
  return { datos: { ...validarDatos(crudos), estado: esquemaEstadoAgentes.parse(crudos.estado) }, manual, crudos };
}

// Una alta llega como `propuesta` por Pull Request: si ya está en main, el PR se aprobó.
function aprobarPropuestas(datos) {
  for (const j of datos.jugadoras) if (j.estado === 'propuesta') j.estado = 'activa';
}

// Lo que le pasó al último PR. Abierto: se sigue acumulando. Aprobado: ya está en main.
// Cerrado sin aprobar: se recuerda con su evidencia para no volver a proponerlo.
export function atenderPr(estado, prEstado, hoy) {
  if (prEstado === 'CLOSED') {
    for (const p of estado.propuestas) {
      const rechazo = estado.rechazos.find((r) => r.clave === p.clave);
      if (rechazo) {
        if (p.fuente && !rechazo.evidencias.includes(p.fuente)) rechazo.evidencias.push(p.fuente);
        rechazo.fecha = hoy;
      } else {
        estado.rechazos.push({ clave: p.clave, texto: p.texto, evidencias: p.fuente ? [p.fuente] : [], fecha: hoy });
      }
    }
  }
  if (prEstado === 'CLOSED' || prEstado === 'MERGED') estado.propuestas = [];
}

function ejecutorDe(ctx, maximo, reporte) {
  const hechas = new Set();
  const pendientes = [];
  const estado = { llamadas: 0 };

  async function ejecutar(agente, clave = null) {
    const id = `${agente}|${clave}`;
    if (hechas.has(id)) return;
    hechas.add(id);
    if (estado.llamadas >= maximo || estado.sinCuota) {
      pendientes.push({ agente, clave });
      return;
    }
    estado.llamadas += 1;
    const respaldo = structuredClone(ctx.datos);
    const altas = [...ctx.altas];
    const marca = reporte.marca();
    try {
      await MODULOS[agente].correr(ctx, clave);
      const { estado: _, ...resto } = ctx.datos;
      validarDatos(resto);
      esquemaEstadoAgentes.parse(ctx.datos.estado);
    } catch (error) {
      // Sin datos a medias: todo lo que hizo esta tarea se deshace.
      ctx.datos = respaldo;
      ctx.altas = altas;
      delete ctx.nuevos[clave ?? 'seleccion'];
      reporte.volver(marca);
      reporte.fallo(agente, `${clave ? `${clave}: ` : ''}${error.message.split('\n')[0]}`);
      // Sin cuota, las demás llamadas fallarían igual: se dejan para la siguiente corrida.
      if (error.sinCuota) {
        estado.sinCuota = true;
        pendientes.push({ agente, clave });
      }
    }
  }
  return { ejecutar, pendientes, estado };
}

// Fusiona lo nuevo con lo que había y aplica manual.json; el resultado es partidos.json.
function reconstruirPartidos(ctx, manual) {
  const { datos, ahora, reporte } = ctx;
  const vivos = datos.partidos.partidos.map(conMs).filter((p) => p && p.ms + DURACION_MS > ahora);
  const manuales = manual.partidos.flatMap((m) => {
    const club = datos.clubes[m.clubId];
    const convertido = m.tipo === 'seleccion' ? convertirSeleccion(m, m.torneoId ?? null, 'manual', ahora) : club && convertir(m, { id: m.clubId, ...club }, 'manual', ahora);
    if (!convertido) reporte.descarto('manual.json', JSON.stringify(m).slice(0, 80), 'no se pudo leer');
    return convertido ? [convertido] : [];
  });

  const entidades = [
    { id: 'seleccion', zona: ZONA_SITIO, es: (p) => p.tipo === 'seleccion' },
    ...Object.entries(datos.clubes).map(([id, c]) => ({ id, zona: c.zona, es: (p) => p.clubId === id })),
  ];
  const todos = entidades.flatMap(({ id, zona, es }) => fusionar(
    { id, zona },
    vivos.filter((p) => es(p) && p.origen !== 'manual'),
    ctx.nuevos[id] ?? [],
    manuales.filter(es),
  ));
  todos.sort((a, b) => a.ms - b.ms);
  datos.partidos.partidos = todos.map(({ eliminar, ...p }) => esquemaPartido.parse(p));
}

function aplicarManualJugadoras(ctx, manual) {
  for (const [slug, campos] of Object.entries(manual.jugadoras)) {
    const j = ctx.datos.jugadoras.find((x) => x.slug === slug);
    if (j) Object.assign(j, campos);
    else ctx.reporte.descarto('manual.json', slug, 'esa jugadora no existe');
  }
}

async function escribir(dir, datos, crudos, seco) {
  const cambiados = [];
  for (const [clave, archivo] of Object.entries(ARCHIVOS)) {
    const texto = aJSON(datos[clave]);
    if (texto === aJSON(crudos[clave])) continue;
    cambiados.push(archivo);
    if (!seco) await writeFile(join(dir, archivo), texto);
  }
  return cambiados;
}

// Lo que se guarda directo tiene que funcionar con lo que ya está aprobado en main.
function validarContraAprobados(datos, aprobados) {
  validarDatos({ ...aprobados, partidos: datos.partidos, seleccion: datos.seleccion, rankings: datos.rankings });
}

export async function correr({
  dirDatos, dirFotos, llamar, verificar, buscador = null, leerPagina = null, ahora = Date.now(), maxLlamadas = 20, diasAdelante = 45, seco = false, modo = 'real',
  prEstado = null, dirAprobados = dirDatos,
}) {
  const { datos, manual, crudos } = await cargar(dirDatos);
  const archivosAprobados = Object.fromEntries(await Promise.all(['jugadoras', 'clubes', 'ligas', 'torneos'].map(async (k) => [k, await leerJSON(dirAprobados, ARCHIVOS[k])])));
  const reporte = crearReporte();
  const hoy = fechaEnZona(ahora, ZONA_SITIO);
  const aprobados = { clubes: new Set(Object.keys(archivosAprobados.clubes)), jugadoras: new Set(archivosAprobados.jugadoras.map((j) => j.slug)) };
  const ctx = { datos, manual, llamar, verificar, buscador, leerPagina, ahora, hoy, diasAdelante, reporte, aprobados, altas: [], nuevos: {} };
  atenderPr(ctx.datos.estado, prEstado, hoy);
  // Con el PR abierto, una `propuesta` todavía no está aprobada.
  if (prEstado !== 'OPEN') aprobarPropuestas(ctx.datos);

  const previos = ctx.datos.estado.pendientes;
  const { ejecutar, pendientes, estado } = ejecutorDe(ctx, maxLlamadas, reporte);

  if (llamar) {
    // Lo que no cupo la semana pasada va primero.
    for (const { agente, clave } of previos) if (MODULOS[agente]) await ejecutar(agente, clave);
    await ejecutar(rankings.AGENTE);
    await ejecutar(seleccion.AGENTE);
    await ejecutar(plantel.AGENTE);
    for (const slug of perfil.porRevisar(ctx.datos.jugadoras, ctx.altas, ctx.datos.estado.revisado)) await ejecutar(perfil.AGENTE, slug);
    for (const club of partidos.clubesPorRevisar(ctx.datos, aprobados.clubes)) await ejecutar(partidos.AGENTE, club);
    for (const id of donde.porRevisar(ctx.datos, hoy)) await ejecutar(donde.AGENTE, id);
  }

  reconstruirPartidos(ctx, manual);
  aplicarManualJugadoras(ctx, manual);

  const { estado: _, ...resto } = ctx.datos;
  validarDatos(resto);
  validarContraAprobados(ctx.datos, archivosAprobados);

  const marcaDeTiempo = isoEnZona(ahora, ZONA_SITIO);
  ctx.datos.partidos.actualizado = marcaDeTiempo;
  ctx.datos.estado.ultimaCorrida = marcaDeTiempo;
  ctx.datos.estado.pendientes = pendientes;

  const cambiados = await escribir(dirDatos, ctx.datos, crudos, seco);
  if (!seco) {
    for (const slug of ctx.altas) {
      const carpeta = join(dirFotos, 'jugadoras', slug);
      await mkdir(carpeta, { recursive: true });
      await writeFile(join(carpeta, '.gitkeep'), '');
    }
  }
  const busqueda = buscador ? await buscador.resumen() : null;
  return {
    cambiados,
    pendientes,
    busqueda,
    llamadas: estado.llamadas,
    altas: ctx.altas,
    reporte,
    resumen: reporte.resumen({ modo, llamadas: estado.llamadas, maximo: maxLlamadas, pendientes, busqueda }),
    cuerpoPr: reporte.cuerpoPr(ctx.datos.estado.propuestas),
    hayPr: ctx.datos.estado.propuestas.length > 0 || cambiados.some((a) => ARCHIVOS_PR.includes(a)),
  };
}

async function main() {
  const seco = process.argv.includes('--seco');
  const simulada = process.env.IA_SIMULADA;
  const clave = process.env.GEMINI_API_KEY;
  const ahora = Date.now();
  const hoy = fechaEnZona(ahora, ZONA_SITIO);
  const dirAgentes = join(RAIZ, 'agentes');

  let llamar = null;
  let buscador = null;
  let modo = 'sin IA';
  if (simulada) {
    llamar = crearClienteSimulado(join(process.cwd(), simulada), hoy);
    modo = 'simulado';
  } else if (clave) {
    const modelos = (process.env.GEMINI_MODELOS || MODELOS_DEFECTO).split(',').map((m) => m.trim()).filter(Boolean);
    const proveedor = process.env.BUSQUEDA || 'tavily';
    if (!['tavily', 'google'].includes(proveedor)) throw new Error(`BUSQUEDA debe ser tavily o google, no ${proveedor}`);
    llamar = crearClienteGemini({ clave, modelos, hoy, dirAgentes });
    if (proveedor === 'tavily') buscador = crearBuscadorTavily({ clave: process.env.TAVILY_API_KEY });
    modo = `Gemini (${modelos.join(', ')}) · búsqueda: ${proveedor}`;
  } else {
    console.log('Sin GEMINI_API_KEY: solo limpio partidos pasados y aplico data/manual.json.');
  }

  const r = await correr({
    dirDatos: join(RAIZ, 'data'),
    dirFotos: join(RAIZ, 'src/assets/fotos'),
    llamar,
    verificar: crearVerificador({ red: !simulada }),
    buscador,
    // Con Tavily las páginas se leen con extract.
    leerPagina: simulada || buscador ? null : textoDePagina,
    ahora,
    maxLlamadas: Number(process.env.MAX_LLAMADAS || 20),
    diasAdelante: Number(process.env.DIAS_ADELANTE || 45),
    seco,
    modo,
    prEstado: process.env.PR_ESTADO || null,
    dirAprobados: process.env.DIR_APROBADOS || undefined,
  });

  console.log(r.resumen);
  console.log(`Archivos con cambios${seco ? ' (no se escribieron)' : ''}: ${r.cambiados.join(', ') || 'ninguno'}`);
  if (!seco) await writeFile(join(RAIZ, 'revision-semanal.md'), r.cuerpoPr);
  if (r.hayPr) console.log(`\n${r.cuerpoPr}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, r.resumen);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
