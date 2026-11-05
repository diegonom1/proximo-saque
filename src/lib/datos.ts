// Lee y valida data/*.json al construir el sitio. Solo se usa en el frontmatter de Astro,
// así Zod y los JSON no llegan al navegador.

import type { z } from 'zod';
import type { PartidoCliente } from './compromiso';
import { porNombre } from './partido';
import { validarDatos, esquemaClub, esquemaJugadora, esquemaLiga, esquemaPartido, esquemaPlataforma, esquemaTorneo } from '../../scripts/lib/validar.mjs';
import jugadorasJson from '../../data/jugadoras.json';
import clubesJson from '../../data/clubes.json';
import ligasJson from '../../data/ligas.json';
import partidosJson from '../../data/partidos.json';
import seleccionJson from '../../data/seleccion.json';
import torneosJson from '../../data/torneos.json';
import rankingsJson from '../../data/rankings.json';

export type Jugadora = z.infer<typeof esquemaJugadora>;
export type Club = z.infer<typeof esquemaClub>;
export type Liga = z.infer<typeof esquemaLiga>;
export type Partido = z.infer<typeof esquemaPartido>;
export type Plataforma = z.infer<typeof esquemaPlataforma>;
export type Torneo = z.infer<typeof esquemaTorneo>;

const datos = validarDatos({
  jugadoras: jugadorasJson,
  clubes: clubesJson,
  ligas: ligasJson,
  partidos: partidosJson,
  seleccion: seleccionJson,
  torneos: torneosJson,
  rankings: rankingsJson,
});

export const { jugadoras, clubes, ligas, seleccion, torneos, rankings } = datos;
export const { actualizado, partidos, estados } = datos.partidos;

// Plantel visible: `propuesta` espera aprobación y `exseleccionada` ya no genera página.
export const activas = jugadoras.filter((j) => j.estado === 'activa');

// Solo lo que el navegador necesita para mantener al día el hero y el botón flotante.
export const paraCliente = (p: Partido): PartidoCliente => ({
  tipo: p.tipo,
  inicio: p.inicio,
  zonaSede: p.zonaSede,
  horaConfirmada: p.horaConfirmada,
  local: p.local,
  visitante: p.visitante,
  competencia: p.competencia,
  sede: p.sede,
  jugadoras: jugadorasDe(p).map(({ nombre, slug }) => ({ nombre, slug })),
});

// Seleccionadas de un partido: las de su club o, en la Selección, las convocadas.
export const jugadorasDe = (p: Partido): Jugadora[] => porNombre(p.tipo === 'seleccion'
  ? activas.filter((j) => p.convocadas?.includes(j.slug))
  : activas.filter((j) => j.clubId && j.clubId === p.clubId));
