// Lo que encontró y descartó cada agente, para el resumen de la corrida y el cuerpo del PR.

export const SECCIONES = ['Altas', 'Bajas', 'Cambios de club', 'Torneos nuevos', 'Perfiles'];

export function crearReporte() {
  const agentes = new Map();
  const dudas = [];
  const de = (agente) => {
    if (!agentes.has(agente)) agentes.set(agente, { encontro: [], yaJugados: [], descarto: [], fallos: [], noConfirmado: [], porRevisar: [], verificados: { verificado: [], horaSinVerificar: [], noVerificado: [] }, modelos: {} });
    return agentes.get(agente);
  };

  return {
    agentes,
    encontro: (agente, texto) => de(agente).encontro.push(texto),
    descarto: (agente, texto, motivo) => de(agente).descarto.push(`${texto}: ${motivo}`),
    yaJugado: (agente, texto) => de(agente).yaJugados.push(texto),
    fallo: (agente, texto) => de(agente).fallos.push(texto),
    noConfirmado: (agente, texto) => de(agente).noConfirmado.push(texto),
    porRevisar: (agente, texto) => de(agente).porRevisar.push(texto),
    verifico: (agente, estado, texto) => de(agente).verificados[estado].push(texto),
    modelo(agente, modelo) {
      const { modelos } = de(agente);
      modelos[modelo] = (modelos[modelo] ?? 0) + 1;
    },
    duda: (texto, fuente = null) => dudas.push({ texto, fuente }),
    // Para deshacer lo que anotó una tarea que falló.
    marca: () => ({
      dudas: dudas.length,
      agentes: new Map([...agentes].map(([a, r]) => [a, r.encontro.length])),
    }),
    volver(marca) {
      dudas.length = marca.dudas;
      for (const [a, r] of agentes) r.encontro.length = marca.agentes.get(a) ?? 0;
    },
    resumen({ modo, llamadas, maximo, pendientes, busqueda }) {
      const lineas = ['## Próximo Saque · actualización', '', `Modo: ${modo} · llamadas: ${llamadas} de ${maximo}`];
      if (busqueda) lineas.push(`${busqueda.proveedor}: ${busqueda.corrida} créditos en esta corrida · ${busqueda.mes} de ${busqueda.limite} este mes`);
      lineas.push('');
      for (const [agente, r] of agentes) {
        lineas.push(`### ${agente}`, '');
        const modelos = Object.entries(r.modelos).map(([m, n]) => `${m} ×${n}`).join(', ');
        if (modelos) lineas.push(`Modelo: ${modelos}`, '');
        for (const t of r.encontro) lineas.push(`- ${t}`);
        for (const t of r.verificados.verificado) lineas.push(`- Verificado: ${t}`);
        for (const t of r.verificados.horaSinVerificar) lineas.push(`- **Hora sin verificar (se conserva):** ${t}`);
        for (const t of r.verificados.noVerificado) lineas.push(`- **No verificado (se conserva):** ${t}`);
        for (const t of r.porRevisar) lineas.push(`- **Por revisar:** ${t}`);
        for (const t of r.noConfirmado) lineas.push(`- No confirmado (se conserva): ${t}`);
        for (const t of r.yaJugados) lineas.push(`- Ya jugado: ${t}`);
        for (const t of r.descarto) lineas.push(`- Descartado: ${t}`);
        for (const t of r.fallos) lineas.push(`- **Falló, se conservan los datos anteriores:** ${t}`);
        lineas.push('');
      }
      if (pendientes.length) lineas.push(`Pendientes para la próxima corrida: ${pendientes.map((p) => `${p.agente} (${p.clave ?? 'general'})`).join(', ')}`, '');
      return lineas.join('\n');
    },
    // Sale de `propuestas`, no de esta corrida: el PR acumula lo de semanas anteriores.
    cuerpoPr(propuestas) {
      const linea = ({ texto, fuente }) => `- ${texto}${fuente ? ` ([fuente](${fuente}))` : ''}`;
      const lineas = ['Revisión semanal de los agentes. Revisa cada cambio con su fuente antes de aprobar.', '', 'Si lo cierras sin aprobar, lo rechazado no se vuelve a proponer salvo que haya una fuente nueva.', ''];
      for (const s of SECCIONES) {
        const lista = propuestas.filter((p) => p.seccion === s);
        if (lista.length) lineas.push(`## ${s}`, '', ...lista.map(linea), '');
      }
      if (dudas.length) lineas.push('## Dudas', '', ...dudas.map(linea), '');
      return lineas.join('\n');
    },
  };
}
