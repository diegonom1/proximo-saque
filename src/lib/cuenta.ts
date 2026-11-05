// Dibuja la cuenta regresiva de <Cuenta />. Corre en el navegador.

import { cuentaRegresiva, diasHasta } from './tiempo';

const dos = (n: number) => String(n).padStart(2, '0');

function unidad(raiz: HTMLElement, nombre: string, valor: string | null) {
  const el = raiz.querySelector<HTMLElement>(`[data-unidad="${nombre}"]`);
  if (!el) return;
  el.hidden = valor === null;
  const numero = el.querySelector('span');
  if (numero && valor !== null && numero.textContent !== valor) numero.textContent = valor;
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

// Con hora sin confirmar la cuenta va solo en días.
export function escribirCuenta(raiz: HTMLElement, ms: number, confirmada: boolean, ahora: number) {
  if (confirmada) escribirCompleta(raiz, ms, ahora);
  else escribirDias(raiz, diasHasta(ms, ahora));
}
