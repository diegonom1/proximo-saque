# Próximo Saque v2

Sitio de aficionados para seguir a la Selección Mexicana femenil de voleibol (categoría mayor, sala) y a cada seleccionada con su club: próximo partido con cuenta regresiva, dónde verlo, agenda unificada, rankings y últimos torneos. Los datos se actualizan solos cada lunes con búsquedas en código (Tavily), agentes de IA (Gemini) y reglas en código.

> Este archivo es para Claude Code. La lógica del proyecto se definió fuera de aquí; este documento es el contrato. Si algo no está aquí, pregunta antes de inventarlo.

## Reglas de trabajo

- En todo el texto visible del sitio se dice "Plantilla", no "Plantel". Los nombres internos (agente 01, variables, `#plantel`) se pueden quedar.
- Commits sin líneas `Co-Authored-By` ni menciones a Claude.
- No hagas commit de fotos sin `credito.txt` lleno.
- Código, comentarios y textos del sitio en español de México.
- Mobile first: la mayoría de las visitas llegan desde el celular.
- No descargues fotos de internet ni enlaces fotos de Volleybox u otros sitios. Las fotos las ponemos nosotros en `src/assets/fotos/`.
- No edites `data/*.json` a mano salvo que te lo pidamos: los escribe el orquestador. Las correcciones humanas van en `data/manual.json`.
- Todo lo animado respeta `prefers-reduced-motion`.
- La carpeta `v1/` es el sitio anterior. Reutiliza su lógica probada (`v1/scripts/actualizar.mjs`, `v1/index.html`): conversión de zonas horarias, fusión de partidos, enlace a Google Calendar, cuenta regresiva y agrupación por día. No la borres hasta que v2 esté en línea.

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Sitio | Astro, salida estática | Genera una página por jugadora desde JSON y optimiza imágenes (WebP/AVIF responsivo). |
| Transiciones | View Transitions nativas entre páginas (`@view-transition { navigation: auto; }`), sin `ClientRouter` | La foto de la tarjeta se convierte en el fondo del perfil. Sin router no hay que reiniciar GSAP en cada navegación; donde el navegador no lo soporta, la navegación es normal. |
| Animación | GSAP + ScrollTrigger + SplitText, Lenis para scroll suave | GSAP y todos sus plugins son gratis. Lenis no altera el scroll táctil por defecto. |
| Validación | Zod | Valida lo que devuelve la IA y lo que lee el sitio. |
| Agentes | Node 24 + API de Gemini por `fetch` | Sin SDK; fácil de probar con respuestas simuladas. |
| Búsqueda | Tavily (plan gratis) por `fetch`; `BUSQUEDA=tavily\|google` | La capa gratis de Gemini 3 no incluye `google_search` y los modelos 2.5 ya no aceptan usuarios nuevos. El código busca y Gemini solo extrae. |
| Automatización | GitHub Actions | Gratis en repo público: actualización semanal y despliegue. |
| Hosting | GitHub Pages (opcional: Hostinger por FTP) | Estático y gratis. |

## Estructura

```
/
├─ CLAUDE.md  LEEME.md
├─ fotos-originales/        fotos sin procesar; no se sube al repo
├─ agentes/                 contextos (prompts) de cada agente; los lee el orquestador
├─ data/                    única fuente de verdad del sitio (JSON)
│  ├─ jugadoras.json  clubes.json  ligas.json  partidos.json
│  ├─ seleccion.json  torneos.json  rankings.json
│  ├─ estado-agentes.json   qué revisó cada agente y cuándo (para rotar)
│  └─ manual.json           correcciones humanas; siempre ganan
├─ scripts/
│  ├─ agentes/              correr.mjs (orquestador) + un módulo por agente
│  ├─ lib/                  tiempo.mjs, fusion.mjs, validar.mjs, gemini.mjs, fuentes.mjs, busqueda.mjs, evidencia.mjs, nombres.mjs, torneos.mjs, fotos-sin-credito.mjs
│  ├─ pruebas/              respuestas simuladas por agente (IA_SIMULADA), páginas reales y datos-base/ (data/ fijo para las pruebas)
│  └─ fotos/                procesar.py (npm run fotos): prepara las fotos, solo en local
├─ src/
│  ├─ assets/fotos/
│  │  ├─ seleccion/         hero.jpg, hero-movil.jpg, credito.txt
│  │  └─ jugadoras/<slug>/  tarjeta.jpg, fondo.jpg, recorte.png (opcional), credito.txt
│  ├─ pages/                index.astro, agenda.astro, jugadoras/[slug].astro, torneos.astro
│  ├─ components/
│  └─ lib/                  tiempo.ts, calendario.ts, datos.ts, fotos.ts, compromiso.ts, presentacion.ts, partido.ts, perfil.ts, iconos.ts, agenda.ts, ics.ts, cuenta.ts
├─ v1/                      sitio anterior (referencia)
└─ .github/workflows/       actualizar.yml (semanal), deploy.yml (push a main)
```

## Contratos de datos

Regla de horas: `inicio` se guarda con la hora local de la sede y su desfase (`"2026-11-07T21:00:00-03:00"`), y `zonaSede` dice en qué zona está. El sitio muestra la hora del dispositivo del visitante con `Intl` y, aparte, "allá serán las 21:00". Si `zonaSede` es `null`, no se muestra el "allá". Nunca se guarda una hora sin desfase.

Cualquier campo puede ser `null`. En pantalla, `null` se muestra como "Por confirmar" (o se oculta si es opcional, como redes).

### `data/jugadoras.json` (arreglo)

```json
{
  "slug": "sofia-maldonado",
  "nombre": "Sofía Maldonado",
  "nombreCompleto": "Sofía Maldonado Díaz",
  "estado": "activa",
  "posicion": "Atacante",
  "numero": 3,
  "capitana": false,
  "fechaNacimiento": null,
  "origen": { "ciudad": "Guadalajara", "estado": "Jalisco", "pais": "México" },
  "estaturaCm": null,
  "clubId": "sesi-bauru",
  "historialClubes": [],
  "redes": [],
  "destacados": [
    { "texto": "MVP del Final Four NORCECA 2026", "anio": 2026, "fuente": "https://norceca.info/mexicos-sofia-maldonado-named-most-valuable-player-of-the-2026-norceca-womens-final-four/" },
    { "texto": "Mejor anotadora, mejor saque, mejor recepción y equipo ideal del Final Six NORCECA 2026", "anio": 2026, "fuente": "https://www.fivb.com/empowerment-funded-mexico-and-puerto-rico-medal-at-norceca-womens-final-six/" }
  ],
  "fotos": { "foco": "50% 30%" },
  "ultimaListaOficial": { "torneo": "NORCECA Final Six 2026", "fecha": "2026-09-27", "fuente": "https://www.fivb.com/empowerment-funded-mexico-and-puerto-rico-medal-at-norceca-womens-final-six/" },
  "fuentes": { "numero": "https://norceca.info/wp-content/uploads/2026/02/BOLETIN-2-2026-NORCECA-Womens-Final-Four.pdf" },
  "revisado": null
}
```

- `estado`: `activa` | `propuesta` (alta sugerida por el agente, pendiente de aprobar) | `exseleccionada` (sale de la plantilla y de la agenda, y el sitio deja de generar su página; los datos se quedan por si regresa).
- `posicion`: `Acomodadora` | `Opuesta` | `Atacante` | `Central` | `Líbero` (la de su última lista con la Selección).
- `redes`: `[{ "red": "instagram", "url": "https://...", "fuente": "https://..." }]`; solo cuentas verificadas (ver agente 02).
- `fuentes`: URL por campo (`{ "clubId": "https://...", "fechaNacimiento": "https://..." }`).
- `fotos.foco`: `object-position` para recortar bien en cualquier pantalla. Los créditos salen de `credito.txt`.
- `revisado`: fecha del último cambio que trajo el agente de perfil. La rotación usa `estado-agentes.json`.

### `data/clubes.json` (objeto por id)

```json
{
  "sesi-bauru": {
    "nombre": "Sesi Vôlei Bauru",
    "alias": ["SESI Bauru", "Bauru"],
    "ligaId": "superliga-br",
    "pais": "Brasil",
    "ciudad": "Bauru",
    "zona": "America/Sao_Paulo",
    "volleybox": { "url": null, "widgetId": 6185 },
    "sitio": null,
    "calendarioUrl": null
  }
}
```

`calendarioUrl`: página pública con el calendario del club en texto. Si existe, el orquestador la descarga y se la pasa al agente (como en el v1).

### `data/ligas.json` (objeto por id)

```json
{
  "superliga-br": {
    "nombre": "Superliga Feminina",
    "pais": "Brasil",
    "temporada": "2026-27",
    "calendarioOficialUrl": "https://cbv.com.br/",
    "plataformas": [],
    "revisado": null
  }
}
```

Cada plataforma (la llena el agente 05):

```json
{ "nombre": "Nombre de la plataforma", "tipo": "youtube", "url": "https://www.youtube.com/@canal", "alcance": "mundial", "costo": "gratis", "notas": null, "fuente": "https://...", "revisado": "2026-11-09" }
```

`tipo`: `youtube` | `streaming` | `tv` | `app` (el icono sale de Simple Icons según el nombre o el dominio, con uno genérico por tipo). `costo`: `gratis` | `pago` | `null`.

### `data/partidos.json`

```json
{
  "actualizado": "2026-11-09T06:20:00-06:00",
  "partidos": [
    {
      "id": "club-sesi-bauru-2026-11-07",
      "tipo": "club",
      "clubId": "sesi-bauru",
      "torneoId": null,
      "ligaId": "superliga-br",
      "inicio": "2026-11-07T21:00:00-03:00",
      "zonaSede": "America/Sao_Paulo",
      "horaConfirmada": true,
      "local": "Sesi Vôlei Bauru",
      "visitante": "E.C. Pinheiros",
      "nuestro": "local",
      "competencia": "Superliga Feminina · Rodada 4",
      "sede": "Bauru",
      "convocadas": null,
      "transmision": [],
      "fuente": null,
      "confianza": null,
      "origen": "inicial"
    }
  ],
  "estados": {
    "lovb-miami": { "texto": "Debuta en enero de 2027. LOVB todavía no publica su calendario.", "fuente": "https://www.lovb.com/teams/lovb-miami-volleyball", "revisado": "2026-11-04" }
  }
}
```

- `zonaSede`: zona IANA de donde se juega. Si el agente no la da, en partidos de local se usa la zona del club; en cualquier otro caso queda `null` e `inicio` usa `zonaHoraria`.
- `tipo`: `club` | `seleccion`. En partidos de Selección: `clubId: null`, `torneoId` con el id del torneo, `nuestro` indica el lado de México y `convocadas` lleva slugs si ya hay lista.
- `origen`: `manual` | `ia` | `inicial`. Prioridad al fusionar: manual > ia > inicial (lógica `fusionar` del v1).
- `estados`: situación de la temporada de cada club (sin empezar, en pausa, terminada), para mostrarla cuando no hay partidos.

### `data/seleccion.json`

```json
{
  "entrenador": { "nombre": "Nicola Negro", "fuente": "https://norceca.info/wp-content/uploads/2026/02/BOLETIN-2-2026-NORCECA-Womens-Final-Four.pdf" },
  "proximoTorneo": null,
  "plataformas": [],
  "revisado": null
}
```

`proximoTorneo`: `{ "id", "nombre", "edicion", "ciudad", "pais", "fechaInicio", "fechaFin", "fuente" }`. `plataformas`: dónde ver ese torneo (agente 05), mismo formato que en ligas.

### `data/torneos.json`

```json
{
  "maximo": 7,
  "torneos": [
    {
      "id": "norceca-final-six-2026",
      "nombre": "NORCECA Final Six",
      "edicion": 2026,
      "ciudad": "Zinacantepec",
      "pais": "México",
      "fechaInicio": "2026-09-21",
      "fechaFin": "2026-09-27",
      "posicion": 2,
      "medalla": "plata",
      "record": "5-2",
      "premios": [
        { "jugadora": "sofia-maldonado", "premio": "Mejor anotadora" },
        { "jugadora": "sofia-maldonado", "premio": "Mejor saque" },
        { "jugadora": "sofia-maldonado", "premio": "Mejor recepción" },
        { "jugadora": "sofia-maldonado", "premio": "Equipo ideal (punta)" }
      ],
      "fuente": "https://norceca.net/2026%20Competition%20&%20Activities/Final%20Six/Women/News-Pages-Women%20Final%20Six.htm"
    },
    {
      "id": "norceca-final-four-2026",
      "nombre": "NORCECA Final Four",
      "edicion": 2026,
      "ciudad": "Ponce",
      "pais": "Puerto Rico",
      "fechaInicio": "2026-06-03",
      "fechaFin": "2026-06-08",
      "posicion": 1,
      "medalla": "oro",
      "record": null,
      "premios": [{ "jugadora": "sofia-maldonado", "premio": "MVP" }],
      "fuente": "https://norceca.info/mexicos-sofia-maldonado-named-most-valuable-player-of-the-2026-norceca-womens-final-four/"
    }
  ]
}
```

`fase`: hasta dónde llegó México (por ejemplo `"Fase de grupos"`). El sitio la muestra cuando `posicion` es `null`.

Regla en código, no en la IA: se ordenan por `fechaFin` descendente y se guardan solo los `maximo` más recientes. Un torneo entra cuando el agente 04 lo reporta terminado.

### `data/rankings.json`

```json
{
  "fivb": { "posicion": null, "puntos": 166.82, "fecha": null, "fuente": "https://www.fmvb.org/femenil-mayor" },
  "norceca": { "posicion": null, "puntos": 183, "fecha": null, "fuente": "https://www.fmvb.org/femenil-mayor" },
  "historial": []
}
```

Los puntos iniciales son los que publica la FMVB (de 2025). El agente 06 los reemplaza. `historial` guarda cada cambio, del más viejo al más nuevo, para mostrar si subió o bajó: `{ "ranking": "fivb", "posicion": 25, "puntos": 150.5, "fecha": "2026-09-28" }`.

### `data/estado-agentes.json`

```json
{
  "ultimaCorrida": null,
  "revisado": { "perfil:sofia-maldonado": "2026-11-09", "dondever:superliga-br": "2026-11-09" },
  "pendientes": [],
  "propuestas": [{ "clave": "alta:rosa-hernandez", "seccion": "Altas", "texto": "Rosa Hernández (NORCECA Final Six 2026)", "fuente": "https://...", "fecha": "2026-11-09" }],
  "rechazos": [{ "clave": "club:uxue-guereca:club ejemplo", "texto": "...", "evidencias": ["https://..."], "fecha": "2026-11-16" }]
}
```

`pendientes`: tareas que no cupieron en el presupuesto de la corrida; van primero la semana siguiente. `propuestas`: lo que está en el PR abierto. `rechazos`: lo de un PR cerrado sin aprobar; no se vuelve a proponer salvo que llegue con una fuente que no esté en `evidencias`.

### `data/manual.json`

```json
{
  "partidos": [],
  "jugadoras": {},
  "seleccion": { "proximoTorneo": null }
}
```

`partidos` funciona como en el v1 (agregar, corregir o `"eliminar": true`). `jugadoras` fija campos por slug (`{ "jocelyn-urias": { "capitana": true } }`) y gana sobre la IA. `seleccion.proximoTorneo` fija el próximo torneo y gana sobre el agente 04 mientras no termine; pide `nombre`, `edicion` y `fuente`, y lo demás es opcional (`ciudad`, `pais`, `fechaInicio`, `fechaFin`; el `id` se calcula). Con `null` decide el agente. Se aplica en la siguiente corrida. Si el agente halla un torneo confirmado que empieza antes, sale en "Por revisar" para decidir.

## Páginas

### Texto de un partido

En todo el sitio (hero, "Esta semana", perfil, agenda) un partido se escribe igual: hora, jugadora y equipos, separados por `·`.

- Club: `21:00 · Sofía Maldonado · Sesi Vôlei Bauru vs E.C. Pinheiros`.
- Dos del mismo club, en orden alfabético: `Argentina Ung y Uxue Guereca`.
- Selección: `Selección Mexicana · México vs Estados Unidos`.
- Cada nombre lleva a su perfil. Se arma con `src/components/LineaPartido.astro` y `src/lib/partido.ts`.
- El título del evento de Google Calendar usa el mismo texto, sin la hora.

### Inicio `/`

1. **Hero**: foto de la Selección a pantalla completa (`hero.jpg`; en celular `hero-movil.jpg`, vertical). Encima, la fecha grande del próximo compromiso (formato `21.09.26`) y la cuenta regresiva. Qué cuenta, en este orden:
   1. el próximo partido de la Selección;
   2. si no hay partido, el inicio del próximo torneo (cuenta en días);
   3. si no hay torneo confirmado: "Próximo torneo por confirmar" y abajo "Mientras, la próxima en jugar:", el texto del partido y su cuenta regresiva.
2. **Esta semana**: los 3 próximos partidos de cualquier tipo, con enlace "Ver agenda completa".
3. **Rankings**: FIVB y NORCECA en dos bloques grandes: lugar (número grande), puntos, fecha de actualización y flecha si subió o bajó contra el registro anterior. La FMVB solo muestra los puntos; nosotros mostramos más.
4. **Plantilla**: tarjetas con retrato (`tarjeta.jpg`), nombre, número, posición y club. Toca una y abre su perfil.
5. **Últimos 7 torneos**: tarjeta por torneo con medalla o lugar, sede, fechas, récord y premios individuales.
6. **Pie**: fecha de última actualización, fuentes generales y créditos de fotos.

### Perfil `/jugadoras/[slug]`

1. **Hero**: `fondo.jpg` (o `recorte.png` encima de su apellido gigante si existe). Datos estilo Volleybox: nombre, fecha de nacimiento y edad, lugar de origen, estatura, club actual con liga y país, posición, número, capitana, redes (iconos solo si hay URL).
2. **Próximo partido**: texto del partido, competencia, "allá serán las…" (si hay `zonaSede`), cuenta regresiva, botón de Google Calendar, iconos de "Dónde verlo" (de la liga o del torneo; cada icono abre el canal o la plataforma) y enlace "Calendario oficial de la liga".
3. **Siguientes**: los 3 partidos posteriores (sin cuenta regresiva) y "Ver todos en la agenda" (`/agenda?j=<slug>`).
4. **Un plus**: destacados (premios, MVP, equipos ideales), línea de tiempo de clubes y última lista oficial en la que apareció.
5. **Fuentes**: enlaces de donde salió cada dato.

Los partidos del perfil son los de su club y los de la Selección donde aparece en `convocadas`; el navegador decide cuál es el próximo, porque el sitio se construye una vez por semana. Si hay un próximo torneo y aún no tiene lista, se muestra una línea: "Próximo torneo de la Selección: <torneo>, <fechas> · Lista por confirmar".

Si su club no tiene partidos, mostrar `partidos.estados[clubId]` (temporada sin empezar, en pausa o terminada). Si no tiene club confirmado: "Club por confirmar".

### Agenda `/agenda`

- Todos los partidos futuros (clubes y Selección) en orden, agrupados por día en la hora del visitante. Los de la Selección salen siempre, haya lista o no, también al filtrar por jugadora y en su `.ics`.
- Cuenta regresiva solo en el primero, en una tarjeta destacada arriba.
- Cada partido: texto del partido (con el lado mexicano resaltado), "allá" (si hay `zonaSede`), competencia, etiqueta roja "Selección" cuando aplique, iconos de dónde verlo, botón de Google Calendar y enlace "Fuente". Si no hay fuente, enlace "Verificar en el calendario oficial".
- Al final, "Sin partidos por ahora": jugadoras cuyo club no tiene partidos en el rango, con el estado de su temporada.
- Filtros: Todas, Selección, por jugadora y por liga. `?j=<slug>` preselecciona una jugadora. El filtro se recuerda en `localStorage` (con try/catch).
- El build genera `calendario.ics` (todos) y `calendario/<slug>.ics` (por jugadora) para suscribirse desde Google Calendar y recibir los cambios solos. Un partido sin hora confirmada va como evento de todo el día.

Acceso desde todo el sitio: enlace "Agenda" en la navegación y, en celular, un botón flotante "Próximo partido · 2d 4h" que lleva a `/agenda`.

### Torneos `/torneos` (opcional)

Los 7 torneos con más detalle: resultado, récord y premios.

## Reglas de tiempo y estados

- Un partido se considera "en juego" durante 150 minutos desde su inicio; después desaparece de las listas.
- `horaConfirmada: false` → "Hora por confirmar" y la cuenta regresiva solo en días.
- La cuenta regresiva corre en el cliente; el resto de la página es estático. Lo que depende de la hora (qué cuenta el hero, los partidos de "Esta semana", el botón flotante y las horas del visitante) se recalcula en el navegador con las mismas funciones del build (`src/lib/compromiso.ts`), porque el sitio se construye una vez por semana.
- Google Calendar: enlace de plantilla (`calendar.google.com/calendar/render?action=TEMPLATE…`) con título (texto del partido sin la hora), 2 horas de duración, competencia, dónde verlo y fuente en los detalles.

## Diseño

- Tema claro fijo, base blanca. Las fotos y las animaciones ponen el color.
- Tokens sugeridos: `--papel #FFFFFF`, `--hueso #F4F3EF` (secciones alternas), `--tinta #0E0E10`, `--gris #6B6B70`, `--linea #E4E2DC`, `--rojo #D1202F` (acento: Selección, "en juego", botones primarios). El verde queda solo como detalle mínimo.
- Tipografía: display condensada para nombres y números (Big Shoulders 800–900, la del v1; Google ya la publica sin "Display" en el nombre), texto en Instrument Sans y etiquetas de datos en IBM Plex Mono.
- Números de camiseta en contorno gigante como recurso gráfico detrás de las jugadoras.
- Las fotos vienen de fuentes distintas: un duotono tinta/rojo opcional las unifica y disimula la baja resolución.

## Animaciones (en orden de prioridad)

1. **De tarjeta a perfil**: transición de elemento compartido (`view-transition-name: foto-<slug>` en la tarjeta y en el hero del perfil); la foto crece hasta ser el fondo.
2. **Perfil con profundidad**: apellido gigante detrás del `recorte.png`; al hacer scroll el texto se mueve más lento que la foto (2–3 capas). Sin recorte: foto con el nombre encima.
3. **Hero de inicio**: la foto empieza a pantalla completa y con el scroll se reduce a una tarjeta redondeada; la fecha y la cuenta quedan fijas (pin) mientras tanto.
4. **Plantilla**: en escritorio, sección fijada con scroll horizontal de tarjetas; en celular, carrusel deslizable con snap.
5. **Intro de carga** (solo la primera visita de la sesión, máximo 1.2 s, saltable): "PRÓXIMO SAQUE" con contador 0–100 % que se abre como máscara sobre el hero. Guiño al sitio de referencia (spidermanbrandnewday.es), que usa pantalla de carga con porcentaje, video de fondo y una fecha grande.
6. Títulos que entran por líneas (SplitText), rankings que cuentan hacia arriba y dígitos de la cuenta regresiva que ruedan.

Presupuesto: animar solo `transform` y `opacity`; nada bloquea la lectura; con `prefers-reduced-motion` no hay pin ni parallax, solo fundidos. Meta Lighthouse móvil ≥ 85 en rendimiento.

Video de fondo: solo si es material propio o con permiso; las transmisiones tienen dueño. Sin video, la foto con movimiento lento basta.

## Fotos

| Archivo | Uso | Mínimo recomendado |
|---|---|---|
| `seleccion/hero.jpg` | Hero de inicio (escritorio) | 2400 px de ancho, horizontal |
| `seleccion/hero-movil.jpg` | Hero de inicio (celular) | 1080 × 1920, vertical |
| `jugadoras/<slug>/tarjeta.jpg` | Plantilla | 1000 × 1250 (4:5), cara en el tercio superior |
| `jugadoras/<slug>/fondo.jpg` | Fondo del perfil | 2000 px del lado largo, jugadora hacia un lado |
| `jugadoras/<slug>/recorte.png` | Efecto de profundidad (opcional) | PNG transparente, 1600 px de alto |
| `credito.txt` | Crédito visible | `Foto: autor o cuenta — URL` |

- En el build de producción una foto sin `credito.txt` lleno no se usa: sale con iniciales, el build lo avisa y el archivo tampoco llega a `dist/` (`scripts/lib/fotos-sin-credito.mjs`). En `npm run dev` sí se ve, para revisarla.
- Si falta una foto: tarjeta con iniciales y número en contorno; perfil con fondo de color y nombre gigante.
- Si solo existe `fondo.jpg`, la tarjeta usa un recorte de esa misma foto con `fotos.foco`.
- `npm run fotos` (`scripts/fotos/procesar.py`, solo en local, con `.venv`): toma `fotos-originales/<slug>/` y `fotos-originales/seleccion/` (cualquier nombre y formato) y genera en `src/assets/fotos/` `tarjeta.jpg` (cara en el tercio de arriba, con detección de rostro), `fondo.jpg`, `recorte.png`, `hero.jpg` y `hero-movil.jpg`. Crea `credito.txt` vacío si falta, avisa de lo que queda debajo del mínimo, no repite lo que no cambió y muestra el avance y el tiempo de cada foto, y deja una hoja en `fotos-originales/vista-previa.jpg`. No quita marcas de agua. Opciones en `npm run fotos -- --help`.
- Si una carpeta trae varias fotos, el script usa la más vertical para la tarjeta y la más horizontal para el fondo. Para decidirlo a mano, poner "tarjeta", "fondo" o "recorte" (en la Selección, "hero" o "movil") en el nombre del archivo.
- `recorte.png` usa un solo modelo: `birefnet-general`, o el que diga `fotos-originales/<slug>/modelo.txt` (`general` o `portrait`). Si cambia ese archivo, la siguiente corrida recorta esa foto sin `--forzar`. `npm run fotos -- --comparar` recorta con los dos y los pone lado a lado en la hoja. `birefnet-portrait` puede morder lo que la jugadora trae en las manos.
- Cada modelo corre en su propio proceso (que sigue vivo entre fotos mientras no cambie de modelo), sin arena de memoria de onnxruntime, con 4 hilos y sobre una copia reducida; la máscara se aplica a la foto original. Con menos de 10 GB disponibles no carga el modelo y avisa. Cada modelo llega a 9.1 GB en la inferencia sin importar hilos, arena ni tamaño de la foto, porque la red siempre trabaja a 1024 × 1024; tener los dos cargados a la vez agotó la memoria de una máquina de 14 GB.
- Las fotos viven en `src/assets/fotos/` porque Astro no procesa lo que está en `public/`. `src/lib/fotos.ts` las carga con `import.meta.glob` y lee `credito.txt` con `?raw`.
- Astro genera los tamaños y formatos (WebP/AVIF) con `<Picture>` de `astro:assets`. El hero usa `getImage()` con un `<picture>` propio, porque `<Picture>` no admite un archivo distinto por pantalla.
- No subir imágenes de más de 5 MB.

## Agentes

Los contextos están en `agentes/` (ver `agentes/README.md`). Para cada llamada, el orquestador manda como instrucción de sistema `00-reglas-comunes.md` + el archivo del agente, hasta la línea `## Prueba manual` (sin incluirla) y con `{{HOY}}` reemplazado por la fecha de Ciudad de México. Con `BUSQUEDA=tavily` agrega `00-resultados-busqueda.md`. El mensaje es la entrada en JSON que describe cada archivo y, con Tavily, `resultadosBusqueda`: lo que el código encontró. Las búsquedas de cada agente están en `scripts/agentes/busquedas.mjs`, y los partidos se buscan en el idioma de cada liga.

### Orquestador `scripts/agentes/correr.mjs`

Orden de cada corrida semanal. Antes de todo, y antes de los `pendientes`, van las tareas de lo que está por jugarse: 04 si la Selección juega en los próximos 7 días y 03 de cada club que juega en ese rango.

1. **06 Rankings** (1 llamada, una vez al mes: cada 28 días).
2. **04 Selección y torneos**: 1 llamada para el próximo compromiso, que también nombra los torneos terminados que ve; luego 1 llamada por torneo del catálogo que no esté en `torneos.json` (máximo 2 por corrida, cada uno cada 30 días).
3. **01 Plantel**: 1 llamada para anuncios de retiro; luego 1 llamada por torneo guardado más reciente que la última lista conocida (máximo 2 por corrida, cada uno cada 30 días). Lo histórico no lo buscan los agentes: se cargó una vez por PR.
4. **02 Perfiles**: altas nuevas primero; luego las 4 jugadoras con `revisado` más viejo (así cada perfil se revisa cerca de una vez al mes sin gastar todo en un lunes).
5. **03 Partidos de club**: 1 llamada por club con seleccionadas activas, ya aprobado en `clubes.json`. Un club nuevo empieza a tener partidos en la corrida siguiente a aprobar el PR (o al correr el workflow a mano).
6. **05 Dónde ver**: máximo 2 por corrida, para ligas o el próximo torneo con `plataformas` vacía, `temporada` distinta o `revisado` de más de 30 días.
7. Fusionar con lo existente, aplicar `manual.json`, validar con Zod, verificar fuentes y escribir.

Verificación de partidos próximos: el código coteja cada partido guardado de la ventana contra el texto de las fuentes de esa tarea (`verificarGuardados`), aunque Gemini no lo reporte, y relee la página de su `fuente` además del calendario. Aquí vale cualquiera de los dos equipos, con sus alias, junto a la fecha y la hora, porque una fuente en otro idioma quizá solo permita reconocer a uno (北京北冰洋); si una fila nombra a los dos, manda esa. Un partido nuevo o un cambio sigue exigiendo al rival. Solo informa en el resumen: "Verificado", "Hora sin verificar" o "No verificado"; lo que no se confirma se conserva. Los cambios siguen las reglas de siempre.

- Lunes: ventana de 7 días (`DIAS_VERIFICAR`), dentro de la corrida normal.
- Jueves (`SOLO_VERIFICAR=true` o `--verificar`): ventana de 4 días. Solo corren 03 de los clubes que juegan en ese rango y 04 si juega la Selección, buscando hasta el último día de la ventana. No corren perfiles, rankings, plantel ni dónde ver; no toca `torneos.json`, el próximo torneo ni el PR; conserva `pendientes`. `npm run agentes:verificar` la prueba sin escribir.

Detalles técnicos:

- Modelos en `GEMINI_MODELOS` (lista separada por comas, por defecto `gemini-3.1-flash-lite`, el único con cuota gratis; las tareas están pensadas para él: chicas, una cosa por llamada y con el texto de la página). Si uno responde 404 o 429 por cuota agotada, se pasa al siguiente de la lista. Si ninguno responde por eso, la corrida deja de llamar y lo demás queda en `pendientes`.
- Presupuesto: `MAX_LLAMADAS` por corrida (por defecto 20). Lo que no cabe va a `estado-agentes.json → pendientes`. Los límites gratis los cambia Google seguido; se revisan en AI Studio.
- Páginas: `/extract` sin `query` (con ella Tavily devuelve solo fragmentos), hasta 20 000 caracteres por página y con los saltos de línea. Para partidos, además se abre la página y se antepone lo que hay en `aria-label` y `title`: spikelive guarda ahí la hora de cada partido y Tavily no la ve.
- Búsqueda (`scripts/lib/busqueda.mjs`): 1 crédito por búsqueda básica y 1 por extracción de hasta 5 páginas. Límite duro de 800 créditos al mes: vale el mayor entre `/usage` de Tavily (va atrasado) y el contador propio (`estado-agentes.json → tavily` y, para `--seco`, `.tavily-creditos.json`, fuera del repo). Si `/usage` no se puede leer, no se busca. Tope de 180 por corrida. Al llegar a un límite la corrida deja de llamar y lo demás queda en `pendientes`. El resumen muestra los créditos.
- Llamada: `system_instruction` + `contents`, y `tools: [{ google_search: {} }]` solo con `BUSQUEDA=google`. `temperature: 0` en modelos 2.5; en Gemini 3 se deja la temperatura por defecto (Google lo recomienda). Pedir el JSON en el texto y extraerlo (`extraerJSON` del v1); no combinar `responseSchema` con `google_search` si el modelo no lo soporta.
- Reintentos ante 429/5xx con espera creciente; pausa de 8 s entre llamadas. Si se agota el tiempo pasa al siguiente modelo.
- `DIAGNOSTICO=<archivo>` guarda las respuestas crudas, las URLs de cada tarea y la comparación de partidos.
- `IA_SIMULADA=scripts/pruebas` usa respuestas guardadas (un JSON por agente, basados en los ejemplos de `agentes/`) para probar sin gastar llamadas ni usar la red. Aceptan `{{HOY+3}}` y `{{CLAVE}}` para no caducar. `npm run agentes:simulado` lo corre con `--seco`, que muestra el resumen sin escribir nada.
- `DIAS_ADELANTE` (por defecto 45): rango de búsqueda de partidos.
- Cada tarea corre aislada: si falla o deja datos que no validan, se deshace todo lo que hizo, incluido lo anotado para el PR.
- Resumen por agente en `GITHUB_STEP_SUMMARY` (qué encontró, qué descartó y por qué).

### Validación (código, no IA)

- Todo dato nuevo necesita `fuente`; sin fuente se descarta.
- Fuentes con `BUSQUEDA=tavily`: una URL vale solo si vino en los resultados de esa misma tarea. Otra página del mismo dominio no vale.
- Nunca valen como fuente las redes sociales (Instagram, LinkedIn, X, Facebook, TikTok) ni la portada de un sitio.
- Perfiles: la página debe mencionar a la jugadora en el título, la URL o el texto que vino en los resultados, y no puede ser un listado (búsquedas, filtros por país, listas de jugadoras; `esListado`).
- Fuentes con `BUSQUEDA=google`: una URL se acepta si su dominio aparece entre las fuentes de `groundingMetadata` de esa misma respuesta o si responde al abrirla (2xx/3xx; Volleybox contesta 403 a los bots y se acepta si viene en `groundingMetadata`). Los enlaces de redirección de Google en `groundingMetadata` (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`) se resuelven a su URL final antes de guardarlos. Si ninguna fuente del dato pasa, se descarta.
- Partidos: fecha válida, futura, a menos de 120 días, zona IANA válida, local y visitante presentes. La hora llega como la publica la fuente (`fecha`, `hora`, `zonaHoraria`), junto con `zonaSede`. El código calcula el instante con `hora` + `zonaHoraria` y guarda `inicio` en `zonaSede` (`relojLocalAUtc` e `isoEnZona` del v1). El desfase de `inicio` debe coincidir con `zonaSede`.
- Evidencia (`scripts/lib/evidencia.mjs`): la fila puede traer todo junto, o la fecha y la hora pueden ir en el encabezado del bloque (Lega Volley: fecha, hora, sede y al final los equipos). Un partido nuevo o un cambio solo se acepta si en el texto de la fuente aparecen el rival y la fecha en la misma fila o bloque; si no, se descarta (o queda "Por revisar" si ya existía). Si la hora no aparece junto al rival, entra con hora por confirmar. "6 matchs à partir de 14:00" no cuenta como hora de un partido. Sin texto de la fuente (modo simulado) no se coteja.
- Un cambio de fecha, hora o rival a un partido que ya existe solo se aplica si la fuente es la liga, el club o Volleybox (en la Selección, la federación). Si no, queda como está y sale en el resumen como "Por revisar". Un partido nuevo entra con cualquier fuente válida. Lo que el agente no confirma se conserva.
- Plantilla: un alta necesita aparecer en una lista oficial (FMVB, NORCECA, FIVB/Volleyball World, Panam Sports, Centro Caribe Sports) de los últimos 12 meses. Una baja necesita anuncio explícito o 24 meses sin aparecer en listas oficiales (se calcula con `ultimaListaOficial.fecha`; si la fecha es `null`, nunca hay baja por inactividad). Faltar a un torneo nunca es baja.
- Nombres: el `slug` que propone el agente se acepta solo si el apellido coincide (comparado sin acentos ni mayúsculas). Si una lista trae solo apellidos, se fusiona cuando el apellido es único en la plantilla; si no, va a dudas del PR.
- Próximo torneo: solo vale si el texto de la fuente dice que México (mayor femenil) participa o clasificó (`evidenciaParticipacion`): México junto a un verbo de participación, y el torneo y la edición ahí mismo o en el título. Varonil, playa y categorías juveniles no cuentan.
- Torneos: máximo 7 por fecha de fin. El `id` sale del nombre canónico y la edición (`norceca-final-six-2026`, `campeonato-mundial-2025`). `scripts/lib/torneos.mjs` tiene el catálogo: "Mundial" y "World Championship" son el mismo torneo; "Copa del Mundo" es otra entrada. También son el mismo dos con la misma edición y fechas traslapadas, porque la Selección no juega dos torneos a la vez.
- Si un agente falla o su respuesta no valida, se conservan los datos anteriores y se avisa en el resumen.
- Fuentes oficiales para un alta: `fmvb.org`, `norceca.net`, `norceca.info`, `fivb.com`, `fivb.org`, `volleyballworld.com`, `panamsports.org`, `centrocaribesports.org`.
- Un torneo terminado sin fechas toma las que ya se conocen: el `proximoTorneo` que acaba de terminar, lo guardado en `torneos.json` o las `ediciones` del catálogo. Sin ninguna de esas, se descarta.
- Un torneo ya guardado no se pisa: el agente solo completa los campos vacíos. Un cambio de club con confianza baja va a dudas.
- Un partido de la Selección sin `zonaSede` la deja en `null`, aunque México juegue de local.

### Qué se guarda solo y qué se aprueba

- **Commit directo**: `partidos.json`, `rankings.json`, `seleccion.json`, `estado-agentes.json`.
- **Pull Request de revisión semanal** (rama `revision-semanal`, uno abierto a la vez; acumula lo de semanas anteriores: la corrida parte de la rama, después de integrarle `main`; si se cerró sin aprobar, parte de `main`): cambios en `jugadoras.json`, `clubes.json`, `ligas.json` y `torneos.json`. El cuerpo del PR resume altas, bajas, cambios de club, plataformas nuevas, torneos nuevos, datos de perfil y dudas, cada uno con su fuente. Un alta crea también `src/assets/fotos/jugadoras/<slug>/.gitkeep`. Se aprueba desde la app de GitHub en el celular.
- Lo que se guarda directo debe ser válido contra lo aprobado en `main` (`DIR_APROBADOS`): `partidos.json` no puede citar un club o una convocada que solo existen en el PR. Si no lo es, la corrida falla sin escribir. Por eso la rotación de los agentes 02 y 05 sale de `estado-agentes.json`, no de los `revisado` de `jugadoras.json` y `ligas.json`.
- Un alta entra como `propuesta` por el PR. Si la siguiente corrida la encuentra en `main`, el PR se aprobó y pasa a `activa`.
- Cuando se confirma el nombre de `ovalle` o `tanguma`, el agente actualiza `nombre` y avisa en dudas; renombrar `slug` y carpeta es a mano.
- El cuerpo del PR se escribe en `revision-semanal.md` (fuera del repo).
- Requisito: en el repo, Settings → Actions → General → *Allow GitHub Actions to create and approve pull requests*. Usar `peter-evans/create-pull-request`.

### Workflows

Ambos usan Node 24: `actions/setup-node` con `node-version-file: .nvmrc`.

- `actualizar.yml`: `schedule` lunes y jueves a las 06:17 de Tonalá (`17 12 * * 1` y `17 12 * * 4` en UTC) y `workflow_dispatch`, que deja elegir `lunes` o `jueves`. El jueves pone `SOLO_VERIFICAR=true`, parte de `main` y no toca el PR. Las programadas solo corren con la variable `CORRIDA_PROGRAMADA` en `true`; a mano siempre corre. Secretos `GEMINI_API_KEY` y `TAVILY_API_KEY`, variables `GEMINI_MODELOS`, `MAX_LLAMADAS` y `BUSQUEDA`. Después del commit, construye y despliega en el mismo workflow, llamando a `deploy.yml`: un push hecho con `GITHUB_TOKEN` no dispara otros workflows.
- `deploy.yml`: en push a `main` (por ejemplo al aprobar el PR), `astro build` y despliegue a Pages (`actions/upload-pages-artifact` + `actions/deploy-pages`; en Settings → Pages, fuente *GitHub Actions*). `site` y `base` están en `astro.config.mjs`: si cambia el nombre del repo, hay que cambiar `base`.

## Fases

0. Proyecto Astro, estructura y carpetas de fotos de la plantilla inicial (con `.gitkeep`). Migrar los datos de `v1/data/` al formato nuevo (`equipos.json` → `clubes.json` + `ligas.json`; `partidos.json` con `tipo: "club"` y `clubId`) y agregar lo de este documento. Migrar las utilidades del v1 a `scripts/lib/` y `src/lib/` con pruebas.
1. Inicio sin animaciones.
2. Perfil de jugadora.
3. Agenda (con filtros y Google Calendar).
4. Agentes en modo simulado + validación + pruebas.
5. Agentes reales + workflows + PR.
6. Animaciones y pulido.
7. Revisión: rendimiento móvil, accesibilidad, reduced motion.

## Plantilla inicial (carpetas de fotos)

Jugadoras que aparecen en al menos una lista oficial reciente: el Campeonato Mundial 2025 y el Final Four NORCECA 2026 (Ponce, junio). Número y posición son los del boletín oficial del Final Four 2026. La lista completa del Final Six 2026 (Zinacantepec, septiembre) no apareció publicada con nombres en las fuentes revisadas; el agente 01 la completa en su primera corrida.

| Carpeta (`slug`) | Nombre | # | Posición | Listas |
|---|---|---|---|---|
| `uxue-guereca` | Uxue Guereca | 1 | Atacante | Mundial 2025, Final Four 2026 |
| `samantha-bricio` | Samantha Bricio | 2 | Atacante | Mundial 2025, Final Four 2026 |
| `sofia-maldonado` | Sofía Maldonado | 3 | Atacante (en el v1 estaba como opuesta) | Mundial 2025, Final Four 2026, Final Six 2026 |
| `grecia-castro` | Grecia Castro | 6 | Atacante | Mundial 2025, Final Four 2026 |
| `argentina-ung` | Argentina Ung | 7 | Acomodadora | Mundial 2025, Final Four 2026 |
| `ovalle` | Ovalle (nombre por confirmar) | 8 | Opuesta | Final Four 2026 |
| `arleth-marquez` | Arleth Márquez | 10 | Central | Mundial 2025, Final Four 2026 |
| `jocelyn-urias` | Jocelyn Urías (capitana) | 11 | Central | Mundial 2025, Final Four 2026 |
| `joseline-landeros` | Joseline Landeros | 12 | Líbero | Mundial 2025, Final Four 2026 |
| `tanguma` | Tanguma (nombre por confirmar) | 13 | Central | Final Four 2026 |
| `paola-rivera` | Paola Rivera | 15 | Acomodadora | Mundial 2025, Final Four 2026 |
| `paulett-munoz` | Paulet Muñoz | 16 | Atacante en 2026; en 2025 aparecía como líbero (el agente 01 confirma que sea la misma Muñoz) | Mundial 2025, Final Four 2026 |
| `aime-topete` | Aime Topete | 20 | Atacante | Mundial 2025, Final Four 2026 |
| `karina-flores` | Karina Flores | 33 | Central | Mundial 2025, Final Four 2026 |
| `melanie-parra` | Melanie Parra | — | Atacante | Mundial 2025 |
| `ximena-solar` | Ximena Solar | — | Central | Mundial 2025 |

Nombres completos según el boletín: Uxue Amaya Guereca Parra, Sofía Maldonado Díaz, Grecia Esther Castro López, Gloria Argentina Ung Enríquez, Joseline Landeros Palacios, Karina Angélica Flores Gámez. Cuando se confirmen los nombres de `ovalle` y `tanguma`, renombrar carpeta y `slug`.
