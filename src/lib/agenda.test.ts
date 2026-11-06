import { describe, expect, it } from 'vitest';
import { TODAS, archivoIcs, coincide, coincideSinPartidos, filtroInicial, type Filtro, colorDeDia } from './agenda';

const club = { tipo: 'club', liga: 'superliga-br', jugadoras: ['sofia-maldonado'] };
const seleccionSinLista = { tipo: 'seleccion', liga: null, jugadoras: [] };
const seleccionConLista = { tipo: 'seleccion', liga: null, jugadoras: ['jocelyn-urias'] };
const sofia: Filtro = { tipo: 'jugadora', valor: 'sofia-maldonado' };
const validos = { jugadoras: ['sofia-maldonado'], ligas: ['superliga-br'] };

describe('coincide', () => {
  it('Todas muestra todo', () => {
    expect(coincide(club, TODAS)).toBe(true);
    expect(coincide(seleccionSinLista, TODAS)).toBe(true);
  });
  it('Selección solo muestra la Selección', () => {
    expect(coincide(club, { tipo: 'seleccion' })).toBe(false);
    expect(coincide(seleccionSinLista, { tipo: 'seleccion' })).toBe(true);
  });
  it('por jugadora: sus partidos de club', () => {
    expect(coincide(club, sofia)).toBe(true);
    expect(coincide(club, { tipo: 'jugadora', valor: 'otra' })).toBe(false);
  });
  it('por jugadora: la Selección sale siempre, haya lista o no', () => {
    expect(coincide(seleccionSinLista, sofia)).toBe(true);
    expect(coincide(seleccionConLista, sofia)).toBe(true);
  });
  it('por liga: la Selección no es una liga', () => {
    const liga: Filtro = { tipo: 'liga', valor: 'superliga-br' };
    expect(coincide(club, liga)).toBe(true);
    expect(coincide(seleccionSinLista, liga)).toBe(false);
  });
});

describe('coincideSinPartidos', () => {
  const item = { jugadora: 'sofia-maldonado', liga: 'superliga-br' };
  it('respeta el filtro', () => {
    expect(coincideSinPartidos(item, TODAS)).toBe(true);
    expect(coincideSinPartidos(item, { tipo: 'seleccion' })).toBe(false);
    expect(coincideSinPartidos(item, sofia)).toBe(true);
    expect(coincideSinPartidos(item, { tipo: 'jugadora', valor: 'otra' })).toBe(false);
    expect(coincideSinPartidos(item, { tipo: 'liga', valor: 'superliga-br' })).toBe(true);
  });
});

describe('filtroInicial', () => {
  it('?j= gana sobre lo guardado', () => {
    expect(filtroInicial('sofia-maldonado', '{"tipo":"seleccion"}', validos)).toEqual(sofia);
  });
  it('un ?j= desconocido se ignora', () => {
    expect(filtroInicial('nadie', '{"tipo":"seleccion"}', validos)).toEqual({ tipo: 'seleccion' });
  });
  it('recupera lo guardado', () => {
    expect(filtroInicial(null, JSON.stringify({ tipo: 'liga', valor: 'superliga-br' }), validos)).toEqual({ tipo: 'liga', valor: 'superliga-br' });
  });
  it.each([
    ['vacío', null],
    ['JSON dañado', '{no'],
    ['jugadora que ya no está', '{"tipo":"jugadora","valor":"se-fue"}'],
    ['tipo raro', '{"tipo":"otro"}'],
    ['otro formato', '[1]'],
  ])('vuelve a Todas: %s', (_, guardado) => {
    expect(filtroInicial(null, guardado, validos)).toEqual(TODAS);
  });
});

describe('archivoIcs', () => {
  it('uno por jugadora y uno general', () => {
    expect(archivoIcs(sofia)).toBe('calendario/sofia-maldonado.ics');
    expect(archivoIcs(TODAS)).toBe('calendario.ics');
    expect(archivoIcs({ tipo: 'seleccion' })).toBe('calendario.ics');
  });
});

describe('colorDeDia', () => {
  it('rota por la paleta y dos días seguidos no se repiten', () => {
    const colores = [0, 1, 2, 3, 4].map(colorDeDia);
    expect(colores[4]).toBe(colores[0]);
    expect(new Set(colores.slice(0, 4)).size).toBe(4);
  });
});
