import { describe, expect, it } from 'vitest';
import { idTorneo, mismoTorneo, nombreCanonico } from './torneos.mjs';

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
