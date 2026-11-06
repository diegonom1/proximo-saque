import { describe, expect, it } from 'vitest';
import { heroCompleto, modoDeFoto } from './tratamiento';

const grande = { width: 2000, height: 1333 };
const chica = { width: 1079, height: 1433 };
const recorte = { width: 290, height: 604 };

describe('modoDeFoto', () => {
  it('respeta completa si la foto llega al mínimo', () => {
    expect(modoDeFoto('completa', { fondo: grande, recorte: null })).toBe('completa');
  });
  it('no estira: una foto chica pedida como completa va en duotono', () => {
    expect(modoDeFoto('completa', { fondo: chica, recorte: null })).toBe('duotono');
  });
  it('cuenta el lado largo, sea vertical u horizontal', () => {
    expect(modoDeFoto('completa', { fondo: { width: 1333, height: 2000 }, recorte: null })).toBe('completa');
  });
  it('usa el recorte solo si existe', () => {
    expect(modoDeFoto('recorte', { fondo: chica, recorte })).toBe('recorte');
    expect(modoDeFoto('recorte', { fondo: chica, recorte: null })).toBe('duotono');
  });
  it('no usa el recorte si se pidió duotono', () => {
    expect(modoDeFoto('duotono', { fondo: chica, recorte })).toBe('duotono');
  });
  it('sin tratamiento, duotono', () => {
    expect(modoDeFoto(null, { fondo: grande, recorte: null })).toBe('duotono');
    expect(modoDeFoto(undefined, { fondo: chica, recorte })).toBe('duotono');
  });
  it('sin fondo, lo que haya', () => {
    expect(modoDeFoto('duotono', { fondo: null, recorte })).toBe('recorte');
    expect(modoDeFoto('completa', { fondo: null, recorte: null })).toBe('sin-foto');
  });
});

describe('heroCompleto', () => {
  it('pide las dos fotos en su mínimo', () => {
    expect(heroCompleto({ width: 2400, height: 1350 }, { width: 1080, height: 1920 })).toBe(true);
    expect(heroCompleto({ width: 1079, height: 607 }, { width: 1080, height: 1920 })).toBe(false);
    expect(heroCompleto({ width: 2400, height: 1350 }, { width: 394, height: 701 })).toBe(false);
  });
});
