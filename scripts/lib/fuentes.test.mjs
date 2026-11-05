import { describe, expect, it, vi } from 'vitest';
import { crearVerificador, dominio } from './fuentes.mjs';

const http = (status, location) => ({ status, headers: { get: () => location ?? null } });
const REDIRECCION = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc';

describe('dominio', () => {
  it('quita www', () => {
    expect(dominio('https://www.FIVB.com/a')).toBe('fivb.com');
    expect(dominio('nada')).toBeNull();
  });
});

describe('verificar', () => {
  it('acepta el dominio que viene en las fuentes de la respuesta, sin abrir la página', async () => {
    const pedir = vi.fn();
    const v = crearVerificador({ fetch: pedir });
    expect(await v('https://volleybox.net/es/x', [{ uri: 'https://volleybox.net/es/y', titulo: null }])).toBe('https://volleybox.net/es/x');
    expect(pedir).not.toHaveBeenCalled();
  });
  it('acepta un subdominio del mismo sitio', async () => {
    const v = crearVerificador({ red: false });
    expect(await v('https://en.volleyballworld.com/a', [{ uri: 'https://volleyballworld.com/b', titulo: null }])).toBeTruthy();
  });
  it('si no viene en las fuentes, debe abrir con 2xx o 3xx', async () => {
    expect(await crearVerificador({ fetch: async () => http(200) })('https://a.mx/x')).toBe('https://a.mx/x');
    expect(await crearVerificador({ fetch: async () => http(301) })('https://a.mx/x')).toBe('https://a.mx/x');
    expect(await crearVerificador({ fetch: async () => http(404) })('https://a.mx/x')).toBeNull();
  });
  it('Volleybox contesta 403 a los bots: sin estar en las fuentes no pasa', async () => {
    expect(await crearVerificador({ fetch: async () => http(403) })('https://volleybox.net/x')).toBeNull();
  });
  it('un sitio que no acepta HEAD se prueba con GET', async () => {
    const pedir = vi.fn(async (_, o) => http(o.method === 'HEAD' ? 405 : 200));
    expect(await crearVerificador({ fetch: pedir })('https://a.mx/x')).toBe('https://a.mx/x');
  });
  it('una página caída no pasa', async () => {
    expect(await crearVerificador({ fetch: async () => { throw new Error('red'); } })('https://a.mx/x')).toBeNull();
  });
  it('resuelve los enlaces de redirección de Google a su URL final', async () => {
    const pedir = vi.fn(async () => http(302, 'https://cbv.com.br/tabela'));
    const v = crearVerificador({ fetch: pedir });
    expect(await v(REDIRECCION, [{ uri: REDIRECCION, titulo: null }])).toBe('https://cbv.com.br/tabela');
  });
  it('rechaza lo que no es URL', async () => {
    const v = crearVerificador({ red: false });
    expect(await v(null)).toBeNull();
    expect(await v('javascript:alert(1)')).toBeNull();
  });
  it('en modo sin red no abre nada', async () => {
    expect(await crearVerificador({ red: false })('https://a.mx/x')).toBeNull();
  });
  it('abre cada URL una sola vez', async () => {
    const pedir = vi.fn(async () => http(200));
    const v = crearVerificador({ fetch: pedir });
    await v('https://a.mx/x');
    await v('https://a.mx/x');
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
