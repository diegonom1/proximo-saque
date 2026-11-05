import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evidenciaParticipacion, evidenciaPartido, fechasEn, normalizar, palabrasDe } from './evidencia.mjs';

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
  describe('bloque de Lega Volley: fecha, hora, sede y al final los equipos', () => {
    const UYBA = ['UYBA Volley Busto Arsizio', 'Laica Cioccolato Uyba'];
    const bloque = '13 Dicembre 2026\n#3095\n13/12/2026\n17:00\nLVF A1 Fineco\n1\na\nGiornata - Ritorno\nPala Igor - Novara\nMATCH CENTER\nIgor Gorgonzola Novara\nLaica Cioccolato Uyba\n20 Dicembre 2026\n#3102\n20/12/2026\n17:30\nLVF A1 Fineco\nE-Work Biella Forum - Biella\nMATCH CENTER\nLaica Cioccolato Uyba\nProsecco Doc A.Carraro Imoco Conegliano';
    it('la hora junto a la fecha es la del partido', () => expect(ver(bloque, '2026-12-13', '17:00', 'Igor Gorgonzola Novara', UYBA)).toBe('completa'));
    it('la hora del bloque de al lado no cuenta', () => expect(ver(bloque, '2026-12-20', '17:00', 'Imoco Conegliano', UYBA)).toBe('sinHora'));
    it('la fecha del bloque de al lado tampoco', () => expect(ver(bloque, '2026-12-20', '17:30', 'Igor Gorgonzola Novara', UYBA)).toBe('nada'));
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

describe('evidenciaParticipacion', () => {
  const MUNDIAL = ['Campeonato Mundial', 'Mundial', 'World Championship'];
  const COPA = ['Copa del Mundo', 'World Cup', 'Copa Mundial'];
  const ver2 = (titulo, contenido, nombres = MUNDIAL, edicion = 2027) => evidenciaParticipacion({ titulo, contenido }, nombres, edicion);
  // Textos reales de Claro Sports y de la FIVB.
  const CLARO = 'México tendrá nuevamente representación femenil y varonil en el voleibol de sala de los Campeonatos Mundiales de 2027, al lograr la clasificación por ubicarse el sitio 21 y 24 del ranking de la disciplina, respectivamente.';
  const FIVB = 'All 32 teams are set to compete for glory in the United States and Canada. Finally, the Netherlands, Russia, Germany, Czechia, Belgium, France, Slovenia, Sweden, Mexico, Ukraine, Greece, Korea, Bulgaria and Switzerland qualified through this pathway.';

  it('acepta la nota de Claro', () => expect(ver2('México clasifica con sus selecciones femenil y varonil a los Mundiales de Voleibol de 2027', CLARO)).toBe(true));
  it('acepta la lista de clasificados de la FIVB, con el torneo en el título', () => {
    expect(ver2('Qualified Teams confirmed for the 2027 FIVB Volleyball Women\'s World Cup', FIVB, COPA)).toBe(true);
  });
  it('sin México en la lista no vale', () => {
    expect(ver2('Qualified Teams confirmed for the 2027 FIVB Volleyball Women\'s World Cup', FIVB.replace('Mexico, ', ''), COPA)).toBe(false);
  });
  it('que México se mencione sin participar no vale', () => {
    expect(ver2('Mundial femenil 2027', 'El Mundial de 2027 se jugará en Canadá. México fue sede de otro torneo de voleibol femenil.')).toBe(false);
  });
  it('otra edición no vale', () => expect(ver2('Mundial femenil 2025', 'México clasificó al Mundial de 2025 de voleibol femenil.')).toBe(false));
  it('otro torneo no vale', () => expect(ver2('Copa Panamericana 2027', 'México clasificó a la Copa Panamericana 2027 de voleibol femenil.')).toBe(false));
  it('la rama varonil no vale', () => {
    expect(ver2('Mundial varonil 2027', 'México clasificó al Mundial varonil de 2027. Las mujeres juegan otra liga.')).toBe(false);
  });
  it('una categoría juvenil no vale', () => {
    expect(ver2('Mundial Sub-21 femenil 2027', 'México clasificó al Mundial de 2027 de voleibol femenil.')).toBe(false);
    expect(ver2('Noticias', 'México clasificó al Mundial U21 de 2027 de voleibol femenil.')).toBe(false);
  });
  it('voleibol de playa no vale', () => expect(ver2('Noticias', 'México clasificó al Mundial de 2027 de voleibol de playa femenil.')).toBe(false));
  it('sin decir que es femenil no vale', () => expect(ver2('Mundial 2027', 'México clasificó al Mundial de 2027.')).toBe(false));
  it('sin edición basta el torneo', () => expect(ver2('Noticias', 'México clasificó al Mundial de voleibol femenil.', MUNDIAL, null)).toBe(true));
});
