import { describe, expect, it } from 'vitest';
import { dominiosConfiables, planDondeVer, planPartidos, planPerfil, planLista, planProximo, planRankings, planTorneo } from './busquedas.mjs';

const ctx = { hoy: '2026-11-05', datos: { torneos: { torneos: [{ nombre: 'Campeonato Mundial', edicion: 2025, fechaInicio: '2025-08-22', fechaFin: '2025-09-07' }] } } };
const club = (pais, nombre, alias = []) => ({ pais, nombre, alias, calendarioUrl: null, sitio: null });
const textos = (plan) => plan.consultas.map((c) => c.texto).join(' | ');

describe('partidos en el idioma de cada liga', () => {
  it('Beijing busca en chino y sin restringir dominios', () => {
    const plan = planPartidos(ctx, club('China', 'Beijing Arctic Ocean', ['北京北冰洋', 'Beijing']), { nombre: 'Superliga china (CVL)', calendarioOficialUrl: null });
    expect(plan.consultas[0]).toMatchObject({ texto: '北京北冰洋 女排 赛程', dominios: [] });
    expect(textos(plan)).toContain('赛程');
    expect(plan.consultas.at(-1).dominios).toEqual(['volleybox.net']);
  });
  it.each([
    ['Brasil', 'tabela'],
    ['Italia', 'calendario partite'],
    ['Francia', 'calendrier'],
    ['Perú', 'fixture'],
    ['Estados Unidos', 'schedule'],
  ])('%s usa su idioma', (pais, palabra) => {
    expect(textos(planPartidos(ctx, club(pais, 'Club'), { nombre: 'Liga', calendarioOficialUrl: 'https://liga.org/calendario' }))).toContain(palabra);
  });
  it('restringe al sitio de la liga y a Volleybox', () => {
    const plan = planPartidos(ctx, club('Brasil', 'Sesi'), { nombre: 'Superliga', calendarioOficialUrl: 'https://cbv.com.br/superliga' });
    expect(plan.consultas[0].dominios).toEqual(['cbv.com.br', 'volleybox.net']);
    expect(plan.paginas).toContain('https://cbv.com.br/superliga');
  });
});

describe('dominiosConfiables', () => {
  it('reúne liga, club y Volleybox', () => {
    const c = { ...club('Francia', 'Nancy'), calendarioUrl: 'https://spikelive.fr/cal', sitio: 'https://www.vnvb.fr/' };
    expect(dominiosConfiables(c, { calendarioOficialUrl: 'https://spikelive.fr/cal' }, 'ligue-a-fr')).toEqual(expect.arrayContaining(['volleybox.net', 'lnv.fr', 'spikelive.fr', 'vnvb.fr']));
  });
});

describe('otros planes', () => {
  it('el perfil exige que la página la mencione', () => {
    const { exige } = planPerfil(ctx, { nombre: 'Uxue Guereca' }, null);
    expect(exige({ titulo: 'Uxue Guereca', url: 'https://a.mx/x', contenido: '' })).toBe(true);
    expect(exige({ titulo: 'Jugadoras', url: 'https://a.mx/players', contenido: 'lista' })).toBe(false);
  });
  it('el ranking lee páginas oficiales con extracción completa', () => {
    const plan = planRankings();
    expect(plan.avanzado).toBe(true);
    expect(plan.paginas.join()).toContain('volleyballworld.com');
  });
  it('el agente 04 busca Lima 2027 y el calendario NORCECA, sin lo histórico', () => {
    const t = textos(planProximo(ctx));
    expect(t).toContain('Lima 2027');
    expect(t).toContain('NORCECA calendar');
    expect(t).not.toContain('Campeonato Mundial');
  });
  it('un torneo y una lista se buscan por su nombre y edición', () => {
    const torneo = { nombre: 'Copa Panamericana', edicion: 2026 };
    expect(textos(planTorneo(ctx, torneo))).toContain('Copa Panamericana 2026');
    expect(textos(planLista(ctx, torneo))).toContain('Copa Panamericana 2026');
  });
  it('un partido por verificar agrega la página de donde salió', () => {
    const club = { nombre: 'Club', alias: [], pais: 'Italia', calendarioUrl: 'https://a.it/cal' };
    expect(planPartidos(ctx, club, null, [{ fuente: 'https://a.it/nota' }, { fuente: null }]).paginas).toEqual(['https://a.it/cal', 'https://a.it/nota']);
  });
  it('no lee la portada de la liga: no se puede citar', () => {
    const club = { nombre: 'Club', alias: [], pais: 'Brasil', calendarioUrl: null };
    expect(planPartidos(ctx, club, { nombre: 'Liga', calendarioOficialUrl: 'https://cbv.com.br/' }).paginas).toEqual([]);
    expect(planPartidos(ctx, club, { nombre: 'Liga', calendarioOficialUrl: 'https://cbv.com.br/superliga' }).paginas).toEqual(['https://cbv.com.br/superliga']);
  });
  it('dónde ver lee el calendario oficial', () => {
    expect(planDondeVer(ctx, { nombre: 'Liga' }, { calendarioOficialUrl: 'https://a.mx/c' }).paginas).toEqual(['https://a.mx/c']);
  });
});
