import { describe, expect, it } from 'vitest';
import { proponer } from './comun.mjs';
import { crearReporte } from './reporte.mjs';

const contexto = (rechazos = []) => ({ datos: { estado: { propuestas: [], rechazos } }, hoy: '2026-11-05', reporte: crearReporte() });
const propuesta = (fuente) => ({ clave: 'alta:ana', seccion: 'Altas', texto: 'Ana', fuente });

describe('proponer', () => {
  it('la misma clave se actualiza, no se repite', () => {
    const ctx = contexto();
    proponer(ctx, 'x', propuesta('https://a.mx/1'));
    proponer(ctx, 'x', propuesta('https://a.mx/2'));
    expect(ctx.datos.estado.propuestas).toHaveLength(1);
    expect(ctx.datos.estado.propuestas[0].fuente).toBe('https://a.mx/2');
  });
  it('rechaza con la misma evidencia y acepta con otra', () => {
    const ctx = contexto([{ clave: 'alta:ana', texto: 'Ana', evidencias: ['https://a.mx/1'], fecha: '2026-11-01' }]);
    expect(proponer(ctx, 'x', propuesta('https://a.mx/1'))).toBe(false);
    expect(proponer(ctx, 'x', propuesta('https://a.mx/2'))).toBe(true);
  });
});
