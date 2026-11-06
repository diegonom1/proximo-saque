// Filtros de la agenda. Sin dependencias: corren en el navegador.

export type Filtro =
  | { tipo: 'todas' }
  | { tipo: 'seleccion' }
  | { tipo: 'jugadora'; valor: string }
  | { tipo: 'liga'; valor: string };

export const TODAS: Filtro = { tipo: 'todas' };

export interface ItemAgenda {
  tipo: string;
  liga: string | null;
  jugadoras: string[];
}

// Los partidos de la Selección salen con cualquier jugadora, haya lista o no.
export function coincide(item: ItemAgenda, filtro: Filtro) {
  switch (filtro.tipo) {
    case 'seleccion':
      return item.tipo === 'seleccion';
    case 'jugadora':
      return item.tipo === 'seleccion' || item.jugadoras.includes(filtro.valor);
    case 'liga':
      return item.liga === filtro.valor;
    default:
      return true;
  }
}

export interface ItemSinPartidos {
  jugadora: string;
  liga: string | null;
}

// Quién aparece en "Sin partidos por ahora" con ese filtro.
export function coincideSinPartidos(item: ItemSinPartidos, filtro: Filtro) {
  switch (filtro.tipo) {
    case 'seleccion':
      return false;
    case 'jugadora':
      return item.jugadora === filtro.valor;
    case 'liga':
      return item.liga === filtro.valor;
    default:
      return true;
  }
}

interface Validos {
  jugadoras: string[];
  ligas: string[];
}

function valido(f: unknown, { jugadoras, ligas }: Validos): Filtro | null {
  if (!f || typeof f !== 'object') return null;
  const { tipo, valor } = f as { tipo?: unknown; valor?: unknown };
  if (tipo === 'todas') return TODAS;
  if (tipo === 'seleccion') return { tipo };
  if (tipo === 'jugadora' && typeof valor === 'string' && jugadoras.includes(valor)) return { tipo, valor };
  if (tipo === 'liga' && typeof valor === 'string' && ligas.includes(valor)) return { tipo, valor };
  return null;
}

// `?j=<slug>` manda sobre lo guardado; lo guardado puede ser viejo o estar dañado.
export function filtroInicial(j: string | null, guardado: string | null, validos: Validos): Filtro {
  if (j && validos.jugadoras.includes(j)) return { tipo: 'jugadora', valor: j };
  try {
    return valido(JSON.parse(guardado ?? 'null'), validos) ?? TODAS;
  } catch {
    return TODAS;
  }
}

// Archivo .ics que corresponde al filtro.
export const archivoIcs = (filtro: Filtro) => (filtro.tipo === 'jugadora' ? `calendario/${filtro.valor}.ics` : 'calendario.ics');

// Cada día con su color, en orden: conecta los bloques de fecha con la paleta de la Plantilla.
const COLORES_DIA = ['rojo', 'verde', 'carbon', 'negro'];
export const colorDeDia = (indice: number) => COLORES_DIA[indice % COLORES_DIA.length];
