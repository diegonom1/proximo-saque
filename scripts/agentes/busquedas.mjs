// Qué busca cada agente. Son las búsquedas que describen los archivos de agentes/, escritas en código.

import { dominio } from '../lib/fuentes.mjs';

const FEDERACIONES = ['fmvb.org', 'norceca.net', 'norceca.info', 'fivb.com', 'volleyballworld.com'];
const anio = (ctx) => ctx.hoy.slice(0, 4);

export const planRankings = () => ({
  consultas: [
    { texto: 'FIVB women volleyball world ranking Mexico points', dominios: ['volleyballworld.com', 'fivb.com'] },
    { texto: 'NORCECA women senior ranking Mexico', dominios: ['norceca.net', 'norceca.info'] },
  ],
  paginas: ['https://en.volleyballworld.com/volleyball/world-ranking/women', 'https://www.fmvb.org/femenil-mayor'],
  intencion: 'Mexico women ranking position and points',
});

export const planSeleccion = (ctx) => ({
  consultas: [
    { texto: `Selección Mexicana voleibol femenil mayor próximo torneo ${anio(ctx)}`, dominios: FEDERACIONES },
    { texto: `Mexico women volleyball NORCECA ${anio(ctx)} final standings results`, dominios: ['norceca.net', 'norceca.info', 'volleyballworld.com'] },
    { texto: `Selección Mexicana femenil voleibol resultado torneo ${anio(ctx)}` },
  ],
  intencion: 'México selección femenil voleibol torneo fechas sede resultado',
});

export const planPlantel = (ctx) => ({
  consultas: [
    { texto: `NORCECA ${anio(ctx)} Mexico women roster boletín`, dominios: ['norceca.net', 'norceca.info'] },
    { texto: `convocatoria selección mexicana voleibol femenil mayor ${anio(ctx)}`, dominios: ['fmvb.org', 'norceca.info', 'volleyballworld.com'] },
    { texto: `selección mexicana voleibol femenil retiro anuncio ${anio(ctx)}` },
  ],
  mejores: 3,
  intencion: 'lista de jugadoras selección mexicana femenil número posición entrenador',
});

export const planPerfil = (ctx, j, club) => ({
  consultas: [
    { texto: `"${j.nombre}" voleibol`, dominios: ['volleybox.net'] },
    { texto: `"${j.nombre}" voleibol ${club ? club.nombre : 'fichaje'} ${anio(ctx)}` },
  ],
  intencion: `${j.nombre} voleibol fecha de nacimiento estatura club trayectoria premios`,
});

export function planPartidos(ctx, club, liga) {
  const sitioLiga = liga?.calendarioOficialUrl ? dominio(liga.calendarioOficialUrl) : null;
  return {
    consultas: [
      { texto: `${club.nombre} calendario partidos ${liga?.nombre ?? ''} ${anio(ctx)}`, dominios: [...(sitioLiga ? [sitioLiga] : []), 'volleybox.net'] },
      { texto: `${club.nombre} próximo partido voleibol femenil ${anio(ctx)}` },
    ],
    paginas: [club.calendarioUrl, liga?.calendarioOficialUrl].filter(Boolean),
    intencion: `${club.nombre} calendario partidos fecha hora rival`,
  };
}

export const planDondeVer = (ctx, competencia, liga) => ({
  consultas: [
    { texto: `${competencia.nombre} voleibol femenil dónde ver transmisión ${anio(ctx)}` },
    { texto: `${competencia.nombre} volleyball official broadcast streaming youtube channel ${anio(ctx)}` },
  ],
  paginas: [liga?.calendarioOficialUrl].filter(Boolean),
  intencion: `${competencia.nombre} transmisión oficial plataforma canal`,
});
