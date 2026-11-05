// Relaciona los nombres que reportan los agentes con las jugadoras del sitio.

import { normal } from './fusion.mjs';

export const slugDe = (nombre) => normal(nombre).replace(/\s+/g, '-');

const palabras = (nombre) => normal(nombre).split(' ').filter(Boolean);

// ¿La página habla de ella? Se busca su nombre en el título, la URL y el texto del resultado.
export function mencionaA(resultado, nombre) {
  const url = (() => {
    try {
      return decodeURIComponent(resultado.url);
    } catch {
      return resultado.url;
    }
  })();
  const texto = new Set(palabras(`${resultado.titulo ?? ''} ${url} ${resultado.contenido ?? ''}`));
  return palabras(nombre).every((p) => texto.has(p));
}

const apellidoDe = (j) => palabras(j.nombre).at(-1);

// ¿Comparten apellido? La lista puede traer solo el apellido o el nombre completo.
function apellidoCoincide(nombre, j) {
  const propuesto = palabras(nombre);
  return propuesto.includes(apellidoDe(j)) || palabras(j.nombreCompleto ?? '').some((p) => propuesto.includes(p) && p !== palabras(j.nombre)[0]);
}

// -> { jugadora } | { nueva: true } | { duda: "motivo" }
export function resolverJugadora(nombre, slug, jugadoras) {
  if (slug) {
    const j = jugadoras.find((x) => x.slug === slug);
    if (j) return apellidoCoincide(nombre, j) ? { jugadora: j } : { duda: `el slug ${slug} no coincide con el apellido de "${nombre}"` };
  }
  const propuesto = palabras(nombre);
  if (propuesto.length === 0) return { duda: 'nombre vacío' };

  if (propuesto.length === 1) {
    const iguales = jugadoras.filter((j) => palabras(j.nombre).includes(propuesto[0]) || palabras(j.nombreCompleto ?? '').includes(propuesto[0]));
    if (iguales.length === 1) return { jugadora: iguales[0] };
    if (iguales.length > 1) return { duda: `"${nombre}" puede ser ${iguales.map((j) => j.nombre).join(' o ')}` };
    return { nueva: true };
  }

  const completas = jugadoras.filter((j) => palabras(j.nombre).every((p) => propuesto.includes(p)));
  if (completas.length === 1) return { jugadora: completas[0] };
  if (completas.length > 1) return { duda: `"${nombre}" puede ser ${completas.map((j) => j.nombre).join(' o ')}` };

  // Mismo apellido, otro nombre: puede ser otra persona o un nombre escrito distinto.
  const parecidas = jugadoras.filter((j) => propuesto.includes(apellidoDe(j)));
  if (parecidas.length > 0) return { duda: `"${nombre}" comparte apellido con ${parecidas.map((j) => j.nombre).join(' y ')}` };
  return { nueva: true };
}
