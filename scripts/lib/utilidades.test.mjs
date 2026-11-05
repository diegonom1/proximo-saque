import { describe, expect, it } from 'vitest';
import { extraerJSON } from './gemini.mjs';
import { limpiarHtml, urlValida } from './fuentes.mjs';

describe('extraerJSON', () => {
  it('lee un bloque con cerca', () => {
    expect(extraerJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('ignora el texto alrededor', () => {
    expect(extraerJSON('Aquí está: {"a":[1,2]} listo')).toEqual({ a: [1, 2] });
  });
  it('falla si no hay JSON', () => {
    expect(() => extraerJSON('sin datos')).toThrow('no trae JSON');
  });
});

describe('fuentes', () => {
  it('limpiarHtml deja solo el texto', () => {
    expect(limpiarHtml('<style>a{}</style><p>Hola&nbsp;<b>mundo</b></p><script>x()</script>')).toBe('Hola mundo');
  });
  it('limpiarHtml no decodifica dos veces', () => {
    expect(limpiarHtml('&amp;quot;')).toBe('&quot;');
  });
  it('urlValida solo acepta http y https', () => {
    expect(urlValida('https://cbv.com.br/')).toBe('https://cbv.com.br/');
    expect(urlValida('javascript:alert(1)')).toBeNull();
    expect(urlValida(null)).toBeNull();
  });
});
