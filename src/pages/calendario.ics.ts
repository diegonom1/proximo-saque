import { actualizado, eventoIcs, partidosAgenda } from '../lib/datos';
import { generarIcs } from '../lib/ics';

export function GET() {
  const cuerpo = generarIcs('Próximo Saque', partidosAgenda.map(eventoIcs), actualizado);
  return new Response(cuerpo, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
}
