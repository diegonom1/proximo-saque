import { describe, expect, it, vi } from 'vitest';
import { crearBuscadorTavily, normalizarUrl, verificadorDeResultados } from './busqueda.mjs';

const json = (cuerpo, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo });

function api({ usados = 0, resultados = [{ url: 'https://a.mx/1', title: 'A', content: 'texto corto' }], extraidos = [], status = {} } = {}) {
  return vi.fn(async (url) => {
    const ruta = new URL(url).pathname;
    if (status[ruta]) return json({}, status[ruta]);
    if (ruta === '/usage') return json({ account: { plan_usage: usados } });
    if (ruta === '/search') return json({ results: resultados });
    return json({ results: extraidos, failed_results: [] });
  });
}
const cuerpos = (pedir, ruta) => pedir.mock.calls.filter(([u]) => u.endsWith(ruta)).map(([, o]) => JSON.parse(o.body));
const buscador = (pedir, extra = {}) => crearBuscadorTavily({ clave: 'k', fetch: pedir, ...extra });

describe('normalizarUrl', () => {
  it('ignora www, ancla, barra final y utm', () => {
    expect(normalizarUrl('https://www.CBV.com.br/tabela/?utm_source=x#top')).toBe('https://cbv.com.br/tabela');
  });
  it('conserva lo que sí distingue una página', () => {
    expect(normalizarUrl('https://a.mx/x?id=1')).not.toBe(normalizarUrl('https://a.mx/x?id=2'));
  });
});

describe('verificadorDeResultados', () => {
  const verificar = verificadorDeResultados([{ url: 'https://www.cbv.com.br/tabela/' }]);
  it('acepta la URL que vino en los resultados y devuelve la original', async () => {
    expect(await verificar('https://cbv.com.br/tabela')).toBe('https://www.cbv.com.br/tabela/');
  });
  it('rechaza otra página del mismo dominio', async () => {
    expect(await verificar('https://cbv.com.br/otra')).toBeNull();
  });
  it('rechaza lo que no es URL', async () => {
    expect(await verificar(null)).toBeNull();
  });
  it('rechaza redes y portadas aunque vengan en los resultados', async () => {
    const v = verificadorDeResultados([{ url: 'https://www.instagram.com/x' }, { url: 'https://cbv.com.br/' }]);
    expect(await v('https://www.instagram.com/x')).toBeNull();
    expect(await v('https://cbv.com.br/')).toBeNull();
  });
  it('aplica la condición extra', async () => {
    const v = verificadorDeResultados([{ url: 'https://a.mx/1', titulo: 'sí' }, { url: 'https://a.mx/2', titulo: 'no' }], (r) => r.titulo === 'sí');
    expect(await v('https://a.mx/1')).toBe('https://a.mx/1');
    expect(await v('https://a.mx/2')).toBeNull();
  });
});

describe('investigar', () => {
  it('manda la clave en el encabezado, nunca en la URL ni en el cuerpo', async () => {
    const pedir = api();
    await buscador(pedir).investigar({ consultas: [{ texto: 'q' }] });
    for (const [url, opciones] of pedir.mock.calls) {
      expect(url).not.toContain('k=');
      expect(opciones.headers.authorization).toBe('Bearer k');
      expect(opciones.body ?? '').not.toContain('Bearer');
    }
  });
  it('usa include_domains cuando hay dominios y excluye wikis cuando no', async () => {
    const pedir = api();
    await buscador(pedir).investigar({ consultas: [{ texto: 'a', dominios: ['volleybox.net'] }, { texto: 'b' }] });
    const [a, b] = cuerpos(pedir, '/search');
    expect(a).toMatchObject({ query: 'a', search_depth: 'basic', include_domains: ['volleybox.net'] });
    expect(b.exclude_domains).toContain('wikipedia.org');
  });
  it('junta resultados sin repetir y el texto extraído reemplaza al fragmento', async () => {
    const pedir = api({ extraidos: [{ url: 'https://a.mx/1', raw_content: 'página completa' }] });
    const { resultados } = await buscador(pedir).investigar({ consultas: [{ texto: 'a' }, { texto: 'b' }] });
    expect(resultados).toEqual([{ url: 'https://a.mx/1', titulo: 'A', contenido: 'página completa' }]);
  });
  it('una página fija cuenta como resultado si se pudo extraer', async () => {
    const pedir = api({ resultados: [], extraidos: [{ url: 'https://liga.mx/cal', raw_content: 'calendario' }] });
    const { resultados } = await buscador(pedir).investigar({ paginas: ['https://liga.mx/cal'], intencion: 'x' });
    expect(resultados.map((r) => r.url)).toEqual(['https://liga.mx/cal']);
  });
  it('una página que no se pudo extraer no cuenta', async () => {
    const pedir = api({ resultados: [], extraidos: [] });
    const { resultados } = await buscador(pedir).investigar({ paginas: ['https://liga.mx/cal'], intencion: 'x' });
    expect(resultados).toEqual([]);
  });
  it('extrae máximo 5 páginas, en una sola llamada', async () => {
    const pedir = api({ resultados: Array.from({ length: 9 }, (_, i) => ({ url: `https://a.mx/${i}`, content: 'x' })) });
    await buscador(pedir).investigar({ consultas: [{ texto: 'q' }], mejores: 9, intencion: 'y' });
    const [e] = cuerpos(pedir, '/extract');
    expect(e.urls).toHaveLength(5);
    expect(e).toMatchObject({ extract_depth: 'basic' });
    expect(e).not.toHaveProperty('query'); // con query Tavily devuelve fragmentos, no la página
    expect(cuerpos(pedir, '/extract')).toHaveLength(1);
  });
  it('nunca le muestra redes sociales a Gemini', async () => {
    const pedir = api({ resultados: [{ url: 'https://www.instagram.com/p/1', content: 'x' }, { url: 'https://a.mx/1', content: 'y' }] });
    const { resultados } = await buscador(pedir).investigar({ consultas: [{ texto: 'q' }], mejores: 0 });
    expect(resultados.map((r) => r.url)).toEqual(['https://a.mx/1']);
  });
  it('la lectura avanzada cuesta 2 créditos', async () => {
    const pedir = api();
    const b = buscador(pedir);
    await b.investigar({ consultas: [{ texto: 'q' }], avanzado: true });
    expect(cuerpos(pedir, '/extract')[0].extract_depth).toBe('advanced');
    expect((await b.resumen()).corrida).toBe(3);
  });
  it('recorta el contenido largo', async () => {
    const pedir = api({ extraidos: [{ url: 'https://a.mx/1', raw_content: 'x'.repeat(50000) }] });
    const { resultados } = await buscador(pedir).investigar({ consultas: [{ texto: 'q' }] });
    expect(resultados[0].contenido.length).toBe(20000);
  });
  it('recorta un fragmento de búsqueda más que una página', async () => {
    const pedir = api({ resultados: [{ url: 'https://a.mx/1', content: 'x'.repeat(50000) }] });
    const { resultados } = await buscador(pedir).investigar({ consultas: [{ texto: 'q' }], mejores: 0 });
    expect(resultados[0].contenido.length).toBe(6000);
  });
  it('conserva los saltos de línea de una página: separan las filas', async () => {
    const pedir = api({ extraidos: [{ url: 'https://a.mx/1', raw_content: 'Fila  uno\n\n  Fila dos' }] });
    const { resultados } = await buscador(pedir).investigar({ consultas: [{ texto: 'q' }] });
    expect(resultados[0].contenido).toBe('Fila uno\nFila dos');
  });
  describe('filas de los atributos', () => {
    const html = '<a aria-label="Nancy contre Béziers, samedi 21 novembre, 20:00"></a><a aria-label="Évreux contre Cannes, samedi 21 novembre, 15:00"></a>';
    const conPagina = (respuesta) => {
      const base = api({ extraidos: [{ url: 'https://a.mx/1', raw_content: 'Texto visible' }] });
      return vi.fn(async (url, opciones) => (url.startsWith('https://a.mx') ? respuesta : base(url, opciones)));
    };
    const pagina = { ok: true, headers: new Headers({ 'content-type': 'text/html' }), text: async () => html };
    const investigar = (pedir, filas) => buscador(pedir).investigar({ consultas: [{ texto: 'q' }], filas });

    it('antepone las filas que mencionan al club', async () => {
      const { resultados } = await investigar(conPagina(pagina), ['Nancy']);
      expect(resultados[0].contenido).toBe('Nancy contre Béziers, samedi 21 novembre, 20:00\nTexto visible');
    });
    it('sin pedirlas no abre la página', async () => {
      const pedir = conPagina(pagina);
      await investigar(pedir, null);
      expect(pedir.mock.calls.some(([u]) => u.startsWith('https://a.mx'))).toBe(false);
    });
    it('si la página no abre queda el texto de Tavily', async () => {
      const { resultados } = await investigar(conPagina({ ok: false, headers: new Headers() }), ['Nancy']);
      expect(resultados[0].contenido).toBe('Texto visible');
    });
    it('abrir la página no cobra créditos', async () => {
      const b = buscador(conPagina(pagina));
      await b.investigar({ consultas: [{ texto: 'q' }], filas: ['Nancy'] });
      expect((await b.resumen()).corrida).toBe(2);
    });
  });
  it('no repite una búsqueda idéntica ni la cobra dos veces', async () => {
    const pedir = api();
    const b = buscador(pedir);
    await b.investigar({ consultas: [{ texto: 'q' }] });
    await b.investigar({ consultas: [{ texto: 'q' }] });
    expect(cuerpos(pedir, '/search')).toHaveLength(1);
  });
});

describe('créditos', () => {
  const unaBusqueda = { consultas: [{ texto: 'q' }], mejores: 0 };

  it('cuenta 1 por búsqueda y 1 por extracción', async () => {
    const pedir = api();
    const b = buscador(pedir);
    await b.investigar({ consultas: [{ texto: 'a' }, { texto: 'b' }] });
    expect((await b.resumen()).corrida).toBe(3);
  });
  it('no pasa del límite del mes: se detiene antes de gastar', async () => {
    const pedir = api({ usados: 800 });
    const error = await buscador(pedir).investigar(unaBusqueda).catch((e) => e);
    expect(error.sinCuota).toBe(true);
    expect(error.message).toContain('800');
    expect(cuerpos(pedir, '/search')).toHaveLength(0);
  });
  it('el crédito 800 sí se puede usar, el 801 no', async () => {
    const pedir = api({ usados: 799 });
    const b = buscador(pedir);
    await b.investigar({ consultas: [{ texto: 'a' }], mejores: 0 });
    await expect(b.investigar({ consultas: [{ texto: 'b' }], mejores: 0 })).rejects.toThrow('límite');
  });
  it('tiene tope por corrida', async () => {
    const b = buscador(api(), { limiteCorrida: 1 });
    await b.investigar({ consultas: [{ texto: 'a' }], mejores: 0 });
    await expect(b.investigar({ consultas: [{ texto: 'b' }], mejores: 0 })).rejects.toThrow('por corrida');
  });
  it('sin poder leer el consumo no busca', async () => {
    const pedir = api({ status: { '/usage': 500 } });
    const error = await buscador(pedir).investigar(unaBusqueda).catch((e) => e);
    expect(error.sinCuota).toBe(true);
    expect(cuerpos(pedir, '/search')).toHaveLength(0);
  });
  it('un 432 de Tavily detiene la corrida', async () => {
    const error = await buscador(api({ status: { '/search': 432 } })).investigar(unaBusqueda).catch((e) => e);
    expect(error.sinCuota).toBe(true);
  });
  it('un error pasajero falla solo esa tarea', async () => {
    const error = await buscador(api({ status: { '/search': 500 } })).investigar(unaBusqueda).catch((e) => e);
    expect(error.sinCuota).toBeUndefined();
  });
  it('si /usage va atrasado manda el contador propio', async () => {
    const pedir = api({ usados: 9 });
    const b = buscador(pedir, { creditosPrevios: 800 });
    await expect(b.investigar(unaBusqueda)).rejects.toThrow('800');
    expect(cuerpos(pedir, '/search')).toHaveLength(0);
  });
  it('usarPrevios sube el contador, nunca lo baja', async () => {
    const b = buscador(api({ usados: 9 }), { creditosPrevios: 100 });
    b.usarPrevios(50);
    await b.investigar(unaBusqueda);
    expect((await b.resumen()).mes).toBe(101);
    const c = buscador(api({ usados: 9 }));
    c.usarPrevios(800);
    await expect(c.investigar(unaBusqueda)).rejects.toThrow('800');
  });
  it('el resumen usa el consumo real de Tavily', async () => {
    const pedir = api({ usados: 100 });
    const b = buscador(pedir);
    await b.investigar(unaBusqueda);
    expect(await b.resumen()).toEqual({ proveedor: 'Tavily', corrida: 1, mes: 101, limite: 800 });
  });
  it('sin clave falla al crear el buscador', () => {
    expect(() => crearBuscadorTavily({ clave: '' })).toThrow('TAVILY_API_KEY');
  });
});
