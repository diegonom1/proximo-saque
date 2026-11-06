import { describe, expect, it } from 'vitest';
import { numerosSeleccion } from './numeros';

const ahora = Date.parse('2026-11-05T12:00:00Z');
const base = {
  activas: [{ clubId: 'a' }, { clubId: 'a' }, { clubId: 'b' }, { clubId: 'c' }, { clubId: null }, { clubId: 'fantasma' }],
  clubes: {
    a: { pais: 'Brasil', ligaId: 'superliga-br' },
    b: { pais: 'Brasil', ligaId: 'otra-br' },
    c: { pais: 'Italia', ligaId: null },
  },
  partidos: [
    { inicio: '2026-11-01T12:00:00Z' }, // ya se jugó
    { inicio: '2026-11-06T12:00:00Z' },
    { inicio: '2026-12-20T11:00:00Z' }, // día 45
    { inicio: '2026-12-21T12:00:00Z' }, // día 46
  ],
  torneos: [
    { fechaFin: '2026-09-27', medalla: 'plata' },
    { fechaFin: '2026-06-08', medalla: 'oro' },
    { fechaFin: '2025-09-07', medalla: null },
    { fechaFin: '2020-01-01', medalla: 'oro' }, // fuera de los recientes
  ],
  maximo: 3,
  ahora,
};

const valor = (rotulo: string, entrada = base) => numerosSeleccion(entrada).find((n) => n.rotulo.startsWith(rotulo))?.valor;

describe('numerosSeleccion', () => {
  it('cuenta a todas las activas, tengan club o no', () => {
    expect(valor('Seleccionadas')).toBe(6);
  });
  it('cuenta países y ligas distintos, sin repetir ni contar lo vacío', () => {
    expect(valor('Países')).toBe(2);
    expect(valor('Ligas')).toBe(2);
  });
  it('solo cuenta los partidos que faltan dentro de los 45 días', () => {
    expect(valor('Partidos')).toBe(2);
  });
  it('solo cuenta medallas de los torneos más recientes', () => {
    expect(valor('Medallas')).toBe(2);
  });
  it('el rótulo dice cuántos torneos hay en realidad', () => {
    const rotulos = numerosSeleccion({ ...base, torneos: base.torneos.slice(0, 2), maximo: 7 }).map((n) => n.rotulo);
    expect(rotulos).toContain('Medallas en 2 torneos');
  });
});
