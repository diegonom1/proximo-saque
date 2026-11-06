// Lenguaje de movimiento del sitio: póster deportivo con gráficos de transmisión de TV.
// Todo sale de cuatro recursos con la misma curva y duración, para que se sienta un solo diseño:
//   1. revelar: revelado con máscara.
//   2. rellenar: texto en contorno que se rellena.
//   3. contar: números que cuentan como marcador (la cuenta regresiva rueda en marcador.ts).
//   4. capa: capas a distinta velocidad.
// Solo se anima transform y opacity. El HTML ya trae el estado final: si este archivo no corre o
// hay prefers-reduced-motion, todo se ve igual, sin movimiento.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, CustomEase);

// La misma pareja que --curva y --duracion en Base.astro.
export const DURACION = 0.7;
CustomEase.create('saque', 'M0,0 C0.16,1 0.3,1 1,1');
gsap.defaults({ duration: DURACION, ease: 'saque' });

export { gsap, ScrollTrigger };

const CONDICIONES = {
  escritorio: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
  celular: '(max-width: 1023px) and (prefers-reduced-motion: no-preference)',
};

type Pantalla = { escritorio: boolean; celular: boolean };

// La sección fijada mueve lo que viene después y cada sección llega por su lado: el orden de la
// página manda, así que se reacomoda cuando ya llegaron todas.
let orden: ReturnType<typeof setTimeout>;
function reacomodar() {
  clearTimeout(orden);
  orden = setTimeout(() => {
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
  }, 60);
}

// Con prefers-reduced-motion no se llama nunca. GSAP deshace lo que haya hecho `fn` si cambia la pantalla.
export function conMovimiento(fn: (pantalla: Pantalla) => void | (() => void)) {
  gsap.matchMedia().add(CONDICIONES, (contexto) => {
    const limpiar = fn(contexto.conditions as Pantalla);
    reacomodar();
    return limpiar;
  });
}

export const alAparecer = (el: Element, fn: () => void, inicio = 'top bottom') =>
  ScrollTrigger.create({ trigger: el, start: inicio, once: true, onEnter: fn });

/* ---------- 1. Revelado con máscara ---------- */

function enmascarar(el: HTMLElement) {
  if (el.parentElement?.classList.contains('mascara')) return el.parentElement;
  const mascara = document.createElement('span');
  mascara.className = 'mascara';
  el.replaceWith(mascara);
  mascara.append(el);
  return mascara;
}

// El elemento sube desde atrás de su propio borde.
export function revelar(elementos: HTMLElement[], vars: gsap.TweenVars = {}) {
  elementos.forEach(enmascarar);
  return gsap.fromTo(elementos, { yPercent: 125 }, { yPercent: 0, stagger: 0.06, ...vars });
}

/* ---------- 2. Contorno que se rellena ---------- */

// Dos capas que se mueven en sentido contrario hacen de máscara sin animar otra cosa que transform.
export function prepararRelleno(el: HTMLElement) {
  if (el.querySelector(':scope > .relleno__capa')) return;
  const interior = document.createElement('span');
  interior.className = 'relleno__interior';
  interior.textContent = el.textContent;
  const capa = document.createElement('span');
  capa.className = 'relleno__capa';
  capa.setAttribute('aria-hidden', 'true');
  capa.append(interior);
  el.classList.add('relleno');
  el.append(capa);
}

export function rellenar(el: HTMLElement, vars: gsap.TimelineVars = {}) {
  const capa = el.querySelector(':scope > .relleno__capa');
  const interior = capa?.querySelector('.relleno__interior');
  return gsap.timeline(vars)
    .fromTo(capa ?? [], { xPercent: -101 }, { xPercent: 0 }, 0)
    .fromTo(interior ?? [], { xPercent: 101 }, { xPercent: 0 }, 0);
}

/* ---------- 3. Números como marcador ---------- */

const decimalesDe = (el: HTMLElement) => Number(el.dataset.decimales ?? 0);
const formato = (valor: number, decimales: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);

// El ancho se fija antes de empezar para que el texto de al lado no brinque.
function prepararContador(el: HTMLElement) {
  if (el.dataset.final) return;
  el.dataset.final = el.textContent ?? '';
  el.style.display = 'inline-block';
  el.style.minWidth = `${el.getBoundingClientRect().width}px`;
}

export function ponerEnCero(el: HTMLElement) {
  prepararContador(el);
  el.textContent = formato(0, decimalesDe(el));
}

export function contar(el: HTMLElement, vars: gsap.TweenVars = {}) {
  prepararContador(el);
  const decimales = decimalesDe(el);
  const marcador = { valor: 0 };
  return gsap.to(marcador, {
    valor: Number(el.dataset.contar),
    onUpdate: () => {
      el.textContent = formato(marcador.valor, decimales);
    },
    onComplete: () => {
      el.textContent = el.dataset.final ?? '';
    },
    ...vars,
  });
}

/* ---------- 4. Capas a distinta velocidad ---------- */

export const capa = (el: Element, desde: gsap.TweenVars, hasta: gsap.TweenVars, disparo: ScrollTrigger.Vars) =>
  gsap.fromTo(el, desde, { ...hasta, ease: 'none', scrollTrigger: { scrub: true, ...disparo } });

/* ---------- Lo que es igual en todas las páginas ---------- */

async function scrollSuave() {
  const { default: Lenis } = await import('lenis');
  const lenis = new Lenis({ anchors: true });
  const avanzar = (tiempo: number) => lenis.raf(tiempo * 1000);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(avanzar);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(avanzar);
    lenis.destroy();
  };
}

export function iniciar() {
  conMovimiento(({ escritorio }) => {
    for (const titulo of document.querySelectorAll<HTMLElement>('.titulo-seccion')) {
      prepararRelleno(titulo);
      rellenar(titulo, {
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: titulo, start: 'top 90%', end: 'top 55%', scrub: true },
      });
    }

    for (const el of document.querySelectorAll<HTMLElement>('[data-contar]:not([data-contar-manual])')) {
      ponerEnCero(el);
      alAparecer(el, () => contar(el));
    }

    if (!escritorio) return;
    const quitar = scrollSuave();
    return () => {
      quitar.then((fn) => fn());
    };
  });

  window.movimientoListo = true;
}

declare global {
  interface Window {
    movimientoListo?: boolean;
  }
}
