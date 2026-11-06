// Cómo se muestra la foto de cada quien. El tratamiento se pide en data/jugadoras.json
// (fotos.tratamiento), pero solo se respeta si la foto lo aguanta: aquí nunca se estira una foto chica.

export type Tratamiento = 'completa' | 'duotono' | 'recorte';
export type Modo = Tratamiento | 'sin-foto';

interface Medidas {
  width: number;
  height: number;
}

// Los mínimos de la tabla de fotos en CLAUDE.md.
export const MIN_FONDO_LADO = 2000;
export const MIN_HERO_ANCHO = 2400;
export const MIN_HERO_MOVIL = { ancho: 1080, alto: 1920 };

export function modoDeFoto(pedido: Tratamiento | null | undefined, fotos: { fondo: Medidas | null; recorte: Medidas | null }): Modo {
  const { fondo, recorte } = fotos;
  if (recorte && (pedido === 'recorte' || !fondo)) return 'recorte';
  if (!fondo) return 'sin-foto';
  return pedido === 'completa' && Math.max(fondo.width, fondo.height) >= MIN_FONDO_LADO ? 'completa' : 'duotono';
}

// A pantalla completa solo si las dos fotos llegan al mínimo; si no, va en un panel a su tamaño real.
export const heroCompleto = (escritorio: Medidas, movil: Medidas) =>
  escritorio.width >= MIN_HERO_ANCHO && movil.width >= MIN_HERO_MOVIL.ancho && movil.height >= MIN_HERO_MOVIL.alto;
