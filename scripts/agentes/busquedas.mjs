// Qué busca cada agente. Son las búsquedas que describen los archivos de agentes/, escritas en código.

import { dominio } from '../lib/fuentes.mjs';
import { mencionaA } from '../lib/nombres.mjs';

export const FEDERACIONES = ['fmvb.org', 'norceca.net', 'norceca.info', 'fivb.com', 'volleyballworld.com'];
const anio = (ctx) => Number(ctx.hoy.slice(0, 4));

export const planRankings = () => ({
  consultas: [
    { texto: 'FIVB women volleyball world ranking Mexico points', dominios: ['volleyballworld.com', 'fivb.com'] },
    { texto: 'NORCECA women senior ranking Mexico', dominios: ['norceca.net', 'norceca.info'] },
  ],
  paginas: ['https://en.volleyballworld.com/volleyball/world-ranking/women', 'https://www.fivb.com/volleyball/rankings/senior-world-ranking-women/', 'https://www.fmvb.org/femenil-mayor'],
  avanzado: true, // el ranking es una tabla; una vez al mes se puede pagar la lectura completa
});

const consultasDeGuardados = (guardados) => [...new Set(guardados.map((p) => p.competencia).filter(Boolean))]
  .map((c) => ({ texto: `${c} México voleibol femenil calendario partidos horarios` }));

// El agente 04 solo detecta lo nuevo: lo histórico ya está en torneos.json.
export const planProximo = (ctx, guardados = []) => ({
  consultas: [
    ...consultasDeGuardados(guardados),
    ...(ctx.soloVerificar ? [] : [
    { texto: `Selección Mexicana voleibol femenil mayor próximo torneo ${anio(ctx) + 1}`, dominios: FEDERACIONES },
    { texto: `NORCECA calendar of competitions ${anio(ctx) + 1} women senior hosts`, dominios: ['norceca.net', 'norceca.info'] },
    { texto: 'Lima 2027 Juegos Panamericanos voleibol femenino clasificación México' },
    { texto: `selección mexicana voleibol femenil resultado torneo ${anio(ctx)}` },
    ]),
  ],
  paginas: guardados.map((p) => p.fuente).filter(Boolean),
  mejores: 4,
});

export const planTorneo = (ctx, { nombre, edicion }) => ({
  consultas: [
    { texto: `${nombre} ${edicion} voleibol femenil México resultado lugar final premios` },
    { texto: `${nombre} ${edicion} women volleyball Mexico final standings awards`, dominios: FEDERACIONES },
  ],
  mejores: 3,
});

export const planLista = (ctx, { nombre, edicion }) => ({
  consultas: [
    { texto: `${nombre} ${edicion} Mexico women roster`, dominios: [...FEDERACIONES, 'panamsports.org', 'centrocaribesports.org'] },
    { texto: `${nombre} ${edicion} selección mexicana voleibol femenil lista convocadas` },
  ],
  mejores: 3,
});

export const planRetiros = (ctx) => ({ consultas: [{ texto: `selección mexicana voleibol femenil retiro anuncio ${anio(ctx)}` }], mejores: 2 });

export const planPerfil = (ctx, j, club) => ({
  consultas: [
    { texto: `"${j.nombre}" voleibol`, dominios: ['volleybox.net'] },
    { texto: `"${j.nombre}" voleibol ${club ? club.nombre : 'fichaje'} ${anio(ctx)}` },
  ],
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

// `guardados`: partidos por verificar. Se relee la página de donde salieron, además del calendario.
export function planPartidos(ctx, club, liga, guardados = []) {
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
    paginas: [club.calendarioUrl, liga?.calendarioOficialUrl, ...guardados.map((p) => p.fuente)].filter(Boolean),
    mejores: 3,
    filas: [club.nombre, ...club.alias],
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
});
