import { describe, expect, it } from 'vitest';
import { elegirCompromiso, textoBoton, vistaHero, type PartidoCliente, type TorneoCliente } from './compromiso';

const CDMX = 'America/Mexico_City';
const AHORA = Date.parse('2026-11-04T18:00:00-06:00');

const club: PartidoCliente = {
  tipo: 'club', inicio: '2026-11-05T18:30:00-03:00', zonaSede: 'America/Sao_Paulo', horaConfirmada: true,
  local: 'Batavo Mackenzie', visitante: 'Gerdau Minas', competencia: 'Superliga', sede: 'Belo Horizonte',
  club: 'Batavo Mackenzie', jugadoras: ['Jocelyn Urías'],
};
const seleccion: PartidoCliente = {
  ...club, tipo: 'seleccion', inicio: '2026-11-20T19:00:00-05:00', zonaSede: 'America/Lima', local: 'México', visitante: 'Perú',
  competencia: 'Copa Panamericana', sede: 'Lima', club: null, jugadoras: [],
};
const torneo: TorneoCliente = {
  nombre: 'Copa Panamericana', edicion: 2026, ciudad: 'Lima', pais: 'Perú', fechaInicio: '2026-11-20', fechaFin: '2026-11-28',
};
const vista = (partidos: PartidoCliente[], t: TorneoCliente | null, ahora = AHORA) => vistaHero(elegirCompromiso(partidos, t, ahora, CDMX), ahora, CDMX);

describe('prioridad del hero', () => {
  it('1. partido de la Selección, aunque un club juegue antes', () => {
    const v = vista([club, seleccion], torneo);
    expect(v).toMatchObject({ modo: 'partido', fecha: '20.11.26', titulo: 'México vs Perú', alla: 'Allá serán las 19:00' });
    expect(v.cuenta).toEqual({ modo: 'completa', ms: Date.parse(seleccion.inicio) });
  });
  it('2. sin partido, el inicio del torneo cuenta en días', () => {
    const v = vista([club], torneo);
    expect(v).toMatchObject({ modo: 'torneo', fecha: '20.11.26', titulo: 'Copa Panamericana 2026', detalle: 'Lima, Perú', cuenta: { modo: 'dias', dias: 16 } });
  });
  it('3. sin torneo, la próxima en jugar', () => {
    const v = vista([club], null);
    expect(v).toMatchObject({
      modo: 'espera', fecha: null, titulo: 'Próximo torneo por confirmar',
      mientras: 'Mientras, la próxima en jugar: Jocelyn Urías con Batavo Mackenzie',
    });
    expect(v.cuenta.modo).toBe('completa');
  });
  it('sin nada programado no hay cuenta', () => {
    expect(vista([], null)).toMatchObject({ mientras: null, cuenta: { modo: 'ninguna' } });
  });
});

describe('el sitio no se queda viejo entre construcciones', () => {
  it('un partido terminado deja el hero', () => {
    const siguiente = { ...club, inicio: '2026-11-13T18:30:00-03:00', local: 'Dentil Praia Clube', visitante: 'Batavo Mackenzie' };
    const despues = Date.parse('2026-11-06T12:00:00-06:00');
    expect(vista([club, siguiente], null, despues).detalle).toContain('Dentil Praia Clube');
  });
  it('un torneo terminado se ignora', () => {
    expect(vista([club], torneo, Date.parse('2026-11-29T12:00:00-06:00')).modo).toBe('espera');
  });
  it('un torneo en curso sin partidos no cuenta días', () => {
    expect(vista([], torneo, Date.parse('2026-11-22T12:00:00-06:00'))).toMatchObject({ etiqueta: 'Torneo en curso', cuenta: { modo: 'ninguna' } });
  });
  it('un torneo sin fecha de inicio no se puede contar', () => {
    expect(vista([club], { ...torneo, fechaInicio: null }).modo).toBe('espera');
  });
});

describe('estados del partido', () => {
  it('en juego dura hasta 150 minutos', () => {
    const v = vista([seleccion], null, Date.parse(seleccion.inicio) + 6e4);
    expect(v.etiqueta).toBe('Selección · En juego');
    expect(v.cuenta.modo).toBe('envivo');
  });
  it('hora sin confirmar: solo días y sin "allá"', () => {
    const v = vista([{ ...seleccion, horaConfirmada: false }], null);
    expect(v).toMatchObject({ hora: 'Hora por confirmar', alla: null, cuenta: { modo: 'dias', dias: 16 } });
  });
  it('sin zonaSede no se muestra "allá"', () => {
    expect(vista([{ ...seleccion, zonaSede: null }], null).alla).toBeNull();
  });
  it('varias jugadoras del mismo club', () => {
    const v = vista([{ ...club, jugadoras: ['Uxue Guereca', 'Argentina Ung'], club: 'LOVB Miami' }], null);
    expect(v.mientras).toBe('Mientras, la próxima en jugar: Uxue Guereca y Argentina Ung con LOVB Miami');
  });
  it('ignora partidos de clubes sin seleccionadas activas', () => {
    expect(vista([{ ...club, jugadoras: [] }], null).mientras).toBeNull();
  });
});

describe('textoBoton', () => {
  const p = (inicio: string, horaConfirmada = true) => ({ inicio, horaConfirmada });
  it('muestra la cuenta corta', () => {
    expect(textoBoton([p('2026-11-07T00:30:00-06:00')], AHORA, CDMX)).toBe('Próximo partido · 2d 6h');
  });
  it('sin hora confirmada cuenta días', () => {
    expect(textoBoton([p('2026-11-07T12:00:00-06:00', false)], AHORA, CDMX)).toBe('Próximo partido · 3d');
  });
  it('avisa si hay partido en juego', () => {
    expect(textoBoton([p('2026-11-04T17:30:00-06:00')], AHORA, CDMX)).toBe('Partido en juego');
  });
  it('sin partidos no hay botón', () => {
    expect(textoBoton([], AHORA, CDMX)).toBeNull();
  });
});
