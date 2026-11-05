import { describe, expect, it } from 'vitest';
import { doblar, escapar, generarIcs, type EventoIcs } from './ics';

const evento: EventoIcs = {
  id: 'club-sesi-bauru-2026-11-07', tipo: 'club', inicio: '2026-11-07T21:00:00-03:00', horaConfirmada: true,
  local: 'Sesi Vôlei Bauru', visitante: 'E.C. Pinheiros', competencia: 'Superliga Feminina · Rodada 4', sede: 'Bauru',
  fuente: 'https://cbv.com.br/tabela', jugadoras: ['Sofía Maldonado'], dondeVer: ['Canal Vôlei'],
};
const ACTUALIZADO = '2026-11-04T19:40:00-06:00';
const lineas = (texto: string) => texto.replace(/\r\n /g, '').split('\r\n');

describe('escapar', () => {
  it('escapa lo que el formato reserva', () => {
    expect(escapar('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
  });
});

describe('doblar', () => {
  it('no toca líneas cortas', () => {
    expect(doblar('SUMMARY:Hola')).toBe('SUMMARY:Hola');
  });
  it('corta a 75 bytes sin partir acentos', () => {
    const texto = `SUMMARY:${'ñ'.repeat(100)}`;
    const partes = doblar(texto).split('\r\n');
    const bytes = new TextEncoder();
    for (const parte of partes) expect(bytes.encode(parte).length).toBeLessThanOrEqual(75);
    expect(partes.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(texto);
    expect(partes.slice(1).every((p) => p.startsWith(' '))).toBe(true);
  });
});

describe('generarIcs', () => {
  const salida = generarIcs('Próximo Saque', [evento], ACTUALIZADO);

  it('usa saltos CRLF y cierra el calendario', () => {
    expect(salida.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(salida.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(salida.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
  it('escribe el partido en UTC con dos horas', () => {
    const l = lineas(salida);
    expect(l).toContain('DTSTART:20261108T000000Z');
    expect(l).toContain('DTEND:20261108T020000Z');
    expect(l).toContain('DTSTAMP:20261105T014000Z');
    expect(l).toContain('UID:club-sesi-bauru-2026-11-07@proximo-saque');
    expect(l).toContain('LOCATION:Bauru');
  });
  it('el título es el texto del partido sin la hora', () => {
    expect(lineas(salida)).toContain('SUMMARY:Sofía Maldonado · Sesi Vôlei Bauru vs E.C. Pinheiros');
  });
  it('los detalles llevan competencia, dónde verlo y fuente', () => {
    expect(lineas(salida)).toContain('DESCRIPTION:Superliga Feminina · Rodada 4\\nDónde verlo: Canal Vôlei\\nFuente: https://cbv.com.br/tabela');
  });
  it('en la Selección el título dice Selección Mexicana', () => {
    const l = lineas(generarIcs('x', [{ ...evento, tipo: 'seleccion', local: 'México', visitante: 'Perú', jugadoras: [] }], ACTUALIZADO));
    expect(l).toContain('SUMMARY:Selección Mexicana · México vs Perú');
  });
  it('sin hora confirmada es de todo el día, en la fecha de la sede', () => {
    const l = lineas(generarIcs('x', [{ ...evento, horaConfirmada: false, inicio: '2026-12-31T12:00:00-03:00' }], ACTUALIZADO));
    expect(l).toContain('DTSTART;VALUE=DATE:20261231');
    expect(l).toContain('DTEND;VALUE=DATE:20270101');
    expect(l.find((x) => x.startsWith('DESCRIPTION'))).toContain('Hora por confirmar');
  });
  it('omite lo que falta', () => {
    const l = lineas(generarIcs('x', [{ ...evento, competencia: null, sede: null, fuente: null, dondeVer: [] }], ACTUALIZADO));
    expect(l.some((x) => x.startsWith('DESCRIPTION'))).toBe(false);
    expect(l.some((x) => x.startsWith('LOCATION'))).toBe(false);
  });
  it('el mismo dato produce el mismo archivo', () => {
    expect(generarIcs('Próximo Saque', [evento], ACTUALIZADO)).toBe(salida);
  });
  it('funciona sin eventos', () => {
    expect(generarIcs('x', [], null)).toContain('END:VCALENDAR');
  });
});
