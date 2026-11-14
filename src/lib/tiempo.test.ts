import { describe, expect, it } from 'vitest';
import {
  agruparPorDia, cuentaCorta, empezoHace, cuentaRegresiva, diaLargo, diasHasta, enJuego, fechaGrande, hora, horaDelLugar, iniciales, partesDelDia, relativo, vigentes,
} from './tiempo';

const CDMX = 'America/Mexico_City';
const p = (inicio: string) => ({ inicio });

describe('formatos', () => {
  it('muestra la hora en la zona pedida y aparte la de la sede', () => {
    const partido = { ...p('2026-11-07T21:00:00-03:00'), zonaSede: 'America/Sao_Paulo' };
    expect(hora(Date.parse(partido.inicio), CDMX)).toBe('18:00');
    expect(horaDelLugar(partido)).toBe('21:00');
  });
  it('sin zonaSede no hay "allá"', () => {
    expect(horaDelLugar({ ...p('2026-11-18T18:00:00+01:00'), zonaSede: null })).toBeNull();
  });
  it('escribe el día con mayúscula y sin comas', () => {
    expect(diaLargo(Date.parse('2026-11-07T21:00:00-03:00'), CDMX)).toBe('Sábado 7 de noviembre');
  });
  it('fechaGrande usa el formato del hero', () => {
    expect(fechaGrande('2026-09-21')).toBe('21.09.26');
  });
  it('iniciales toma dos palabras', () => {
    expect(iniciales('Sofía Maldonado Díaz')).toBe('SM');
    expect(iniciales('Ovalle')).toBe('O');
  });
});

describe('diasHasta', () => {
  it('cuenta días de calendario, no bloques de 24 h', () => {
    const ahora = Date.parse('2026-11-04T23:00:00-06:00');
    expect(diasHasta(Date.parse('2026-11-05T01:00:00-06:00'), ahora, CDMX)).toBe(1);
  });
  it('relativo habla como persona', () => {
    expect([relativo(0), relativo(1), relativo(5)]).toEqual(['hoy', 'mañana', 'en 5 días']);
  });
});

describe('estados', () => {
  const inicio = '2026-11-07T21:00:00-03:00';
  const ms = Date.parse(inicio);
  it('en juego dura 150 minutos', () => {
    expect(enJuego(p(inicio), ms - 1)).toBe(false);
    expect(enJuego(p(inicio), ms)).toBe(true);
    expect(enJuego(p(inicio), ms + 149 * 6e4)).toBe(true);
    expect(enJuego(p(inicio), ms + 150 * 6e4)).toBe(false);
  });
  it('vigentes quita lo terminado y ordena', () => {
    const lista = [p('2026-11-09T10:00:00-03:00'), p(inicio), p('2026-11-01T10:00:00-03:00')];
    expect(vigentes(lista, ms + 6e4).map((x) => x.inicio)).toEqual([inicio, '2026-11-09T10:00:00-03:00']);
  });
});

describe('cuenta regresiva', () => {
  const ahora = Date.parse('2026-11-04T12:00:00Z');
  const falta = 2 * 864e5 + 4 * 36e5 + 5 * 6e4 + 9e3;
  it('separa días, horas, minutos y segundos', () => {
    expect(cuentaRegresiva(ahora + falta, ahora)).toEqual({ dias: 2, horas: 4, minutos: 5, segundos: 9, terminada: false });
  });
  it('se detiene en cero', () => {
    expect(cuentaRegresiva(ahora - 1000, ahora)).toMatchObject({ dias: 0, segundos: 0, terminada: true });
  });
  it('tiene versión corta para el botón flotante', () => {
    expect(cuentaCorta(ahora + falta, ahora)).toBe('2d 4h');
    expect(cuentaCorta(ahora + 4 * 36e5 + 5 * 6e4, ahora)).toBe('4h 05m');
    expect(cuentaCorta(ahora + 5 * 6e4, ahora)).toBe('5m');
  });
});

describe('agruparPorDia', () => {
  it('agrupa por el día del visitante, no el de la sede', () => {
    // En Pekín ya es día 8; en Ciudad de México sigue siendo 7.
    const lista = [p('2026-11-07T15:00:00-06:00'), p('2026-11-08T08:00:00+08:00'), p('2026-11-08T17:00:00+01:00')];
    const dias = agruparPorDia(lista, CDMX);
    expect(dias.map((d) => [d.dia, d.partidos.length])).toEqual([['2026-11-07', 2], ['2026-11-08', 1]]);
    expect(dias[0].titulo).toBe('Sábado 7 de noviembre');
  });
});

describe('partesDelDia', () => {
  it('da el bloque de fecha en mayúsculas y sin puntos', () => {
    expect(partesDelDia(Date.parse('2026-11-07T18:00:00-06:00'), 'America/Mexico_City')).toEqual({ semana: 'SÁB', dia: '07', mes: 'NOV' });
  });
  it('respeta la zona', () => {
    expect(partesDelDia(Date.parse('2026-11-08T02:00:00Z'), 'America/Mexico_City').dia).toBe('07');
    expect(partesDelDia(Date.parse('2026-11-08T02:00:00Z'), 'Asia/Shanghai').dia).toBe('08');
  });
});

describe('empezoHace', () => {
  const inicio = Date.parse('2026-11-13T21:00:00-03:00');
  it.each([[0, 'Acaba de empezar'], [32, 'Empezó hace 32 min'], [65, 'Empezó hace 1 h 05 min'], [149, 'Empezó hace 2 h 29 min']])('%i minutos: %s', (min, texto) => {
    expect(empezoHace(inicio, inicio + min * 6e4 + 20e3)).toBe(texto);
  });
});
