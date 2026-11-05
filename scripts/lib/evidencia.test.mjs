import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evidenciaPartido, fechasEn, normalizar, palabrasDe } from './evidencia.mjs';

// Copia real de spikelive.fr/ligue/laf/calendrier: filas de aria-label + texto, y solo el texto de Tavily.
const pagina = (nombre) => readFileSync(new URL(`../pruebas/paginas/${nombre}`, import.meta.url), 'utf8');
const SPIKELIVE = pagina('spikelive-laf.txt');
const TAVILY = pagina('spikelive-laf-tavily.txt');
const NANCY = ['Vandœuvre Nancy Volley-Ball', 'Vandœuvre Nancy', 'VNVB'];
const ver = (texto, fecha, hora, rival, propio = NANCY) => evidenciaPartido(texto, { fecha, hora, rival, propio });

describe('la página real de spikelive', () => {
  it.each([
    ['2026-11-21', '20:00', 'Béziers Volley'],
    ['2026-11-28', '19:00', 'Le Cannet'],
    ['2026-12-05', '20:45', 'Volley Mulhouse Alsace'],
    ['2026-12-12', '19:30', 'Levallois Paris'],
    ['2026-12-19', '14:00', 'France Avenir'],
  ])('el %s a las %s vs %s está completo', (fecha, hora, rival) => expect(ver(SPIKELIVE, fecha, hora, rival)).toBe('completa'));

  it.each([
    ['2026-11-21', 'Béziers Volley'],
    ['2026-12-05', 'Volley Mulhouse Alsace'],
    ['2026-12-12', 'Levallois Paris'],
  ])('las 14:00 que repitió Gemini el %s no valen', (fecha, rival) => expect(ver(SPIKELIVE, fecha, '14:00', rival)).toBe('sinHora'));

  it('"à partir de 14:00" no es la hora de un partido, aunque esté en la línea de abajo', () => {
    expect(ver(TAVILY, '2026-11-21', '14:00', 'Béziers Volley')).toBe('sinHora');
  });
  it('un rival de otra fecha no pasa', () => expect(ver(SPIKELIVE, '2026-11-21', '20:00', 'Le Cannet')).toBe('nada'));
  it('la fila de un rival contra otro equipo no cuenta', () => {
    // Évreux juega el 21 de noviembre, pero contra Le Cannet.
    expect(ver(SPIKELIVE, '2026-11-21', '20:00', 'Évreux')).toBe('nada');
  });
  it('sin aria-label, el encabezado da la fecha del bloque', () => {
    expect(ver(TAVILY, '2026-11-07', null, 'Chamalières')).toBe('sinHora');
    expect(ver(TAVILY, '2026-11-14', null, 'Chamalières')).toBe('nada');
  });
});

describe('evidenciaPartido', () => {
  const uyba = ['UYBA Volley Busto Arsizio', 'Busto Arsizio'];
  it('fila de calendario de un club, sin su nombre en cada fila', () => {
    expect(ver('Calendario UYBA\nSab 22/11/2026 17:00 Il Bisonte Firenze\nDom 29/11/2026 17:00 Brescia', '2026-11-22', '17:00', 'Il Bisonte Firenze', uyba)).toBe('completa');
  });
  it('fecha en portugués y hora con h', () => {
    expect(ver('13 de novembro, 21h30 - Sesi Bauru x Osasco', '2026-11-13', '21:30', 'Osasco São Cristóvão', ['Sesi Bauru'])).toBe('completa');
  });
  it('fecha en chino', () => {
    expect(ver('11月7日 15:00 北京北冰洋 对 天津渤海银行', '2026-11-07', '15:00', '天津渤海银行', ['北京北冰洋'])).toBe('completa');
  });
  it('hora en inglés de 12 horas', () => {
    expect(ver('Dec 17, 7:30 PM LOVB Miami vs LOVB Austin', '2026-12-17', '19:30', 'LOVB Austin', ['LOVB Miami'])).toBe('completa');
  });
  it('hora en la línea de abajo, sola', () => {
    expect(ver('Samedi 7 novembre\nNancy Nantes\n19:30', '2026-11-07', '19:30', 'Nantes', ['Nancy'])).toBe('completa');
  });
  it('en un párrafo sin saltos busca alrededor del rival', () => {
    const relleno = 'palabras sin datos '.repeat(40);
    expect(ver(`${relleno}el 21 de noviembre a las 20:00 juega Nancy ante Béziers. ${relleno}`, '2026-11-21', '20:00', 'Béziers', ['Nancy'])).toBe('completa');
    expect(ver(`21 de noviembre a las 20:00. ${relleno}Nancy ante Béziers. ${relleno}`, '2026-11-21', '20:00', 'Béziers', ['Nancy'])).toBe('nada');
  });
  it('"20:30" no pasa por "20:00" ni "120:00" por "20:00"', () => {
    expect(ver('21/11 20:30 Nancy Béziers', '2026-11-21', '20:00', 'Béziers', ['Nancy'])).toBe('sinHora');
    expect(ver('21/11 120:00 Nancy Béziers', '2026-11-21', '20:00', 'Béziers', ['Nancy'])).toBe('sinHora');
  });
  it('sin hora que comprobar nunca es completa', () => expect(ver('21/11 Nancy Béziers', '2026-11-21', null, 'Béziers', ['Nancy'])).toBe('sinHora'));
  it('un texto vacío no tiene evidencia', () => expect(ver('', '2026-11-21', '20:00', 'Béziers')).toBe('nada'));
});

describe('fechasEn', () => {
  it.each([
    ['samedi 21 novembre', '11-21'], ['1er décembre', '12-01'], ['7 de novembro', '11-07'], ['8 novembre 2026', '11-08'],
    ['nov 7', '11-07'], ['december 17th', '12-17'], ['2026-11-07', '11-07'], ['11月7日', '11-07'], ['07/11', '11-07'],
  ])('%s', (texto, esperado) => expect([...fechasEn(normalizar(texto))]).toContain(esperado));
  it('las horas y los marcadores no son fechas', () => {
    expect(fechasEn('20.00')).toEqual(new Set());
    expect(fechasEn('25-20 3-1')).toEqual(new Set());
    expect(fechasEn('20:30')).toEqual(new Set());
  });
});

describe('palabrasDe', () => {
  it('quita lo genérico y lo corto', () => expect(palabrasDe('Béziers Volley')).toEqual(['beziers']));
  it('"Le Cannet" es "cannet"', () => expect(palabrasDe('Le Cannet')).toEqual(['cannet']));
  it('sin palabras útiles usa el nombre', () => expect(palabrasDe('LA VC')).toEqual(['la vc']));
  it('los nombres en chino se quedan', () => expect(palabrasDe('天津渤海银行')).toEqual(['天津渤海银行']));
});
