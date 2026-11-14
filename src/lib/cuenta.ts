// Dibuja la cuenta regresiva de <Cuenta />. Corre en el navegador.

import { rodar } from './marcador';
import { cuentaRegresiva, diasHasta, empezoHace } from './tiempo';

const dos = (n: number) => String(n).padStart(2, '0');

function unidad(raiz: HTMLElement, nombre: string, valor: string | null) {
  const el = raiz.querySelector<HTMLElement>(`[data-unidad="${nombre}"]`);
  if (!el) return;
  el.hidden = valor === null;
  const numero = el.querySelector<HTMLElement>(':scope > span');
  if (numero && valor !== null) rodar(numero, valor);
}

export function escribirDias(raiz: HTMLElement, dias: number) {
  unidad(raiz, 'dias', String(dias));
  for (const nombre of ['horas', 'minutos', 'segundos']) unidad(raiz, nombre, null);
}

export function escribirCompleta(raiz: HTMLElement, ms: number, ahora: number) {
  const r = cuentaRegresiva(ms, ahora);
  unidad(raiz, 'dias', String(r.dias));
  unidad(raiz, 'horas', dos(r.horas));
  unidad(raiz, 'minutos', dos(r.minutos));
  unidad(raiz, 'segundos', dos(r.segundos));
}

// Mientras se juega, la cuenta deja su lugar a un aviso grande de "En juego" (el que va junto a ella en
// <Cuenta />). Sin el aviso, el hueco donde estaba la cuenta parecía un error.
export function pintarEnJuego(cuenta: HTMLElement, jugando: boolean, ms: number, ahora: number) {
  cuenta.hidden = jugando;
  const aviso = cuenta.nextElementSibling;
  if (!(aviso instanceof HTMLElement) || !aviso.matches('[data-envivo]')) return;
  aviso.hidden = !jugando;
  const desde = aviso.querySelector('[data-envivo-desde]');
  if (jugando && desde) desde.textContent = empezoHace(ms, ahora);
}

// Con hora sin confirmar la cuenta va solo en días.
export function escribirCuenta(raiz: HTMLElement, ms: number, confirmada: boolean, ahora: number) {
  if (confirmada) escribirCompleta(raiz, ms, ahora);
  else escribirDias(raiz, diasHasta(ms, ahora));
}
