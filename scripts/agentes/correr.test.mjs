import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { correr } from './correr.mjs';
import { temporadaActual } from './perfil.mjs';
import { crearVerificador } from '../lib/fuentes.mjs';
import { crearClienteSimulado } from '../lib/gemini.mjs';
import { validarDatos } from '../lib/validar.mjs';

const AHORA = Date.parse('2026-11-05T12:00:00-06:00');
const OFICIAL = 'https://norceca.info/lista';
const PRENSA = 'https://prensa.mx/nota';
const FUENTES = [OFICIAL, PRENSA, 'https://volleybox.net/x', 'https://cbv.com.br/tabela', 'https://www.fivb.com/x', 'https://www.youtube.com/@x'];

const VACIAS = {
  '06-rankings': { fivb: {}, norceca: {} },
  '04-seleccion-torneos': { proximoTorneo: null, partidos: [], convocadas: null, torneosTerminados: [] },
  '01-plantel': { listas: [], ultimasApariciones: [], bajas: [], entrenador: null, dudas: [] },
  '02-perfil': (clave) => ({ slug: clave }),
  '03-partidos-club': (clave) => ({ clubId: clave, partidos: [] }),
  '05-donde-ver': { plataformas: [] },
};

let dir;
let fotos;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'datos-'));
  fotos = join(dir, 'fotos');
  // Base fija: data/ cambia con cada corrida y las pruebas no pueden depender de eso.
  await cp(new URL('../pruebas/datos-base/', import.meta.url), dir, { recursive: true });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const leer = async (archivo) => JSON.parse(await readFile(join(dir, archivo), 'utf8'));
const guardar = (archivo, datos) => writeFile(join(dir, archivo), JSON.stringify(datos, null, 2));
const cambiar = async (archivo, fn) => {
  const d = await leer(archivo);
  fn(d);
  await guardar(archivo, d);
};
const jugadora = async (slug) => (await leer('jugadoras.json')).find((j) => j.slug === slug);

const llamarCon = (respuestas = {}) => {
  const llamadas = [];
  const llamar = async ({ agente, clave, mensaje, conBusqueda }) => {
    llamadas.push({ agente, clave, mensaje, conBusqueda });
    const r = respuestas[agente] ?? VACIAS[agente];
    const v = typeof r === 'function' ? (r(clave) ?? VACIAS[agente]) : r;
    const final = typeof v === 'function' ? v(clave) : v;
    if (final instanceof Error) throw final;
    return { texto: typeof final === 'string' ? final : JSON.stringify(final), fuentes: FUENTES.map((uri) => ({ uri, titulo: null })), modelo: 'prueba' };
  };
  llamar.llamadas = llamadas;
  return llamar;
};

const ejecutar = (respuestas, opciones = {}) => correr({
  dirDatos: dir, dirFotos: fotos, llamar: llamarCon(respuestas), verificar: crearVerificador({ red: false }), ahora: AHORA, ...opciones,
});

const lista = (jugadoras, extra = {}) => ({ torneo: 'NORCECA Final Six 2026', tipo: 'torneo', fechaFin: '2026-09-27', fuente: OFICIAL, completa: true, jugadoras, ...extra });
const plantel = (cambios) => ({ '01-plantel': { ...VACIAS['01-plantel'], ...cambios } });

describe('rankings', () => {
  const ranking = (cambios) => ({ '06-rankings': { fivb: { posicion: 24, puntos: 171.3, fecha: '2026-11-01', fuente: 'https://www.fivb.com/x', ...cambios }, norceca: {} } });

  it('guarda el nuevo valor y deja el anterior en el historial', async () => {
    await ejecutar(ranking({}));
    const r = await leer('rankings.json');
    expect(r.fivb).toMatchObject({ posicion: 24, puntos: 171.3, fecha: '2026-11-01' });
    expect(r.historial).toEqual([{ ranking: 'fivb', posicion: null, puntos: 166.82, fecha: null }]);
  });
  it('sin fuente se descarta', async () => {
    const r = await ejecutar(ranking({ fuente: null }));
    expect((await leer('rankings.json')).fivb.puntos).toBe(166.82);
    expect(r.resumen).toContain('Descartado: fivb: sin fuente');
  });
  it('con fuente que no se puede verificar se descarta', async () => {
    await ejecutar(ranking({ fuente: 'https://inventada.com/x' }));
    expect((await leer('rankings.json')).fivb.puntos).toBe(166.82);
  });
});

describe('Selección y torneos', () => {
  const torneo = (cambios) => ({ nombre: 'Copa Panamericana', edicion: 2025, ciudad: 'Colima', pais: 'México', fechaInicio: '2025-06-01', fechaFin: '2025-06-08', posicion: 3, medalla: 'bronce', record: '4-2', premios: [], fuente: OFICIAL, ...cambios });
  const seleccion = (cambios) => ({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], ...cambios } });
  const partido = (cambios) => ({ fecha: '2026-12-01', hora: '19:00', zonaHoraria: 'America/Lima', zonaSede: 'America/Lima', local: 'México', visitante: 'Perú', mexico: 'local', torneo: 'Copa', fase: 'Grupos', sede: 'Lima', fuente: OFICIAL, ...cambios });

  it('un partido de la Selección queda con su zona de sede y sin club', async () => {
    await ejecutar(seleccion({ partidos: [partido({})] }));
    const p = (await leer('partidos.json')).partidos.find((x) => x.tipo === 'seleccion');
    expect(p).toMatchObject({ id: 'seleccion-2026-12-01', clubId: null, inicio: '2026-12-01T19:00:00-05:00', zonaSede: 'America/Lima', nuestro: 'local', competencia: 'Copa · Grupos', convocadas: null });
  });
  it('sin zonaSede queda null aunque México sea local', async () => {
    await ejecutar(seleccion({ partidos: [partido({ zonaSede: null })] }));
    expect((await leer('partidos.json')).partidos.find((x) => x.tipo === 'seleccion').zonaSede).toBeNull();
  });
  it('un partido sin fuente se descarta', async () => {
    await ejecutar(seleccion({ partidos: [partido({ fuente: null })] }));
    expect((await leer('partidos.json')).partidos.some((x) => x.tipo === 'seleccion')).toBe(false);
  });
  it('las convocadas se guardan como slugs', async () => {
    await ejecutar(seleccion({ partidos: [partido({})], convocadas: { torneo: 'Copa', fuente: OFICIAL, jugadoras: ['Sofía Maldonado', 'Urías'] } }));
    expect((await leer('partidos.json')).partidos.find((x) => x.tipo === 'seleccion').convocadas).toEqual(['sofia-maldonado', 'jocelyn-urias']);
  });
  it('el próximo torneo necesita fuente', async () => {
    await ejecutar(seleccion({ proximoTorneo: { nombre: 'Copa', edicion: 2027, fechaInicio: '2027-01-01', fechaFin: '2027-01-08', fuente: null } }));
    expect((await leer('seleccion.json')).proximoTorneo).toBeNull();
  });
  it('un torneo que ya pasó deja de ser el próximo', async () => {
    await cambiar('seleccion.json', (s) => { s.proximoTorneo = { id: 'x', nombre: 'X', edicion: 2026, ciudad: null, pais: null, fechaInicio: '2026-10-01', fechaFin: '2026-10-05', fuente: OFICIAL }; });
    await ejecutar();
    expect((await leer('seleccion.json')).proximoTorneo).toBeNull();
  });
  it('un torneo terminado entra con id y premios por slug', async () => {
    const r = await ejecutar(seleccion({ torneosTerminados: [torneo({ premios: [{ jugadora: 'Sofía Maldonado', premio: 'MVP' }] })] }));
    const t = (await leer('torneos.json')).torneos.find((x) => x.id === 'copa-panamericana-2025');
    expect(t.premios).toEqual([{ jugadora: 'sofia-maldonado', premio: 'MVP' }]);
    expect(r.cuerpoPr).toContain('Copa Panamericana 2025: bronce');
  });
  it('un torneo sin terminar no entra', async () => {
    await ejecutar(seleccion({ torneosTerminados: [torneo({ fechaFin: '2026-12-01' })] }));
    expect((await leer('torneos.json')).torneos).toHaveLength(2);
  });
  it('un premio de alguien que no está va a dudas', async () => {
    const r = await ejecutar(seleccion({ torneosTerminados: [torneo({ premios: [{ jugadora: 'Nadie Conocida', premio: 'MVP' }] })] }));
    expect((await leer('torneos.json')).torneos.find((x) => x.id === 'copa-panamericana-2025').premios).toEqual([]);
    expect(r.cuerpoPr).toContain('Nadie Conocida');
  });
  it('no duplica por id y solo completa lo que faltaba', async () => {
    await ejecutar(seleccion({ torneosTerminados: [torneo({ nombre: 'NORCECA Final Four', edicion: 2026, fechaFin: '2026-06-08', record: '5-0', posicion: 9, medalla: 'plata' })] }));
    const lista2 = (await leer('torneos.json')).torneos.filter((x) => x.id === 'norceca-final-four-2026');
    expect(lista2).toHaveLength(1);
    expect(lista2[0]).toMatchObject({ record: '5-0', posicion: 1, medalla: 'oro' });
  });
  it('el mismo torneo con otro nombre no se duplica', async () => {
    const mundial = (nombre) => torneo({ nombre, edicion: 2025, fechaInicio: '2025-08-22', fechaFin: '2025-09-07', medalla: null, posicion: 25 });
    await ejecutar(seleccion({ torneosTerminados: [mundial('Mundial'), mundial('World Championship'), mundial('Campeonato Mundial')] }));
    const iguales = (await leer('torneos.json')).torneos.filter((x) => x.edicion === 2025);
    expect(iguales).toHaveLength(1);
    expect(iguales[0]).toMatchObject({ id: 'campeonato-mundial-2025', nombre: 'Campeonato Mundial' });
  });
  it('dos nombres desconocidos con fechas traslapadas son el mismo torneo', async () => {
    await ejecutar(seleccion({ torneosTerminados: [torneo({ nombre: 'Copa Tailandia', edicion: 2025 }), torneo({ nombre: 'Thailand Cup', edicion: 2025, fechaInicio: '2025-06-03', fechaFin: '2025-06-05' })] }));
    expect((await leer('torneos.json')).torneos.filter((x) => x.edicion === 2025)).toHaveLength(1);
  });
  it('un partido se liga al próximo torneo aunque lo nombren distinto', async () => {
    await ejecutar(seleccion({
      proximoTorneo: { nombre: 'Pan American Cup', edicion: 2027, fechaInicio: '2027-01-01', fechaFin: '2027-01-08', fuente: OFICIAL },
      partidos: [partido({ torneo: 'Copa Panamericana' })],
    }));
    expect((await leer('seleccion.json')).proximoTorneo).toMatchObject({ id: 'copa-panamericana-2027', nombre: 'Copa Panamericana' });
    expect((await leer('partidos.json')).partidos.find((x) => x.tipo === 'seleccion').torneoId).toBe('copa-panamericana-2027');
  });
  it('se queda con los 7 más recientes por fecha de fin', async () => {
    const muchos = Array.from({ length: 8 }, (_, i) => torneo({ nombre: `Copa ${i}`, edicion: 2020 + i - 2, fechaFin: `${2018 + i}-06-08` }));
    await ejecutar(seleccion({ torneosTerminados: muchos }));
    const { torneos } = await leer('torneos.json');
    expect(torneos).toHaveLength(7);
    expect(torneos[0].id).toBe('norceca-final-six-2026');
    expect(torneos.at(-1).fechaFin).toBe('2021-06-08');
  });
});

describe('plantilla: altas', () => {
  const nueva = { nombre: 'Rosa Hernández', numero: 9, posicion: 'Central', capitana: false, club: null, slug: null };

  it('un alta en lista oficial reciente queda como propuesta, con su carpeta de fotos', async () => {
    const r = await ejecutar(plantel({ listas: [lista([nueva])] }));
    expect(await jugadora('rosa-hernandez')).toMatchObject({ estado: 'propuesta', numero: 9, ultimaListaOficial: { fecha: '2026-09-27' } });
    expect(await stat(join(fotos, 'jugadoras/rosa-hernandez/.gitkeep'))).toBeTruthy();
    expect(r.altas).toEqual(['rosa-hernandez']);
    expect(r.cuerpoPr).toContain('## Altas');
  });
  it('un alta aprobada se activa en la siguiente corrida', async () => {
    await ejecutar(plantel({ listas: [lista([nueva])] }));
    await ejecutar();
    expect((await jugadora('rosa-hernandez')).estado).toBe('activa');
  });
  it('no acepta un alta sacada de la prensa', async () => {
    await ejecutar(plantel({ listas: [lista([nueva], { fuente: PRENSA })] }));
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
  });
  it('no acepta un alta de una lista de hace más de 12 meses', async () => {
    await ejecutar(plantel({ listas: [lista([nueva], { fechaFin: '2025-10-01' })] }));
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
  });
  it('no acepta una lista con fecha futura', async () => {
    await ejecutar(plantel({ listas: [lista([nueva], { fechaFin: '2026-12-01' })] }));
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
  });
  it('sin fuente no pasa', async () => {
    await ejecutar(plantel({ listas: [lista([nueva], { fuente: null })] }));
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
  });
});

describe('plantilla: nombres', () => {
  it('rechaza un slug cuyo apellido no coincide y lo manda a dudas', async () => {
    const r = await ejecutar(plantel({ listas: [lista([{ nombre: 'Sofía Márquez', numero: 44, slug: 'sofia-maldonado' }])] }));
    expect((await jugadora('sofia-maldonado')).numero).toBe(3);
    expect(r.cuerpoPr).toContain('no coincide con el apellido');
  });
  it('una lista con solo apellidos se fusiona si el apellido es único', async () => {
    await ejecutar(plantel({ listas: [lista([{ nombre: 'Tanguma', numero: 77, slug: null }])] }));
    expect((await jugadora('tanguma')).numero).toBe(77);
  });
  it('un nombre confirmado se guarda y avisa que falta renombrar', async () => {
    const r = await ejecutar(plantel({ listas: [lista([{ nombre: 'María Tanguma', numero: 13, slug: 'tanguma' }])] }));
    expect((await jugadora('tanguma')).nombre).toBe('María Tanguma');
    expect(r.cuerpoPr).toContain('renombrar');
  });
  it('una lista vieja no pisa una más reciente', async () => {
    await ejecutar(plantel({ listas: [lista([{ nombre: 'Sofía Maldonado', numero: 99, slug: 'sofia-maldonado' }], { torneo: 'Viejo', fechaFin: '2025-01-01' })] }));
    expect(await jugadora('sofia-maldonado')).toMatchObject({ numero: 3, ultimaListaOficial: { fecha: '2026-09-27' } });
  });
});

describe('plantilla: bajas', () => {
  const baja = (cambios) => ({ slug: 'jocelyn-urias', tipo: 'retiro', evidencia: 'Anunció su retiro', fecha: '2026-10-01', fuente: OFICIAL, confianza: 'alta', ...cambios });

  it('faltar a un torneo nunca es baja', async () => {
    await ejecutar(plantel({ listas: [lista([{ nombre: 'Sofía Maldonado', slug: 'sofia-maldonado' }])] }));
    const j = await leer('jugadoras.json');
    expect(j.every((x) => x.estado === 'activa')).toBe(true);
  });
  it('con anuncio explícito y fuente sale de la plantilla', async () => {
    const r = await ejecutar(plantel({ bajas: [baja({})] }));
    expect((await jugadora('jocelyn-urias')).estado).toBe('exseleccionada');
    expect(r.cuerpoPr).toContain('## Bajas');
  });
  it.each([['sin fuente', { fuente: null }], ['sin evidencia', { evidencia: '' }]])('%s no hay baja', async (_, cambios) => {
    await ejecutar(plantel({ bajas: [baja(cambios)] }));
    expect((await jugadora('jocelyn-urias')).estado).toBe('activa');
  });
  it.each([['tipo otra', { tipo: 'otra' }], ['confianza baja', { confianza: 'baja' }]])('%s va a dudas', async (_, cambios) => {
    const r = await ejecutar(plantel({ bajas: [baja(cambios)] }));
    expect((await jugadora('jocelyn-urias')).estado).toBe('activa');
    expect(r.cuerpoPr).toContain('Posible baja');
  });
  it('24 meses sin listas oficiales es baja', async () => {
    await cambiar('jugadoras.json', (l) => { l.find((j) => j.slug === 'jocelyn-urias').ultimaListaOficial.fecha = '2024-10-01'; });
    await ejecutar();
    expect((await jugadora('jocelyn-urias')).estado).toBe('exseleccionada');
  });
  it('sin fecha nunca hay baja por inactividad', async () => {
    await ejecutar();
    expect((await jugadora('melanie-parra')).estado).toBe('activa');
  });
  it('quien regresa a una lista oficial vuelve a estar activa', async () => {
    await cambiar('jugadoras.json', (l) => { l.find((j) => j.slug === 'jocelyn-urias').estado = 'exseleccionada'; });
    await ejecutar(plantel({ listas: [lista([{ nombre: 'Jocelyn Urías', slug: 'jocelyn-urias' }])] }));
    expect((await jugadora('jocelyn-urias')).estado).toBe('activa');
  });
});

describe('perfiles', () => {
  const perfil = (slug, cambios) => ({ '02-perfil': (clave) => (clave === slug ? { slug, ...cambios } : undefined) });
  const dato = (valor, fuente = 'https://volleybox.net/x') => ({ valor, fuente, confianza: 'alta', motivo: null });

  it('guarda un dato con su fuente', async () => {
    await ejecutar(perfil('uxue-guereca', { estaturaCm: dato(183) }));
    const j = await jugadora('uxue-guereca');
    expect(j.estaturaCm).toBe(183);
    expect(j.fuentes.estaturaCm).toBe('https://volleybox.net/x');
    expect(j.revisado).toBe('2026-11-05');
  });
  it('sin fuente verificable se descarta', async () => {
    await ejecutar(perfil('uxue-guereca', { estaturaCm: dato(183, 'https://inventada.com/x') }));
    expect((await jugadora('uxue-guereca')).estaturaCm).toBeNull();
  });
  it('una fecha que no cuadra con la edad se descarta: seguramente es otra persona', async () => {
    await ejecutar(perfil('uxue-guereca', { fechaNacimiento: dato('2015-01-01') }));
    expect((await jugadora('uxue-guereca')).fechaNacimiento).toBeNull();
  });
  it('una respuesta de otra jugadora se rechaza completa', async () => {
    const r = await ejecutar({ '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: 'otra', estaturaCm: dato(183) } : undefined) });
    expect((await jugadora('uxue-guereca')).estaturaCm).toBeNull();
    expect(r.resumen).toContain('Falló');
  });
  it('un cambio a un club conocido va al PR', async () => {
    const r = await ejecutar(perfil('uxue-guereca', { club: dato({ nombre: 'Sesi Vôlei Bauru', liga: 'Superliga Feminina', pais: 'Brasil' }) }));
    expect((await jugadora('uxue-guereca')).clubId).toBe('sesi-bauru');
    expect(r.cuerpoPr).toContain('LOVB Miami → Sesi Vôlei Bauru');
  });
  it('un club con confianza baja va a dudas', async () => {
    const r = await ejecutar(perfil('uxue-guereca', { club: { ...dato({ nombre: 'Sesi Bauru' }), confianza: 'baja' } }));
    expect((await jugadora('uxue-guereca')).clubId).toBe('lovb-miami');
    expect(r.cuerpoPr).toContain('Posible cambio de club');
  });
  it('un club nuevo sin zona horaria va a dudas', async () => {
    const r = await ejecutar(perfil('uxue-guereca', { club: dato({ nombre: 'Club Desconocido', zonaHoraria: null }) }));
    expect((await jugadora('uxue-guereca')).clubId).toBe('lovb-miami');
    expect(r.cuerpoPr).toContain('falta su zona horaria');
  });
  it('un club nuevo no tiene partidos hasta que el PR se aprueba', async () => {
    const nuevo = { nombre: 'Club Nuevo', liga: 'Liga Nueva', pais: 'Italia', ciudad: 'Roma', zonaHoraria: 'Europe/Rome' };
    const llamar = llamarCon(perfil('uxue-guereca', { club: dato(nuevo) }));
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA });
    expect((await leer('clubes.json'))['club-nuevo']).toMatchObject({ ligaId: 'liga-nueva-italia', zona: 'Europe/Rome' });
    expect(llamar.llamadas.some((l) => l.agente === '03-partidos-club' && l.clave === 'club-nuevo')).toBe(false);
  });
  it('rota: altas primero y luego las 4 más viejas, según estado-agentes', async () => {
    await cambiar('estado-agentes.json', (e) => {
      for (const s of ['uxue-guereca', 'samantha-bricio', 'sofia-maldonado', 'grecia-castro']) e.revisado[`perfil:${s}`] = '2026-11-01';
    });
    const llamar = llamarCon(plantel({ listas: [lista([{ nombre: 'Rosa Hernández', slug: null }])] }));
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA });
    expect(llamar.llamadas.filter((l) => l.agente === '02-perfil').map((l) => l.clave)).toEqual(['rosa-hernandez', 'argentina-ung', 'marian-ovalle', 'arleth-marquez', 'jocelyn-urias']);
  });
  it('la rotación avanza aunque el PR no se apruebe', async () => {
    const primeras = llamarCon();
    await correr({ dirDatos: dir, dirFotos: fotos, llamar: primeras, verificar: crearVerificador({ red: false }), ahora: AHORA });
    const original = await readFile(new URL('../pruebas/datos-base/jugadoras.json', import.meta.url), 'utf8');
    await writeFile(join(dir, 'jugadoras.json'), original); // el PR sigue sin aprobarse
    const segundas = llamarCon();
    await correr({ dirDatos: dir, dirFotos: fotos, llamar: segundas, verificar: crearVerificador({ red: false }), ahora: AHORA + 7 * 864e5 });
    const claves = (l) => l.llamadas.filter((x) => x.agente === '02-perfil').map((x) => x.clave);
    expect(claves(segundas).some((s) => claves(primeras).includes(s))).toBe(false);
  });
  it('solo acepta redes conocidas y máximo 6 destacados', async () => {
    const destacados = Array.from({ length: 8 }, (_, i) => ({ texto: `Premio ${i}`, anio: 2026, fuente: 'https://volleybox.net/x' }));
    const redes = [{ red: 'instagram', url: 'https://instagram.com/a', fuente: 'https://volleybox.net/x' }, { red: 'onlyfans', url: 'https://a.mx', fuente: 'https://volleybox.net/x' }];
    await ejecutar(perfil('uxue-guereca', { destacados, redes }));
    const j = await jugadora('uxue-guereca');
    expect(j.destacados).toHaveLength(6);
    expect(j.redes.map((r) => r.red)).toEqual(['instagram']);
  });
});

describe('partidos de club', () => {
  const base = { hora: '21:00', zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'Praia Clube', nuestro: 'local', competencia: 'Superliga', fase: 'Rodada 9', sede: 'Bauru', fuente: 'https://cbv.com.br/tabela' };
  const sesi = (lista2) => ({ '03-partidos-club': (clave) => (clave === 'sesi-bauru' ? { clubId: clave, partidos: lista2 } : undefined) });
  const de = async (club) => (await leer('partidos.json')).partidos.filter((p) => p.clubId === club);

  it('agrega un partido con origen ia', async () => {
    await ejecutar(sesi([{ ...base, fecha: '2026-12-01' }]));
    expect((await de('sesi-bauru')).find((p) => p.id === 'club-sesi-bauru-2026-12-01')).toMatchObject({ origen: 'ia', inicio: '2026-12-01T21:00:00-03:00', competencia: 'Superliga · Rodada 9' });
  });
  it.each([
    ['ya pasó', { fecha: '2026-10-01' }],
    ['a más de 120 días', { fecha: '2027-04-01' }],
    ['zona inválida', { fecha: '2026-12-01', zonaHoraria: 'Marte/Olympus' }],
    ['fecha imposible', { fecha: '2026-02-31' }],
    ['sin rival', { fecha: '2026-12-01', visitante: '' }],
    ['sin fuente', { fecha: '2026-12-01', fuente: null }],
    ['fuente inventada', { fecha: '2026-12-01', fuente: 'https://inventada.com/x' }],
  ])('descarta: %s', async (_, cambios) => {
    const antes = (await de('sesi-bauru')).length;
    await ejecutar(sesi([{ ...base, ...cambios }]));
    expect((await de('sesi-bauru'))).toHaveLength(antes);
  });
  it('la IA gana sobre lo inicial el mismo día', async () => {
    await ejecutar(sesi([{ ...base, fecha: '2026-11-07', hora: '19:00', visitante: 'E.C. Pinheiros' }]));
    const p = (await de('sesi-bauru')).find((x) => x.id === 'club-sesi-bauru-2026-11-07');
    expect(p).toMatchObject({ origen: 'ia', inicio: '2026-11-07T19:00:00-03:00' });
  });
  it('manual.json siempre gana', async () => {
    await cambiar('manual.json', (m) => { m.partidos.push({ clubId: 'sesi-bauru', inicio: '2026-11-07T18:00:00-03:00', local: 'Sesi Vôlei Bauru', visitante: 'E.C. Pinheiros', nuestro: 'local' }); });
    await ejecutar(sesi([{ ...base, fecha: '2026-11-07', hora: '19:00', visitante: 'E.C. Pinheiros' }]));
    expect((await de('sesi-bauru')).find((x) => x.id === 'club-sesi-bauru-2026-11-07')).toMatchObject({ origen: 'manual', inicio: '2026-11-07T18:00:00-03:00' });
  });
  it('manual.json puede eliminar un partido', async () => {
    await cambiar('manual.json', (m) => { m.partidos.push({ clubId: 'sesi-bauru', fecha: '2026-11-07', eliminar: true }); });
    await ejecutar();
    expect((await de('sesi-bauru')).some((x) => x.id === 'club-sesi-bauru-2026-11-07')).toBe(false);
  });
  it('quita los partidos que ya terminaron', async () => {
    await ejecutar({}, { ahora: Date.parse('2026-11-08T12:00:00-06:00') });
    expect((await de('mackenzie')).some((p) => p.inicio.startsWith('2026-11-05'))).toBe(false);
  });
  it('guarda el estado de la temporada con fuente', async () => {
    await ejecutar({ '03-partidos-club': (clave) => (clave === 'nancy' ? { clubId: clave, partidos: [], estadoTemporada: { texto: 'En pausa', fuente: 'https://cbv.com.br/tabela' } } : undefined) });
    expect((await leer('partidos.json')).estados.nancy).toMatchObject({ texto: 'En pausa', revisado: '2026-11-05' });
  });
  it('sin fuente el estado no cambia', async () => {
    await ejecutar({ '03-partidos-club': (clave) => (clave === 'nancy' ? { clubId: clave, partidos: [], estadoTemporada: { texto: 'En pausa', fuente: null } } : undefined) });
    expect((await leer('partidos.json')).estados.nancy).toBeUndefined();
  });
  it('usa el calendario del club si se puede leer', async () => {
    const llamar = llamarCon();
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA, leerPagina: async () => 'texto del calendario' });
    const m = JSON.parse(llamar.llamadas.find((l) => l.clave === 'nancy').mensaje);
    expect(m).toMatchObject({ textoPagina: 'texto del calendario', urlPagina: 'https://spikelive.fr/ligue/laf/calendrier' });
  });
});

describe('dónde ver', () => {
  const plataforma = { nombre: 'Canal', tipo: 'youtube', url: 'https://www.youtube.com/@x', alcance: 'mundial', costo: 'gratis', notas: null, fuente: 'https://www.youtube.com/@x', confianza: 'alta' };
  const dondeVer = (extra = {}) => ({ '05-donde-ver': { temporada: '2026-27', plataformas: [plataforma], ...extra } });

  it('máximo 2 por corrida', async () => {
    const llamar = llamarCon(dondeVer());
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA });
    expect(llamar.llamadas.filter((l) => l.agente === '05-donde-ver')).toHaveLength(2);
  });
  it('guarda la plataforma y la avisa en el PR', async () => {
    const r = await ejecutar(dondeVer());
    const conPlataforma = Object.values(await leer('ligas.json')).filter((l) => l.plataformas.length);
    expect(conPlataforma).toHaveLength(2);
    expect(conPlataforma[0].plataformas[0]).toMatchObject({ nombre: 'Canal', revisado: '2026-11-05' });
    expect(conPlataforma[0].plataformas[0].confianza).toBeUndefined();
    expect(r.cuerpoPr).toContain('## Plataformas nuevas');
  });
  it('a la semana siguiente sigue con las que faltan', async () => {
    await ejecutar(dondeVer());
    const llamar = llamarCon(dondeVer());
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA + 7 * 864e5 });
    const conPlataforma = Object.values(await leer('ligas.json')).filter((l) => l.plataformas.length);
    expect(conPlataforma).toHaveLength(4);
  });
  it('sin fuente verificable no entra', async () => {
    await ejecutar(dondeVer({ plataformas: [{ ...plataforma, fuente: 'https://inventada.com/x' }] }));
    expect(Object.values(await leer('ligas.json')).every((l) => l.plataformas.length === 0)).toBe(true);
  });
});

describe('orquestador', () => {
  it('corre en el orden acordado', async () => {
    const llamar = llamarCon();
    // Sin partidos próximos: esos van antes que todo y tienen su propia prueba.
    await cambiar('partidos.json', (d) => { d.partidos = []; });
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA, maxLlamadas: 99 });
    const orden = [...new Set(llamar.llamadas.map((l) => l.agente))];
    expect(orden).toEqual(['06-rankings', '04-seleccion-torneos', '01-plantel', '02-perfil', '03-partidos-club', '05-donde-ver']);
  });
  it('lo que no cabe queda pendiente y va primero la semana siguiente', async () => {
    const r = await ejecutar({}, { maxLlamadas: 5 });
    expect(r.llamadas).toBe(5);
    expect(r.pendientes.length).toBeGreaterThan(0);
    const { pendientes } = await leer('estado-agentes.json');
    expect(pendientes).toEqual(r.pendientes);
    // Sin partidos próximos, que son lo único que va antes de los pendientes.
    await cambiar('partidos.json', (d) => { d.partidos = []; });
    const llamar = llamarCon();
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA + 7 * 864e5, maxLlamadas: 99 });
    expect({ agente: llamar.llamadas[0].agente, clave: llamar.llamadas[0].clave ?? null }).toEqual(pendientes[0]);
    expect((await leer('estado-agentes.json')).pendientes).toEqual([]);
  });
  it('si un agente falla se conservan los datos y sigue con los demás', async () => {
    const r = await ejecutar({ '06-rankings': new Error('Gemini caído'), '04-seleccion-torneos': 'esto no es JSON' });
    expect((await leer('rankings.json')).fivb.puntos).toBe(166.82);
    expect(r.resumen).toContain('Falló');
    expect(r.resumen).toContain('Gemini caído');
    expect(r.llamadas).toBeGreaterThan(2);
  });
  it('sin cuota deja de llamar y todo queda pendiente', async () => {
    const error = Object.assign(new Error('ningún modelo respondió'), { sinCuota: true });
    await cambiar('partidos.json', (d) => { d.partidos = []; });
    const r = await ejecutar({ '06-rankings': error });
    expect(r.llamadas).toBe(1);
    expect(r.pendientes[0]).toEqual({ agente: '06-rankings', clave: null });
    expect(r.pendientes.length).toBeGreaterThan(10);
  });
  it('una respuesta con forma equivocada no se usa', async () => {
    const r = await ejecutar({ '06-rankings': { fivb: { posicion: 'primero' }, norceca: {} } });
    expect(r.resumen).toContain('Falló');
  });
  it('si una tarea falla a medias, deshace lo que ya había hecho', async () => {
    const verificar = crearVerificador({ red: false });
    const conFallo = async (url, fuentes) => {
      if (url === 'https://norceca.info/explota') throw new Error('red caída');
      return verificar(url, fuentes);
    };
    const respuestas = plantel({
      listas: [lista([{ nombre: 'Rosa Hernández', slug: null }])],
      bajas: [{ slug: 'jocelyn-urias', tipo: 'retiro', evidencia: 'x', fuente: 'https://norceca.info/explota', confianza: 'alta' }],
    });
    const r = await correr({ dirDatos: dir, dirFotos: fotos, llamar: llamarCon(respuestas), verificar: conFallo, ahora: AHORA });
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
    expect(r.altas).toEqual([]);
    expect(r.cuerpoPr).not.toContain('Rosa Hernández');
    await expect(stat(join(fotos, 'jugadoras/rosa-hernandez'))).rejects.toThrow();
  });
  it('manual.json fija campos de una jugadora sobre la IA', async () => {
    await cambiar('manual.json', (m) => { m.jugadoras['uxue-guereca'] = { estaturaCm: 190 }; });
    await ejecutar({ '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: clave, estaturaCm: { valor: 183, fuente: 'https://volleybox.net/x' } } : undefined) });
    expect((await jugadora('uxue-guereca')).estaturaCm).toBe(190);
  });
  it('sin IA solo limpia y aplica manual, sin llamadas', async () => {
    const r = await correr({ dirDatos: dir, dirFotos: fotos, llamar: null, verificar: crearVerificador({ red: false }), ahora: AHORA });
    expect(r.llamadas).toBe(0);
    expect(r.hayPr).toBe(false);
  });
  it('--seco no escribe nada', async () => {
    const antes = await readFile(join(dir, 'rankings.json'), 'utf8');
    const r = await ejecutar({ '06-rankings': { fivb: { puntos: 200, fuente: 'https://www.fivb.com/x' }, norceca: {} } }, { seco: true });
    expect(r.cambiados).toContain('rankings.json');
    expect(await readFile(join(dir, 'rankings.json'), 'utf8')).toBe(antes);
  });
  it('sin novedades no hay PR, aunque los agentes hayan revisado', async () => {
    const r = await ejecutar();
    expect(r.llamadas).toBeGreaterThan(0);
    expect(r.hayPr).toBe(false);
    expect(r.cambiados).toEqual(expect.arrayContaining(['partidos.json', 'estado-agentes.json']));
    expect(r.cambiados).not.toContain('jugadoras.json');
    expect(r.cambiados).not.toContain('ligas.json');
  });
  it('separa lo que va a Pull Request', async () => {
    const r = await ejecutar({ '05-donde-ver': { temporada: '2026-27', plataformas: [] } });
    expect(r.hayPr).toBe(true);
    expect(r.cambiados).toContain('ligas.json');
  });
  it('lo que se guarda directo sigue siendo válido con los archivos del PR sin aprobar', async () => {
    const original = Object.fromEntries(await Promise.all(['jugadoras', 'clubes', 'ligas', 'torneos'].map(async (n) => [n, await leer(`${n}.json`)])));
    await ejecutar({
      ...plantel({ listas: [lista([{ nombre: 'Rosa Hernández', slug: null }])] }),
      '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: clave, club: { valor: { nombre: 'Club Nuevo', liga: 'Liga Nueva', pais: 'Italia', zonaHoraria: 'Europe/Rome' }, fuente: 'https://volleybox.net/x', confianza: 'alta' } } : undefined),
    });
    expect(() => validarDatos({ ...original, partidos: null })).toThrow();
    const directo = { partidos: await leer('partidos.json'), seleccion: await leer('seleccion.json'), rankings: await leer('rankings.json') };
    expect(() => validarDatos({ ...original, ...directo })).not.toThrow();
  });
  it('siempre deja datos válidos', async () => {
    await ejecutar();
    const nombres = ['jugadoras', 'clubes', 'ligas', 'partidos', 'seleccion', 'torneos', 'rankings'];
    const crudos = Object.fromEntries(await Promise.all(nombres.map(async (n) => [n, await leer(`${n}.json`)])));
    expect(() => validarDatos(crudos)).not.toThrow();
  });
});

describe('búsqueda hecha por el código', () => {
  const URL_BUENA = 'https://cbv.com.br/tabela';
  const buscadorFalso = (resultados = [{ url: URL_BUENA, titulo: 'Tabela', contenido: '01/12 21:00 Sesi Vôlei Bauru x Praia Clube' }]) => {
    const planes = [];
    return {
      planes,
      investigar: async (plan) => { planes.push(plan); return { resultados }; },
      resumen: async () => ({ proveedor: 'Tavily', corrida: planes.length, mes: 40, limite: 800 }),
      usarPrevios: () => {},
    };
  };
  const partido = (fuente) => ({ fecha: '2026-12-01', hora: '21:00', zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'Praia Clube', nuestro: 'local', fuente });
  const sesi = (fuente) => ({ '03-partidos-club': (clave) => (clave === 'sesi-bauru' ? { clubId: clave, partidos: [partido(fuente)] } : undefined) });
  const correrCon = (buscador, respuestas) => {
    const llamar = llamarCon(respuestas);
    return correr({ dirDatos: dir, dirFotos: fotos, llamar, buscador, verificar: async () => { throw new Error('no debe usarse'); }, ahora: AHORA }).then((r) => ({ r, llamar }));
  };
  const hay = async () => (await leer('partidos.json')).partidos.some((p) => p.id === 'club-sesi-bauru-2026-12-01');

  it('una fuente vale si su URL vino en los resultados', async () => {
    await correrCon(buscadorFalso(), sesi(URL_BUENA));
    expect(await hay()).toBe(true);
  });
  it('otra página del mismo dominio no vale', async () => {
    await correrCon(buscadorFalso(), sesi('https://cbv.com.br/inventada'));
    expect(await hay()).toBe(false);
  });
  it('Gemini recibe los resultados en el mensaje y no busca', async () => {
    const { llamar } = await correrCon(buscadorFalso(), {});
    const m = JSON.parse(llamar.llamadas.find((l) => l.agente === '06-rankings').mensaje);
    expect(m.resultadosBusqueda).toEqual([{ url: URL_BUENA, titulo: 'Tabela', contenido: '01/12 21:00 Sesi Vôlei Bauru x Praia Clube' }]);
    expect(m.guardado).toBeTruthy();
    expect(llamar.llamadas.every((l) => l.conBusqueda === false)).toBe(true);
  });
  it('sin resultados no gasta una llamada a Gemini', async () => {
    const { r, llamar } = await correrCon(buscadorFalso([]), {});
    expect(llamar.llamadas).toHaveLength(0);
    expect(r.resumen).toContain('no trajo resultados');
  });
  it('si se acaban los créditos todo queda pendiente', async () => {
    const buscador = { ...buscadorFalso(), investigar: async () => { throw Object.assign(new Error('límite de 800'), { sinCuota: true }); } };
    const { r, llamar } = await correrCon(buscador, {});
    expect(llamar.llamadas).toHaveLength(0);
    expect(r.pendientes.length).toBeGreaterThan(10);
  });
  it('el resumen muestra los créditos', async () => {
    const { r } = await correrCon(buscadorFalso(), {});
    expect(r.resumen).toMatch(/Tavily: \d+ créditos en esta corrida · 40 de 800 este mes/);
  });
  it('recuerda los créditos del mes en estado-agentes.json y los usa en la siguiente corrida', async () => {
    const usados = [];
    const b = { ...buscadorFalso(), usarPrevios: (n) => usados.push(n) };
    await correrCon(b, {});
    expect((await leer('estado-agentes.json')).tavily).toEqual({ mes: '2026-11', creditos: 40 });
    await correrCon(b, {});
    expect(usados).toEqual([40]);
  });
  it('usa búsquedas con dominio para Volleybox y la liga', async () => {
    const b = buscadorFalso();
    await correrCon(b, {});
    const dominios = b.planes.flatMap((p) => p.consultas.flatMap((c) => c.dominios ?? []));
    expect(dominios).toEqual(expect.arrayContaining(['volleybox.net', 'cbv.com.br', 'norceca.info']));
  });
  it('una corrida normal cabe en el presupuesto de créditos', async () => {
    const b = buscadorFalso();
    await correrCon(b, {});
    const porCorrida = b.planes.reduce((t, p) => t + p.consultas.length + 1, 0);
    expect(porCorrida).toBeLessThanOrEqual(60);
    expect(porCorrida * 5).toBeLessThanOrEqual(800); // un mes con 5 lunes
  });
});

describe('cambios a partidos que ya existen', () => {
  const LIGA = 'https://cbv.com.br/tabela';
  const PRENSA2 = 'https://prensa.mx/nota';
  const base = { zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'E.C. Pinheiros', nuestro: 'local', competencia: 'Superliga', sede: 'Bauru' };
  const sesi = (p) => ({ '03-partidos-club': (clave) => (clave === 'sesi-bauru' ? { clubId: clave, partidos: [{ ...base, ...p }] } : undefined) });
  const guardado = async () => (await leer('partidos.json')).partidos.find((x) => x.clubId === 'sesi-bauru' && x.visitante === 'E.C. Pinheiros');
  const fila = (r) => r.comparacion.find((c) => c.rival === 'E.C. Pinheiros');

  it('la prensa no cambia la hora: queda igual y sale en Por revisar', async () => {
    const r = await ejecutar(sesi({ fecha: '2026-11-07', hora: '19:00', fuente: PRENSA2 }));
    expect((await guardado()).inicio).toBe('2026-11-07T21:00:00-03:00');
    expect(r.resumen).toContain('Por revisar');
    expect(fila(r).resultado).toBe('Por revisar');
  });
  it('la prensa no cambia la fecha', async () => {
    await ejecutar(sesi({ fecha: '2026-11-09', hora: '21:00', fuente: PRENSA2 }));
    expect((await guardado()).inicio).toBe('2026-11-07T21:00:00-03:00');
  });
  it('la prensa no reemplaza al rival de ese día', async () => {
    await ejecutar(sesi({ fecha: '2026-11-07', hora: '21:00', visitante: 'Otro Club', fuente: PRENSA2 }));
    expect((await guardado()).inicio).toBe('2026-11-07T21:00:00-03:00');
  });
  it('la liga sí cambia la hora', async () => {
    const r = await ejecutar(sesi({ fecha: '2026-11-07', hora: '19:00', fuente: LIGA }));
    expect((await guardado()).inicio).toBe('2026-11-07T19:00:00-03:00');
    expect(fila(r).resultado).toBe('Cambia');
  });
  it('Volleybox sí cambia la fecha', async () => {
    await ejecutar(sesi({ fecha: '2026-11-09', hora: '21:00', fuente: 'https://volleybox.net/x' }));
    expect((await guardado()).inicio).toBe('2026-11-09T21:00:00-03:00');
  });
  it('un partido nuevo entra con cualquier fuente válida', async () => {
    const r = await ejecutar(sesi({ fecha: '2026-12-20', hora: '21:00', visitante: 'Rival Nuevo', fuente: PRENSA2 }));
    expect(r.comparacion.find((c) => c.rival === 'Rival Nuevo').resultado).toBe('Nuevo');
    expect((await leer('partidos.json')).partidos.some((p) => p.visitante === 'Rival Nuevo')).toBe(true);
  });
  it('un partido igual coincide', async () => {
    const r = await ejecutar(sesi({ fecha: '2026-11-07', hora: '21:00', fuente: PRENSA2 }));
    expect(fila(r).resultado).toBe('Coincide');
  });
  it('sin hora no borra la hora que ya había', async () => {
    const r = await ejecutar(sesi({ fecha: '2026-11-07', hora: null, fuente: LIGA }));
    expect(await guardado()).toMatchObject({ inicio: '2026-11-07T21:00:00-03:00', horaConfirmada: true });
    expect(fila(r).resultado).toBe('Coincide');
  });
  it('lo que el agente no confirma se conserva y se marca', async () => {
    const r = await ejecutar({ '03-partidos-club': (clave) => (clave === 'sesi-bauru' ? { clubId: clave, partidos: [], noEncontrados: [{ fecha: '2026-11-07', rival: 'E.C. Pinheiros', motivo: 'no apareció' }] } : undefined) });
    expect((await guardado())).toBeTruthy();
    expect(r.resumen).toContain('No confirmado (se conserva)');
    expect(r.resumen).not.toContain('Descartado: Sesi');
    expect(fila(r).resultado).toBe('Sin confirmar');
  });
  it('tampoco la prensa cambia un partido de la Selección', async () => {
    const p = { fecha: '2026-12-01', hora: '19:00', zonaHoraria: 'America/Lima', zonaSede: 'America/Lima', local: 'México', visitante: 'Perú', mexico: 'local', torneo: 'Copa', fuente: OFICIAL };
    await ejecutar({ '04-seleccion-torneos': { partidos: [p] } });
    await ejecutar({ '04-seleccion-torneos': { partidos: [{ ...p, hora: '15:00', fuente: PRENSA2 }] } });
    expect((await leer('partidos.json')).partidos.find((x) => x.tipo === 'seleccion').inicio).toBe('2026-12-01T19:00:00-05:00');
  });
});

describe('perfiles con búsqueda: la página debe mencionarla', () => {
  const buscador = (resultados) => ({
    investigar: async (plan) => ({ resultados: plan.consultas[0].texto.includes('Uxue') ? resultados : [{ url: 'https://a.mx/nada', titulo: 'x', contenido: 'y' }] }),
    resumen: async () => ({ proveedor: 'Tavily', corrida: 0, mes: 0, limite: 800 }),
    usarPrevios: () => {},
  });
  const respuesta = (fuente) => ({ '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: clave, estaturaCm: { valor: 178, fuente } } : undefined) });
  const correrCon = (resultados, fuente) => correr({ dirDatos: dir, dirFotos: fotos, llamar: llamarCon(respuesta(fuente)), buscador: buscador(resultados), verificar: async () => null, ahora: AHORA });

  it('un listado que no la nombra no vale', async () => {
    await correrCon([{ url: 'https://women.volleybox.net/players?country=MX', titulo: 'Jugadoras', contenido: 'México' }], 'https://women.volleybox.net/players?country=MX');
    expect((await jugadora('uxue-guereca')).estaturaCm).toBeNull();
  });
  it('su ficha sí vale', async () => {
    await correrCon([{ url: 'https://women.volleybox.net/uxue-guereca-p13878', titulo: 'Ficha', contenido: '' }], 'https://women.volleybox.net/uxue-guereca-p13878');
    expect((await jugadora('uxue-guereca')).estaturaCm).toBe(178);
  });
});

describe('tareas chicas', () => {
  const fin = (d) => ({ id: `t-${d}`, nombre: 'Copa Panamericana', edicion: 2026, ciudad: null, pais: null, fechaInicio: null, fechaFin: d, posicion: null, medalla: null, record: null, premios: [], fuente: OFICIAL });
  const claves = (llamar, agente) => llamar.llamadas.filter((l) => l.agente === agente).map((l) => l.clave);
  const corre = (llamar, extra = {}) => correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA, ...extra });
  const mencion = (...torneosMencionados) => ({ '04-seleccion-torneos': (clave) => (clave ? undefined : { ...VACIAS['04-seleccion-torneos'], torneosMencionados }) });

  it('el agente 04 pregunta por cada torneo nuevo aparte', async () => {
    const llamar = llamarCon(mencion({ nombre: 'Pan American Cup', edicion: 2026 }, { nombre: 'Mundial', edicion: 2025 }));
    await corre(llamar);
    expect(claves(llamar, '04-seleccion-torneos')).toEqual([null, 'Copa Panamericana|2026', 'Campeonato Mundial|2025']);
    expect(llamar.llamadas.find((l) => l.clave === 'Copa Panamericana|2026').mensaje).toContain('"tarea": "torneo"');
  });
  it('no pasa de dos torneos por corrida', async () => {
    const llamar = llamarCon(mencion({ nombre: 'Copa Panamericana', edicion: 2026 }, { nombre: 'Mundial', edicion: 2025 }, { nombre: 'Copa Challenger', edicion: 2026 }));
    await corre(llamar);
    expect(claves(llamar, '04-seleccion-torneos')).toHaveLength(3);
  });
  it('ignora lo que ya está guardado, lo futuro y lo que no es de categoría mayor', async () => {
    const llamar = llamarCon(mencion({ nombre: 'Final Six', edicion: 2026 }, { nombre: 'Juegos Panamericanos', edicion: 2027 }, { nombre: 'Copa Panamericana U21', edicion: 2026 }));
    await corre(llamar);
    expect(claves(llamar, '04-seleccion-torneos')).toEqual([null]);
  });
  it('un torneo revisado no se repite en 30 días', async () => {
    await cambiar('estado-agentes.json', (e) => { e.revisado['torneo:copa-panamericana-2026'] = '2026-11-01'; });
    const llamar = llamarCon(mencion({ nombre: 'Copa Panamericana', edicion: 2026 }));
    await corre(llamar);
    expect(claves(llamar, '04-seleccion-torneos')).toEqual([null]);
  });
  it('un torneo sin lugar conserva hasta qué fase llegó', async () => {
    const terminado = { nombre: 'Copa Panamericana', edicion: 2026, ciudad: 'León', pais: 'México', fechaInicio: '2026-09-08', fechaFin: '2026-09-18', posicion: null, medalla: null, fase: 'Fase de grupos', record: null, premios: [], fuente: OFICIAL };
    const llamar = llamarCon({ '04-seleccion-torneos': (clave) => (clave ? { ...VACIAS['04-seleccion-torneos'], torneosTerminados: [terminado] } : { ...VACIAS['04-seleccion-torneos'], torneosMencionados: [{ nombre: 'Copa Panamericana', edicion: 2026 }] }) });
    const r = await corre(llamar);
    expect((await leer('torneos.json')).torneos.find((t) => t.id === 'copa-panamericana-2026')).toMatchObject({ posicion: null, fase: 'Fase de grupos' });
    expect(r.cuerpoPr).toContain('Copa Panamericana 2026: Fase de grupos');
  });
  it('el torneo revisado entra por PR y otro distinto se descarta', async () => {
    const terminado = { nombre: 'Copa Panamericana', edicion: 2026, ciudad: 'León', pais: 'México', fechaInicio: '2026-09-08', fechaFin: '2026-09-18', posicion: 3, medalla: 'bronce', record: null, premios: [], fuente: OFICIAL };
    const llamar = llamarCon({ '04-seleccion-torneos': (clave) => (clave ? { ...VACIAS['04-seleccion-torneos'], torneosTerminados: [terminado, { ...terminado, nombre: 'Copa Challenger' }] } : { ...VACIAS['04-seleccion-torneos'], torneosMencionados: [{ nombre: 'Copa Panamericana', edicion: 2026 }] }) });
    const r = await corre(llamar);
    const { torneos } = await leer('torneos.json');
    expect(torneos.some((t) => t.id === 'copa-panamericana-2026')).toBe(true);
    expect(torneos.some((t) => t.nombre === 'Copa Challenger')).toBe(false);
    expect(r.resumen).toContain('se preguntó por Copa Panamericana 2026');
  });
  it('un próximo torneo que ya terminó se revisa solo', async () => {
    await cambiar('seleccion.json', (s) => { s.proximoTorneo = { id: 'copa-challenger-2026', nombre: 'Copa Challenger', edicion: 2026, ciudad: null, pais: null, fechaInicio: '2026-10-01', fechaFin: '2026-10-08', fuente: OFICIAL }; });
    const llamar = llamarCon();
    await corre(llamar);
    expect(claves(llamar, '04-seleccion-torneos')).toEqual([null, 'Copa Challenger|2026|2026-10-01|2026-10-08']);
  });

  describe('fechas conocidas', () => {
    const sinFechas = { nombre: 'Copa Challenger', edicion: 2026, ciudad: null, pais: null, fechaInicio: null, fechaFin: null, posicion: 4, medalla: null, record: null, premios: [], fuente: OFICIAL };
    const responde = (cambios) => ({ '04-seleccion-torneos': (clave) => (clave ? { ...VACIAS['04-seleccion-torneos'], torneosTerminados: [{ ...sinFechas, ...cambios }] } : undefined) });
    const proximoTerminado = () => cambiar('seleccion.json', (s) => { s.proximoTorneo = { id: 'copa-challenger-2026', nombre: 'Copa Challenger', edicion: 2026, ciudad: null, pais: null, fechaInicio: '2026-10-01', fechaFin: '2026-10-08', fuente: OFICIAL }; });
    const guardado = async (id) => (await leer('torneos.json')).torneos.find((t) => t.id === id);

    it('sin fecha de fin usa las del próximo torneo que ya terminó', async () => {
      await proximoTerminado();
      const llamar = llamarCon(responde({}));
      await corre(llamar);
      expect(claves(llamar, '04-seleccion-torneos')).toEqual([null, 'Copa Challenger|2026|2026-10-01|2026-10-08']);
      expect(await guardado('copa-challenger-2026')).toMatchObject({ fechaInicio: '2026-10-01', fechaFin: '2026-10-08', posicion: 4 });
    });
    it('la fecha que trae la fuente gana sobre la conocida', async () => {
      await proximoTerminado();
      await corre(llamarCon(responde({ fechaFin: '2026-10-09' })));
      expect(await guardado('copa-challenger-2026')).toMatchObject({ fechaInicio: '2026-10-01', fechaFin: '2026-10-09' });
    });
    it('sin fechas de ningún lado se descarta', async () => {
      const llamar = llamarCon({ '04-seleccion-torneos': (clave) => (clave ? { ...VACIAS['04-seleccion-torneos'], torneosTerminados: [sinFechas] } : { ...VACIAS['04-seleccion-torneos'], torneosMencionados: [{ nombre: 'Copa Challenger', edicion: 2026 }] }) });
      const r = await corre(llamar);
      expect(await guardado('copa-challenger-2026')).toBeFalsy();
      expect(r.resumen).toContain('formato inválido');
    });
    it('usa las del catálogo', async () => {
      const panam = { ...sinFechas, nombre: 'Pan American Games', edicion: 2027 };
      const r = await corre(llamarCon({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], torneosTerminados: [panam] } }), { ahora: Date.parse('2027-08-20T12:00:00Z') });
      expect(await guardado('juegos-panamericanos-2027')).toMatchObject({ fechaInicio: '2027-07-23', fechaFin: '2027-08-08' });
      expect(r.resumen).not.toContain('formato inválido');
    });
    it('sirve también para un torneo ya guardado al que le falta un dato', async () => {
      const llamar = llamarCon({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], torneosTerminados: [{ ...sinFechas, nombre: 'NORCECA Final Four', edicion: 2026, posicion: 1, record: '3-0' }] } });
      await corre(llamar);
      expect(await guardado('norceca-final-four-2026')).toMatchObject({ record: '3-0' });
    });
  });

  it('el agente 01 solo busca anuncios si no hay torneos nuevos', async () => {
    await cambiar('jugadoras.json', (js) => { js[0].ultimaListaOficial = { torneo: 'X', fecha: '2026-10-30', fuente: OFICIAL }; });
    const llamar = llamarCon();
    await corre(llamar);
    expect(claves(llamar, '01-plantel')).toEqual([null]);
    expect(llamar.llamadas.find((l) => l.agente === '01-plantel').mensaje).toContain('"tarea": "retiros"');
  });
  it('pide una lista por cada torneo más nuevo que la última conocida', async () => {
    await cambiar('torneos.json', (d) => { d.torneos.unshift({ ...fin('2026-10-20'), id: 'copa-a-2026', nombre: 'Copa A' }, { ...fin('2026-10-10'), id: 'copa-b-2026', nombre: 'Copa B' }, { ...fin('2026-10-01'), id: 'copa-c-2026', nombre: 'Copa C' }); });
    const llamar = llamarCon();
    await corre(llamar);
    expect(claves(llamar, '01-plantel')).toEqual([null, 'lista:copa-a-2026', 'lista:copa-b-2026']);
  });
  it('la lista queda con el torneo y la fecha del programa, no con los de Gemini', async () => {
    await cambiar('torneos.json', (d) => { d.torneos.unshift({ ...fin('2026-10-20'), id: 'copa-a-2026', nombre: 'Copa A' }); });
    const llamar = llamarCon({ '01-plantel': (clave) => (clave ? { ...VACIAS['01-plantel'], listas: [lista([{ nombre: 'Sofía Maldonado', numero: 3, slug: 'sofia-maldonado' }], { torneo: 'Otro nombre', fechaFin: '2026-01-01' }), lista([{ nombre: 'Rosa Hernández' }])] } : undefined) });
    await corre(llamar);
    expect((await jugadora('sofia-maldonado')).ultimaListaOficial).toMatchObject({ torneo: 'Copa A 2026', fecha: '2026-10-20' });
    expect(await jugadora('rosa-hernandez')).toBeFalsy(); // una lista por llamada
  });
  it('una lista revisada no se repite en 30 días', async () => {
    await cambiar('torneos.json', (d) => { d.torneos.unshift({ ...fin('2026-10-20'), id: 'copa-a-2026', nombre: 'Copa A' }); });
    await cambiar('estado-agentes.json', (e) => { e.revisado['lista:copa-a-2026'] = '2026-11-01'; });
    const llamar = llamarCon();
    await corre(llamar);
    expect(claves(llamar, '01-plantel')).toEqual([null]);
  });
});

describe('evidencia en el texto de la fuente', () => {
  const URL_LIGA = 'https://spikelive.fr/ligue/laf/calendrier';
  const PRENSA = 'https://noticias.fr/nancy';
  const nancy = (cambios) => ({ '03-partidos-club': (clave) => (clave === 'nancy' ? { clubId: clave, partidos: [{ fecha: '2026-11-21', hora: '20:00', zonaHoraria: 'Europe/Paris', zonaSede: 'Europe/Paris', local: 'Vandœuvre Nancy Volley-Ball', visitante: 'Béziers Volley', nuestro: 'local', fuente: URL_LIGA, ...cambios }] } : undefined) });
  const corre = (respuestas, contenido, url = URL_LIGA) => correr({
    dirDatos: dir, dirFotos: fotos, llamar: llamarCon(respuestas), verificar: async () => null, ahora: AHORA,
    buscador: { investigar: async () => ({ resultados: [{ url, titulo: 'x', contenido }] }), resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} },
  });
  const guardado = async (dia) => (await leer('partidos.json')).partidos.find((p) => p.id === `club-nancy-${dia}`);
  const PAGINA = 'Vandœuvre Nancy contre Béziers, samedi 21 novembre, 20:00\nNantes contre Vandœuvre Nancy, samedi 14 novembre, 20:00';

  it('con rival, fecha y hora juntos entra con su hora', async () => {
    await corre(nancy({}), PAGINA);
    expect(await guardado('2026-11-21')).toMatchObject({ horaConfirmada: true, inicio: '2026-11-21T20:00:00+01:00' });
  });
  it('si la hora no aparece junto al rival entra con hora por confirmar', async () => {
    const r = await corre(nancy({ hora: '14:00' }), PAGINA);
    expect(await guardado('2026-11-21')).toMatchObject({ horaConfirmada: false });
    expect(r.comparacion.find((f) => f.fecha === '2026-11-21').resultado).toBe('Nuevo (hora sin verificar)');
    expect(r.resumen).toContain('la hora 14:00 no aparece junto al rival');
  });
  it('si el rival y la fecha no están juntos no entra', async () => {
    const r = await corre(nancy({ fecha: '2026-11-28' }), PAGINA);
    expect(await guardado('2026-11-28')).toBeFalsy();
    expect(r.comparacion.find((f) => f.fecha === '2026-11-28').resultado).toBe('Sin evidencia');
    expect(r.resumen).toContain('no aparecen juntos');
  });
  it('un cambio sin evidencia deja el partido como estaba y sale por revisar', async () => {
    const antes = await guardado('2026-11-14');
    const r = await corre(nancy({ fecha: '2026-11-14', hora: '18:00', local: 'Volley-Ball Nantes', visitante: 'Vandœuvre Nancy Volley-Ball', nuestro: 'visita' }), 'Otra cosa: Nantes contre Rennes, 15 novembre, 18:00');
    expect((await guardado('2026-11-14')).inicio).toBe(antes.inicio);
    expect(r.comparacion.find((f) => f.fecha === '2026-11-14').resultado).toBe('Sin evidencia');
    expect(r.resumen).toContain('Por revisar');
  });
  it('un cambio de hora sin la hora junto al rival no cambia nada', async () => {
    const antes = await guardado('2026-11-14');
    const r = await corre(nancy({ fecha: '2026-11-14', hora: '18:00', local: 'Volley-Ball Nantes', visitante: 'Vandœuvre Nancy Volley-Ball', nuestro: 'visita' }), PAGINA);
    expect(await guardado('2026-11-14')).toMatchObject({ inicio: antes.inicio, horaConfirmada: true });
    expect(r.comparacion.find((f) => f.fecha === '2026-11-14').resultado).toBe('Coincide (hora sin verificar)');
  });
  it('lo que coincide con lo guardado no necesita evidencia', async () => {
    const r = await corre(nancy({ fecha: '2026-11-14', hora: '20:00', local: 'Volley-Ball Nantes', visitante: 'Vandœuvre Nancy Volley-Ball', nuestro: 'visita' }), 'Calendario sin esa fila');
    expect(r.comparacion.find((f) => f.fecha === '2026-11-14').resultado).toBe('Coincide');
  });
  it('también aplica a los partidos de la Selección', async () => {
    const p = { fecha: '2026-12-01', hora: '19:00', zonaHoraria: 'America/Lima', zonaSede: 'America/Lima', local: 'México', visitante: 'Perú', mexico: 'local', torneo: 'Copa', fuente: URL_LIGA };
    await corre({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], partidos: [p] } }, 'México vs Perú, 1 de diciembre');
    expect((await leer('partidos.json')).partidos.find((x) => x.tipo === 'seleccion')).toMatchObject({ horaConfirmada: false });
  });
});

describe('manual.json: próximo torneo', () => {
  const mano = (t) => cambiar('manual.json', (m) => { m.seleccion = { proximoTorneo: t }; });
  const base = { nombre: 'Pan American Games', edicion: 2027, fechaInicio: '2027-07-23', fechaFin: '2027-08-08', fuente: OFICIAL };
  const proximo = async () => (await leer('seleccion.json')).proximoTorneo;
  const llamaProximo = { '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], proximoTorneo: { nombre: 'Copa Challenger', edicion: 2027, fechaInicio: '2027-05-01', fechaFin: '2027-05-08', fuente: OFICIAL, confianza: 'alta' } } };

  it('con nombre, edición y fuente basta: el id se calcula', async () => {
    await mano(base);
    await ejecutar({});
    expect(await proximo()).toEqual({ id: 'juegos-panamericanos-2027', nombre: 'Juegos Panamericanos', edicion: 2027, ciudad: null, pais: null, fechaInicio: '2027-07-23', fechaFin: '2027-08-08', fuente: OFICIAL });
  });
  it('gana sobre lo que encuentre el agente', async () => {
    await mano(base);
    await ejecutar(llamaProximo);
    expect((await proximo()).nombre).toBe('Juegos Panamericanos');
  });
  it('sin IA también se aplica', async () => {
    await mano(base);
    await correr({ dirDatos: dir, dirFotos: fotos, llamar: null, verificar: crearVerificador({ red: false }), ahora: AHORA });
    expect((await proximo()).id).toBe('juegos-panamericanos-2027');
  });
  it('en null decide el agente', async () => {
    await mano(null);
    await ejecutar(llamaProximo);
    expect((await proximo()).nombre).toBe('Copa Challenger');
  });
  it('si ya terminó no se aplica y avisa', async () => {
    await mano({ ...base, fechaInicio: '2026-01-01', fechaFin: '2026-01-08' });
    const r = await ejecutar(llamaProximo);
    expect((await proximo()).nombre).toBe('Copa Challenger');
    expect(r.resumen).toContain('ya terminó');
  });
  it('un torneo confirmado antes del manual sale en el resumen para decidir', async () => {
    await mano(base);
    const r = await ejecutar(llamaProximo);
    expect(r.resumen).toContain('**Por revisar:** El agente halló un torneo antes del de manual.json: Copa Challenger 2027, desde el 2027-05-01');
  });
  it('el agente puede llamarlo Mundial: es el mismo y no avisa', async () => {
    await mano({ ...base, nombre: 'Copa del Mundo FIVB', fechaInicio: '2027-08-20', fechaFin: '2027-09-05' });
    const r = await ejecutar({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], proximoTorneo: { nombre: 'Campeonato Mundial', edicion: 2027, fuente: OFICIAL, confianza: 'alta' } } });
    expect(await proximo()).toMatchObject({ id: 'copa-del-mundo-fivb-2027', nombre: 'Copa del Mundo FIVB' });
    expect(r.resumen).not.toContain('antes del de manual.json');
  });
  it('uno posterior no molesta', async () => {
    await mano({ ...base, fechaInicio: '2027-01-01', fechaFin: '2027-01-08' });
    const r = await ejecutar(llamaProximo);
    expect(r.resumen).not.toContain('antes del de manual.json');
  });
  it('el mismo torneo con otro nombre tampoco', async () => {
    await mano(base);
    const r = await ejecutar({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], proximoTorneo: { nombre: 'Lima 2027', edicion: 2027, fechaInicio: '2027-07-23', fechaFin: '2027-08-08', fuente: OFICIAL, confianza: 'alta' } } });
    expect(r.resumen).not.toContain('antes del de manual.json');
  });
  it('sin fuente no pasa la validación', async () => {
    await mano({ nombre: 'Copa', edicion: 2027 });
    await expect(ejecutar({})).rejects.toThrow();
  });
});

describe('verificación de partidos próximos', () => {
  const URL_CAL = 'https://cbv.com.br/tabela';
  const partido = (cambios) => ({ id: 'club-sesi-bauru-2026-11-20', tipo: 'club', clubId: 'sesi-bauru', torneoId: null, ligaId: 'superliga-br', inicio: '2026-11-20T21:00:00-03:00', zonaSede: 'America/Sao_Paulo', horaConfirmada: true, local: 'Sesi Vôlei Bauru', visitante: 'Praia Clube', nuestro: 'local', competencia: 'Superliga', sede: 'Bauru', convocadas: null, transmision: [], fuente: 'https://cbv.com.br/nota', confianza: null, origen: 'ia', ...cambios });
  const buscador = (contenido, planes = []) => ({ planes, investigar: async (plan) => { planes.push(plan); return { resultados: [{ url: URL_CAL, titulo: 'Tabela', contenido }] }; }, resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} });
  const hoy = () => new Date(AHORA).toISOString().slice(0, 10);
  const enDias = (n) => new Date(AHORA + n * 864e5).toISOString().slice(0, 10);
  const conPartido = (dias, cambios = {}) => cambiar('partidos.json', (d) => {
    d.partidos = [partido({ id: `club-sesi-bauru-${enDias(dias)}`, inicio: `${enDias(dias)}T21:00:00-03:00`, ...cambios })];
  });
  const corre = (extra = {}, respuestas = {}, b = buscador('')) => {
    const llamar = llamarCon(respuestas);
    return correr({ dirDatos: dir, dirFotos: fotos, llamar, buscador: b, verificar: async () => null, ahora: AHORA, ...extra }).then((r) => ({ r, llamar, b }));
  };
  const fila = (dias, hora = '21:00') => `${enDias(dias).slice(8)}/${enDias(dias).slice(5, 7)} ${hora} Sesi Vôlei Bauru x Praia Clube`;
  const guardados = async () => (await leer('partidos.json')).partidos;

  it('el lunes coteja lo guardado aunque Gemini no lo reporte', async () => {
    await conPartido(5);
    const { r } = await corre({}, {}, buscador(fila(5)));
    expect(r.resumen).toContain(`Verificado: Sesi Vôlei Bauru: ${enDias(5)} 21:00 vs Praia Clube`);
  });
  it('si la fuente ya no lo muestra lo avisa y lo conserva', async () => {
    await conPartido(5);
    const { r } = await corre({}, {}, buscador('Calendario sin esa fila'));
    expect(r.resumen).toContain('**No verificado (se conserva):** Sesi Vôlei Bauru');
    expect((await guardados()).some((p) => p.clubId === 'sesi-bauru')).toBe(true);
  });
  it('si la hora ya no aparece junto al rival lo avisa y la conserva', async () => {
    await conPartido(5);
    const { r } = await corre({}, {}, buscador(fila(5, '19:00')));
    expect(r.resumen).toContain('**Hora sin verificar (se conserva):** Sesi Vôlei Bauru');
    expect((await guardados()).find((p) => p.clubId === 'sesi-bauru').inicio).toContain('T21:00');
  });
  describe('con cualquiera de los dos equipos', () => {
    const beijing = async (dias = 3) => cambiar('partidos.json', (d) => {
      d.partidos = [partido({ id: `club-beijing-${enDias(dias)}`, clubId: 'beijing', ligaId: 'superliga-cn', inicio: `${enDias(dias)}T15:00:00+08:00`, zonaSede: 'Asia/Shanghai', local: 'Beijing Arctic Ocean', visitante: 'Tianjin Bohai Bank' })];
    });
    const chino = (dias, hora = '15:00') => `${Number(enDias(dias).slice(5, 7))}月${Number(enDias(dias).slice(8))}日 ${hora} 北京北冰洋 主场迎战 天津渤海银行`;

    it('una fuente en chino se reconoce por el alias del club', async () => {
      await beijing();
      const { r } = await corre({}, {}, buscador(chino(3)));
      expect(r.resumen).toContain('Verificado: Beijing Arctic Ocean');
    });
    it('el club con otra fecha no verifica', async () => {
      await beijing();
      const { r } = await corre({}, {}, buscador(chino(9)));
      expect(r.resumen).toContain('**No verificado (se conserva):** Beijing');
    });
    it('el club con otra hora deja la hora sin verificar', async () => {
      await beijing();
      const { r } = await corre({}, {}, buscador(chino(3, '19:35')));
      expect(r.resumen).toContain('**Hora sin verificar (se conserva):** Beijing');
    });
    it('también basta con el rival', async () => {
      await conPartido(5);
      const { r } = await corre({}, {}, buscador(`${enDias(5).slice(8)}/${enDias(5).slice(5, 7)} 21:00 Praia Clube`));
      expect(r.resumen).toContain('Verificado: Sesi');
    });
    it('si una fila nombra a los dos, otra fila del club con esa fecha y hora no cuenta', async () => {
      await conPartido(5);
      const fecha = `${enDias(5).slice(8)}/${enDias(5).slice(5, 7)}`;
      const { r } = await corre({}, {}, buscador(`${fecha} 19:00 Sesi Vôlei Bauru x Praia Clube\n${fecha} 21:00 Sesi Vôlei Bauru x Minas`));
      expect(r.resumen).toContain('**Hora sin verificar (se conserva):** Sesi');
    });
    it('un partido nuevo sigue exigiendo al rival', async () => {
      await cambiar('partidos.json', (d) => { d.partidos = []; });
      const nuevo = { '03-partidos-club': (c) => (c === 'sesi-bauru' ? { clubId: c, partidos: [{ fecha: enDias(5), hora: '21:00', zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'Praia Clube', nuestro: 'local', fuente: URL_CAL }] } : undefined) };
      const { r } = await corre({}, nuevo, buscador(`${enDias(5).slice(8)}/${enDias(5).slice(5, 7)} 21:00 Sesi Vôlei Bauru x Minas`));
      expect((await guardados()).some((p) => p.clubId === 'sesi-bauru')).toBe(false);
      expect(r.comparacion.find((f) => f.club.startsWith('Sesi')).resultado).toBe('Sin evidencia');
    });
  });
  it('un partido sin hora confirmada se verifica por su fecha', async () => {
    await conPartido(5, { horaConfirmada: false });
    const { r } = await corre({}, {}, buscador(fila(5, '19:00')));
    expect(r.resumen).toContain('Verificado: Sesi Vôlei Bauru');
  });
  it('fuera de los 7 días no se verifica', async () => {
    await conPartido(9);
    const { r } = await corre({}, {}, buscador(fila(9)));
    expect(r.resumen).not.toContain('Verificado');
  });
  it('el último día de la ventana cuenta', async () => {
    await conPartido(7);
    const { r } = await corre({}, {}, buscador(fila(7)));
    expect(r.resumen).toContain('Verificado: Sesi');
  });
  it('un partido que acaba de cambiar no se reporta como no verificado', async () => {
    await conPartido(5);
    const respuesta = { '03-partidos-club': (c) => (c === 'sesi-bauru' ? { clubId: c, partidos: [{ fecha: enDias(5), hora: '19:00', zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'Praia Clube', nuestro: 'local', fuente: URL_CAL }] } : undefined) };
    const { r } = await corre({}, respuesta, buscador(fila(5, '19:00')));
    expect((await guardados()).find((p) => p.clubId === 'sesi-bauru').inicio).toContain('T19:00');
    expect(r.resumen).not.toContain('Hora sin verificar');
    expect(r.resumen).not.toContain('No verificado');
  });
  it('relee la página de donde salió el partido', async () => {
    await conPartido(5);
    const { b } = await corre({}, {}, buscador(fila(5)));
    expect(b.planes[0].paginas).toContain('https://cbv.com.br/nota');
  });
  it('lo que está por jugarse va antes que todo, aunque no alcance el presupuesto', async () => {
    await conPartido(5);
    const { llamar } = await corre({ maxLlamadas: 1 }, {}, buscador(fila(5)));
    expect(llamar.llamadas.map((l) => [l.agente, l.clave])).toEqual([['03-partidos-club', 'sesi-bauru']]);
  });
  it('también verifica los partidos de la Selección', async () => {
    await cambiar('partidos.json', (d) => {
      d.partidos = [partido({ id: `seleccion-${enDias(3)}`, tipo: 'seleccion', clubId: null, ligaId: null, torneoId: 'copa-2026', inicio: `${enDias(3)}T19:00:00-05:00`, zonaSede: 'America/Lima', local: 'México', visitante: 'Perú', competencia: 'Copa' })];
    });
    const b = buscador(`${enDias(3).slice(8)}/${enDias(3).slice(5, 7)} 19:00 México vs Perú`);
    const { r, llamar } = await corre({ soloVerificar: true }, {}, b);
    expect(llamar.llamadas[0].agente).toBe('04-seleccion-torneos');
    expect(r.resumen).toContain('Verificado: Selección');
    expect(b.planes[0].consultas.map((c) => c.texto).join()).toContain('Copa México');
    expect(b.planes[0].consultas.map((c) => c.texto).join()).not.toContain('Lima 2027');
  });

  describe('corrida del jueves', () => {
    const agentes = (llamar) => [...new Set(llamar.llamadas.map((l) => l.agente))];

    it('solo corre el club que juega en los próximos 4 días', async () => {
      await conPartido(3);
      const { llamar } = await corre({ soloVerificar: true }, {}, buscador(fila(3)));
      expect(agentes(llamar)).toEqual(['03-partidos-club']);
      expect(llamar.llamadas.map((l) => l.clave)).toEqual(['sesi-bauru']);
    });
    it('sin partidos en la ventana no gasta ninguna llamada', async () => {
      await conPartido(6);
      const { llamar, r } = await corre({ soloVerificar: true });
      expect(llamar.llamadas).toEqual([]);
      expect(r.cambiados.every((a) => ['partidos.json', 'estado-agentes.json'].includes(a))).toBe(true);
    });
    it('busca solo hasta el último día de la ventana', async () => {
      await conPartido(3);
      const { llamar } = await corre({ soloVerificar: true }, {}, buscador(fila(3)));
      expect(JSON.parse(llamar.llamadas[0].mensaje)).toMatchObject({ desde: hoy(), hasta: enDias(4) });
    });
    it('aplica un cambio de hora de una fuente confiable', async () => {
      await conPartido(3);
      const respuesta = { '03-partidos-club': (c) => ({ clubId: c, partidos: [{ fecha: enDias(3), hora: '19:30', zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'Praia Clube', nuestro: 'local', fuente: URL_CAL }] }) };
      await corre({ soloVerificar: true }, respuesta, buscador(fila(3, '19:30')));
      expect((await guardados()).find((p) => p.clubId === 'sesi-bauru').inicio).toContain('T19:30');
    });
    it('no toca nada fuera de la ventana, aunque Gemini lo reporte', async () => {
      await cambiar('partidos.json', (d) => {
        d.partidos = [partido({ id: `club-sesi-bauru-${enDias(3)}`, inicio: `${enDias(3)}T21:00:00-03:00` }), partido({ id: `club-sesi-bauru-${enDias(20)}`, inicio: `${enDias(20)}T21:00:00-03:00`, visitante: 'Minas' })];
      });
      const respuesta = { '03-partidos-club': (c) => ({ clubId: c, partidos: [{ fecha: enDias(20), hora: '18:00', zonaHoraria: 'America/Sao_Paulo', zonaSede: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'Minas', nuestro: 'local', fuente: URL_CAL }] }) };
      await corre({ soloVerificar: true }, respuesta, buscador(`${fila(3)}\n${fila(20, '18:00').replace('Praia Clube', 'Minas')}`));
      expect((await guardados()).map((p) => p.inicio.slice(11, 16))).toEqual(['21:00', '21:00']);
    });
    it('conserva los pendientes del lunes y no atiende el PR', async () => {
      const pendientes = [{ agente: '02-perfil', clave: 'uxue-guereca' }];
      const propuestas = [{ clave: 'x', seccion: 'Perfiles', texto: 'y', fuente: null, fecha: hoy() }];
      await cambiar('estado-agentes.json', (e) => { e.pendientes = pendientes; e.propuestas = propuestas; });
      await conPartido(3);
      const { llamar } = await corre({ soloVerificar: true, prEstado: 'CLOSED' }, {}, buscador(fila(3)));
      expect(agentes(llamar)).toEqual(['03-partidos-club']);
      expect(await leer('estado-agentes.json')).toMatchObject({ pendientes, propuestas, rechazos: [] });
    });
    it('no cambia lo que va por PR', async () => {
      await conPartido(3);
      const { r } = await corre({ soloVerificar: true }, {}, buscador(fila(3)));
      expect(r.cambiados.filter((a) => ['jugadoras.json', 'clubes.json', 'ligas.json', 'torneos.json'].includes(a))).toEqual([]);
    });
    it('el agente 04 no toca el próximo torneo ni los torneos', async () => {
      const seleccion = (await leer('seleccion.json')).proximoTorneo;
      await cambiar('partidos.json', (d) => {
        d.partidos = [partido({ id: `seleccion-${enDias(3)}`, tipo: 'seleccion', clubId: null, ligaId: null, torneoId: 'copa-2026', inicio: `${enDias(3)}T19:00:00-05:00`, zonaSede: 'America/Lima', local: 'México', visitante: 'Perú' })];
      });
      const respuesta = { '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], proximoTorneo: { nombre: 'Copa Challenger', edicion: 2027, fuente: URL_CAL }, torneosMencionados: [{ nombre: 'Copa Challenger', edicion: 2026 }] } };
      const { llamar } = await corre({ soloVerificar: true }, respuesta, buscador('x'));
      expect(llamar.llamadas.filter((l) => l.agente === '04-seleccion-torneos')).toHaveLength(1);
      expect((await leer('seleccion.json')).proximoTorneo).toEqual(seleccion);
    });
  });
});

describe('manual.json: rankings', () => {
  const CLARO = 'https://www.clarosports.com/nota';
  const fijo = { posicion: 21, puntos: null, fecha: '2026-10-01', fuente: CLARO };
  const mano = (fivb, norceca = null) => cambiar('manual.json', (m) => { m.rankings = { fivb, norceca }; });
  const agente = (cambios) => ({ '06-rankings': { fivb: { posicion: 21, fecha: '2026-11-01', fuente: 'https://www.fivb.com/x', ...cambios }, norceca: {} } });

  it('gana sobre lo guardado y manda lo anterior al historial', async () => {
    await mano(fijo);
    await ejecutar({});
    const r = await leer('rankings.json');
    expect(r.fivb).toEqual(fijo);
    expect(r.historial).toEqual([{ ranking: 'fivb', posicion: null, puntos: 166.82, fecha: null }]);
  });
  it('no toca el ranking que no se fijó', async () => {
    await mano(fijo);
    await ejecutar({});
    expect((await leer('rankings.json')).norceca.puntos).toBe(183);
  });
  it('sin IA también se aplica', async () => {
    await mano(fijo);
    await correr({ dirDatos: dir, dirFotos: fotos, llamar: null, verificar: crearVerificador({ red: false }), ahora: AHORA });
    expect((await leer('rankings.json')).fivb.posicion).toBe(21);
  });
  it('correr dos veces no repite el historial', async () => {
    await mano(fijo);
    await ejecutar({});
    await ejecutar({});
    expect((await leer('rankings.json')).historial).toHaveLength(1);
  });
  it('si el agente halla otro dato, manual gana, avisa y no ensucia el historial', async () => {
    await mano(fijo);
    const r = await ejecutar(agente({ posicion: 19, puntos: 180.5 }));
    const guardado = await leer('rankings.json');
    expect(guardado.fivb).toEqual(fijo);
    expect(guardado.historial).toHaveLength(1);
    expect(r.resumen).toContain('**Por revisar:** fivb: manual.json dice lugar 21 y sin puntos (2026-10-01); https://www.fivb.com/x dice lugar 19 y 180.5 puntos (2026-11-01)');
  });
  it('si el agente confirma lo mismo no avisa', async () => {
    await mano(fijo);
    await cambiar('rankings.json', (d) => { d.fivb = fijo; });
    const r = await ejecutar(agente({}));
    expect(r.resumen).not.toContain('manual.json dice lugar');
  });
  it('en null decide el agente', async () => {
    await mano(null);
    await ejecutar(agente({ posicion: 19 }));
    expect((await leer('rankings.json')).fivb.posicion).toBe(19);
  });
  it('sin fuente no pasa la validación', async () => {
    await mano({ ...fijo, fuente: null });
    await expect(ejecutar({})).rejects.toThrow();
  });
});

describe('próximo torneo: la fuente debe decir que México participa', () => {
  const FIVB = 'https://www.fivb.com/qualified-teams';
  const respuesta = (cambios = {}) => ({ '04-seleccion-torneos': { ...VACIAS['04-seleccion-torneos'], proximoTorneo: { nombre: 'Copa del Mundo Femenina de Voleibol de la FIVB', edicion: 2027, fechaInicio: '2027-08-20', fechaFin: '2027-09-05', fuente: FIVB, confianza: 'alta', ...cambios } } });
  const corre = (contenido, titulo = 'Qualified Teams confirmed for the 2027 FIVB Volleyball Women\'s World Cup') => correr({
    dirDatos: dir, dirFotos: fotos, llamar: llamarCon(respuesta()), verificar: async () => null, ahora: AHORA,
    buscador: { investigar: async () => ({ resultados: [{ url: FIVB, titulo, contenido }] }), resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} },
  });
  const proximo = async () => (await leer('seleccion.json')).proximoTorneo;

  it('con México en la lista de clasificados entra', async () => {
    await corre('Sweden, Mexico, Ukraine, Greece, Korea, Bulgaria and Switzerland qualified through this pathway.');
    expect(await proximo()).toMatchObject({ id: 'copa-del-mundo-fivb-2027', nombre: 'Copa del Mundo FIVB', edicion: 2027 });
  });
  it('si la fuente no dice que México clasificó se descarta y queda lo anterior', async () => {
    await cambiar('seleccion.json', (s) => { s.proximoTorneo = null; });
    const r = await corre('Sweden, Ukraine, Greece, Korea, Bulgaria and Switzerland qualified through this pathway.');
    expect(await proximo()).toBeNull();
    expect(r.resumen).toContain('no dice que México (mayor femenil) participe');
  });
});

describe('calendario del club: lo que Gemini omite', () => {
  const CAL = 'https://www.legavolleyfemminile.it/club/uyba-busto-arsizio/710946/calendario';
  const partido = (fecha, rival) => ({ fecha, hora: '17:00', zonaHoraria: 'Europe/Rome', zonaSede: 'Europe/Rome', local: 'UYBA Volley Busto Arsizio', visitante: rival, nuestro: 'local', fuente: CAL });
  const fila = (dia, rival) => `${dia} Novembre 2026\n${dia}/11/2026\n17:00\nUYBA Volley Busto Arsizio\n${rival}`;
  const PAGINA = [fila(22, 'Il Bisonte Firenze'), fila(29, 'Millenium Brescia')].join('\n');
  const uyba = (respuestas) => ({ '03-partidos-club': (c) => (c === 'uyba' ? respuestas.shift() : undefined) });
  const corre = async (respuestas, contenido = PAGINA) => {
    await cambiar('clubes.json', (d) => { d.uyba.calendarioUrl = CAL; });
    const llamar = llamarCon(uyba(respuestas));
    const r = await correr({
      dirDatos: dir, dirFotos: fotos, llamar, verificar: async () => null, ahora: AHORA,
      buscador: { investigar: async () => ({ resultados: [{ url: CAL, titulo: 'x', contenido }] }), resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} },
    });
    return { r, llamadas: llamar.llamadas.filter((l) => l.clave === 'uyba') };
  };
  const hay = async (fecha) => (await leer('partidos.json')).partidos.some((p) => p.id === `club-uyba-${fecha}`);

  it('si faltan fechas vuelve a preguntar por ellas y agrega lo que llegue', async () => {
    const { llamadas, r } = await corre([
      { clubId: 'uyba', partidos: [partido('2026-11-22', 'Il Bisonte Firenze')] },
      { clubId: 'uyba', partidos: [partido('2026-11-22', 'Il Bisonte Firenze'), partido('2026-11-29', 'Millenium Brescia')] },
    ]);
    expect(llamadas).toHaveLength(2);
    expect(JSON.parse(llamadas[1].mensaje).fechasOmitidas).toEqual(['2026-11-29']);
    expect(await hay('2026-11-22')).toBe(true);
    expect(await hay('2026-11-29')).toBe(true);
    expect(r.resumen).not.toContain('Gemini no lo reportó');
  });
  it('con todo reportado no gasta otra llamada', async () => {
    const { llamadas } = await corre([{ clubId: 'uyba', partidos: [partido('2026-11-22', 'Il Bisonte Firenze'), partido('2026-11-29', 'Millenium Brescia')] }]);
    expect(llamadas).toHaveLength(1);
  });
  it('si sigue faltando lo avisa', async () => {
    const { r } = await corre([{ clubId: 'uyba', partidos: [] }, { clubId: 'uyba', partidos: [] }]);
    expect(r.resumen).toContain('**Por revisar:** UYBA Volley Busto Arsizio: el calendario muestra un partido el 2026-11-22');
    expect(r.resumen).toContain('el 2026-11-29');
  });
  it('si la segunda lectura falla se queda con la primera', async () => {
    const { r } = await corre([{ clubId: 'uyba', partidos: [partido('2026-11-22', 'Il Bisonte Firenze')] }, new Error('sin respuesta')]);
    expect(await hay('2026-11-22')).toBe(true);
    expect(r.resumen).toContain('segunda lectura: sin respuesta');
  });
  it('una fecha fuera del rango no cuenta como omitida', async () => {
    const { llamadas } = await corre([{ clubId: 'uyba', partidos: [] }], fila(4, 'Pasado'));
    expect(llamadas).toHaveLength(1);
  });
  it('una nota de prensa no cuenta como calendario', async () => {
    await cambiar('clubes.json', (d) => { d.uyba.calendarioUrl = null; });
    const llamar = llamarCon(uyba([{ clubId: 'uyba', partidos: [] }]));
    await correr({
      dirDatos: dir, dirFotos: fotos, llamar, verificar: async () => null, ahora: AHORA,
      buscador: { investigar: async () => ({ resultados: [{ url: 'https://noticias.it/nota', titulo: 'x', contenido: PAGINA }] }), resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} },
    });
    expect(llamar.llamadas.filter((l) => l.clave === 'uyba')).toHaveLength(1);
  });
});

describe('club desde el historial', () => {
  const FUENTE = 'https://volleybox.net/x';
  const SLUG = 'uxue-guereca';
  const sinClub = () => cambiar('jugadoras.json', (js) => { js.find((j) => j.slug === SLUG).clubId = null; });
  const historial = (club, cambios = {}) => ({ '02-perfil': (c) => (c === SLUG ? { slug: c, historialClubes: [{ club, pais: 'Eslovenia', temporada: '2026-27', fuente: FUENTE, ...cambios }] } : undefined) });

  it('propone el cambio y crea el club', async () => {
    await sinClub();
    const r = await ejecutar(historial('OK Formis'));
    expect(await jugadora(SLUG)).toMatchObject({ clubId: 'ok-formis' });
    expect((await jugadora(SLUG)).fuentes.clubId).toBe(FUENTE);
    expect((await leer('clubes.json'))['ok-formis']).toMatchObject({ nombre: 'OK Formis', pais: 'Eslovenia', zona: 'Europe/Ljubljana', ligaId: null });
    expect(r.cuerpoPr).toContain('## Cambios de club');
    expect(r.cuerpoPr).toContain('sin club → OK Formis');
  });
  it('funciona con lo que ya estaba en el historial', async () => {
    await cambiar('jugadoras.json', (js) => {
      const j = js.find((x) => x.slug === SLUG);
      j.clubId = null;
      j.historialClubes = [{ club: 'OK Formis', pais: 'Eslovenia', temporada: '2026/27', fuente: 'https://otra.mx/nota' }];
    });
    await ejecutar({ '02-perfil': (c) => (c === SLUG ? { slug: c } : undefined) });
    expect(await jugadora(SLUG)).toMatchObject({ clubId: 'ok-formis' });
    expect((await jugadora(SLUG)).fuentes.clubId).toBe('https://otra.mx/nota');
  });
  it('un club que ya existe no se duplica', async () => {
    await sinClub();
    const antes = Object.keys(await leer('clubes.json')).length;
    await ejecutar(historial('Sesi Bauru', { pais: 'Brasil' }));
    expect(await jugadora(SLUG)).toMatchObject({ clubId: 'sesi-bauru' });
    expect(Object.keys(await leer('clubes.json'))).toHaveLength(antes);
  });
  it('el club que reporta el agente también llega a una jugadora sin club', async () => {
    await sinClub();
    await ejecutar({ '02-perfil': (c) => (c === SLUG ? { slug: c, club: { valor: { nombre: 'OK Formis', pais: 'Eslovenia', zonaHoraria: 'Europe/Ljubljana' }, fuente: FUENTE, confianza: 'alta' } } : undefined) });
    expect(await jugadora(SLUG)).toMatchObject({ clubId: 'ok-formis' });
  });
  it('otra temporada no cuenta', async () => {
    await sinClub();
    await ejecutar(historial('OK Formis', { temporada: '2025-26' }));
    expect(await jugadora(SLUG)).toMatchObject({ clubId: null });
  });
  it('si ya tiene club no lo toca', async () => {
    const { clubId } = await jugadora(SLUG);
    await ejecutar(historial('OK Formis'));
    expect((await jugadora(SLUG)).clubId).toBe(clubId);
  });
  it('sin zona conocida va a dudas', async () => {
    await sinClub();
    const r = await ejecutar(historial('Club Nuevo', { pais: 'Brasil' }));
    expect(await jugadora(SLUG)).toMatchObject({ clubId: null });
    expect(r.cuerpoPr).toContain('estaría en Club Nuevo, pero falta su zona horaria');
  });
  it.each([['2026-11-05', '2026-27'], ['2027-03-01', '2026-27'], ['2026-07-01', '2026-27'], ['2026-06-30', '2025-26']])('%s es la temporada %s', (hoy, temporada) => {
    expect(temporadaActual(hoy)).toBe(temporada);
  });
});

describe('perfiles: lo que ya tenemos', () => {
  const BOLETIN = 'https://norceca.info/wp-content/uploads/2026/02/BOLETIN-2-2026-NORCECA-Womens-Final-Four.pdf';
  const corre = (valor, fuente = BOLETIN) => correr({
    dirDatos: dir, dirFotos: fotos, verificar: async () => null, ahora: AHORA,
    llamar: llamarCon({ '02-perfil': (clave) => (clave === 'sofia-maldonado' ? { slug: clave, nombreCompleto: { valor, fuente, confianza: 'alta' } } : undefined) }),
    buscador: { investigar: async () => ({ resultados: [{ url: 'https://a.mx/sofia-maldonado', titulo: 'Sofía Maldonado', contenido: 'x' }] }), resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} },
  });
  it('el mismo nombre no se descarta aunque su fuente no venga en los resultados', async () => {
    const r = await corre('Sofía Maldonado Díaz');
    expect(r.resumen).not.toContain('nombreCompleto de Sofía');
    expect((await jugadora('sofia-maldonado')).fuentes.nombreCompleto).toBe(BOLETIN);
  });
  it('tampoco si solo cambian los acentos, y no los pisa', async () => {
    const r = await corre('Sofia Maldonado Diaz', 'https://a.mx/sofia-maldonado');
    expect(r.resumen).not.toContain('nombreCompleto de Sofía');
    expect((await jugadora('sofia-maldonado')).nombreCompleto).toBe('Sofía Maldonado Díaz');
  });
  it('un nombre distinto sin fuente válida sí se descarta', async () => {
    const r = await corre('Sofía Maldonado Pérez');
    expect(r.resumen).toContain('Descartado: nombreCompleto de Sofía Maldonado: la fuente no pasó');
    expect((await jugadora('sofia-maldonado')).nombreCompleto).toBe('Sofía Maldonado Díaz');
  });
});

describe('perfiles: un listado no es fuente', () => {
  const LISTADO = 'https://women.volleybox.net/players?country=MX';
  it('rechaza el listado aunque nombre a la jugadora', async () => {
    const buscador = { investigar: async () => ({ resultados: [{ url: LISTADO, titulo: 'Jugadoras', contenido: 'Uxue Guereca, Sofía Maldonado, Grecia Castro' }] }), resumen: async () => ({ proveedor: 'Tavily', corrida: 1, mes: 1, limite: 800 }), usarPrevios: () => {} };
    const llamar = llamarCon({ '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: clave, estaturaCm: { valor: 178, fuente: LISTADO, confianza: 'alta' } } : undefined) });
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, buscador, verificar: async () => null, ahora: AHORA });
    expect((await jugadora('uxue-guereca')).estaturaCm).toBeNull();
  });
});

describe('rankings una vez al mes', () => {
  const corre = async (ahora) => {
    const llamar = llamarCon();
    await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora });
    return llamar.llamadas.some((l) => l.agente === '06-rankings');
  };
  it('corre, descansa y vuelve a los 28 días', async () => {
    expect(await corre(AHORA)).toBe(true);
    expect(await corre(AHORA + 7 * 864e5)).toBe(false);
    expect(await corre(AHORA + 27 * 864e5)).toBe(false);
    expect(await corre(AHORA + 28 * 864e5)).toBe(true);
  });
});

describe('Pull Request que acumula', () => {
  const nueva = { nombre: 'Rosa Hernández', numero: 9, posicion: 'Central', capitana: false, club: null, slug: null };
  const conAlta = (fuente = OFICIAL) => plantel({ listas: [lista([nueva], { fuente })] });
  const baja = (fuente) => plantel({ bajas: [{ slug: 'jocelyn-urias', tipo: 'retiro', evidencia: 'Anunció su retiro', fuente, confianza: 'alta' }] });
  const semana = (n) => AHORA + n * 7 * 864e5;
  const vuelveAMain = async (original) => writeFile(join(dir, 'jugadoras.json'), original);
  const original = () => readFile(new URL('../pruebas/datos-base/jugadoras.json', import.meta.url), 'utf8');

  it('guarda lo propuesto en estado-agentes con su fuente', async () => {
    await ejecutar(conAlta());
    expect((await leer('estado-agentes.json')).propuestas).toEqual([
      { clave: 'alta:rosa-hernandez', seccion: 'Altas', texto: 'Rosa Hernández (NORCECA Final Six 2026)', fuente: OFICIAL, fecha: '2026-11-05' },
    ]);
  });
  it('con el PR abierto acumula: el cuerpo trae lo de la semana pasada', async () => {
    await ejecutar(conAlta());
    const r = await ejecutar(baja(OFICIAL), { prEstado: 'OPEN', ahora: semana(1) });
    expect(r.cuerpoPr).toContain('Rosa Hernández');
    expect(r.cuerpoPr).toContain('Jocelyn Urías');
    expect(await jugadora('rosa-hernandez')).toBeTruthy();
    expect((await jugadora('jocelyn-urias')).estado).toBe('exseleccionada');
  });
  it('con el PR abierto una propuesta sigue sin aprobarse', async () => {
    await ejecutar(conAlta());
    await ejecutar({}, { prEstado: 'OPEN', ahora: semana(1) });
    expect((await jugadora('rosa-hernandez')).estado).toBe('propuesta');
  });
  it('no repite una propuesta que ya está en el PR', async () => {
    await ejecutar(conAlta());
    await ejecutar(conAlta(), { prEstado: 'OPEN', ahora: semana(1) });
    expect((await leer('estado-agentes.json')).propuestas).toHaveLength(1);
  });
  it('un PR aprobado limpia las propuestas y activa las altas', async () => {
    await ejecutar(conAlta());
    await ejecutar({}, { prEstado: 'MERGED', ahora: semana(1) });
    expect((await leer('estado-agentes.json')).propuestas).toEqual([]);
    expect((await jugadora('rosa-hernandez')).estado).toBe('activa');
  });
  it('un PR cerrado pasa lo propuesto a rechazos', async () => {
    const base = await original();
    await ejecutar(conAlta());
    await vuelveAMain(base);
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(1) });
    const e = await leer('estado-agentes.json');
    expect(e.propuestas).toEqual([]);
    expect(e.rechazos).toEqual([{ clave: 'alta:rosa-hernandez', texto: 'Rosa Hernández (NORCECA Final Six 2026)', evidencias: [OFICIAL], fecha: '2026-11-12' }]);
  });
  it('lo rechazado no se vuelve a proponer con la misma evidencia', async () => {
    const base = await original();
    await ejecutar(conAlta());
    await vuelveAMain(base);
    const r = await ejecutar(conAlta(), { prEstado: 'CLOSED', ahora: semana(1) });
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
    expect(r.resumen).toContain('se rechazó en un PR');
    await ejecutar(conAlta(), { ahora: semana(2) });
    expect(await jugadora('rosa-hernandez')).toBeUndefined();
  });
  it('con evidencia nueva sí vuelve', async () => {
    const base = await original();
    await ejecutar(conAlta());
    await vuelveAMain(base);
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(1) });
    await ejecutar(conAlta('https://www.fivb.com/x'), { ahora: semana(2) });
    expect((await jugadora('rosa-hernandez')).estado).toBe('propuesta');
  });
  it('rechazar dos veces junta las evidencias', async () => {
    const base = await original();
    await ejecutar(conAlta());
    await vuelveAMain(base);
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(1) });
    await ejecutar(conAlta('https://www.fivb.com/x'), { ahora: semana(2) });
    await vuelveAMain(base);
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(3) });
    expect((await leer('estado-agentes.json')).rechazos[0].evidencias).toEqual([OFICIAL, 'https://www.fivb.com/x']);
  });
  it('una baja por inactividad rechazada no vuelve sola', async () => {
    const vieja = (l) => { l.find((j) => j.slug === 'jocelyn-urias').ultimaListaOficial.fecha = '2024-10-01'; };
    await cambiar('jugadoras.json', vieja);
    await ejecutar();
    await cambiar('jugadoras.json', (l) => { const j = l.find((x) => x.slug === 'jocelyn-urias'); j.estado = 'activa'; });
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(1) });
    expect((await jugadora('jocelyn-urias')).estado).toBe('activa');
  });
  it('un cambio de club rechazado no vuelve', async () => {
    const club = { '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: clave, club: { valor: { nombre: 'Sesi Vôlei Bauru' }, fuente: 'https://volleybox.net/x', confianza: 'alta' } } : undefined) };
    const base = await original();
    await ejecutar(club);
    await vuelveAMain(base);
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(1) });
    await cambiar('estado-agentes.json', (e) => { e.revisado = {}; });
    await ejecutar(club, { ahora: semana(2) });
    expect((await jugadora('uxue-guereca')).clubId).toBe('lovb-miami');
  });
  it('un dato de perfil rechazado no vuelve, pero otro valor sí', async () => {
    const estatura = (valor) => ({ '02-perfil': (clave) => (clave === 'uxue-guereca' ? { slug: clave, estaturaCm: { valor, fuente: 'https://volleybox.net/x' } } : undefined) });
    const base = await original();
    await ejecutar(estatura(183));
    await vuelveAMain(base);
    await ejecutar({}, { prEstado: 'CLOSED', ahora: semana(1) });
    await cambiar('estado-agentes.json', (e) => { e.revisado = {}; });
    await ejecutar(estatura(183), { ahora: semana(2) });
    expect((await jugadora('uxue-guereca')).estaturaCm).toBeNull();
    await cambiar('estado-agentes.json', (e) => { e.revisado = {}; });
    await ejecutar(estatura(185), { ahora: semana(3) });
    expect((await jugadora('uxue-guereca')).estaturaCm).toBe(185);
  });
  it('una tarea que falla no deja propuestas', async () => {
    const verificar = crearVerificador({ red: false });
    const conFallo = async (url, fuentes) => {
      if (url === 'https://norceca.info/explota') throw new Error('red caída');
      return verificar(url, fuentes);
    };
    const respuestas = plantel({ listas: [lista([nueva])], bajas: [{ slug: 'jocelyn-urias', tipo: 'retiro', evidencia: 'x', fuente: 'https://norceca.info/explota', confianza: 'alta' }] });
    await correr({ dirDatos: dir, dirFotos: fotos, llamar: llamarCon(respuestas), verificar: conFallo, ahora: AHORA });
    expect((await leer('estado-agentes.json')).propuestas).toEqual([]);
  });

  describe('partiendo de la rama del PR', () => {
    let aprobados;
    beforeEach(async () => {
      aprobados = await mkdtemp(join(tmpdir(), 'aprobados-'));
      await cp(dir, aprobados, { recursive: true });
    });
    afterEach(() => rm(aprobados, { recursive: true, force: true }));

    it('un club que solo está en el PR no recibe partidos', async () => {
      await cambiar('clubes.json', (c) => { c['club-nuevo'] = { ...c.uyba, nombre: 'Club Nuevo', alias: [] }; });
      await cambiar('jugadoras.json', (l) => { l.find((j) => j.slug === 'uxue-guereca').clubId = 'club-nuevo'; });
      const llamar = llamarCon();
      await correr({ dirDatos: dir, dirFotos: fotos, llamar, verificar: crearVerificador({ red: false }), ahora: AHORA, prEstado: 'OPEN', dirAprobados: aprobados });
      expect(llamar.llamadas.some((l) => l.clave === 'club-nuevo')).toBe(false);
    });
    it('una convocada que solo está en el PR no entra a partidos.json', async () => {
      await ejecutar(conAlta());
      const partido = { fecha: '2026-12-01', hora: '19:00', zonaHoraria: 'America/Lima', local: 'México', visitante: 'Perú', mexico: 'local', torneo: 'Copa', fuente: OFICIAL };
      const r = await ejecutar({ '04-seleccion-torneos': { partidos: [partido], convocadas: { fuente: OFICIAL, jugadoras: ['Rosa Hernández', 'Sofía Maldonado'] } } }, { prEstado: 'OPEN', dirAprobados: aprobados, ahora: semana(1) });
      expect((await leer('partidos.json')).partidos.find((p) => p.tipo === 'seleccion').convocadas).toEqual(['sofia-maldonado']);
      expect(r.cuerpoPr).toContain('Rosa Hernández');
    });
    it('no escribe si lo directo no funcionaría en main', async () => {
      await cambiar('clubes.json', (c) => { c['club-nuevo'] = { ...c.uyba, nombre: 'Club Nuevo', alias: [] }; });
      await cambiar('partidos.json', (d) => { d.partidos.push({ ...d.partidos[0], id: 'club-club-nuevo-2026-12-01', clubId: 'club-nuevo', inicio: '2026-12-01T20:00:00+01:00', zonaSede: 'Europe/Rome' }); });
      const antes = await readFile(join(dir, 'rankings.json'), 'utf8');
      await expect(correr({ dirDatos: dir, dirFotos: fotos, llamar: null, verificar: crearVerificador({ red: false }), ahora: AHORA, dirAprobados: aprobados })).rejects.toThrow('club desconocido');
      expect(await readFile(join(dir, 'rankings.json'), 'utf8')).toBe(antes);
    });
  });
});

describe('respuestas simuladas de scripts/pruebas', () => {
  it('pasan completas por todo el proceso', async () => {
    const carpeta = new URL('../pruebas/', import.meta.url).pathname;
    const r = await correr({
      dirDatos: dir, dirFotos: fotos, llamar: crearClienteSimulado(carpeta, '2026-11-05'), verificar: crearVerificador({ red: false }), ahora: AHORA, modo: 'simulado',
    });
    expect(r.resumen).not.toContain('Falló');
    expect(r.altas).toEqual(['nombre-apellido']);
    expect(r.llamadas).toBeLessThanOrEqual(20);
    expect((await leer('seleccion.json')).proximoTorneo.id).toBe('copa-panamericana-2027');
    expect((await leer('partidos.json')).partidos.some((p) => p.tipo === 'seleccion')).toBe(true);
  });
});
