// Comprueba en código lo que dice Gemini: un partido vale si en el texto de su fuente aparecen
// el rival, la fecha y la hora en la misma fila o bloque. Gemini puede leer mal una página;
// el texto de la página no.

const MESES = [
  ['enero', 'ene', 'janeiro', 'jan', 'gennaio', 'gen', 'janvier', 'january'],
  ['febrero', 'feb', 'fevereiro', 'fev', 'febbraio', 'fevrier', 'fevr', 'february'],
  ['marzo', 'mar', 'marco', 'mars', 'march'],
  ['abril', 'abr', 'aprile', 'apr', 'avril', 'avr', 'april'],
  ['mayo', 'may', 'maio', 'mai', 'maggio', 'mag'],
  ['junio', 'jun', 'junho', 'giugno', 'giu', 'juin', 'june'],
  ['julio', 'jul', 'julho', 'luglio', 'lug', 'juillet', 'juil', 'july'],
  ['agosto', 'ago', 'aout', 'august', 'aug'],
  ['septiembre', 'sep', 'sept', 'setiembre', 'set', 'setembro', 'settembre', 'septembre', 'september'],
  ['octubre', 'oct', 'outubro', 'out', 'ottobre', 'ott', 'octobre', 'october'],
  ['noviembre', 'nov', 'novembro', 'novembre', 'november'],
  ['diciembre', 'dic', 'dezembro', 'dez', 'dicembre', 'decembre', 'dec', 'december'],
];
const MES_DE = new Map(MESES.flatMap((nombres, i) => nombres.map((n) => [n, i + 1])));
const NOMBRES = [...MES_DE.keys()].sort((a, b) => b.length - a.length).join('|');
const DIA_MES = new RegExp(`(?<![\\d:.])(\\d{1,2})(?:er|o|º|°|st|nd|rd|th)?\\s+(?:de\\s+)?(${NOMBRES})\\b`, 'g');
const MES_DIA = new RegExp(`\\b(${NOMBRES})\\.?\\s+(\\d{1,2})(?![\\d:])`, 'g');

const GENERICAS = new Set(['volley', 'volei', 'volleyball', 'voleibol', 'pallavolo', 'club', 'clube', 'esporte', 'sport', 'deportivo', 'universidad', 'universidade', 'feminino', 'femenil', 'women', 'team', 'ball']);
const LARGO_FILA = 300; // más largo ya no es una fila: es un párrafo o un texto sin saltos de línea
const VENTANA = 120;
const ARRIBA = 12; // cuánto se sube a buscar el encabezado de fecha del bloque
// "6 matchs à partir de 14:00" habla de toda la jornada, no de un partido.
const HORA_GENERAL = /(?:^|[^\p{L}])(?:a partir de|a partir das|desde las?|desde|from|des|ab)\s+$/u;

export const normalizar = (texto) => (texto ?? '')
  .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');

const clave = (mes, dia) => (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` : null);

// Todas las fechas de un texto ya normalizado, como 'MM-DD'.
export function fechasEn(texto) {
  const fechas = new Set();
  const agregar = (mes, dia) => {
    const k = clave(Number(mes), Number(dia));
    if (k) fechas.add(k);
  };
  for (const [, , m, d] of texto.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) agregar(m, d);
  for (const [, m, d] of texto.matchAll(/(\d{1,2})月(\d{1,2})[日号]/g)) agregar(m, d);
  for (const [, d, m] of texto.matchAll(DIA_MES)) agregar(MES_DE.get(m), d);
  for (const [, m, d] of texto.matchAll(MES_DIA)) agregar(MES_DE.get(m), d);
  // 07/11 y 07.11 pueden ser día/mes o mes/día. "20.00" no es fecha: no hay mes 00.
  for (const [, a, b] of texto.matchAll(/(?<![\d:.,/])(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?(?![\d:])/g)) {
    agregar(b, a);
    agregar(a, b);
  }
  return fechas;
}

function escrituras(hora) {
  const [h, m] = hora.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const h12 = h % 12 || 12;
  const sufijo = h < 12 ? 'a\\.?m' : 'p\\.?m';
  const horas = `0?${h}`;
  const opciones = [`${horas}[:.h]${mm}`, `${horas}\\s?h\\s?${mm}`, `${horas}时${mm}分?`, `${horas}点${mm}分?`, `0?${h12}[:.]${mm}\\s?${sufijo}`];
  if (m === 0) opciones.push(`${horas}\\s?h(?![\\da-z])`, `${horas}[时点]`, `0?${h12}\\s?${sufijo}`);
  return new RegExp(`(?<![\\d:.])(?:${opciones.join('|')})(?![\\d:])`);
}

// Las palabras que identifican a un equipo. "Béziers Volley" es "beziers"; si no queda nada, el nombre entero.
export function palabrasDe(nombres) {
  return [...new Set([nombres].flat().filter(Boolean).flatMap((nombre) => {
    const n = normalizar(nombre);
    const palabras = n.split(/[^\p{L}\p{N}]+/u).filter((p) => (/^[\x00-\x7f]+$/.test(p) ? p.length >= 4 : p.length >= 2) && !GENERICAS.has(p));
    return palabras.length ? palabras : [n.trim()];
  }))].filter(Boolean);
}

const menciona = (texto, palabras) => palabras.some((p) => texto.includes(p));

function filasDe(lineas, palabras) {
  return lineas.flatMap((linea, i) => {
    if (!menciona(linea, palabras)) return [];
    if (linea.length <= LARGO_FILA) return [{ i, texto: linea, corta: true }];
    return palabras.flatMap((p) => [...linea.matchAll(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].map((m) => ({
      i, texto: linea.slice(Math.max(0, m.index - VENTANA), m.index + p.length + VENTANA), corta: false,
    })));
  });
}

// La fecha de la fila, o la del encabezado más cercano arriba de ella, con la línea donde está.
function fechasDeFila(lineas, fila) {
  const fechas = fechasEn(fila.texto);
  if (fechas.size || !fila.corta) return { fechas, encabezado: null };
  for (let i = fila.i - 1; i >= Math.max(0, fila.i - ARRIBA); i -= 1) {
    if (lineas[i].length > LARGO_FILA) continue;
    const delBloque = fechasEn(lineas[i]);
    if (delBloque.size) return { fechas: delBloque, encabezado: i };
  }
  return { fechas, encabezado: null };
}

const horaPropia = (texto, patron) => {
  const hallada = texto.match(patron);
  return Boolean(hallada) && !HORA_GENERAL.test(texto.slice(0, hallada.index));
};
const soloHora = (linea, patron) => Boolean(linea) && linea.length <= 12 && patron.test(linea);

// La hora va en la fila, sola en la línea de junto ("19:00" debajo de los equipos) o junto a la fecha
// del bloque (Lega Volley: fecha, hora, sede y al final los equipos).
function tieneHora(lineas, fila, encabezado, patron) {
  if (horaPropia(fila.texto, patron)) return true;
  if (!fila.corta) return false;
  const junto = [lineas[fila.i - 1], lineas[fila.i + 1]];
  if (encabezado !== null) {
    if (horaPropia(lineas[encabezado], patron)) return true;
    junto.push(lineas[encabezado - 1], lineas[encabezado + 1]);
  }
  return junto.some((l) => soloHora(l, patron));
}

// 'completa': rival, fecha y hora juntos. 'sinHora': rival y fecha, pero la hora no está junto al rival.
// 'nada': el rival y la fecha no aparecen juntos.
export function evidenciaPartido(texto, { fecha, hora, rival, propio }) {
  const lineas = normalizar(texto).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const palabrasRival = palabrasDe(rival);
  const palabrasPropias = palabrasDe(propio);
  const dia = fecha.slice(5);
  const patron = hora ? escrituras(hora) : null;
  const filas = filasDe(lineas, palabrasRival);
  const mismaFila = filas.filter((f) => menciona(f.texto, palabrasPropias));
  const conVecina = filas.filter((f) => f.corta && [lineas[f.i - 1], lineas[f.i + 1]].some((l) => l && menciona(l, palabrasPropias)));
  // En un calendario de liga cada fila nombra a los dos equipos: la fila del rival contra otro no cuenta.
  // Hay páginas con un equipo por línea (se mira la de junto), y en el calendario de un club su nombre no se repite.
  const candidatas = mismaFila.length ? mismaFila : conVecina.length ? conVecina : filas;

  let resultado = 'nada';
  for (const fila of candidatas) {
    const { fechas, encabezado } = fechasDeFila(lineas, fila);
    if (!fechas.has(dia)) continue;
    if (patron && tieneHora(lineas, fila, encabezado, patron)) return 'completa';
    resultado = 'sinHora';
  }
  return resultado;
}
