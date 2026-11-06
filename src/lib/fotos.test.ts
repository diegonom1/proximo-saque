import { describe, expect, it } from 'vitest';
import { fotosJugadora, parsearCredito } from './fotos';

describe('parsearCredito', () => {
  it('separa autor y enlace', () => {
    expect(parsearCredito('Foto: FMVB — https://fmvb.org/x\n')).toEqual({ texto: 'Foto: FMVB', url: 'https://fmvb.org/x' });
  });
  it('acepta un crédito sin enlace', () => {
    expect(parsearCredito('Foto: Archivo familiar')).toEqual({ texto: 'Foto: Archivo familiar', url: null });
  });
  it('no parte nombres con guion', () => {
    expect(parsearCredito('Foto: Ana Ruiz-Soto — https://a.mx')).toEqual({ texto: 'Foto: Ana Ruiz-Soto', url: 'https://a.mx' });
  });
  it('ignora archivos vacíos', () => {
    expect(parsearCredito('  \n')).toBeNull();
  });
});

describe('fotosJugadora', () => {
  it('devuelve null si la foto no existe', () => {
    expect(fotosJugadora('nadie')).toEqual({ tarjeta: null, fondo: null, recorte: null, cara: null });
  });
});
