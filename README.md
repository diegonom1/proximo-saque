# Próximo Saque

Sitio de aficionados para seguir a la Selección Mexicana femenil de voleibol (categoría mayor, sala) y a cada seleccionada con su club: próximo partido con cuenta regresiva, agenda unificada, rankings y últimos torneos.

**En línea:** https://diegonom1.github.io/proximo-saque/

Los datos se actualizan solos: GitHub corre los agentes cada lunes y, cada jueves, vuelve a verificar los partidos de los próximos días. El contrato completo del proyecto está en [CLAUDE.md](CLAUDE.md).

## Qué tiene

- **Inicio:** cuenta regresiva al próximo compromiso, rankings FIVB y NORCECA, la Selección en números, la Plantilla, los partidos de esta semana y los últimos 6 torneos.
- **Perfil de cada jugadora:** sus datos, próximos partidos, destacados, trayectoria y fuentes.
- **Agenda:** todos los partidos en la hora del visitante, con filtros por jugadora y liga, botón de Google Calendar y calendarios `.ics` para suscribirse (`calendario.ics` y `calendario/<slug>.ics`).

Funciona con teclado y lector de pantalla, y sin animaciones si el dispositivo pide movimiento reducido.

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
| `npm run prueba:fotos` | Pruebas del programa de fotos. Necesita el entorno de Python de `npm run fotos`. |
| `npm run check` | Revisa los tipos. |
| `npm run agentes:simulado` | Corre los agentes con respuestas guardadas: no gasta llamadas ni escribe nada. |
| `npm run agentes:seco` | Corrida real de los agentes, sin escribir en `data/`. Gasta créditos. |
| `npm run agentes:verificar` | Corrida real del jueves, sin escribir en `data/`. Gasta créditos. |

Los comandos que gastan créditos necesitan un archivo `.env`, que nunca se sube al repo, con `GEMINI_API_KEY` ([Google AI Studio](https://aistudio.google.com/)) y `TAVILY_API_KEY` ([Tavily](https://tavily.com/)).

## Cómo agregar fotos

1. Pega la foto en `fotos-originales/<slug>/`, o en `fotos-originales/seleccion/`. Sirve cualquier nombre y formato, incluso HEIC. Para el encabezado de la agenda, llámalas `seleccion1`, `seleccion2`…
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

Si un recorte sale mejor con el otro modelo, crea `fotos-originales/<slug>/modelo.txt` con `general` o `portrait`. La siguiente corrida recorta esa foto otra vez.

El programa no quita marcas de agua. Respeta los permisos de cada foto.

### Cómo se muestra cada foto

Cada jugadora tiene un tratamiento en `fotos.tratamiento`, en `data/jugadoras.json`. Se aplica en su tarjeta de la Plantilla y en la portada de su perfil:

| Tratamiento | Cómo se ve | Cuándo usarlo |
|---|---|---|
| `completa` | Foto a pantalla completa. | Solo si llega a 2000 px en su lado largo. Si no, el sitio usa `duotono`. |
| `duotono` | Foto en tinta y rojo con grano, a media pantalla. | Es el tratamiento normal para fotos chicas. |
| `recorte` | Jugadora recortada sobre un bloque de color, con su apellido y número detrás. | Es el de toda la plantilla. Solo si el recorte quedó bien en la hoja. |

En el mismo lugar se elige:

- `fotos.color`: el color del bloque (`negro`, `rojo`, `verde` o `carbon`). Se escoge contra su jersey: nadie rojo sobre rojo ni verde sobre verde.
- `fotos.variante`: cómo se mueve en su perfil al hacer scroll (`profundidad`, `izquierda`, `derecha` o `acerca`).
- `fotos.orilla`: `derecha` pega el recorte a esa orilla, para ocultar un corte de la foto.

Ninguna foto se muestra más grande que su tamaño real. El hero de inicio sigue la misma regla: con fotos chicas va en un panel, y a pantalla completa solo si `hero.jpg` y `hero-movil.jpg` llegan a su mínimo.

## Cómo corregir datos

No edites `data/*.json` a mano: los escribe el orquestador. Las correcciones van en [data/manual.json](data/manual.json), que siempre gana sobre lo que encuentren los agentes. La excepción son la temporada y el calendario de cada liga, que nadie más actualiza (ver abajo).

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
| Jueves, 06:17 de Tonalá | Verifica los partidos de los próximos 4 días y vuelve a buscar los clubes que no tienen ningún partido guardado. |
| Cada push a `main` | Publica el sitio en GitHub Pages. |

Cada lunes el código revisa si la temporada de una liga ya debería haber terminado o si su calendario oficial dejó de responder. Si encuentra algo, lo avisa en el resumen, en las dudas del PR y en un issue llamado "Revisar temporadas de las ligas". Si ya hay uno abierto, le actualiza la lista en lugar de crear otro. Esos dos datos se corrigen a mano en `data/ligas.json`; al terminar, cierra el issue.

El PR se aprueba desde GitHub. Cada corrida deja su resumen en Actions y un artefacto `diagnostico` con las respuestas crudas, durante 14 días.

Para que todo esto corra, el repo necesita:

- Secretos `GEMINI_API_KEY` y `TAVILY_API_KEY`.
- La variable `CORRIDA_PROGRAMADA` en `true`, que enciende las corridas programadas. A mano siempre corren.
- En Settings → Actions → General, *Allow GitHub Actions to create and approve pull requests*.
- En Settings → Pages, la fuente *GitHub Actions*.

Las instrucciones de cada agente están en [agentes/](agentes/README.md).
