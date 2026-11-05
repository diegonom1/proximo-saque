import { describe, expect, it } from 'vitest';
import { porNombre, tituloPartido, unirNombres } from './partido';

const club = { tipo: 'club', local: 'Sesi Vôlei Bauru', visitante: 'E.C. Pinheiros' } as const;

describe('tituloPartido', () => {
  it('va primero la jugadora y luego los equipos', () => {
    expect(tituloPartido(club, ['Sofía Maldonado'])).toBe('Sofía Maldonado · Sesi Vôlei Bauru vs E.C. Pinheiros');
  });
  it('junta a dos del mismo club', () => {
    expect(tituloPartido(club, ['Argentina Ung', 'Uxue Guereca'])).toBe('Argentina Ung y Uxue Guereca · Sesi Vôlei Bauru vs E.C. Pinheiros');
  });
  it('en la Selección no lista jugadoras', () => {
    const p = { tipo: 'seleccion', local: 'México', visitante: 'Estados Unidos' } as const;
    expect(tituloPartido(p, ['Sofía Maldonado'])).toBe('Selección Mexicana · México vs Estados Unidos');
  });
  it('sin seleccionadas quedan solo los equipos', () => {
    expect(tituloPartido(club, [])).toBe('Sesi Vôlei Bauru vs E.C. Pinheiros');
  });
});

describe('nombres', () => {
  it('une tres con coma y "y"', () => {
    expect(unirNombres(['A', 'B', 'C'])).toBe('A, B y C');
  });
  it('ordena alfabéticamente con acentos', () => {
    expect(porNombre([{ nombre: 'Uxue' }, { nombre: 'Álvara' }, { nombre: 'Argentina' }]).map((j) => j.nombre)).toEqual(['Álvara', 'Argentina', 'Uxue']);
  });
});
