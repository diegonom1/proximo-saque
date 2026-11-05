import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { correr } from './correr.mjs';
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
  await cp(new URL('../../data/', import.meta.url), dir, { recursive: true });
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
  const llamar = async ({ agente, clave, mensaje }) => {
    llamadas.push({ agente, clave, mensaje });
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
    const r = await ejecutar(plantel({ listas: [lista([{ nombre: 'María Ovalle', numero: 8, slug: 'ovalle' }])] }));
    expect((await jugadora('ovalle')).nombre).toBe('María Ovalle');
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
    expect(llamar.llamadas.filter((l) => l.agente === '02-perfil').map((l) => l.clave)).toEqual(['rosa-hernandez', 'argentina-ung', 'ovalle', 'arleth-marquez', 'jocelyn-urias']);
  });
  it('la rotación avanza aunque el PR no se apruebe', async () => {
    const primeras = llamarCon();
    await correr({ dirDatos: dir, dirFotos: fotos, llamar: primeras, verificar: crearVerificador({ red: false }), ahora: AHORA });
    const original = await readFile(new URL('../../data/jugadoras.json', import.meta.url), 'utf8');
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
  it('separa lo que va a Pull Request', async () => {
    expect((await ejecutar()).hayPr).toBe(true); // revisado cambia en jugadoras.json
    const soloRanking = await correr({ dirDatos: dir, dirFotos: fotos, llamar: null, verificar: crearVerificador({ red: false }), ahora: AHORA + 36e5 });
    expect(soloRanking.hayPr).toBe(false);
    expect(soloRanking.cambiados).toContain('partidos.json');
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
