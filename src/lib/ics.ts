// Calendarios .ics (RFC 5545) para suscribirse y recibir los cambios solos.

import { tituloPartido } from './partido';

export interface EventoIcs {
  id: string;
  tipo: 'club' | 'seleccion';
  inicio: string;
  horaConfirmada: boolean;
  local: string;
  visitante: string;
  competencia: string | null;
  sede: string | null;
  fuente: string | null;
  jugadoras: string[];
}

const DOS_HORAS = 2 * 36e5;

export const escapar = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Máximo 75 bytes por línea, sin partir un carácter; la continuación empieza con un espacio.
export function doblar(linea: string) {
  const bytes = new TextEncoder();
  const partes: string[] = [];
  let actual = '';
  let tamano = 0;
  for (const caracter of linea) {
    const peso = bytes.encode(caracter).length;
    if (tamano + peso > 75) {
      partes.push(actual);
      actual = ' ';
      tamano = 1;
    }
    actual += caracter;
    tamano += peso;
  }
  partes.push(actual);
  return partes.join('\r\n');
}

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const fechaSola = (fecha: string) => fecha.replace(/-/g, '');

function diaSiguiente(fecha: string) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

function lineasEvento(e: EventoIcs, sello: string) {
  const ms = Date.parse(e.inicio);
  const dia = e.inicio.slice(0, 10);
  // Sin hora confirmada va como evento de todo el día: el mediodía guardado no es una hora real.
  const fechas = e.horaConfirmada
    ? [`DTSTART:${utc(ms)}`, `DTEND:${utc(ms + DOS_HORAS)}`]
    : [`DTSTART;VALUE=DATE:${fechaSola(dia)}`, `DTEND;VALUE=DATE:${fechaSola(diaSiguiente(dia))}`];
  const detalles = [
    e.competencia,
    !e.horaConfirmada && 'Hora por confirmar',
    e.fuente && `Fuente: ${e.fuente}`,
  ].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@proximo-saque`,
    `DTSTAMP:${sello}`,
    ...fechas,
    `SUMMARY:${escapar(tituloPartido(e, e.jugadoras))}`,
    ...(detalles ? [`DESCRIPTION:${escapar(detalles)}`] : []),
    ...(e.sede ? [`LOCATION:${escapar(e.sede)}`] : []),
    'END:VEVENT',
  ];
}

// `actualizado` hace que el archivo solo cambie cuando cambian los datos.
export function generarIcs(nombre: string, eventos: EventoIcs[], actualizado: string | null) {
  const sello = utc(actualizado ? Date.parse(actualizado) : 0);
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Próximo Saque//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nombre)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...eventos.flatMap((e) => lineasEvento(e, sello)),
    'END:VCALENDAR',
  ];
  return `${lineas.map(doblar).join('\r\n')}\r\n`;
}
