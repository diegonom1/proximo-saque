// Enlace de plantilla de Google Calendar.

interface EventoPartido {
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
  dondeVer?: string[]; // nombres de las plataformas
}

const DOS_HORAS = 2 * 36e5;
const formatoGoogle = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function enlaceGoogleCalendar(p: EventoPartido, { jugadoras = [], dondeVer = [] }: Extras = {}) {
  const ms = Date.parse(p.inicio);
  const nombres = jugadoras.join(', ');
  const titulo = `${p.local} vs ${p.visitante}${nombres ? ` (${nombres})` : ''}`;
  const detalles = [
    p.competencia,
    !p.horaConfirmada && 'Hora por confirmar',
    nombres && `Seleccionadas: ${nombres}`,
    dondeVer.length > 0 && `Dónde verlo: ${dondeVer.join(', ')}`,
    p.fuente && `Fuente: ${p.fuente}`,
  ].filter(Boolean).join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(titulo)}&dates=${formatoGoogle(ms)}/${formatoGoogle(ms + DOS_HORAS)}`
    + `&details=${encodeURIComponent(detalles)}&location=${encodeURIComponent(p.sede ?? '')}`;
}
