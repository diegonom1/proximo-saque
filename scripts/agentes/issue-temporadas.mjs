#!/usr/bin/env node
// Abre un issue con los avisos de temporadas, para que no se pierdan en las semanas sin PR.
// Si ya hay uno abierto no crea otro: le actualiza la lista. Lo corre actualizar.yml.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const ARCHIVO_AVISOS = 'avisos-temporada.md';
export const TITULO = 'Revisar temporadas de las ligas';

export const cuerpoIssue = (avisos) => [
  'La revisión del lunes encontró esto. Se corrige a mano en `data/ligas.json`.',
  '',
  avisos.trim(),
  '',
  'Cuando esté corregido, cierra este issue. Si vuelve a pasar, se abrirá otro.',
].join('\n');

// `gh` recibe los argumentos del comando y devuelve lo que imprime.
export async function avisarEnIssue(avisos, gh) {
  const abiertos = JSON.parse(await gh(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title']));
  const previo = abiertos.find((i) => i.title === TITULO);
  const cuerpo = cuerpoIssue(avisos);
  if (previo) {
    await gh(['issue', 'edit', String(previo.number), '--body', cuerpo]);
    return { accion: 'actualizado', numero: previo.number };
  }
  await gh(['issue', 'create', '--title', TITULO, '--body', cuerpo]);
  return { accion: 'creado', numero: null };
}

async function main() {
  const avisos = await readFile(ARCHIVO_AVISOS, 'utf8').catch(() => '');
  if (!avisos.trim()) {
    console.log('Sin avisos de temporadas.');
    return;
  }
  const correr = promisify(execFile);
  const { accion, numero } = await avisarEnIssue(avisos, async (argumentos) => (await correr('gh', argumentos)).stdout);
  console.log(`Issue de temporadas ${accion}${numero ? ` (#${numero})` : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
