import { describe, expect, it } from 'vitest';
import { comprobarUrl, estadoResponde, finDeTemporada } from './temporadas.mjs';

describe('finDeTemporada', () => {
  it('entiende las formas de escribirla', () => {
    expect(finDeTemporada('2026-27')).toBe('2027-06-30');
    expect(finDeTemporada('2026/27')).toBe('2027-06-30');
    expect(finDeTemporada('2026-2027')).toBe('2027-06-30');
    expect(finDeTemporada('2099-00')).toBe('2100-06-30');
    expect(finDeTemporada('2027')).toBe('2027-12-31');
  });
  it('no inventa una fecha', () => {
    expect(finDeTemporada(null)).toBeNull();
    expect(finDeTemporada('temporada larga')).toBeNull();
  });
});

describe('estadoResponde', () => {
  it('un bot bloqueado no es una página caída', () => {
    for (const s of [200, 301, 401, 403, 429]) expect(estadoResponde(s), s).toBe(true);
  });
  it('lo demás sí', () => {
    for (const s of [400, 404, 410, 500, 503]) expect(estadoResponde(s), s).toBe(false);
  });
});

describe('comprobarUrl', () => {
  const conFetch = async (respuestas, fn) => {
    const original = globalThis.fetch;
    let n = 0;
    globalThis.fetch = async () => {
      const r = respuestas[Math.min(n, respuestas.length - 1)];
      n += 1;
      if (r instanceof Error) throw r;
      return { status: r, body: null };
    };
    try {
      return { resultado: await fn(), intentos: n };
    } finally {
      globalThis.fetch = original;
    }
  };
  it('un tropiezo no avisa: el reintento manda', async () => {
    const { resultado, intentos } = await conFetch([503, 200], () => comprobarUrl('https://a.mx', 0));
    expect(resultado.responde).toBe(true);
    expect(intentos).toBe(2);
  });
  it('si falla dos veces no responde y dice por qué', async () => {
    const { resultado } = await conFetch([404], () => comprobarUrl('https://a.mx', 0));
    expect(resultado).toEqual({ responde: false, detalle: 'respondió 404' });
  });
  it('sin conexión tampoco', async () => {
    const { resultado } = await conFetch([new TypeError('fetch failed')], () => comprobarUrl('https://a.mx', 0));
    expect(resultado).toEqual({ responde: false, detalle: 'no se pudo conectar' });
  });
  it('si responde a la primera no reintenta', async () => {
    const { intentos } = await conFetch([200], () => comprobarUrl('https://a.mx', 0));
    expect(intentos).toBe(1);
  });
});
