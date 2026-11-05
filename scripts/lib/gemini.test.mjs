import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { crearClienteGemini, crearClienteSimulado, extraerJSON, instruccionesDe } from './gemini.mjs';

const respuesta = (status, cuerpo) => ({ ok: status < 400, status, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });
const ok = (texto, uri) => respuesta(200, { candidates: [{ content: { parts: [{ text: texto }] }, groundingMetadata: { groundingChunks: uri ? [{ web: { uri, title: 'cbv.com.br' } }] : [] } }] });

let dir;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agentes-'));
  await writeFile(join(dir, '00-reglas-comunes.md'), 'Reglas. Hoy es {{HOY}}.');
  await writeFile(join(dir, '06-rankings.md'), '# Rankings\n\nTarea.\n\n## Prueba manual\n\nSecreto.\n');
});

const cliente = (pedir, extra = {}) => crearClienteGemini({
  clave: 'k', modelos: ['gemini-2.5-flash', 'gemini-3-flash'], hoy: '2026-11-05', dirAgentes: dir, fetch: pedir, dormir: async () => {}, ...extra,
});
const llamada = { agente: '06-rankings', mensaje: '{}' };

describe('instruccionesDe', () => {
  it('junta reglas y agente, sin la prueba manual y con la fecha', async () => {
    const t = await instruccionesDe('06-rankings', '2026-11-05', dir);
    expect(t).toContain('Hoy es 2026-11-05');
    expect(t).toContain('Tarea.');
    expect(t).not.toContain('Secreto');
    expect(t).not.toContain('Prueba manual');
  });
});

describe('crearClienteGemini', () => {
  it('manda instrucción de sistema, búsqueda y temperatura 0 en modelos 2.5', async () => {
    const pedir = vi.fn(async () => ok('{"a":1}', 'https://cbv.com.br/x'));
    const r = await cliente(pedir)(llamada);
    const cuerpo = JSON.parse(pedir.mock.calls[0][1].body);
    expect(cuerpo.system_instruction.parts[0].text).toContain('Tarea.');
    expect(cuerpo.tools).toEqual([{ google_search: {} }]);
    expect(cuerpo.generationConfig).toEqual({ temperature: 0 });
    expect(r).toEqual({ texto: '{"a":1}', fuentes: [{ uri: 'https://cbv.com.br/x', titulo: 'cbv.com.br' }], modelo: 'gemini-2.5-flash' });
  });
  it('en Gemini 3 deja la temperatura por defecto', async () => {
    const pedir = vi.fn(async () => ok('{}'));
    await cliente(pedir, { modelos: ['gemini-3-flash'] })(llamada);
    expect(JSON.parse(pedir.mock.calls[0][1].body).generationConfig).toEqual({});
  });
  it('con la cuota del día agotada pasa al siguiente modelo sin esperar', async () => {
    const dormir = vi.fn(async () => {});
    const pedir = vi.fn(async (url) => (url.includes('2.5') ? respuesta(429, 'GenerateRequestsPerDayPerProject') : ok('{}')));
    const r = await cliente(pedir, { dormir })(llamada);
    expect(r.modelo).toBe('gemini-3-flash');
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(dormir).not.toHaveBeenCalled();
  });
  it('un 429 pasajero se reintenta con espera creciente', async () => {
    const dormir = vi.fn(async () => {});
    const pedir = vi.fn().mockResolvedValueOnce(respuesta(429, 'rate')).mockResolvedValueOnce(respuesta(503, 'x')).mockResolvedValueOnce(ok('{}'));
    const r = await cliente(pedir, { dormir, esperaMs: 10 })(llamada);
    expect(r.modelo).toBe('gemini-2.5-flash');
    expect(dormir.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });
  it('si ninguno responde, falla diciendo por qué', async () => {
    await expect(cliente(async () => respuesta(429, 'per day'))(llamada)).rejects.toThrow('cuota del día agotada');
  });
  it('un error de la petición no se reintenta', async () => {
    const pedir = vi.fn(async () => respuesta(400, 'mal'));
    await expect(cliente(pedir)(llamada)).rejects.toThrow('400');
    expect(pedir).toHaveBeenCalledTimes(1);
  });
  it('pausa entre llamadas, no antes de la primera', async () => {
    const dormir = vi.fn(async () => {});
    const llamar = cliente(async () => ok('{}'), { dormir, pausaMs: 8000 });
    await llamar(llamada);
    expect(dormir).not.toHaveBeenCalled();
    await llamar(llamada);
    expect(dormir).toHaveBeenCalledWith(8000);
  });
});

describe('crearClienteSimulado', () => {
  it('reemplaza fechas relativas y la clave', async () => {
    await writeFile(join(dir, 'x.json'), JSON.stringify({ fuentes: ['https://a.mx/'], respuestas: { '*': { fecha: '{{HOY+3}}', slug: '{{CLAVE}}' } } }));
    const r = await crearClienteSimulado(dir, '2026-12-30')({ agente: 'x', clave: 'ana' });
    expect(extraerJSON(r.texto)).toEqual({ fecha: '2027-01-02', slug: 'ana' });
    expect(r.fuentes).toEqual([{ uri: 'https://a.mx/', titulo: null }]);
  });
});
