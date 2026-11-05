// Textos del perfil de una jugadora.

interface Origen {
  ciudad: string | null;
  estado: string | null;
  pais: string | null;
}

export const apellido = (nombre: string) => nombre.trim().split(/\s+/).at(-1) ?? nombre;

export function edad(fechaNacimiento: string, ahora: number) {
  const [a, m, d] = fechaNacimiento.split('-').map(Number);
  const hoy = new Date(ahora);
  const yaCumplio = hoy.getUTCMonth() + 1 > m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() >= d);
  return hoy.getUTCFullYear() - a - (yaCumplio ? 0 : 1);
}

const formatoLargo = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', dateStyle: 'long' });
export const fechaLarga = (fecha: string) => formatoLargo.format(Date.parse(`${fecha}T12:00:00Z`));

export const origenTexto = (o: Origen | null) => (o ? [o.ciudad, o.estado, o.pais].filter(Boolean).join(', ') || null : null);

export const estaturaTexto = (cm: number) => `${(cm / 100).toFixed(2)} m`;

/* ---------- Fuentes ---------- */

const CAMPOS: Record<string, string> = {
  nombreCompleto: 'Nombre completo',
  fechaNacimiento: 'Fecha de nacimiento',
  origen: 'Lugar de origen',
  estaturaCm: 'Estatura',
  clubId: 'Club',
  posicion: 'Posición',
  numero: 'Número',
  capitana: 'Capitanía',
  perfil: 'Ficha oficial',
};

interface ConFuentes {
  fuentes: Record<string, string>;
  destacados: { texto: string; fuente: string }[];
  historialClubes: { club: string; fuente: string | null }[];
  redes: { red: string; fuente: string }[];
  ultimaListaOficial: { fuente: string | null } | null;
}

const sitioDe = (url: string) => new URL(url).hostname.replace(/^www\./, '');

// Una entrada por URL, con todo lo que se sacó de ahí.
export function fuentesDe(j: ConFuentes) {
  const porUrl = new Map<string, string[]>();
  const agregar = (url: string | null | undefined, tema: string) => {
    if (!url) return;
    const temas = porUrl.get(url) ?? [];
    if (!temas.includes(tema)) temas.push(tema);
    porUrl.set(url, temas);
  };
  for (const [campo, url] of Object.entries(j.fuentes)) agregar(url, CAMPOS[campo] ?? campo);
  agregar(j.ultimaListaOficial?.fuente, 'Última lista oficial');
  for (const d of j.destacados) agregar(d.fuente, d.texto);
  for (const h of j.historialClubes) agregar(h.fuente, h.club);
  for (const r of j.redes) agregar(r.fuente, `Red social (${r.red})`);
  return [...porUrl].map(([url, temas]) => ({ url, sitio: sitioDe(url), temas }));
}
