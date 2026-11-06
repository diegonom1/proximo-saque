// "La Selección en números": sale de data/ al construir.

import { msDe, vigentes } from './tiempo';

export const DIAS_PROXIMOS = 45;
const DIA_MS = 86_400_000;

interface Entrada {
  activas: { clubId: string | null }[];
  clubes: Record<string, { pais: string | null; ligaId: string | null }>;
  partidos: { inicio: string }[];
  torneos: { fechaFin: string; medalla: string | null }[];
  maximo: number;
  ahora: number;
}

export function numerosSeleccion({ activas, clubes, partidos, torneos, maximo, ahora }: Entrada) {
  const suyos = activas.flatMap((j) => (j.clubId && clubes[j.clubId] ? [clubes[j.clubId]] : []));
  const distintos = (valores: (string | null)[]) => new Set(valores.filter(Boolean)).size;
  const recientes = [...torneos].sort((a, b) => b.fechaFin.localeCompare(a.fechaFin)).slice(0, maximo);
  return [
    { valor: activas.length, rotulo: 'Seleccionadas' },
    { valor: distintos(suyos.map((c) => c.pais)), rotulo: 'Países donde juegan' },
    { valor: distintos(suyos.map((c) => c.ligaId)), rotulo: 'Ligas' },
    { valor: vigentes(partidos, ahora).filter((p) => msDe(p) <= ahora + DIAS_PROXIMOS * DIA_MS).length, rotulo: `Partidos en ${DIAS_PROXIMOS} días` },
    { valor: recientes.filter((t) => t.medalla).length, rotulo: `Medallas en ${recientes.length} torneos` },
  ];
}
