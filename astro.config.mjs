import { defineConfig, fontProviders } from 'astro/config';
import { fotosSinCredito } from './scripts/lib/fotos-sin-credito.mjs';

export default defineConfig({
  site: 'https://diegonom1.github.io',
  base: '/proximo-saque', // GitHub Pages sirve el sitio bajo el nombre del repo
  output: 'static',
  vite: {
    plugins: [fotosSinCredito()],
  },
  // Astro descarga las fuentes al construir y las sirve desde el propio sitio.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Big Shoulders',
      cssVariable: '--fuente-display',
      weights: [800, 900],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Impact', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Instrument Sans',
      cssVariable: '--fuente-texto',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'IBM Plex Mono',
      cssVariable: '--fuente-mono',
      weights: [500, 600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
});
