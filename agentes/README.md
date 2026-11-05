# Agentes de Próximo Saque

Aquí, un agente es: instrucciones fijas (estos archivos) + búsqueda de Google + una tarea chica + una respuesta en JSON. Los agentes no deciden nada. El orquestador (`scripts/agentes/correr.mjs`) les pasa los datos actuales, junta lo que encuentran, lo valida con reglas y lo guarda o lo manda a un Pull Request para que ustedes lo aprueben.

| Archivo | Qué busca | Cuándo corre | Llamadas por corrida |
|---|---|---|---|
| `00-reglas-comunes.md` | Reglas que van antes de cada agente | Siempre | — |
| `01-plantel.md` | Listas oficiales recientes: quién está en la Selección | Cada lunes | 1 |
| `02-perfil.md` | Datos de una jugadora | Altas nuevas + las 4 con revisión más vieja | 1 por jugadora |
| `03-partidos-club.md` | Próximos partidos de un club | Cada lunes | 1 por club |
| `04-seleccion-torneos.md` | Próximo torneo, partidos y resultados de la Selección | Cada lunes | 1 |
| `05-donde-ver.md` | Plataformas oficiales para ver una liga o torneo desde México | Si no hay datos o pasaron 30 días | Máximo 2 |
| `06-rankings.md` | Ranking FIVB y NORCECA | Cada lunes | 1 |

Una corrida normal gasta unas 15–20 llamadas a Gemini a la semana.

## Cómo los usa el código

- Instrucción de sistema: `00-reglas-comunes.md` + el archivo del agente, **hasta la línea `## Prueba manual`** (esa sección es solo para ustedes). `{{HOY}}` se reemplaza por la fecha de Ciudad de México.
- Mensaje: la entrada en JSON que describe cada archivo, armada con los datos de `data/`.
- Búsqueda: la hace el código con Tavily (`scripts/agentes/busquedas.mjs`) y los resultados llegan en `resultadosBusqueda`, con el anexo `00-resultados-busqueda.md`. Con `BUSQUEDA=google` Gemini busca solo con `google_search`, que necesita facturación activa.
- Respuesta esperada: un solo bloque ```json, que el código valida antes de usar.

## Probarlos a mano (antes de conectar el código)

**En Google AI Studio** (aistudio.google.com, gratis, se comporta igual que la API):

1. Abran un chat nuevo y elijan el mismo modelo que usará el sitio.
2. En *System instructions* peguen `00-reglas-comunes.md` y debajo el agente, sin la parte de "Prueba manual". Cambien `{{HOY}}` por la fecha de hoy.
3. Activen la búsqueda de Google (*Grounding with Google Search*).
4. En el chat, peguen el JSON de "Prueba manual" del agente.
5. Revisen lo que dice "Qué revisar" y abran los enlaces de las fuentes.

**En la app de Gemini** (su plan de estudiante): creen un Gem por agente y peguen las mismas instrucciones. Sirve para iterar rápido, aunque la app busca distinto que la API, así que la prueba final va en AI Studio.

## Mejorarlos

Si un agente se equivoca seguido en lo mismo, se corrige editando su archivo: agreguen una regla o un ejemplo de lo que no debe hacer. No hace falta tocar el código.
