// Clientes de IA: el real (API de Gemini por fetch) y el simulado (respuestas guardadas).
// Los dos responden igual: llamar({ agente, clave, mensaje }) -> { texto, fuentes, modelo }.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function extraerJSON(salida) {
  const bloque = salida.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const crudo = bloque ? bloque[1] : salida;
  const a = crudo.indexOf('{');
  const b = crudo.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('la respuesta no trae JSON');
  return JSON.parse(crudo.slice(a, b + 1));
}

// Reglas comunes + agente, hasta "## Prueba manual" (esa parte es solo para las personas).
// Si la búsqueda la hace el código, se agrega cómo trabajar con los resultados.
export async function instruccionesDe(agente, hoy, dirAgentes, conResultados = false) {
  const [comunes, propio, modo] = await Promise.all([
    readFile(join(dirAgentes, '00-reglas-comunes.md'), 'utf8'),
    readFile(join(dirAgentes, `${agente}.md`), 'utf8'),
    conResultados ? readFile(join(dirAgentes, '00-resultados-busqueda.md'), 'utf8') : '',
  ]);
  return `${comunes}\n\n${propio.split(/^## Prueba manual/m)[0].trimEnd()}\n\n${modo}`.trimEnd().concat('\n').replaceAll('{{HOY}}', hoy);
}

const dormirReal = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Un 429 por minuto trae cuánto esperar. Sin eso, la cuota no vuelve por reintentar: se pasa al siguiente modelo.
const cuotaAgotada = (cuerpo) => /per.?day|daily|limit: 0/i.test(cuerpo) || !/retry/i.test(cuerpo.replace(/rate-limits/g, ''));

// El cuerpo del error es JSON en varias líneas: se saca el mensaje para que el resumen diga la causa.
function mensajeDe(crudo) {
  try {
    return JSON.parse(crudo).error.message.replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    return crudo.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
}

const generacion = (modelo) => (modelo.startsWith('gemini-2') ? { temperature: 0 } : {});

export function crearClienteGemini({
  clave, modelos, hoy, dirAgentes, fetch: pedir = globalThis.fetch, dormir = dormirReal, pausaMs = 8000, esperaMs = 30000, intentos = 3,
}) {
  let primera = true;

  async function preguntar(modelo, sistema, mensaje, conBusqueda) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
    const cuerpo = JSON.stringify({
      system_instruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: [{ text: mensaje }] }],
      ...(conBusqueda ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: generacion(modelo),
    });
    let ultimo = '';
    for (let intento = 1; intento <= intentos; intento += 1) {
      const r = await pedir(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
        body: cuerpo,
        signal: AbortSignal.timeout(180000),
      });
      const crudo = await r.text();
      if (r.ok) {
        const c = JSON.parse(crudo).candidates?.[0];
        return {
          texto: (c?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
          fuentes: (c?.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web?.uri ? [{ uri: g.web.uri, titulo: g.web.title ?? null }] : [])),
          modelo,
        };
      }
      ultimo = `${r.status}`;
      if (r.status === 429 && cuotaAgotada(crudo)) return { agotado: `${modelo}: sin cuota (${mensajeDe(crudo)})` };
      if (r.status === 404) return { agotado: `${modelo}: no disponible (${mensajeDe(crudo)})` };
      if (r.status !== 429 && r.status < 500) throw new Error(`Gemini respondió ${r.status}: ${mensajeDe(crudo)}`);
      if (intento < intentos) await dormir(esperaMs * intento);
    }
    return { agotado: `${modelo}: respondió ${ultimo} después de ${intentos} intentos` };
  }

  // `conBusqueda: false`: los resultados ya vienen en el mensaje y Gemini no usa herramientas.
  return async function llamar({ agente, mensaje, conBusqueda = true }) {
    if (!primera) await dormir(pausaMs);
    primera = false;
    const sistema = await instruccionesDe(agente, hoy, dirAgentes, !conBusqueda);
    const motivos = [];
    for (const modelo of modelos) {
      const r = await preguntar(modelo, sistema, mensaje, conBusqueda);
      if (!r.agotado) return r;
      motivos.push(r.agotado);
    }
    const error = new Error(`ningún modelo respondió (${motivos.join('; ')})`);
    error.sinCuota = true;
    throw error;
  };
}

// {{HOY+3}} permite que las respuestas guardadas no caduquen; {{CLAVE}} es el club, jugadora o liga.
function plantilla(texto, hoy, clave) {
  return texto
    .replaceAll('{{CLAVE}}', clave ?? '')
    .replace(/\{\{HOY([+-]\d+)?\}\}/g, (_, dias) => {
      const [a, m, d] = hoy.split('-').map(Number);
      return new Date(Date.UTC(a, m - 1, d + Number(dias ?? 0))).toISOString().slice(0, 10);
    });
}

// Lee <dir>/<agente>.json: { "fuentes": [...], "respuestas": { "<clave>": {...}, "*": {...} } }.
export function crearClienteSimulado(dir, hoy) {
  return async function llamar({ agente, clave }) {
    const archivo = JSON.parse(await readFile(join(dir, `${agente}.json`), 'utf8'));
    const respuesta = archivo.respuestas[clave ?? '*'] ?? archivo.respuestas['*'];
    if (respuesta === undefined) throw new Error(`no hay respuesta simulada para ${agente} (${clave})`);
    return {
      texto: `\`\`\`json\n${plantilla(JSON.stringify(respuesta), hoy, clave)}\n\`\`\``,
      fuentes: (archivo.fuentes ?? []).map((uri) => ({ uri, titulo: null })),
      modelo: 'simulado',
    };
  };
}
