# Próximo Saque

Sitio de aficionados para seguir a la Selección Mexicana femenil de voleibol (categoría mayor, sala) y a cada seleccionada con su club: próximo partido con cuenta regresiva, dónde verlo, agenda unificada, rankings y últimos torneos.

**En línea:** https://diegonom1.github.io/proximo-saque/

Los datos se actualizan solos: GitHub corre los agentes cada lunes y, cada jueves, vuelve a verificar los partidos de los próximos días. El contrato completo del proyecto está en [CLAUDE.md](CLAUDE.md).

## Cómo correrlo

Necesitas Node 24.

```
npm ci
npm run dev
```

Abre la dirección que muestra la terminal, que termina en `/proximo-saque/`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Sitio local. Aquí sí se ven las fotos sin crédito, para revisarlas. |
| `npm run build` | Construye el sitio como se publica. |
| `npm run preview` | Sirve lo que construyó `build`. |
| `npm run prueba` | Pruebas del sitio y de los agentes. |
| `npm run check` | Revisa los tipos. |
| `npm run agentes:simulado` | Corre los agentes con respuestas guardadas: no gasta llamadas ni escribe nada. |
| `npm run agentes:seco` | Corrida real de los agentes, sin escribir en `data/`. Gasta créditos. |
| `npm run agentes:verificar` | Corrida real del jueves, sin escribir en `data/`. Gasta créditos. |

Los comandos que gastan créditos necesitan un archivo `.env`, que nunca se sube al repo, con `GEMINI_API_KEY` ([Google AI Studio](https://aistudio.google.com/)) y `TAVILY_API_KEY` ([Tavily](https://tavily.com/)).

## Cómo agregar fotos

1. Pega la foto en `fotos-originales/<slug>/`, o en `fotos-originales/seleccion/`. Sirve cualquier nombre y formato, incluso HEIC.
2. Llena el `credito.txt` de esa carpeta: `Foto: autor o cuenta — URL`.
3. Corre `npm run fotos`.
4. Abre `fotos-originales/vista-previa.jpg` y lee los avisos. Revisa sobre todo el cabello y que no se haya comido el balón.
5. Sube a Git lo que se generó en `src/assets/fotos/<slug>/`.

**Sin crédito la foto no se publica:** en el sitio sale con iniciales. Si dejas la plantilla sin llenar, cuenta como vacío.

`fotos-originales/` no se sube al repo. Su archivo `LEEME.txt` trae los tamaños mínimos y cómo nombrar las fotos. Las carpetas ya están creadas; si falta alguna, por ejemplo la de una jugadora nueva, `npm run fotos` la crea.

La primera vez prepara un entorno de Python y descarga el modelo de recorte, cerca de 1 GB. Después solo procesa lo que cambió.

El mejor recorte pide 12 GB de memoria disponibles. Con menos no se salta la foto: usa un modelo de reserva y lo dice en el resumen. Si después corres el programa con más memoria, mejora esos recortes solo.

| Memoria disponible | Modelo | Pico medido |
|---|---|---|
| 12 GB o más | `birefnet-general` | 11.82 GB |
| 8 GB o más | `birefnet-general-lite` | 7.44 GB |
| 3 GB o más | `isnet-general-use`, con fantasmas y a veces sin un brazo | 1.71 GB |
| Menos de 3 GB | Ninguno: avisa y salta la foto | — |

| Comando | Qué hace |
|---|---|
| `npm run fotos` | Procesa lo que cambió y copia los créditos. |
| `npm run fotos -- --solo <slug>` | Procesa solo esa carpeta. |
| `npm run fotos -- --comparar` | Recorta con los dos modelos y los pone lado a lado en la hoja. Tarda el doble. |
| `npm run fotos -- --forzar` | Vuelve a procesar aunque nada haya cambiado. |
| `npm run fotos -- --carpetas` | Solo crea las carpetas que falten, sin procesar nada. |

Si la tarjeta salió centrada en otra persona, crea `fotos-originales/<slug>/cara.txt` con la posición de su cara en porcentaje de la foto, por ejemplo `36% 40%`, y vuelve a correr el programa.

Del recorte solo queda la silueta conectada a la cara de la jugadora, con el balón si lo trae en la mano. Si sigue saliendo otra persona, crea `fotos-originales/<slug>/caja.txt` con la zona que debe usar, en porcentaje de la foto (izquierda, arriba, derecha, abajo), por ejemplo `20% 0% 80% 100%`.

El programa no quita marcas de agua. Respeta los permisos de cada foto.

### Cómo se muestra cada foto

Cada jugadora tiene un tratamiento en `fotos.tratamiento`, en `data/jugadoras.json`. Se aplica en la portada de su perfil:

| Tratamiento | Cómo se ve | Cuándo usarlo |
|---|---|---|
| `completa` | Foto a pantalla completa. | Solo si llega a 2000 px en su lado largo. Si no, el sitio usa `duotono`. |
| `duotono` | Foto en tinta y rojo con grano, a media pantalla. | Es el tratamiento normal para fotos chicas. |
| `recorte` | Jugadora recortada sobre un bloque rojo, con su apellido y número detrás. | Solo si el recorte quedó bien en la hoja. |

Ninguna foto se muestra más grande que su tamaño real. El hero de inicio sigue la misma regla: con fotos chicas va en un panel, y a pantalla completa solo si `hero.jpg` y `hero-movil.jpg` llegan a su mínimo.

## Cómo corregir datos

No edites `data/*.json` a mano: los escribe el orquestador. Las correcciones van en [data/manual.json](data/manual.json), que siempre gana sobre lo que encuentren los agentes.

```json
{
  "partidos": [],
  "jugadoras": {},
  "seleccion": { "proximoTorneo": null },
  "rankings": { "fivb": null, "norceca": null }
}
```

**Agregar o corregir un partido.** La fecha y la hora van como las publica la fuente, con su zona horaria:

```json
"partidos": [
  {
    "clubId": "uyba",
    "fecha": "2026-11-22",
    "hora": "17:00",
    "zonaHoraria": "Europe/Rome",
    "local": "UYBA Volley Busto Arsizio",
    "visitante": "Il Bisonte Firenze",
    "competencia": "Serie A1",
    "fuente": "https://..."
  }
]
```

**Quitar un partido:**

```json
"partidos": [{ "clubId": "uyba", "fecha": "2026-11-29", "eliminar": true }]
```

**Fijar un dato de una jugadora,** por su `slug`:

```json
"jugadoras": { "jocelyn-urias": { "capitana": true } }
```

**Fijar el próximo torneo.** Pide `nombre`, `edicion` y `fuente`; lo demás es opcional. Deja de aplicarse cuando el torneo termina. Si el agente halla uno confirmado antes, sale en "Por revisar":

```json
"seleccion": {
  "proximoTorneo": {
    "nombre": "Copa del Mundo FIVB",
    "edicion": 2027,
    "fechaInicio": "2027-08-20",
    "fechaFin": "2027-09-05",
    "fuente": "https://..."
  }
}
```

**Fijar un ranking.** Lleva los cuatro campos y `fuente` es obligatoria. Si el agente halla otro dato, sale en "Por revisar"; para aceptarlo, escríbelo aquí o vuelve a `null`:

```json
"rankings": {
  "fivb": { "posicion": 21, "puntos": null, "fecha": "2026-10-01", "fuente": "https://..." },
  "norceca": null
}
```

Los cambios se aplican en la siguiente corrida. Para verlos antes, ve a Actions → **Actualizar datos** → *Run workflow*:

- `jueves` basta para partidos, próximo torneo y rankings, y casi no gasta llamadas.
- `lunes` hace falta para `jugadoras`, y ese cambio llega por el PR "Revisión semanal de datos".

## Cómo se actualiza solo

| Cuándo | Qué corre |
|---|---|
| Lunes, 06:17 de Tonalá | Todos los agentes. Partidos, rankings y Selección se guardan directo; plantilla, perfiles, clubes, ligas y torneos llegan en el PR "Revisión semanal de datos". |
| Jueves, 06:17 de Tonalá | Solo verifica los partidos de los próximos 4 días. |
| Cada push a `main` | Publica el sitio en GitHub Pages. |

El PR se aprueba desde GitHub. Cada corrida deja su resumen en Actions y un artefacto `diagnostico` con las respuestas crudas, durante 14 días. Las corridas programadas se encienden con la variable `CORRIDA_PROGRAMADA` en `true`.

Las instrucciones de cada agente están en [agentes/](agentes/README.md).
