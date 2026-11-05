// Plugin de Vite: en el build de producción una foto sin credito.txt lleno no entra al sitio.
// Filtrarla en la página no basta: Astro copia a dist/ toda imagen importada, aunque no se use.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const VIRTUAL = '\0foto-sin-credito';
const FOTO = /\/src\/assets\/fotos\/.+\.(jpg|png)$/;

export const creditoLleno = (contenido) => contenido.replace(/^﻿/, '').trim().length > 0;

export function fotoSinCredito(ruta, leer = (r) => (existsSync(r) ? readFileSync(r, 'utf8') : '')) {
  return FOTO.test(ruta) && !creditoLleno(leer(join(dirname(ruta), 'credito.txt')));
}

// Vite entrega las rutas relativas al archivo que importa, o absolutas desde la raíz del proyecto.
export function rutaAbsoluta(fuente, importador, raiz) {
  const ruta = fuente.split('?')[0];
  if (ruta.startsWith('.')) return importador ? resolve(dirname(importador), ruta) : ruta;
  if (ruta.startsWith(raiz) || !isAbsolute(ruta)) return ruta;
  return join(raiz, ruta);
}

export function fotosSinCredito() {
  const avisadas = new Set();
  let raiz = process.cwd();
  return {
    name: 'proximo-saque:fotos-sin-credito',
    enforce: 'pre',
    apply: 'build', // en npm run dev sí se ven, para poder revisarlas
    configResolved(config) {
      raiz = config.root;
    },
    resolveId(fuente, importador) {
      const absoluta = rutaAbsoluta(fuente, importador, raiz);
      if (!fotoSinCredito(absoluta)) return null;
      const carpeta = relative(raiz, dirname(absoluta));
      if (!avisadas.has(carpeta)) {
        avisadas.add(carpeta);
        console.warn(`[fotos] ${carpeta}: sin crédito en credito.txt; no se publica y sale con iniciales.`);
      }
      return VIRTUAL;
    },
    load(id) {
      return id === VIRTUAL ? 'export default null;' : null;
    },
  };
}
