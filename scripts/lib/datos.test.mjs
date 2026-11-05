// Revisa los archivos reales de data/ y las carpetas de fotos.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { esquemaEstadoAgentes, esquemaManual, validarDatos } from './validar.mjs';

const leer = (nombre) => JSON.parse(readFileSync(new URL(`../../data/${nombre}.json`, import.meta.url), 'utf8'));
const nombres = ['jugadoras', 'clubes', 'ligas', 'partidos', 'seleccion', 'torneos', 'rankings'];
const crudos = Object.fromEntries(nombres.map((n) => [n, leer(n)]));

describe('data/', () => {
  it('cumple los contratos y sus referencias', () => {
    expect(() => validarDatos(crudos)).not.toThrow();
  });
  it('estado-agentes.json y manual.json cumplen su contrato', () => {
    expect(esquemaEstadoAgentes.safeParse(leer('estado-agentes')).success).toBe(true);
    expect(esquemaManual.safeParse(leer('manual')).success).toBe(true);
  });
  it('cada jugadora tiene su carpeta de fotos', () => {
    const faltan = crudos.jugadoras
      .filter((j) => !existsSync(new URL(`../../src/assets/fotos/jugadoras/${j.slug}/`, import.meta.url)))
      .map((j) => j.slug);
    expect(faltan).toEqual([]);
  });
  it('torneos no pasa del máximo', () => {
    expect(crudos.torneos.torneos.length).toBeLessThanOrEqual(crudos.torneos.maximo);
  });
});
