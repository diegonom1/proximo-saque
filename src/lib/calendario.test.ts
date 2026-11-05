import { describe, expect, it } from 'vitest';
import { enlaceGoogleCalendar } from './calendario';

const partido = {
  inicio: '2026-11-07T21:00:00-03:00', horaConfirmada: true, local: 'Sesi Vôlei Bauru', visitante: 'E.C. Pinheiros',
  competencia: 'Superliga Feminina · Rodada 4', sede: 'Bauru', fuente: 'https://cbv.com.br/tabela',
};
const leer = (enlace: string) => new URL(enlace).searchParams;

describe('enlaceGoogleCalendar', () => {
  it('usa la plantilla con dos horas de duración en UTC', () => {
    const q = leer(enlaceGoogleCalendar(partido));
    expect(q.get('action')).toBe('TEMPLATE');
    expect(q.get('dates')).toBe('20261108T000000Z/20261108T020000Z');
    expect(q.get('location')).toBe('Bauru');
  });
  it('lleva título, competencia, dónde verlo y fuente', () => {
    const q = leer(enlaceGoogleCalendar(partido, { jugadoras: ['Sofía Maldonado'], dondeVer: ['Canal Vôlei Brasil'] }));
    expect(q.get('text')).toBe('Sesi Vôlei Bauru vs E.C. Pinheiros (Sofía Maldonado)');
    expect(q.get('details')).toBe([
      'Superliga Feminina · Rodada 4', 'Seleccionadas: Sofía Maldonado', 'Dónde verlo: Canal Vôlei Brasil', 'Fuente: https://cbv.com.br/tabela',
    ].join('\n'));
  });
  it('avisa si la hora no está confirmada y tolera campos vacíos', () => {
    const q = leer(enlaceGoogleCalendar({ ...partido, horaConfirmada: false, competencia: null, sede: null, fuente: null }));
    expect(q.get('details')).toBe('Hora por confirmar');
    expect(q.get('location')).toBe('');
  });
});
