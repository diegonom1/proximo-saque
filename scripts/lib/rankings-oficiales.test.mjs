import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PAGINA_FIVB, crearDescargaSimulada, fechaEnIngles, fivbDeJson, leerFivb, leerNorceca, norcecaDeHtml, paginaDeRankings, paginaFemenil } from './rankings-oficiales.mjs';

const copia = (nombre) => readFile(new URL(`../pruebas/paginas/${nombre}`, import.meta.url), 'utf8');
const descargar = crearDescargaSimulada(copia);
const FEMENIL = 'https://norceca.net/Ranking/Volleyball/Ranking%202025/Doc/Women%20Rankings%202025.htm';

describe('fechaEnIngles', () => {
  it('entiende los dos formatos', () => {
    expect(fechaEnIngles('15 Oct 2026 - 10:40 am UTC')).toBe('2026-10-15');
    expect(fechaEnIngles('31 December 2025')).toBe('2025-12-31');
    expect(fechaEnIngles('3 Mar 2027')).toBe('2027-03-03');
  });
  it('no inventa una fecha', () => {
    expect(() => fechaEnIngles('ayer')).toThrow('no entendí');
    expect(() => fechaEnIngles(undefined)).toThrow('no entendí');
  });
});

describe('FIVB', () => {
  it('lee lugar, puntos exactos y fecha de la respuesta real', async () => {
    expect(await leerFivb(descargar)).toEqual({ posicion: 21, puntos: 201.88, fecha: '2026-10-15', fuente: PAGINA_FIVB });
  });
  it('rechaza el ranking varonil', async () => {
    const doc = JSON.parse(await copia('fivb-ranking.json'));
    expect(() => fivbDeJson({ ...doc, gender: 1 })).toThrow('gender 1');
  });
  it('rechaza una respuesta con otra forma', () => {
    expect(() => fivbDeJson({ gender: 0, date: '15 Oct 2026' })).toThrow('no trae equipos');
    expect(() => fivbDeJson({ gender: 0, date: '15 Oct 2026', teams: [{ federationCode: 'MEX', rank: 'x', decimalPoints: 1 }] })).toThrow();
  });
  it('busca a México en las páginas siguientes', async () => {
    const doc = JSON.parse(await copia('fivb-ranking.json'));
    const sinMexico = { ...doc, teams: doc.teams.filter((t) => t.federationCode !== 'MEX') };
    const paginas = [sinMexico, doc];
    expect((await leerFivb(async () => JSON.stringify(paginas.shift()))).posicion).toBe(21);
  });
  it('si no aparece en ninguna, lo dice', async () => {
    const doc = JSON.parse(await copia('fivb-ranking.json'));
    const sinMexico = JSON.stringify({ ...doc, teams: doc.teams.filter((t) => t.federationCode !== 'MEX') });
    await expect(leerFivb(async () => sinMexico)).rejects.toThrow('México no aparece');
  });
});

describe('NORCECA', () => {
  it('llega desde el menú y lee lugar, puntos y fecha de la página real', async () => {
    expect(await leerNorceca(descargar)).toEqual({ posicion: 5, puntos: 183, fecha: '2025-12-31', fuente: FEMENIL });
  });
  it('si el menú enlaza varios años, usa el más reciente', () => {
    const html = '<a href="https://norceca.net/Ranking/Volleyball/Ranking%202025/Doc/2025-Ranking%20Pages.htm">a</a><a href="https://norceca.net/Ranking/Volleyball/Ranking%202026/Doc/2026-Ranking%20Pages.htm">b</a>';
    expect(paginaDeRankings(html, 'https://norceca.net/')).toContain('2026-Ranking');
  });
  it('no confunde la mayor con U21 ni U23', async () => {
    expect(paginaFemenil(await copia('norceca-rankings.html'), FEMENIL)).toBe(FEMENIL);
  });
  it('rechaza una página que no es la femenil mayor', async () => {
    const html = (await copia('norceca-femenil.html')).replace(/Women's Senior Ranking/g, "Men's Senior Ranking");
    expect(() => norcecaDeHtml(html, FEMENIL)).toThrow('no es el ranking femenil mayor');
  });
  it('rechaza una página sin fecha o sin México', async () => {
    const html = await copia('norceca-femenil.html');
    expect(() => norcecaDeHtml(html.replace(/As per/g, 'Hasta'), FEMENIL)).toThrow('a qué fecha');
    expect(() => norcecaDeHtml(html.replace(/MEX/g, 'XXX'), FEMENIL)).toThrow('México no aparece');
  });
  it('si cambia el menú, lo dice', () => {
    expect(() => paginaDeRankings('<a href="/otra.htm">x</a>', 'https://norceca.net/')).toThrow('no enlaza');
  });
});
