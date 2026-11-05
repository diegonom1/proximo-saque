import { describe, expect, it } from 'vitest';
import { fechaLegible, lugarTexto, rangoFechas, ruta, tendencia } from './presentacion';

describe('fechas', () => {
  it('escribe fechas cortas sin puntos', () => {
    expect(fechaLegible('2026-09-21')).toBe('21 sep 2026');
  });
  it('no se recorre de día por la zona', () => {
    expect(fechaLegible('2026-01-01')).toBe('1 ene 2026');
  });
  it('resume rangos', () => {
    expect(rangoFechas('2026-09-21', '2026-09-27')).toBe('21–27 sep 2026');
    expect(rangoFechas('2026-09-28', '2026-10-03')).toBe('28 sep – 3 oct 2026');
    expect(rangoFechas('2026-12-28', '2027-01-03')).toBe('28 dic 2026 – 3 ene 2027');
    expect(rangoFechas(null, '2026-09-27')).toBe('27 sep 2026');
  });
});

describe('textos', () => {
  it('lugarTexto', () => {
    expect(lugarTexto(2)).toBe('2.º lugar');
    expect(lugarTexto(null)).toBe('Lugar por confirmar');
    expect(lugarTexto(null, 'Fase de grupos')).toBe('Fase de grupos');
    expect(lugarTexto(24, 'Fase de grupos')).toBe('24.º lugar'); // el lugar confirmado manda
  });
  it('ruta respeta la base', () => {
    expect(ruta('agenda')).toBe('/agenda');
    expect(ruta()).toBe('/');
  });
});

describe('tendencia', () => {
  const h = (posicion: number | null, puntos: number | null, ranking = 'fivb') => ({ ranking, posicion, puntos });
  it('un lugar menor es subir', () => {
    expect(tendencia({ posicion: 20, puntos: 170 }, [h(25, 160)], 'fivb')).toBe('sube');
    expect(tendencia({ posicion: 25, puntos: 160 }, [h(20, 170)], 'fivb')).toBe('baja');
  });
  it('sin lugares deciden los puntos', () => {
    expect(tendencia({ posicion: null, puntos: 170 }, [h(null, 166.82)], 'fivb')).toBe('sube');
  });
  it('usa el registro más reciente que sea distinto', () => {
    expect(tendencia({ posicion: 20, puntos: 170 }, [h(30, 150), h(18, 180), h(20, 170)], 'fivb')).toBe('baja');
  });
  it('no mezcla rankings', () => {
    expect(tendencia({ posicion: 3, puntos: 180 }, [h(9, 100, 'norceca')], 'fivb')).toBeNull();
  });
  it('sin historial no hay flecha', () => {
    expect(tendencia({ posicion: 3, puntos: 180 }, [], 'fivb')).toBeNull();
  });
});
