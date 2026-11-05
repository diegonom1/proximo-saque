// Lee y valida data/*.json al construir el sitio. Solo se usa en el frontmatter de Astro,
// así Zod y los JSON no llegan al navegador.

import type { z } from 'zod';
import type { PartidoCliente } from './compromiso';
import type { EventoIcs } from './ics';
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

// Plantilla visible: `propuesta` espera aprobación y `exseleccionada` ya no genera página.
export const activas = jugadoras.filter((j) => j.estado === 'activa');

// Partidos de una jugadora: los de su club y los de la Selección a los que fue convocada.
export const partidosDe = (slug: string) => partidos.filter((p) => jugadorasDe(p).some((j) => j.slug === slug));

// Dónde verlo: lo que publica la fuente del partido y las plataformas de su liga o del torneo.
export function dondeVer(p: Partido) {
  const generales = p.tipo === 'seleccion' ? seleccion.plataformas : (p.ligaId ? ligas[p.ligaId]?.plataformas ?? [] : []);
  const lista = [...p.transmision.map((t) => ({ ...t, tipo: 'streaming' as const })), ...generales];
  return lista.filter((x, i) => lista.findIndex((y) => y.url === x.url) === i);
}

export const eventoIcs = (p: Partido): EventoIcs => ({
  id: p.id,
  tipo: p.tipo,
  inicio: p.inicio,
  horaConfirmada: p.horaConfirmada,
  local: p.local,
  visitante: p.visitante,
  competencia: p.competencia,
  sede: p.sede,
  fuente: p.fuente,
  jugadoras: jugadorasDe(p).map((j) => j.nombre),
  dondeVer: dondeVer(p).map((x) => x.nombre),
});

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

// Agenda: la Selección siempre, haya lista o no; de los clubes, solo los que tienen seleccionadas activas.
export const partidosAgenda = partidos.filter((p) => p.tipo === 'seleccion' || jugadorasDe(p).length > 0);

// Agenda de una jugadora: sus partidos de club y todos los de la Selección.
export const partidosAgendaDe = (slug: string) => partidosAgenda.filter((p) => p.tipo === 'seleccion' || jugadorasDe(p).some((j) => j.slug === slug));
