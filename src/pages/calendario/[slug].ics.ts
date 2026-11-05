import type { APIContext } from 'astro';
import { activas, actualizado, eventoIcs, partidosAgendaDe } from '../../lib/datos';
import { generarIcs } from '../../lib/ics';

export function getStaticPaths() {
  return activas.map((j) => ({ params: { slug: j.slug }, props: { slug: j.slug, nombre: j.nombre } }));
}

export function GET({ props }: APIContext<{ slug: string; nombre: string }>) {
  const cuerpo = generarIcs(`${props.nombre} · Próximo Saque`, partidosAgendaDe(props.slug).map(eventoIcs), actualizado);
  return new Response(cuerpo, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
}
