import { describe, expect, it } from 'vitest';
import { TITULO, avisarEnIssue, cuerpoIssue } from './issue-temporadas.mjs';

const AVISOS = '- Serie A1: la temporada 2026-27 ya debería haber terminado.\n';

const ghFalso = (abiertos) => {
  const llamadas = [];
  const gh = async (argumentos) => {
    llamadas.push(argumentos);
    return argumentos[1] === 'list' ? JSON.stringify(abiertos) : '';
  };
  return { gh, llamadas };
};

describe('avisarEnIssue', () => {
  it('sin issue abierto, crea uno', async () => {
    const { gh, llamadas } = ghFalso([]);
    expect(await avisarEnIssue(AVISOS, gh)).toEqual({ accion: 'creado', numero: null });
    expect(llamadas[1].slice(0, 4)).toEqual(['issue', 'create', '--title', TITULO]);
    expect(llamadas[1].at(-1)).toContain('Serie A1');
  });
  it('con uno abierto no duplica: le actualiza la lista', async () => {
    const { gh, llamadas } = ghFalso([{ number: 7, title: 'Otro tema' }, { number: 12, title: TITULO }]);
    expect(await avisarEnIssue(AVISOS, gh)).toEqual({ accion: 'actualizado', numero: 12 });
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].slice(0, 3)).toEqual(['issue', 'edit', '12']);
    expect(llamadas.some((l) => l[1] === 'create')).toBe(false);
  });
  it('solo busca entre los abiertos', async () => {
    const { gh, llamadas } = ghFalso([]);
    await avisarEnIssue(AVISOS, gh);
    expect(llamadas[0]).toContain('open');
  });
  it('un título parecido no cuenta como el mismo', async () => {
    const { gh, llamadas } = ghFalso([{ number: 3, title: `${TITULO} de 2025` }]);
    await avisarEnIssue(AVISOS, gh);
    expect(llamadas[1][1]).toBe('create');
  });
  it('si GitHub falla, el error sale', async () => {
    await expect(avisarEnIssue(AVISOS, async () => { throw new Error('sin permiso'); })).rejects.toThrow('sin permiso');
  });
});

describe('cuerpoIssue', () => {
  it('dice qué hacer y trae los avisos', () => {
    const cuerpo = cuerpoIssue(AVISOS);
    expect(cuerpo).toContain('Serie A1');
    expect(cuerpo).toContain('data/ligas.json');
  });
});
