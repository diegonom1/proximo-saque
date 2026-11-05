import { describe, expect, it } from 'vitest';
import { resolverJugadora, slugDe } from './nombres.mjs';

const plantilla = [
  { slug: 'sofia-maldonado', nombre: 'Sofía Maldonado', nombreCompleto: 'Sofía Maldonado Díaz' },
  { slug: 'jocelyn-urias', nombre: 'Jocelyn Urías', nombreCompleto: null },
  { slug: 'ovalle', nombre: 'Ovalle', nombreCompleto: null },
  { slug: 'ana-lopez', nombre: 'Ana López', nombreCompleto: null },
  { slug: 'eva-lopez', nombre: 'Eva López', nombreCompleto: null },
];
const r = (nombre, slug = null) => resolverJugadora(nombre, slug, plantilla);

describe('slugDe', () => {
  it('quita acentos', () => {
    expect(slugDe('Paulett Muñoz')).toBe('paulett-munoz');
  });
});

describe('con slug propuesto', () => {
  it('lo acepta si el apellido coincide, sin importar acentos ni mayúsculas', () => {
    expect(r('JOCELYN URIAS', 'jocelyn-urias').jugadora.slug).toBe('jocelyn-urias');
    expect(r('Urias', 'jocelyn-urias').jugadora.slug).toBe('jocelyn-urias');
  });
  it('acepta el nombre completo del boletín', () => {
    expect(r('Sofía Maldonado Díaz', 'sofia-maldonado').jugadora.slug).toBe('sofia-maldonado');
  });
  it('lo rechaza si el apellido no coincide', () => {
    expect(r('Sofía Márquez', 'sofia-maldonado').duda).toContain('no coincide');
  });
});

describe('sin slug', () => {
  it('un apellido único se fusiona', () => {
    expect(r('Maldonado').jugadora.slug).toBe('sofia-maldonado');
    expect(r('Ovalle').jugadora.slug).toBe('ovalle');
  });
  it('un apellido repetido va a dudas', () => {
    expect(r('López').duda).toContain('Ana López');
  });
  it('un apellido nuevo es nueva', () => {
    expect(r('Hernández')).toEqual({ nueva: true });
  });
  it('completa a quien solo tenía apellido', () => {
    expect(r('María Ovalle').jugadora.slug).toBe('ovalle');
  });
  it('mismo apellido con otro nombre va a dudas, no se fusiona', () => {
    expect(r('Rosa López').duda).toContain('comparte apellido');
  });
  it('alguien nueva de verdad', () => {
    expect(r('Rosa Hernández')).toEqual({ nueva: true });
  });
});
