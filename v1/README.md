# Próximo Saque

Sitio que muestra el próximo partido de cada seleccionada mexicana de voleibol con su club, en hora de Tonalá, Jalisco. Arriba va el partido más cercano con cuenta regresiva; debajo, la agenda por día y la ficha de cada jugadora.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El sitio. Lee los tres JSON de `data/` y, si no puede, usa una copia que trae adentro. |
| `data/jugadoras.json` | Las seleccionadas y el equipo de cada una (`equipo: null` = club por confirmar). Se edita a mano. |
| `data/equipos.json` | Cada club: liga, zona horaria, ID del widget de Volleybox y páginas para verificar. Se edita a mano. |
| `data/partidos.json` | Los próximos partidos. Lo reescribe el actualizador cada lunes. |
| `data/manual.json` | Correcciones a mano. Siempre ganan sobre la IA. |
| `scripts/actualizar.mjs` | El agente: le pide a Gemini el calendario de cada club, valida fechas y zonas horarias y guarda el resultado. |
| `.github/workflows/actualizar.yml` | Corre el agente cada lunes a las 06:17 de Tonalá y guarda los cambios. |

## Ponerlo en línea gratis (GitHub Pages)

1. Creen un repositorio **público** y suban todo el contenido de esta carpeta (incluida `.github`).
2. **Settings → Pages**: *Deploy from a branch*, rama `main`, carpeta `/ (root)`.
3. **Settings → Actions → General → Workflow permissions**: elijan *Read and write permissions*.
4. Saquen una clave gratis de Gemini en [Google AI Studio](https://aistudio.google.com/) (*Get API key*). Google pide ser mayor de edad para usar la API.
5. En el repo: **Settings → Secrets and variables → Actions → New repository secret**, nombre `GEMINI_API_KEY`, valor: la clave.
6. **Actions → Actualizar partidos → Run workflow** para probarlo sin esperar al lunes. El resumen de la ejecución dice qué encontró por equipo.

Si Google cambia el modelo gratuito, creen una variable (pestaña *Variables*) llamada `GEMINI_MODEL` con el nombre que muestre AI Studio.

## Usarlo en Hostinger

Suban solo `index.html` y en el bloque `CONFIG` del script cambien `datos` por la dirección "raw" del repo:

```js
datos: 'https://raw.githubusercontent.com/USUARIO/REPO/main/data/',
```

Así el sitio lee los datos que GitHub actualiza cada semana.

## Cambiar jugadoras o clubes

- Para que una jugadora aparezca con partidos, su `equipo` en `jugadoras.json` debe ser una clave de `equipos.json`.
- Si un club tiene widget en Volleybox, pongan en `volleyboxId` el número final de la dirección del widget (`https://volleybox.net/widget/soonest_match/2048` → `2048`). El widget aparece dentro de la ficha de la jugadora.
- `calendario` es opcional: una página pública con el calendario del club en texto (no armada con JavaScript). Si existe, el agente la lee en vez de buscar en Google.

## Corregir un partido a mano

En `data/manual.json`:

```json
{
  "partidos": [
    { "equipo": "lovb-miami", "inicio": "2027-01-08T19:00:00-05:00", "local": "LOVB Miami", "visitante": "LOVB Atlanta", "competencia": "LOVB Pro", "sede": "Miami" },
    { "equipo": "uyba", "fecha": "2026-11-08", "eliminar": true }
  ]
}
```

`inicio` lleva la hora del lugar del partido con su desfase de UTC. El primero agrega un partido; el segundo borra el que haya ese día.

## Límites que conviene saber

- **Volleybox no se puede leer automáticamente.** Está protegido por Cloudflare y pide verificar que eres humano, así que sus widgets solo sirven para mostrarse; el orden y las horas salen de `data/partidos.json`.
- **La IA puede equivocarse.** Cada partido que encuentra lleva la etiqueta "IA" y su enlace de fuente. Si algo sale mal, se corrige en `manual.json`.
- **Plan gratuito de Gemini.** Con siete equipos una vez por semana sobra, pero Google ajusta sus límites seguido. Si un lunes falla, el sitio se queda con los datos anteriores.
- **GitHub pausa las tareas programadas** de un repo público que pasa 60 días sin cambios (por ejemplo, en vacaciones de liga). Se reactiva desde la pestaña *Actions*.

## ¿Y n8n?

n8n es gratis solo si lo instalan ustedes en una computadora o servidor que esté siempre prendido; n8n Cloud es de paga. GitHub Actions hace lo mismo sin servidor. Si después quieren pasarlo a n8n, el flujo equivalente es: *Schedule Trigger* → *HTTP Request* a Gemini → *Code* para validar → *GitHub* para guardar `data/partidos.json`.
