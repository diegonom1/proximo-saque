import { describe, expect, it } from 'vitest';
import { creditoLleno, fotoSinCredito, rutaAbsoluta } from './fotos-sin-credito.mjs';

const conCredito = (texto) => () => texto;
const FOTO = '/sitio/src/assets/fotos/jugadoras/ana/tarjeta.jpg';

describe('creditoLleno', () => {
  it('distingue vacío de lleno', () => {
    expect(creditoLleno('Foto: FMVB — https://fmvb.org')).toBe(true);
    expect(creditoLleno('')).toBe(false);
    expect(creditoLleno('Foto: autor o cuenta — URL\n')).toBe(false); // la plantilla sin llenar
    expect(creditoLleno('  \n')).toBe(false);
    expect(creditoLleno('﻿\n')).toBe(false);
  });
});

describe('rutaAbsoluta', () => {
  const raiz = '/sitio';
  it('resuelve la ruta relativa que manda import.meta.glob', () => {
    expect(rutaAbsoluta('../assets/fotos/jugadoras/ana/tarjeta.jpg', '/sitio/src/lib/fotos.ts', raiz)).toBe(FOTO);
  });
  it('resuelve una ruta desde la raíz del proyecto', () => {
    expect(rutaAbsoluta('/src/assets/fotos/jugadoras/ana/tarjeta.jpg', undefined, raiz)).toBe(FOTO);
  });
  it('deja una ruta que ya es completa', () => {
    expect(rutaAbsoluta(FOTO, undefined, raiz)).toBe(FOTO);
  });
  it('quita la consulta', () => {
    expect(rutaAbsoluta('../assets/fotos/jugadoras/ana/tarjeta.jpg?v=1', '/sitio/src/lib/fotos.ts', raiz)).toBe(FOTO);
  });
});

describe('fotoSinCredito', () => {
  it('detiene una foto sin crédito', () => {
    expect(fotoSinCredito(FOTO, conCredito(''))).toBe(true);
  });
  it('deja pasar una foto con crédito', () => {
    expect(fotoSinCredito(FOTO, conCredito('Foto: FMVB'))).toBe(false);
  });
  it('no toca archivos fuera de las fotos', () => {
    expect(fotoSinCredito('/sitio/src/assets/otra/logo.png', conCredito(''))).toBe(false);
    expect(fotoSinCredito('/sitio/src/assets/fotos/jugadoras/ana/credito.txt', conCredito(''))).toBe(false);
  });
});
