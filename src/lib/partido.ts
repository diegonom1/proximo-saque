// Texto de un partido: "21:00 · Sofía Maldonado · Sesi Vôlei Bauru vs E.C. Pinheiros".
// Sin dependencias: lo usan el build y el navegador.

export interface Nombrada {
  nombre: string;
  slug: string;
}

interface Duelo {
  tipo: 'club' | 'seleccion';
  local: string;
  visitante: string;
}

export const SELECCION = 'Selección Mexicana';

export const porNombre = <T extends { nombre: string }>(lista: T[]) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// Lo que va antes de cada nombre al escribirlos en una frase: "A, B y C".
export const separador = (i: number, total: number) => (i === 0 ? '' : i === total - 1 ? ' y ' : ', ');

export const unirNombres = (nombres: string[]) => nombres.map((n, i) => `${separador(i, nombres.length)}${n}`).join('');

export const equipos = (p: Pick<Duelo, 'local' | 'visitante'>) => `${p.local} vs ${p.visitante}`;

// "Sofía Maldonado · Sesi Vôlei Bauru vs E.C. Pinheiros" o "Selección Mexicana · México vs Perú"
export function tituloPartido(p: Duelo, nombres: string[]) {
  const quien = p.tipo === 'seleccion' ? SELECCION : unirNombres(nombres);
  return [quien, equipos(p)].filter(Boolean).join(' · ');
}
