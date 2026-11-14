// Qué cuenta el hero y el botón flotante. Son funciones puras: corren al construir el sitio
// y otra vez en el navegador, porque el sitio se construye una vez por semana y los partidos
// terminan entre una construcción y otra.

import { cuentaCorta, diaCorto, diasHasta, enJuego, fechaGrande, hora, horaDelLugar, msDe, vigentes, ymd } from './tiempo';
import { SELECCION, equipos, unirNombres, type Nombrada } from './partido';
import { DIA_MS } from '../../scripts/lib/tiempo.mjs';

export interface PartidoCliente {
  tipo: 'club' | 'seleccion';
  inicio: string;
  zonaSede: string | null;
  horaConfirmada: boolean;
  local: string;
  visitante: string;
  competencia: string | null;
  sede: string | null;
  jugadoras: Nombrada[]; // ya ordenadas
}

export interface TorneoCliente {
  nombre: string;
  edicion: number | null;
  ciudad: string | null;
  pais: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
}

export type Compromiso =
  | { tipo: 'partido'; partido: PartidoCliente }
  | { tipo: 'torneo'; torneo: TorneoCliente & { fechaInicio: string } }
  | { tipo: 'espera'; partido: PartidoCliente | null };

// Orden del hero: partido de la Selección, inicio del próximo torneo o la próxima en jugar.
export function elegirCompromiso(partidos: PartidoCliente[], torneo: TorneoCliente | null, ahora: number, zona?: string): Compromiso {
  const lista = vigentes(partidos, ahora);
  const partido = lista.find((p) => p.tipo === 'seleccion');
  if (partido) return { tipo: 'partido', partido };
  const { fechaInicio } = torneo ?? {};
  if (torneo && fechaInicio && (torneo.fechaFin ?? fechaInicio) >= ymd(ahora, zona)) {
    return { tipo: 'torneo', torneo: { ...torneo, fechaInicio } };
  }
  return { tipo: 'espera', partido: lista.find((p) => p.jugadoras.length > 0) ?? null };
}

export type Cuenta =
  | { modo: 'completa'; ms: number }
  | { modo: 'dias'; dias: number }
  | { modo: 'envivo'; ms: number }
  | { modo: 'ninguna' };

// Texto del partido, separado para poder enlazar cada nombre a su perfil.
export interface LineaHero {
  hora: string;
  seleccion: boolean;
  jugadoras: Nombrada[];
  equipos: string;
}

export interface VistaHero {
  modo: Compromiso['tipo'];
  etiqueta: string;
  fecha: string | null;
  titulo: string;
  mientras: string | null;
  linea: LineaHero | null;
  detalle: string | null;
  alla: string | null;
  cuenta: Cuenta;
}

const unir = (lista: (string | null | undefined)[], separador = ' · ') => lista.filter(Boolean).join(separador) || null;

function cuentaDe(p: PartidoCliente, ahora: number, zona?: string): Cuenta {
  if (enJuego(p, ahora)) return { modo: 'envivo', ms: msDe(p) };
  return p.horaConfirmada ? { modo: 'completa', ms: msDe(p) } : { modo: 'dias', dias: diasHasta(msDe(p), ahora, zona) };
}

// Sin `zona` es la hora del dispositivo; con `zona`, la versión que se escribe al construir.
const lineaDe = (p: PartidoCliente, zona?: string): LineaHero => ({
  hora: p.horaConfirmada ? hora(msDe(p), zona) : 'Hora por confirmar',
  seleccion: p.tipo === 'seleccion',
  jugadoras: p.jugadoras,
  equipos: equipos(p),
});

const allaDe = (p: PartidoCliente) => {
  const lugar = p.horaConfirmada ? horaDelLugar(p) : null;
  return lugar ? `Allá serán las ${lugar}` : null;
};

export function vistaHero(c: Compromiso, ahora: number, zona?: string): VistaHero {
  if (c.tipo === 'partido') {
    const p = c.partido;
    const cuenta = cuentaDe(p, ahora, zona);
    return {
      modo: 'partido',
      etiqueta: cuenta.modo === 'envivo' ? 'Selección · En juego' : 'Próximo partido de la Selección',
      fecha: fechaGrande(ymd(msDe(p), zona)),
      titulo: equipos(p),
      mientras: null,
      linea: lineaDe(p, zona),
      detalle: unir([p.competencia, p.sede]),
      alla: allaDe(p),
      cuenta,
    };
  }
  if (c.tipo === 'torneo') {
    const { torneo } = c;
    const [a, m, d] = torneo.fechaInicio.split('-').map(Number);
    const [ha, hm, hd] = ymd(ahora, zona).split('-').map(Number);
    const dias = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / DIA_MS);
    return {
      modo: 'torneo',
      etiqueta: dias > 0 ? 'Próximo torneo' : 'Torneo en curso',
      fecha: fechaGrande(torneo.fechaInicio),
      titulo: unir([torneo.nombre, torneo.edicion ? String(torneo.edicion) : null], ' ') ?? torneo.nombre,
      mientras: null,
      linea: null,
      detalle: unir([torneo.ciudad, torneo.pais], ', '),
      alla: null,
      cuenta: dias > 0 ? { modo: 'dias', dias } : { modo: 'ninguna' },
    };
  }
  const base = { modo: 'espera', etiqueta: 'Selección Mexicana', fecha: null, titulo: 'Próximo torneo por confirmar' } as const;
  const p = c.partido;
  if (!p) return { ...base, mientras: null, linea: null, detalle: null, alla: null, cuenta: { modo: 'ninguna' } };
  const cuenta = cuentaDe(p, ahora, zona);
  return {
    ...base,
    mientras: cuenta.modo === 'envivo' ? 'Mientras, ahora en juego:' : 'Mientras, la próxima en jugar:',
    linea: lineaDe(p, zona),
    detalle: unir([diaCorto(msDe(p), zona), p.competencia]),
    alla: allaDe(p),
    cuenta,
  };
}

/* ---------- Botón flotante ---------- */

// Lo mismo que el texto de un partido, con la cuenta en lugar de la hora.
export function vistaBoton(partidos: PartidoCliente[], ahora: number, zona?: string) {
  const p = vigentes(partidos, ahora)[0];
  if (!p) return null;
  const quien = p.tipo === 'seleccion' ? SELECCION : unirNombres(p.jugadoras.map((j) => j.nombre));
  const dias = diasHasta(msDe(p), ahora, zona);
  const cuando = enJuego(p, ahora)
    ? 'En juego'
    : p.horaConfirmada ? cuentaCorta(msDe(p), ahora) : dias <= 0 ? 'Hoy' : `${dias}d`;
  return { cuando, quien, equipos: equipos(p) };
}
