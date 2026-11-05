// Qué cuenta el hero y el botón flotante. Son funciones puras: corren al construir el sitio
// y otra vez en el navegador, porque el sitio se construye una vez por semana y los partidos
// terminan entre una construcción y otra.

import { cuentaCorta, diaCorto, diasHasta, enJuego, fechaGrande, hora, horaDelLugar, msDe, vigentes, ymd } from './tiempo';
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
  club: string | null; // nombre del club
  jugadoras: string[]; // nombres de las seleccionadas
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
  | { modo: 'envivo' }
  | { modo: 'ninguna' };

export interface VistaHero {
  modo: Compromiso['tipo'];
  etiqueta: string;
  fecha: string | null;
  titulo: string;
  mientras: string | null;
  detalle: string | null;
  hora: string | null;
  alla: string | null;
  cuenta: Cuenta;
}

const unir = (lista: (string | null | undefined)[], separador = ' · ') => lista.filter(Boolean).join(separador) || null;

const nombres = (lista: string[]) => (lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}` : lista[0]);

function cuentaDe(p: PartidoCliente, ahora: number, zona?: string): Cuenta {
  if (enJuego(p, ahora)) return { modo: 'envivo' };
  return p.horaConfirmada ? { modo: 'completa', ms: msDe(p) } : { modo: 'dias', dias: diasHasta(msDe(p), ahora, zona) };
}

// Sin `zona` es la hora del dispositivo. Con `zona` es la versión que se escribe al construir.
function horas(p: PartidoCliente, zona?: string) {
  if (!p.horaConfirmada) return { hora: 'Hora por confirmar', alla: null };
  const lugar = horaDelLugar(p);
  return {
    hora: `${hora(msDe(p), zona)} ${zona ? 'hora del centro de México' : 'tu hora'}`,
    alla: lugar ? `Allá serán las ${lugar}` : null,
  };
}

export function vistaHero(c: Compromiso, ahora: number, zona?: string): VistaHero {
  if (c.tipo === 'partido') {
    const p = c.partido;
    const cuenta = cuentaDe(p, ahora, zona);
    return {
      modo: 'partido',
      etiqueta: cuenta.modo === 'envivo' ? 'Selección · En juego' : 'Próximo partido de la Selección',
      fecha: fechaGrande(ymd(msDe(p), zona)),
      titulo: `${p.local} vs ${p.visitante}`,
      mientras: null,
      detalle: unir([p.competencia, p.sede]),
      ...horas(p, zona),
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
      detalle: unir([torneo.ciudad, torneo.pais], ', '),
      hora: null,
      alla: null,
      cuenta: dias > 0 ? { modo: 'dias', dias } : { modo: 'ninguna' },
    };
  }
  const base = { modo: 'espera', etiqueta: 'Selección Mexicana', fecha: null, titulo: 'Próximo torneo por confirmar' } as const;
  const p = c.partido;
  if (!p) return { ...base, mientras: null, detalle: null, hora: null, alla: null, cuenta: { modo: 'ninguna' } };
  return {
    ...base,
    mientras: `Mientras, la próxima en jugar: ${nombres(p.jugadoras)}${p.club ? ` con ${p.club}` : ''}`,
    detalle: unir([`${p.local} vs ${p.visitante}`, diaCorto(msDe(p), zona)]),
    ...horas(p, zona),
    cuenta: cuentaDe(p, ahora, zona),
  };
}

/* ---------- Botón flotante ---------- */

export function textoBoton(partidos: Pick<PartidoCliente, 'inicio' | 'horaConfirmada'>[], ahora: number, zona?: string) {
  const p = vigentes(partidos, ahora)[0];
  if (!p) return null;
  if (enJuego(p, ahora)) return 'Partido en juego';
  if (p.horaConfirmada) return `Próximo partido · ${cuentaCorta(msDe(p), ahora)}`;
  const dias = diasHasta(msDe(p), ahora, zona);
  return `Próximo partido · ${dias <= 0 ? 'hoy' : `${dias}d`}`;
}
