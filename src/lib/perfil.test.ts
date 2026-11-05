import { describe, expect, it } from 'vitest';
import { apellido, edad, estaturaTexto, fechaLarga, fuentesDe, origenTexto } from './perfil';

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
