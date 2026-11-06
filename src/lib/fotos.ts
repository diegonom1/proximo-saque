// Fotos y créditos de src/assets/fotos/. Astro genera tamaños y formatos al construir.
// Solo se usa en el frontmatter: en el navegador no hace falta.
// En producción las fotos sin crédito llegan como null (ver scripts/lib/fotos-sin-credito.mjs).

import type { ImageMetadata } from 'astro';

const RAIZ = '/src/assets/fotos/';

const imagenes = import.meta.glob<ImageMetadata | null>('/src/assets/fotos/**/*.{jpg,png}', { eager: true, import: 'default' });
const creditos = import.meta.glob<string>('/src/assets/fotos/**/credito.txt', { eager: true, query: '?raw', import: 'default' });

const foto = (ruta: string) => imagenes[`${RAIZ}${ruta}`] ?? null;

// Si solo existe una de las dos, sirve para ambas pantallas.
export function fotosHero() {
  const escritorio = foto('seleccion/hero.jpg');
  const movil = foto('seleccion/hero-movil.jpg');
  return { escritorio: escritorio ?? movil, movil: movil ?? escritorio };
}

export const fotosJugadora = (slug: string) => ({
  tarjeta: foto(`jugadoras/${slug}/tarjeta.jpg`),
  fondo: foto(`jugadoras/${slug}/fondo.jpg`),
  recorte: foto(`jugadoras/${slug}/recorte.png`),
  cara: foto(`jugadoras/${slug}/cara.jpg`),
});

// El encabezado de la agenda: seleccion1 y seleccion2 de fotos-originales.
export const fotosAgenda = () => [foto('seleccion/agenda-1.jpg'), foto('seleccion/agenda-2.jpg')].filter((f) => f !== null);

// Anchos que tiene sentido generar: nunca más que la foto original.
export const anchosPara = (foto: ImageMetadata, anchos: number[]) => [...anchos.filter((a) => a < foto.width), foto.width];

export interface Credito {
  texto: string;
  url: string | null;
}

// "Foto: autor o cuenta — URL"
export function parsearCredito(contenido: string): Credito | null {
  const linea = contenido.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!linea || linea === 'Foto: autor o cuenta — URL') return null; // la plantilla sin llenar
  const m = linea.match(/^(.*?)\s+[—–-]\s+(https?:\/\/\S+)$/);
  return m ? { texto: m[1], url: m[2] } : { texto: linea, url: null };
}

// Créditos distintos, para el pie del sitio.
export function todosLosCreditos() {
  const unicos = new Map<string, Credito>();
  for (const contenido of Object.values(creditos)) {
    const c = parsearCredito(contenido);
    if (c) unicos.set(`${c.texto}|${c.url}`, c);
  }
  return [...unicos.values()];
}
