// Iconos de redes. Se resuelven al construir: Simple Icons no llega al navegador.

import * as simple from 'simple-icons';

export interface Icono {
  titulo: string;
  path: string;
}

const marcas = new Map(Object.values(simple).filter((i) => typeof i === 'object' && 'slug' in i).map((i) => [i.slug, i]));

export function iconoRed(red: string): Icono | null {
  const marca = marcas.get(red);
  return marca ? { titulo: marca.title, path: marca.path } : null;
}
