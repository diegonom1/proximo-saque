import { describe, expect, it } from 'vitest';
import { apellido, avisoTorneo, destacadosPorAnio, edad, estaturaTexto, fechaLarga, fuentesDe, origenTexto } from './perfil';

describe('datos', () => {
  it('apellido toma la última palabra', () => {
    expect(apellido('Sofía Maldonado')).toBe('Maldonado');
    expect(apellido('Ovalle')).toBe('Ovalle');
  });
  it('edad depende de si ya cumplió años', () => {
    expect(edad('2000-11-04', Date.parse('2026-11-04T12:00:00Z'))).toBe(26);
    expect(edad('2000-11-05', Date.parse('2026-11-04T12:00:00Z'))).toBe(25);
  });
  it('fechaLarga no se recorre de día', () => {
    expect(fechaLarga('2000-01-01')).toBe('1 de enero de 2000');
  });
  it('origenTexto omite lo que falta', () => {
    expect(origenTexto({ ciudad: null, estado: 'Jalisco', pais: 'México' })).toBe('Jalisco, México');
    expect(origenTexto({ ciudad: null, estado: null, pais: null })).toBeNull();
    expect(origenTexto(null)).toBeNull();
  });
  it('estatura en metros', () => {
    expect(estaturaTexto(183)).toBe('1.83 m');
  });
});

describe('destacadosPorAnio', () => {
  const lista = [{ texto: 'a', anio: 2021 }, { texto: 'b', anio: null }, { texto: 'c', anio: 2026 }, { texto: 'd', anio: 2024 }, { texto: 'e', anio: 2026 }, { texto: 'f', anio: null }];
  it('va del más reciente al más antiguo, con los que no tienen año al final', () => {
    expect(destacadosPorAnio(lista).map((d) => d.texto)).toEqual(['c', 'e', 'd', 'a', 'b', 'f']);
  });
  it('no cambia la lista guardada', () => {
    const copia = [...lista];
    destacadosPorAnio(lista);
    expect(lista).toEqual(copia);
  });
});

describe('avisoTorneo', () => {
  const torneo = { id: 't', nombre: 'Copa Panamericana', edicion: 2027, fechaInicio: '2027-06-03', fechaFin: '2027-06-08' };
  const hoy = '2026-11-05';

  it('avisa si hay torneo y aún no hay lista', () => {
    expect(avisoTorneo(torneo, [], hoy)?.texto).toBe('Próximo torneo de la Selección: Copa Panamericana 2027, 3–8 jun 2027 · Lista por confirmar');
  });
  it('los partidos sin convocadas no cuentan como lista', () => {
    expect(avisoTorneo(torneo, [{ torneoId: 't', convocadas: null }, { torneoId: 't', convocadas: [] }], hoy)).not.toBeNull();
  });
  it('con lista publicada ya no avisa, aunque ella no esté', () => {
    expect(avisoTorneo(torneo, [{ torneoId: 't', convocadas: ['otra'] }], hoy)).toBeNull();
  });
  it('la lista de otro torneo no cuenta', () => {
    expect(avisoTorneo(torneo, [{ torneoId: 'otro', convocadas: ['a'] }], hoy)).not.toBeNull();
  });
  it('sin torneo o con torneo terminado no avisa', () => {
    expect(avisoTorneo(null, [], hoy)).toBeNull();
    expect(avisoTorneo(torneo, [], '2027-06-09')).toBeNull();
  });
  it('el último día todavía avisa', () => {
    expect(avisoTorneo(torneo, [], '2027-06-08')).not.toBeNull();
  });
  it('sin fechas lo dice', () => {
    const v = avisoTorneo({ ...torneo, fechaInicio: null, fechaFin: null }, [], hoy);
    expect(v?.texto).toBe('Próximo torneo de la Selección: Copa Panamericana 2027, fechas por confirmar · Lista por confirmar');
  });
});

describe('fuentesDe', () => {
  it('junta por URL lo que salió de la misma página', () => {
    const lista = fuentesDe({
      fuentes: { numero: 'https://www.norceca.info/a', posicion: 'https://www.norceca.info/a' },
      destacados: [{ texto: 'MVP', fuente: 'https://fivb.com/b' }],
      historialClubes: [{ club: 'Sin fuente', fuente: null }],
      redes: [],
      ultimaListaOficial: { fuente: 'https://www.norceca.info/a' },
    });
    expect(lista).toEqual([
      { url: 'https://www.norceca.info/a', sitio: 'norceca.info', temas: ['Número', 'Posición', 'Última lista oficial'] },
      { url: 'https://fivb.com/b', sitio: 'fivb.com', temas: ['MVP'] },
    ]);
  });
});
