// Textos y enlaces que se escriben al construir el sitio.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Respeta el `base` de Astro (en GitHub Pages el sitio vive en una subcarpeta).
export const ruta = (destino = '') => `${BASE}/${destino}`;

export const POR_CONFIRMAR = 'Por confirmar';

const formatoFecha = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const partesDe = (fecha: string) => {
  const partes = formatoFecha.formatToParts(Date.parse(`${fecha}T12:00:00Z`));
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value.replace('.', '') ?? '';
  return { dia: valor('day'), mes: valor('month'), anio: valor('year') };
};

// "2026-09-21" -> "21 sep 2026"
export const fechaLegible = (fecha: string) => {
  const { dia, mes, anio } = partesDe(fecha);
  return `${dia} ${mes} ${anio}`;
};

// "21–27 sep 2026" o "28 sep – 3 oct 2026"
export function rangoFechas(inicio: string | null, fin: string) {
  if (!inicio || inicio === fin) return fechaLegible(fin);
  const a = partesDe(inicio);
  const b = partesDe(fin);
  if (a.anio !== b.anio) return `${fechaLegible(inicio)} – ${fechaLegible(fin)}`;
  if (a.mes !== b.mes) return `${a.dia} ${a.mes} – ${b.dia} ${b.mes} ${b.anio}`;
  return `${a.dia}–${b.dia} ${b.mes} ${b.anio}`;
}

export const lugarTexto = (posicion: number | null) => (posicion ? `${posicion}.º lugar` : 'Lugar por confirmar');

/* ---------- Rankings ---------- */

interface Marca {
  posicion: number | null;
  puntos: number | null;
}

// Compara contra el registro anterior: un lugar menor es subir; sin lugares, deciden los puntos.
export function tendencia(actual: Marca, historial: (Marca & { ranking: string })[], ranking: string) {
  const anterior = historial
    .filter((h) => h.ranking === ranking && (h.posicion !== actual.posicion || h.puntos !== actual.puntos))
    .at(-1);
  if (!anterior) return null;
  if (actual.posicion !== null && anterior.posicion !== null && actual.posicion !== anterior.posicion) {
    return actual.posicion < anterior.posicion ? 'sube' : 'baja';
  }
  if (actual.puntos !== null && anterior.puntos !== null && actual.puntos !== anterior.puntos) {
    return actual.puntos > anterior.puntos ? 'sube' : 'baja';
  }
  return null;
}
