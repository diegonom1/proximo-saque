// Utilidades para leer respuestas de Gemini. La llamada a la API se agrega en las fases 4 y 5.

export function extraerJSON(salida) {
  const bloque = salida.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const crudo = bloque ? bloque[1] : salida;
  const a = crudo.indexOf('{');
  const b = crudo.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('la respuesta no trae JSON');
  return JSON.parse(crudo.slice(a, b + 1));
}
