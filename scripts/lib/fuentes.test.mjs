import { describe, expect, it, vi } from 'vitest';
import { crearVerificador, dominio, fuenteAdmisible } from './fuentes.mjs';
import { esListado, esVideoSuelto, filasDeAtributos, fuenteAdmisible as admisible } from './fuentes.mjs';

const http = (status, location) => ({ status, headers: { get: () => location ?? null } });
const REDIRECCION = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc';

describe('fuentes que nunca valen', () => {
  it.each([
    'https://www.threads.com/@sitemelhordovolei/post/DZIP0nhjn3b/mercado',
    'https://www.threads.net/@cuenta/post/1',
    'https://www.facebook.com/okformis/posts/1',
    'https://www.tiktok.com/discover/arleth',
    'https://www.instagram.com/p/1',
    'https://www.youtube.com/watch?v=A4LupRHEcS0',
    'https://youtube.com/shorts/abc',
    'https://www.youtube.com/live/abc',
    'https://youtu.be/A4LupRHEcS0',
  ])('%s', (url) => expect(admisible(url)).toBe(false));
  it('el canal de YouTube sí', () => {
    expect(esVideoSuelto('https://www.youtube.com/@legavolleyfemminile')).toBe(false);
    expect(admisible('https://www.youtube.com/@legavolleyfemminile')).toBe(true);
  });
  it('una página que solo se llama parecido sí', () => expect(admisible('https://notyoutube.com/watch?v=1')).toBe(true));
});

describe('esListado', () => {
  it.each([
    'https://women.volleybox.net/players?country=MX',
    'https://women.volleybox.net/players',
    'https://sitio.mx/search?q=sofia',
    'https://sitio.mx/buscar/maldonado',
    'https://club.it/squadra?page=2',
    'https://fmvb.org/seleccion/jugadoras/',
    'https://women.volleybox.net/mackenzie-t5/players',
    'https://en.volleyballworld.com/teams/mexico/roster',
    'https://noticias.mx/tag/voleibol',
    'https://volleybox.net/penny-tusa-p29605/teammates',
    'https://women.volleybox.net/samantha-bricio-p5050/movies?orderValue=add_date&orderDirection=asc',
    'https://women.volleybox.net/tr/marian-ovalle-p24597/fans',
  ])('%s es un listado', (url) => expect(esListado(url)).toBe(true));
  it.each([
    'https://women.volleybox.net/uxue-guereca-p13878',
    'https://noticias.mx/deportes/sofia-maldonado-mvp-final-four',
    'https://norceca.info/mexicos-sofia-maldonado-named-most-valuable-player/',
    'https://sitio.mx/nota?utm_source=x',
  ])('%s no lo es', (url) => expect(esListado(url)).toBe(false));
  it('una URL inválida no es listado', () => expect(esListado('no')).toBe(false));
});

describe('filasDeAtributos', () => {
  it('saca la fila completa de aria-label y decodifica', () => {
    expect(filasDeAtributos('<a aria-label="Nancy contre B&amp;B, samedi 21 novembre, 20:00" href="/x">')).toEqual(['Nancy contre B&B, samedi 21 novembre, 20:00']);
  });
  it('ignora etiquetas sin números y repetidas', () => {
    expect(filasDeAtributos('<a aria-label="Ir al inicio del sitio"><a title="Jornada 9 del torneo"><a title="Jornada 9 del torneo">')).toEqual(['Jornada 9 del torneo']);
  });
});

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

describe('fuenteAdmisible', () => {
  it('rechaza redes sociales', () => {
    for (const u of ['https://www.instagram.com/samybricio', 'https://linkedin.com/in/x', 'https://x.com/a/status/1', 'https://twitter.com/a', 'https://m.facebook.com/a']) expect(fuenteAdmisible(u)).toBe(false);
  });
  it('rechaza portadas', () => {
    expect(fuenteAdmisible('https://cbv.com.br/')).toBe(false);
    expect(fuenteAdmisible('https://cbv.com.br')).toBe(false);
  });
  it('acepta páginas internas y consultas', () => {
    expect(fuenteAdmisible('https://cbv.com.br/tabela')).toBe(true);
    expect(fuenteAdmisible('https://agorarn.com.br/?p=2408078')).toBe(true);
  });
  it('un verificador con red tampoco las deja pasar', async () => {
    const v = crearVerificador({ red: false });
    expect(await v('https://www.instagram.com/x', [{ uri: 'https://www.instagram.com/x', titulo: null }])).toBeNull();
    expect(await v('https://cbv.com.br/', [{ uri: 'https://cbv.com.br/x', titulo: null }])).toBeNull();
  });
});
