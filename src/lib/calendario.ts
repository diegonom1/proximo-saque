// Enlace de plantilla de Google Calendar.

import { tituloPartido } from './partido';

interface EventoPartido {
  tipo: 'club' | 'seleccion';
  inicio: string;
  horaConfirmada: boolean;
  local: string;
  visitante: string;
  competencia: string | null;
  sede: string | null;
  fuente: string | null;
}

interface Extras {
  jugadoras?: string[]; // nombres de las seleccionadas
}

const DOS_HORAS = 2 * 36e5;
const formatoGoogle = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function enlaceGoogleCalendar(p: EventoPartido, { jugadoras = [] }: Extras = {}) {
  const ms = Date.parse(p.inicio);
  const detalles = [
    p.competencia,
    !p.horaConfirmada && 'Hora por confirmar',
    p.fuente && `Fuente: ${p.fuente}`,
  ].filter(Boolean).join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(tituloPartido(p, jugadoras))}&dates=${formatoGoogle(ms)}/${formatoGoogle(ms + DOS_HORAS)}`
    + `&details=${encodeURIComponent(detalles)}&location=${encodeURIComponent(p.sede ?? '')}`;
}
