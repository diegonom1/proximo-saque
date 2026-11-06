# Agentes de Próximo Saque

Aquí, un agente es: instrucciones fijas (estos archivos) + resultados de búsqueda de Tavily + una tarea chica + una respuesta en JSON. Los agentes no deciden nada. El orquestador (`scripts/agentes/correr.mjs`) les pasa los datos actuales, junta lo que encuentran, lo valida con reglas y lo guarda o lo manda a un Pull Request para que ustedes lo aprueben.

| Archivo | Qué busca | Cuándo corre | Llamadas por corrida |
|---|---|---|---|
| `00-reglas-comunes.md` | Reglas que van antes de cada agente | Siempre | — |
| `01-plantel.md` | Anuncios de retiro; la lista de cada torneo nuevo | Cada lunes | 1 + máximo 2 listas |
| `02-perfil.md` | Datos de una jugadora | Altas nuevas + las 4 con revisión más vieja | 1 por jugadora |
| `03-partidos-club.md` | Próximos partidos de un club | Cada lunes; los jueves solo clubes que juegan en 4 días | 1 por club |
| `04-seleccion-torneos.md` | Próximo torneo y partidos; el resultado de cada torneo nuevo | Cada lunes | 1 + máximo 2 torneos |

Una corrida normal gasta unas 15–20 llamadas a Gemini a la semana. Las búsquedas gastan créditos de Tavily, con un tope de 180 por corrida.

El agente 05 (dónde ver) ya no existe: se apagó cuando el sitio dejó de mostrarlo, y por eso la numeración salta. El 06 (rankings) no tiene archivo aquí porque no usa IA.

## Cómo los usa el código

- Instrucción de sistema: `00-reglas-comunes.md` + el archivo del agente, **hasta la línea `## Prueba manual`** (esa sección es solo para ustedes). `{{HOY}}` se reemplaza por la fecha de Ciudad de México.
- Mensaje: la entrada en JSON que describe cada archivo, armada con los datos de `data/`.
- Búsqueda: la hace el código con Tavily (`scripts/agentes/busquedas.mjs`) y los resultados llegan en `resultadosBusqueda`, con el anexo `00-resultados-busqueda.md`. Con `BUSQUEDA=google` Gemini busca solo con `google_search`, que necesita facturación activa.
- Respuesta esperada: un solo bloque ```json, que el código valida antes de usar.

## Probarlos

- `npm run agentes:simulado`: respuestas guardadas. No gasta nada ni escribe.
- `npm run agentes:seco`: corrida real con Tavily y Gemini, sin escribir en `data/`. Gasta créditos y es la prueba final de cualquier cambio.

**A mano en Google AI Studio** (aistudio.google.com, gratis, se comporta igual que la API), para iterar una instrucción sin gastar créditos de Tavily:

1. Abran un chat nuevo y elijan el mismo modelo que usará el sitio.
2. En *System instructions* peguen `00-reglas-comunes.md`, debajo el agente, sin la parte de "Prueba manual", y al final `00-resultados-busqueda.md`. Cambien `{{HOY}}` por la fecha de hoy.
3. En el chat, peguen el JSON de "Prueba manual" del agente y agréguenle `resultadosBusqueda`: una lista de `{ "url", "titulo", "contenido" }` con el texto de las páginas que quieran probar.
4. Revisen lo que dice "Qué revisar" y abran los enlaces de las fuentes.

**En la app de Gemini** (su plan de estudiante): creen un Gem por agente con las mismas instrucciones y pasen `resultadosBusqueda` igual. Sirve para iterar rápido, pero la prueba final sigue siendo `npm run agentes:seco`.

## Mejorarlos

Si un agente se equivoca seguido en lo mismo, se corrige editando su archivo: agreguen una regla o un ejemplo de lo que no debe hacer. No hace falta tocar el código.

Los rankings los lee el código: `scripts/lib/rankings-oficiales.mjs` los lee directo de la FIVB y de NORCECA.
