import { describe, expect, it } from 'vitest';
import { desfaseMin, fechaEnZona, isoEnZona, relojLocalAUtc, zonaValida } from './tiempo.mjs';

describe('zonaValida', () => {
  it('acepta zonas IANA y rechaza lo demás', () => {
    expect(zonaValida('Europe/Rome')).toBe(true);
    expect(zonaValida('Marte/Olympus')).toBe(false);
    expect(zonaValida('')).toBe(false);
    expect(zonaValida(null)).toBe(false);
  });
});

describe('desfaseMin', () => {
  it('respeta el horario de verano', () => {
    expect(desfaseMin('Europe/Rome', Date.UTC(2026, 0, 15))).toBe(60);
    expect(desfaseMin('Europe/Rome', Date.UTC(2026, 6, 15))).toBe(120);
  });
  it('funciona con zonas sin cambio de horario y con UTC', () => {
    expect(desfaseMin('America/Mexico_City', Date.UTC(2026, 6, 15))).toBe(-360);
    expect(desfaseMin('Asia/Shanghai', Date.UTC(2026, 6, 15))).toBe(480);
    expect(desfaseMin('UTC', Date.UTC(2026, 6, 15))).toBe(0);
  });
});

describe('relojLocalAUtc e isoEnZona', () => {
  it('convierte la hora de la sede a UTC', () => {
    expect(relojLocalAUtc('2026-11-08', '17:00', 'Europe/Rome')).toBe(Date.parse('2026-11-08T16:00:00Z'));
    expect(relojLocalAUtc('2026-11-07', '21:00', 'America/Sao_Paulo')).toBe(Date.parse('2026-11-08T00:00:00Z'));
  });
  it('calcula bien justo después del cambio de horario', () => {
    expect(relojLocalAUtc('2026-10-25', '17:00', 'Europe/Rome')).toBe(Date.parse('2026-10-25T16:00:00Z'));
    expect(relojLocalAUtc('2026-03-29', '17:00', 'Europe/Rome')).toBe(Date.parse('2026-03-29T15:00:00Z'));
  });
  it('escribe la hora local con su desfase', () => {
    expect(isoEnZona(Date.parse('2026-11-08T00:00:00Z'), 'America/Sao_Paulo')).toBe('2026-11-07T21:00:00-03:00');
    expect(isoEnZona(Date.parse('2026-11-07T07:00:00Z'), 'Asia/Shanghai')).toBe('2026-11-07T15:00:00+08:00');
  });
  it('ida y vuelta conserva el reloj local', () => {
    const ms = relojLocalAUtc('2027-01-08', '19:00', 'America/New_York');
    expect(isoEnZona(ms, 'America/New_York')).toBe('2027-01-08T19:00:00-05:00');
  });
});

describe('fechaEnZona', () => {
  it('da el día de la zona, no el de UTC', () => {
    const ms = Date.parse('2026-11-08T00:00:00Z');
    expect(fechaEnZona(ms, 'America/Sao_Paulo')).toBe('2026-11-07');
    expect(fechaEnZona(ms, 'Asia/Shanghai')).toBe('2026-11-08');
  });
});
