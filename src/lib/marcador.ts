// Dígitos que ruedan como marcador: el que cambia sale por arriba y el nuevo entra por abajo.
// Corre en el navegador. No usa GSAP para que la cuenta regresiva no dependa de él.

const CURVA = 'cubic-bezier(0.16, 1, 0.3, 1)'; // --curva
const MS = 700; // --duracion

const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Posiciones que cambian de un valor al otro. Si cambia la longitud, se repinta todo.
export function digitosQueCambian(antes: string, despues: string) {
  return [...despues].flatMap((c, i) => (antes.length === despues.length && antes[i] === c ? [] : [i]));
}

function celdas(el: HTMLElement, cuantas: number) {
  const actuales = [...el.querySelectorAll<HTMLElement>(':scope > .digito')];
  if (actuales.length === cuantas) return actuales;
  const nuevas = Array.from({ length: cuantas }, () => {
    const celda = document.createElement('span');
    celda.className = 'digito';
    return celda;
  });
  el.replaceChildren(...nuevas);
  return nuevas;
}

export function rodar(el: HTMLElement, texto: string) {
  const antes = el.dataset.valor ?? '';
  if (antes === texto) return;
  el.dataset.valor = texto;
  if (quieto()) {
    el.textContent = texto;
    return;
  }
  const lugares = celdas(el, texto.length);
  for (const i of digitosQueCambian(antes, texto)) {
    const celda = lugares[i];
    // Si el navegador va lento, el cambio anterior puede no haber terminado.
    celda.querySelectorAll(':scope > .digito__saliente').forEach((viejo) => viejo.remove());
    const saliente = celda.firstElementChild as HTMLElement | null;
    const entrante = document.createElement('span');
    entrante.textContent = texto[i];
    celda.append(entrante);
    entrante.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: MS, easing: CURVA });
    if (saliente) {
      saliente.classList.add('digito__saliente');
      const salida = saliente.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: MS, easing: CURVA });
      salida.onfinish = () => saliente.remove();
    }
  }
}
