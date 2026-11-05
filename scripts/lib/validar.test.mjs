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

describe('esquemaPartido', () => {
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
