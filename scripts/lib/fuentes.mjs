// Lectura de páginas públicas. La verificación de fuentes se agrega en la fase 4.

export const urlValida = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) ? u : null);

export const limpiarHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

export async function textoDePagina(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': 'ProximoSaque/2.0 (calendario de aficionados; una consulta por semana)', 'accept-language': 'es,en;q=0.8' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  const limpio = limpiarHtml(await r.text());
  if (limpio.length < 400) throw new Error('la página casi no trae texto (seguramente se arma con JavaScript)');
  return limpio.slice(0, 60000);
}
