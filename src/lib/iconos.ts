// Iconos de plataformas y redes. Se resuelven al construir: Simple Icons no llega al navegador.

import * as simple from 'simple-icons';

export interface Icono {
  titulo: string;
  path: string;
}

const marcas = new Map(Object.values(simple).filter((i) => typeof i === 'object' && 'slug' in i).map((i) => [i.slug, i]));

const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');

const dominio = (url: string) => new URL(url).hostname.replace(/^www\./, '').split('.').at(-2) ?? '';

// Iconos propios (24 × 24) para plataformas que no están en Simple Icons.
const GENERICOS: Record<string, Icono> = {
  streaming: { titulo: 'Streaming', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 6 6 4-6 4V8Z' },
  tv: { titulo: 'Televisión', path: 'M3 5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8v1h4v2H7v-2h4v-1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v9h16V7H4Z' },
  app: { titulo: 'App', path: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 3v13h10V5H7Zm5 14.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z' },
};

// Primero el nombre, luego el dominio y al final uno genérico por tipo.
export function iconoPlataforma(p: { nombre: string; tipo: string; url: string }): Icono {
  const marca = marcas.get(limpio(p.nombre)) ?? marcas.get(limpio(dominio(p.url))) ?? (p.tipo === 'youtube' ? marcas.get('youtube') : undefined);
  if (marca) return { titulo: marca.title, path: marca.path };
  return GENERICOS[p.tipo] ?? GENERICOS.streaming;
}

export function iconoRed(red: string): Icono | null {
  const marca = marcas.get(red);
  return marca ? { titulo: marca.title, path: marca.path } : null;
}
