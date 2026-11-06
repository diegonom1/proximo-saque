import { describe, expect, it } from 'vitest';
import { idTorneo, mismoTorneo, nombreCanonico } from './torneos.mjs';
import { fechasDeCatalogo, mismoTorneo as mismo, nombresDe } from './torneos.mjs';

describe('nombreCanonico', () => {
  it.each([
    ['Mundial'],
    ['Campeonato Mundial'],
    ['World Championship'],
    ['FIVB Volleyball Women\'s World Championship'],
    ['Campeonato Mundial Femenil de Voleibol 2025'],
    ['Campeonato del Mundo'],
  ])('%s es el Campeonato Mundial', (nombre) => {
    expect(nombreCanonico(nombre)).toBe('Campeonato Mundial');
  });
  it('no importa el orden ni los acentos', () => {
    expect(nombreCanonico('Final Four NORCECA')).toBe('NORCECA Final Four');
    expect(nombreCanonico('JUEGOS OLIMPICOS')).toBe('Juegos Olímpicos');
  });
  it('reconoce los nombres en inglés', () => {
    expect(nombreCanonico('Pan-American Cup')).toBe('Copa Panamericana');
    expect(nombreCanonico('Volleyball Nations League')).toBe('Liga de Naciones');
    expect(nombreCanonico('Central American and Caribbean Games')).toBe('Juegos Centroamericanos y del Caribe');
  });
  it('ignora el número romano de la edición', () => {
    expect(nombreCanonico('XXIII Copa Panamericana')).toBe('Copa Panamericana');
    expect(nombreCanonico("XXII Women's Pan American Cup")).toBe('Copa Panamericana');
    expect(idTorneo('XXIII Copa Panamericana', 2026)).toBe('copa-panamericana-2026');
  });
  it('un torneo fuera del catálogo conserva su nombre', () => {
    expect(nombreCanonico('Copa Tokio')).toBe('Copa Tokio');
  });
  it('no confunde torneos parecidos', () => {
    expect(nombreCanonico('NORCECA Final Six')).not.toBe(nombreCanonico('NORCECA Final Four'));
    expect(nombreCanonico('Campeonato NORCECA')).not.toBe(nombreCanonico('Campeonato Mundial'));
    expect(nombreCanonico('Copa Panamericana Sub-23')).toBe('Copa Panamericana Sub-23');
  });
});

describe('idTorneo', () => {
  it('es el mismo con cualquier nombre', () => {
    expect(idTorneo('World Championship', 2025)).toBe('campeonato-mundial-2025');
    expect(idTorneo('Mundial', 2025)).toBe('campeonato-mundial-2025');
  });
  it('conserva los ids que ya existen', () => {
    expect(idTorneo('NORCECA Final Six', 2026)).toBe('norceca-final-six-2026');
    expect(idTorneo('NORCECA Final Four', 2026)).toBe('norceca-final-four-2026');
  });
});

describe('mismoTorneo', () => {
  const t = (nombre, edicion, fechaInicio, fechaFin) => ({ nombre, edicion, fechaInicio, fechaFin });
  it('mismo nombre canónico y edición', () => {
    expect(mismoTorneo(t('Mundial', 2025), t('World Championship', 2025))).toBe(true);
  });
  it('otra edición es otro torneo', () => {
    expect(mismoTorneo(t('Mundial', 2025), t('Mundial', 2022))).toBe(false);
  });
  it('nombres raros con la misma edición y fechas traslapadas son el mismo', () => {
    expect(mismoTorneo(t('Copa Tailandia', 2025, '2025-08-22', '2025-09-07'), t('Thailand Cup', 2025, '2025-08-25', '2025-08-30'))).toBe(true);
  });
  it('el último día de uno y el primero del otro se traslapan', () => {
    expect(mismoTorneo(t('A', 2026, '2026-06-01', '2026-06-08'), t('B', 2026, '2026-06-08', '2026-06-10'))).toBe(true);
  });
  it('misma edición sin traslape son distintos', () => {
    expect(mismoTorneo(t('A', 2026, '2026-06-03', '2026-06-08'), t('B', 2026, '2026-09-21', '2026-09-27'))).toBe(false);
  });
  it('fechas traslapadas de otra edición son distintos', () => {
    expect(mismoTorneo(t('A', 2025, '2026-06-03', '2026-06-08'), t('B', 2026, '2026-06-03', '2026-06-08'))).toBe(false);
  });
  it('sin fechas solo decide el nombre', () => {
    expect(mismoTorneo(t('A', 2026, null, null), t('B', 2026, null, null))).toBe(false);
  });
});

describe('fechasDeCatalogo', () => {
  it('reconoce la edición por cualquiera de sus nombres', () => {
    expect(fechasDeCatalogo('Pan American Games', 2027)).toEqual({ fechaInicio: '2027-07-23', fechaFin: '2027-08-08' });
  });
  it('sin esa edición no inventa fechas', () => {
    expect(fechasDeCatalogo('Juegos Panamericanos', 2023)).toBeNull();
    expect(fechasDeCatalogo('Torneo desconocido', 2027)).toBeNull();
  });
});

describe('Copa del Mundo: el nombre del Mundial desde 2027', () => {
  const NOMBRES = ['Campeonato Mundial', 'Mundial', 'World Championship', 'Copa del Mundo', 'Copa del Mundo FIVB', 'Copa Mundial', 'FIVB Volleyball Women\'s World Cup', 'Copa del Mundo Femenina de Voleibol de la FIVB'];

  it.each(NOMBRES)('"%s" en 2027 es la Copa del Mundo FIVB', (nombre) => {
    expect(nombreCanonico(nombre, 2027)).toBe('Copa del Mundo FIVB');
    expect(idTorneo(nombre, 2027)).toBe('copa-del-mundo-fivb-2027');
  });
  it.each(NOMBRES)('"%s" en 2025 sigue siendo el Campeonato Mundial', (nombre) => {
    expect(nombreCanonico(nombre, 2025)).toBe('Campeonato Mundial');
    expect(idTorneo(nombre, 2025)).toBe('campeonato-mundial-2025');
  });
  it('las ediciones siguientes conservan el nombre nuevo', () => expect(nombreCanonico('Mundial', 2029)).toBe('Copa del Mundo FIVB'));
  it('el año también puede llegar como texto', () => expect(idTorneo('World Cup', '2027')).toBe('copa-del-mundo-fivb-2027'));
  it('sin edición usa el nombre de su entrada', () => expect(nombreCanonico('World Cup')).toBe('Campeonato Mundial'));
  it('es el mismo torneo aunque no haya fechas', () => {
    expect(mismo({ nombre: 'Copa del Mundo', edicion: 2027 }, { nombre: 'Campeonato Mundial', edicion: 2027 })).toBe(true);
  });
  it('otra edición es otro torneo', () => {
    expect(mismo({ nombre: 'Copa del Mundo', edicion: 2027 }, { nombre: 'Campeonato Mundial', edicion: 2025 })).toBe(false);
  });
});

describe('nombresDe', () => {
  it('trae el nombre canónico y sus alias', () => expect(nombresDe('World Cup')).toEqual(expect.arrayContaining(['Campeonato Mundial', 'Mundial', 'Copa del Mundo', 'World Cup'])));
  it('un torneo fuera del catálogo solo tiene su nombre', () => expect(nombresDe('Torneo X')).toEqual(['Torneo X']));
});
