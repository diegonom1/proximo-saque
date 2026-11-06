// Revisa los archivos reales de data/ y las carpetas de fotos.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { creditoLleno } from './fotos-sin-credito.mjs';
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
  it('ninguna foto del repo va sin crédito', () => {
    const raiz = fileURLToPath(new URL('../../', import.meta.url));
    const fotos = execFileSync('git', ['ls-files', 'src/assets/fotos'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter((f) => /\.(jpg|png)$/.test(f));
    const sinCredito = fotos.filter((f) => {
      const credito = join(raiz, dirname(f), 'credito.txt');
      return !existsSync(credito) || !creditoLleno(readFileSync(credito, 'utf8'));
    });
    expect(sinCredito).toEqual([]);
  });
  it('torneos no pasa del máximo', () => {
    expect(crudos.torneos.torneos.length).toBeLessThanOrEqual(crudos.torneos.maximo);
  });
});
