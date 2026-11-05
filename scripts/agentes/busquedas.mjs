// Qué busca cada agente. Son las búsquedas que describen los archivos de agentes/, escritas en código.

import { dominio } from '../lib/fuentes.mjs';
import { mencionaA } from '../lib/nombres.mjs';
import { mismoTorneo } from '../lib/torneos.mjs';

export const FEDERACIONES = ['fmvb.org', 'norceca.net', 'norceca.info', 'fivb.com', 'volleyballworld.com'];
const anio = (ctx) => Number(ctx.hoy.slice(0, 4));

export const planRankings = () => ({
  consultas: [
    { texto: 'FIVB women volleyball world ranking Mexico points', dominios: ['volleyballworld.com', 'fivb.com'] },
    { texto: 'NORCECA women senior ranking Mexico', dominios: ['norceca.net', 'norceca.info'] },
  ],
  paginas: ['https://en.volleyballworld.com/volleyball/world-ranking/women', 'https://www.fivb.com/volleyball/rankings/senior-world-ranking-women/', 'https://www.fmvb.org/femenil-mayor'],
  intencion: 'Mexico women volleyball world ranking position points',
  avanzado: true, // el ranking es una tabla; una vez al mes se puede pagar la lectura completa
});

// Lo que el agente 04 debería tener ya; solo se busca lo que falta en torneos.json.
function torneosPendientes(ctx) {
  const a = anio(ctx);
  return [
    { nombre: 'Juegos Centroamericanos y del Caribe', edicion: a },
    { nombre: 'Copa Panamericana', edicion: a },
    { nombre: 'Copa Panamericana', edicion: a - 1 },
    { nombre: 'NORCECA Final Six', edicion: a - 1 },
    { nombre: 'Campeonato Mundial', edicion: a - 1 },
  ].filter((t) => !ctx.datos.torneos.torneos.some((g) => mismoTorneo(g, t)));
}

export const planSeleccion = (ctx) => ({
  consultas: [
    { texto: `Selección Mexicana voleibol femenil mayor próximo torneo ${anio(ctx) + 1}`, dominios: FEDERACIONES },
    { texto: `NORCECA calendar of competitions ${anio(ctx) + 1} women senior hosts`, dominios: ['norceca.net', 'norceca.info'] },
    { texto: 'Lima 2027 Juegos Panamericanos voleibol femenino clasificación México' },
    ...torneosPendientes(ctx).map((t) => ({ texto: `${t.nombre} ${t.edicion} voleibol femenil México resultado lugar final` })),
  ],
  mejores: 4,
  intencion: 'México selección femenil voleibol torneo fechas sede resultado lugar',
});

const consultaListas = (ctx) => [
  { texto: `NORCECA ${anio(ctx)} Mexico women roster boletín`, dominios: ['norceca.net', 'norceca.info'] },
  { texto: `convocatoria selección mexicana voleibol femenil mayor ${anio(ctx)}`, dominios: ['fmvb.org', 'norceca.info', 'volleyballworld.com'] },
];
const consultaRetiros = (ctx) => [{ texto: `selección mexicana voleibol femenil retiro anuncio ${anio(ctx)}` }];
const intencionListas = 'lista de jugadoras selección mexicana femenil número posición entrenador';

export const planPlantel = (ctx) => ({ consultas: [...consultaListas(ctx), ...consultaRetiros(ctx)], mejores: 3, intencion: intencionListas });
export const planListas = (ctx) => ({ consultas: consultaListas(ctx), mejores: 3, intencion: intencionListas });
export const planRetiros = (ctx) => ({ consultas: consultaRetiros(ctx), mejores: 2, intencion: 'jugadora selección mexicana voleibol anuncia retiro' });

export const planPerfil = (ctx, j, club) => ({
  consultas: [
    { texto: `"${j.nombre}" voleibol`, dominios: ['volleybox.net'] },
    { texto: `"${j.nombre}" voleibol ${club ? club.nombre : 'fichaje'} ${anio(ctx)}` },
  ],
  intencion: `${j.nombre} voleibol fecha de nacimiento estatura club trayectoria premios`,
  exige: (resultado) => mencionaA(resultado, j.nombre), // un dato de perfil exige una página que hable de ella
});

// Cada liga se busca en su idioma: ahí está el calendario.
const IDIOMAS = {
  Brasil: { calendario: (c, l, a) => `${c} tabela jogos ${l} ${a}`, proximo: (c, a) => `${c} próximo jogo vôlei feminino ${a}` },
  Italia: { calendario: (c, l, a) => `${c} calendario partite ${l} ${a}`, proximo: (c, a) => `${c} prossima partita pallavolo femminile ${a}` },
  Francia: { calendario: (c, l, a) => `${c} calendrier matchs ${l} ${a}`, proximo: (c, a) => `${c} prochain match volley féminin ${a}` },
  China: { calendario: (c) => `${c} 女排 赛程`, proximo: (c, a) => `${a} 中国女排超级联赛 ${c} 赛程 比赛时间` },
  Perú: { calendario: (c, l, a) => `${c} fixture ${l} ${a}`, proximo: (c, a) => `${c} próximo partido vóley femenino ${a}` },
  'Estados Unidos': { calendario: (c, l, a) => `${c} schedule ${l} ${a}`, proximo: (c, a) => `${c} next match women's volleyball ${a}` },
};
const ESPANOL = { calendario: (c, l, a) => `${c} calendario partidos ${l} ${a}`, proximo: (c, a) => `${c} próximo partido voleibol femenil ${a}` };

// En China el nombre que encuentra el calendario es el original.
const nombreLocal = (club) => (club.pais === 'China' ? club.alias.find((a) => /[一-鿿]/.test(a)) ?? club.nombre : club.nombre);

export function planPartidos(ctx, club, liga) {
  const idioma = IDIOMAS[club.pais] ?? ESPANOL;
  const nombre = nombreLocal(club);
  const sitioLiga = liga?.calendarioOficialUrl ? dominio(liga.calendarioOficialUrl) : null;
  const a = anio(ctx);
  const china = club.pais === 'China';
  return {
    consultas: [
      // En China un dominio restringido no encuentra nada: el calendario está en prensa local.
      { texto: idioma.calendario(nombre, liga?.nombre ?? '', a), dominios: china ? [] : [...(sitioLiga ? [sitioLiga] : []), 'volleybox.net'] },
      { texto: idioma.proximo(nombre, a) },
      ...(china ? [{ texto: `${club.nombre} schedule`, dominios: ['volleybox.net'] }] : []),
    ],
    paginas: [club.calendarioUrl, liga?.calendarioOficialUrl].filter(Boolean),
    mejores: 3,
    intencion: `${club.nombre} ${nombre} calendario partidos fecha hora rival`,
  };
}

// Sitios de liga que no salen de data/ligas.json. Sin sitio confiable queda Volleybox.
const SITIOS_LIGA = { 'ligue-a-fr': ['lnv.fr'], 'superliga-cn': ['volleychina.org'] };

// Quién puede cambiar la fecha u hora de un partido que ya existe: la liga, el club o Volleybox.
export const dominiosConfiables = (club, liga, ligaId) => [
  'volleybox.net',
  ...(SITIOS_LIGA[ligaId] ?? []),
  ...[liga?.calendarioOficialUrl, club.calendarioUrl, club.sitio].filter(Boolean).map(dominio),
];

export const planDondeVer = (ctx, competencia, liga) => ({
  consultas: [
    { texto: `${competencia.nombre} voleibol femenil dónde ver transmisión ${anio(ctx)}` },
    { texto: `${competencia.nombre} volleyball official broadcast streaming youtube channel ${anio(ctx)}` },
  ],
  paginas: [liga?.calendarioOficialUrl].filter(Boolean),
  intencion: `${competencia.nombre} transmisión oficial plataforma canal`,
});
