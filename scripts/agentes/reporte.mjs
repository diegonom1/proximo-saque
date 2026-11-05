// Lo que encontró y descartó cada agente, para el resumen de la corrida y el cuerpo del PR.

const SECCIONES = ['Altas', 'Bajas', 'Cambios de club', 'Plataformas nuevas', 'Torneos nuevos', 'Dudas'];

export function crearReporte() {
  const agentes = new Map();
  const pr = Object.fromEntries(SECCIONES.map((s) => [s, []]));
  const de = (agente) => {
    if (!agentes.has(agente)) agentes.set(agente, { encontro: [], descarto: [], fallos: [] });
    return agentes.get(agente);
  };

  return {
    agentes,
    pr,
    encontro: (agente, texto) => de(agente).encontro.push(texto),
    descarto: (agente, texto, motivo) => de(agente).descarto.push(`${texto}: ${motivo}`),
    fallo: (agente, texto) => de(agente).fallos.push(texto),
    agregarPr: (seccion, texto, fuente = null) => pr[seccion].push({ texto, fuente }),
    // Para deshacer lo que anotó una tarea que falló.
    marca: () => ({
      pr: Object.fromEntries(SECCIONES.map((s) => [s, pr[s].length])),
      agentes: new Map([...agentes].map(([a, r]) => [a, r.encontro.length])),
    }),
    volver(marca) {
      for (const s of SECCIONES) pr[s].length = marca.pr[s];
      for (const [a, r] of agentes) r.encontro.length = marca.agentes.get(a) ?? 0;
    },
    resumen({ modo, llamadas, maximo, pendientes }) {
      const lineas = ['## Próximo Saque · actualización', '', `Modo: ${modo} · llamadas: ${llamadas} de ${maximo}`, ''];
      for (const [agente, r] of agentes) {
        lineas.push(`### ${agente}`, '');
        for (const t of r.encontro) lineas.push(`- ${t}`);
        for (const t of r.descarto) lineas.push(`- Descartado: ${t}`);
        for (const t of r.fallos) lineas.push(`- **Falló, se conservan los datos anteriores:** ${t}`);
        lineas.push('');
      }
      if (pendientes.length) lineas.push(`Pendientes para la próxima corrida: ${pendientes.map((p) => `${p.agente} (${p.clave ?? 'general'})`).join(', ')}`, '');
      return lineas.join('\n');
    },
    cuerpoPr() {
      const lineas = ['Revisión semanal de los agentes. Revisa cada cambio con su fuente antes de aprobar.', ''];
      for (const s of SECCIONES) {
        if (!pr[s].length) continue;
        lineas.push(`## ${s}`, '');
        for (const { texto, fuente } of pr[s]) lineas.push(`- ${texto}${fuente ? ` ([fuente](${fuente}))` : ''}`);
        lineas.push('');
      }
      return lineas.join('\n');
    },
  };
}
