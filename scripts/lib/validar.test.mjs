import { describe, expect, it } from 'vitest';
import { convertir, esquemaPartido, revisarReferencias } from './validar.mjs';

const AHORA = Date.parse('2026-11-04T12:00:00Z');
const club = { id: 'sesi-bauru', zona: 'America/Sao_Paulo', ligaId: 'superliga-br', nombre: 'Sesi Vôlei Bauru', alias: ['Bauru'] };
const base = {
  fecha: '2026-11-07', hora: '21:00', zonaHoraria: 'America/Sao_Paulo', local: 'Sesi Vôlei Bauru', visitante: 'E.C. Pinheiros',
  competencia: 'Superliga Feminina', fase: 'Rodada 4', sede: 'Bauru', fuente: 'https://cbv.com.br/tabela', confianza: 'alta',
};
const conv = (cambios, origen = 'ia') => convertir({ ...base, ...cambios }, club, origen, AHORA);

describe('convertir', () => {
  it('arma un partido que cumple el contrato', () => {
    const p = conv({});
    expect(esquemaPartido.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({
      id: 'club-sesi-bauru-2026-11-07', tipo: 'club', clubId: 'sesi-bauru', ligaId: 'superliga-br',
      inicio: '2026-11-07T21:00:00-03:00', horaConfirmada: true, nuestro: 'local',
      competencia: 'Superliga Feminina · Rodada 4', origen: 'ia',
    });
  });
  it('sin hora marca horaConfirmada en false', () => {
    expect(conv({ hora: null })).toMatchObject({ horaConfirmada: false, inicio: '2026-11-07T12:00:00-03:00' });
  });
  it('sin zona usa la del club', () => {
    expect(conv({ zonaHoraria: null }).inicio).toBe('2026-11-07T21:00:00-03:00');
  });
  it('conserva un inicio con desfase y completa los segundos', () => {
    const p = convertir({ inicio: '2026-11-07T21:00-03:00', local: 'A', visitante: 'B' }, club, 'manual', AHORA);
    expect(p.inicio).toBe('2026-11-07T21:00:00-03:00');
  });
  it('pasa un inicio en UTC a la zona del partido', () => {
    const p = convertir({ inicio: '2026-11-08T00:00:00Z', local: 'A', visitante: 'B' }, club, 'manual', AHORA);
    expect(p.inicio).toBe('2026-11-07T21:00:00-03:00');
  });
  it('un partido en juego sigue vigente y uno terminado no', () => {
    expect(conv({ fecha: '2026-11-04', hora: '08:00' })).not.toBeNull(); // empezó hace 1 h
    expect(conv({ fecha: '2026-11-04', hora: '06:00' })).toBeNull(); // empezó hace 3 h
  });
  it.each([
    ['zona inventada', { zonaHoraria: 'Marte/Olympus' }],
    ['fecha imposible', { fecha: '2026-02-31' }],
    ['mes imposible', { fecha: '2026-13-01' }],
    ['a más de 120 días', { fecha: '2027-04-01' }],
    ['sin rival', { visitante: ' ' }],
    ['sin fecha', { fecha: null }],
  ])('descarta: %s', (_, cambios) => {
    expect(conv(cambios)).toBeNull();
  });
  it('una hora imposible queda como hora por confirmar', () => {
    expect(conv({ hora: '25:00' }).horaConfirmada).toBe(false);
  });
  it('eliminar no exige rivales', () => {
    const p = convertir({ fecha: '2026-11-07', eliminar: true }, club, 'manual', AHORA);
    expect(p.eliminar).toBe(true);
  });
});

describe('convertir con zonaSede', () => {
  const uyba = { id: 'uyba', zona: 'Europe/Rome', ligaId: 'serie-a1-it', nombre: 'UYBA Volley Busto Arsizio', alias: ['Busto Arsizio'] };
  const beijing = { id: 'beijing', zona: 'Asia/Shanghai', ligaId: 'superliga-cn', nombre: 'Beijing Arctic Ocean', alias: [] };
  const visita = {
    fecha: '2026-11-18', hora: '18:00', zonaHoraria: 'Europe/Rome', zonaSede: 'Europe/Istanbul',
    local: 'Eczacıbaşı Istanbul', visitante: 'UYBA Busto Arsizio', nuestro: 'visita', sede: 'Estambul',
  };

  it('visita en otra zona: el instante sale de zonaHoraria e inicio se guarda en zonaSede', () => {
    const p = convertir(visita, uyba, 'ia', AHORA);
    expect(p.inicio).toBe('2026-11-18T20:00:00+03:00');
    expect(p.zonaSede).toBe('Europe/Istanbul');
    expect(Date.parse(p.inicio)).toBe(Date.parse('2026-11-18T17:00:00Z'));
    expect(esquemaPartido.safeParse(p).success).toBe(true);
  });
  it('visita sin zonaSede: queda null e inicio usa zonaHoraria', () => {
    const p = convertir({ ...visita, zonaSede: null }, uyba, 'ia', AHORA);
    expect(p.zonaSede).toBeNull();
    expect(p.inicio).toBe('2026-11-18T18:00:00+01:00');
    expect(esquemaPartido.safeParse(p).success).toBe(true);
  });
  it('local sin zonaSede: usa la zona del club aunque la fuente publique en otra', () => {
    const p = convertir({
      fecha: '2026-11-07', hora: '01:00', zonaHoraria: 'America/Mexico_City',
      local: 'Beijing Arctic Ocean', visitante: 'Tianjin Bohai Bank', nuestro: 'local',
    }, beijing, 'ia', AHORA);
    expect(p.zonaSede).toBe('Asia/Shanghai');
    expect(p.inicio).toBe('2026-11-07T15:00:00+08:00');
  });
  it('lado sin identificar cuenta como no local', () => {
    const p = convertir({ ...visita, zonaSede: null, nuestro: null, visitante: 'Otro club' }, uyba, 'ia', AHORA);
    expect(p.nuestro).toBeNull();
    expect(p.zonaSede).toBeNull();
  });
  it('sin hora conserva el día de la sede', () => {
    const p = convertir({ ...visita, hora: null, zonaHoraria: null, zonaSede: 'Asia/Tokyo' }, uyba, 'ia', AHORA);
    expect(p.inicio).toBe('2026-11-18T12:00:00+09:00');
    expect(p.horaConfirmada).toBe(false);
  });
  it('un inicio con desfase también se guarda en zonaSede', () => {
    const p = convertir({ ...visita, fecha: undefined, inicio: '2026-11-18T18:00:00+01:00', zonaHoraria: undefined }, uyba, 'manual', AHORA);
    expect(p.inicio).toBe('2026-11-18T20:00:00+03:00');
  });
  it('descarta una zonaSede inventada', () => {
    expect(convertir({ ...visita, zonaSede: 'Marte/Olympus' }, uyba, 'ia', AHORA)).toBeNull();
  });
});

describe('esquemaPartido', () => {
  it('rechaza un inicio que no está en la zona de la sede', () => {
    const p = { ...conv({}), inicio: '2026-11-07T19:00:00-05:00' }; // mismo instante, otra zona
    expect(esquemaPartido.safeParse(p).success).toBe(false);
  });
  it('reporta un inicio imposible sin tronar', () => {
    expect(esquemaPartido.safeParse({ ...conv({}), inicio: '2026-13-45T21:00:00-03:00' }).success).toBe(false);
  });
  it('rechaza una zonaSede inventada', () => {
    expect(esquemaPartido.safeParse({ ...conv({}), zonaSede: 'Marte/Olympus' }).success).toBe(false);
  });
  it('rechaza una hora sin desfase', () => {
    const p = { ...conv({}), inicio: '2026-11-07T21:00:00' };
    expect(esquemaPartido.safeParse(p).success).toBe(false);
  });
});

describe('revisarReferencias', () => {
  const vacio = { jugadoras: [], clubes: {}, ligas: {}, partidos: { partidos: [], estados: {} }, torneos: { torneos: [] } };
  it('detecta clubes, slugs y premios rotos', () => {
    const problemas = revisarReferencias({
      ...vacio,
      jugadoras: [{ slug: 'a', clubId: 'nadie' }, { slug: 'a', clubId: null }],
      torneos: { torneos: [{ id: 't', premios: [{ jugadora: 'b', premio: 'MVP' }] }] },
    });
    expect(problemas).toEqual(['slug repetido: a', 'a: club desconocido nadie', 't: jugadora desconocida b']);
  });
  it('no se queja de datos vacíos', () => {
    expect(revisarReferencias(vacio)).toEqual([]);
  });
});
