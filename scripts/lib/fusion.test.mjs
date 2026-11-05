import { describe, expect, it } from 'vitest';
import { conMs, fichas, fusionar, ladoNuestro, mismoCruce, normal } from './fusion.mjs';

const club = { id: 'uyba', zona: 'Europe/Rome', nombre: 'UYBA Volley Busto Arsizio', alias: ['Eurotek UYBA', 'Busto Arsizio'] };
const partido = (inicio, origen, extra = {}) => conMs({
  inicio, origen, local: 'UYBA Busto Arsizio', visitante: 'Savino Del Bene Scandicci', nuestro: 'local', ...extra,
});

describe('nombres', () => {
  it('normal quita acentos y ligaduras', () => {
    expect(normal('Vandœuvre-lès-Nancy')).toBe('vandoeuvre les nancy');
    expect(normal('Sesi Vôlei Bauru')).toBe('sesi volei bauru');
  });
  it('fichas descarta palabras vacías y conserva chino', () => {
    expect(fichas('Sesi Vôlei Bauru')).toEqual(['sesi', 'bauru']);
    expect(fichas('北京北冰洋')).toEqual(['北京北冰洋']);
  });
});

describe('ladoNuestro', () => {
  it('identifica al club por nombre o alias', () => {
    expect(ladoNuestro({ local: 'Eurotek UYBA', visitante: 'Consolini Volley' }, club)).toBe('local');
    expect(ladoNuestro({ local: 'Consolini Volley', visitante: 'UYBA Busto Arsizio' }, club)).toBe('visita');
  });
  it('devuelve null si no puede decidir', () => {
    expect(ladoNuestro({ local: 'Consolini Volley', visitante: 'Scandicci' }, club)).toBeNull();
  });
});

describe('mismoCruce', () => {
  it('reconoce un partido reprogramado', () => {
    expect(mismoCruce(partido('2026-11-15T17:00:00+01:00', 'inicial'), partido('2026-11-18T20:30:00+01:00', 'ia'))).toBe(true);
  });
  it('no confunde el mismo rival semanas después', () => {
    expect(mismoCruce(partido('2026-11-15T17:00:00+01:00', 'inicial'), partido('2026-12-20T17:00:00+01:00', 'ia'))).toBe(false);
  });
});

describe('fusionar', () => {
  it('la IA gana sobre lo inicial el mismo día', () => {
    const r = fusionar(club, [partido('2026-11-15T17:00:00+01:00', 'inicial')], [partido('2026-11-15T18:00:00+01:00', 'ia')], []);
    expect(r).toHaveLength(1);
    expect(r[0].origen).toBe('ia');
  });
  it('lo manual gana sobre la IA', () => {
    const r = fusionar(club, [], [partido('2026-11-15T18:00:00+01:00', 'ia')], [partido('2026-11-15T19:00:00+01:00', 'manual')]);
    expect(r).toHaveLength(1);
    expect(r[0].origen).toBe('manual');
  });
  it('un partido reprogramado reemplaza al anterior', () => {
    const r = fusionar(club, [partido('2026-11-15T17:00:00+01:00', 'inicial')], [partido('2026-11-18T20:30:00+01:00', 'ia')], []);
    expect(r.map((p) => p.inicio)).toEqual(['2026-11-18T20:30:00+01:00']);
  });
  it('conserva lo anterior si la IA no trae nada', () => {
    const r = fusionar(club, [partido('2026-11-15T17:00:00+01:00', 'inicial')], [], []);
    expect(r).toHaveLength(1);
  });
  it('eliminar quita el partido de ese día', () => {
    const borrar = partido('2026-11-15T12:00:00+01:00', 'manual', { eliminar: true });
    expect(fusionar(club, [partido('2026-11-15T17:00:00+01:00', 'inicial')], [], [borrar])).toEqual([]);
  });
  it('ordena por fecha', () => {
    const otro = { visitante: 'Megabox Vallefoglia' };
    const r = fusionar(club, [partido('2026-11-15T17:00:00+01:00', 'inicial')], [partido('2026-11-11T20:30:00+01:00', 'ia', otro)], []);
    expect(r.map((p) => p.inicio.slice(0, 10))).toEqual(['2026-11-11', '2026-11-15']);
  });
});
