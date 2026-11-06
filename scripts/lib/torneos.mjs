// Un mismo torneo aparece con varios nombres y en varios idiomas.
// El catálogo evita que "Mundial" y "World Championship" entren como dos torneos.

import { normal } from './fusion.mjs';
import { slugDe } from './nombres.mjs';

const CATALOGO = [
  { nombre: 'Juegos Olímpicos', alias: ['Olimpiadas', 'Olympic Games', 'Olympics', 'Juegos Olimpicos'] },
  { nombre: 'Preolímpico', alias: ['Clasificatorio Olímpico', 'Olympic Qualification Tournament', 'Olympic Qualifier', 'Preolimpico'] },
  // Desde 2027 la FIVB llama Copa del Mundo a lo que antes era el Campeonato Mundial: es el mismo torneo.
  {
    nombre: 'Campeonato Mundial',
    alias: ['Mundial', 'World Championship', 'World Championships', 'Campeonato del Mundo', 'Copa del Mundo', 'World Cup', 'Copa Mundial'],
    renombrado: { desde: 2027, nombre: 'Copa del Mundo FIVB' },
    // Ya no cabe en los últimos torneos: con su fecha, el agente no lo vuelve a buscar.
    ediciones: { 2025: { fechaInicio: '2025-08-22', fechaFin: '2025-09-07' } },
  },
  { nombre: 'Liga de Naciones', alias: ['Nations League', 'VNL'] },
  { nombre: 'Copa Challenger', alias: ['Challenger Cup'] },
  // Fechas que anunció Panam Sports el 30 de enero de 2026.
  { nombre: 'Juegos Panamericanos', alias: ['Pan American Games', 'Panamericanos', 'Pan Am Games'], ediciones: { 2027: { fechaInicio: '2027-07-23', fechaFin: '2027-08-08' } } },
  { nombre: 'Juegos Centroamericanos y del Caribe', alias: ['Central American and Caribbean Games', 'Centroamericanos', 'CAC Games'] },
  { nombre: 'Copa Panamericana', alias: ['Pan American Cup', 'Pan-American Cup', 'Panamericana'] },
  { nombre: 'Campeonato NORCECA', alias: ['NORCECA Championship', 'Continental Championship NORCECA'] },
  { nombre: 'NORCECA Final Four', alias: ['Final Four'] },
  { nombre: 'NORCECA Final Six', alias: ['Final Six'] },
];

// No distinguen un torneo de otro: el organizador, la rama, el año y las palabras sueltas.
const VACIAS = new Set(['fivb', 'women', 'womens', 's', 'femenil', 'femenino', 'femenina', 'mayor', 'senior', 'voleibol', 'volleyball', 'de', 'del', 'la', 'el', 'y', 'and', 'the', 'of']);

// "XXIII Copa Panamericana": el número de la edición no cambia de qué torneo se trata.
const ORDINAL = /^(?=[ivxl])(l?x{0,3})(ix|iv|v?i{0,3})$/;

const huella = (nombre) => normal(nombre).split(' ')
  .filter((p) => p && !VACIAS.has(p) && !/^(19|20)\d\d$/.test(p) && !ORDINAL.test(p))
  .sort()
  .join(' ');

const CANONICOS = new Map(CATALOGO.flatMap(({ nombre, alias }) => [nombre, ...alias].map((a) => [huella(a), nombre])));

// Con la edición, el nombre que tenía ese año; sin ella, el de su entrada del catálogo.
export function nombreCanonico(nombre, edicion = null) {
  const base = CANONICOS.get(huella(nombre));
  if (!base) return nombre.trim();
  const renombrado = CATALOGO.find((t) => t.nombre === base).renombrado;
  return renombrado && Number(edicion) >= renombrado.desde ? renombrado.nombre : base;
}

// Las fechas de una edición, si el catálogo las sabe.
export const fechasDeCatalogo = (nombre, edicion) => CATALOGO.find((t) => t.nombre === nombreCanonico(nombre))?.ediciones?.[edicion] ?? null;

// Todos los nombres con los que una fuente puede llamar a un torneo.
export function nombresDe(nombre) {
  const entrada = CATALOGO.find((t) => t.nombre === nombreCanonico(nombre));
  return entrada ? [entrada.nombre, ...entrada.alias] : [nombre];
}

export const delCatalogo = (nombre) => CANONICOS.has(huella(nombre));

export const idTorneo = (nombre, edicion) => slugDe(`${nombreCanonico(nombre, edicion)} ${edicion ?? ''}`);

const rango = (t) => [t.fechaInicio ?? t.fechaFin ?? null, t.fechaFin ?? t.fechaInicio ?? null];

function seTraslapan(a, b) {
  const [ai, af] = rango(a);
  const [bi, bf] = rango(b);
  return Boolean(ai && bi) && ai <= bf && bi <= af;
}

// La Selección no juega dos torneos a la vez: misma edición y fechas traslapadas es el mismo torneo.
export function mismoTorneo(a, b) {
  if (idTorneo(a.nombre, a.edicion) === idTorneo(b.nombre, b.edicion)) return true;
  return a.edicion === b.edicion && seTraslapan(a, b);
}
