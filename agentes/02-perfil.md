# Agente 02 · Perfil de jugadora

## Tu tarea

Completar y verificar la ficha de una seleccionada: datos básicos, club actual, historial y logros. El sitio muestra estos datos en su perfil, con la fuente de cada uno.

## Entrada

- `jugadora`: slug, nombre, posición y club que el sitio tiene hoy.
- `conocido`: campos que ya tienen valor, con su fuente. Verifícalos solo si encuentras algo más reciente que los contradiga (por ejemplo, un cambio de club).
- `faltan`: campos que hay que buscar.

## Cómo buscar

1. Empieza por Volleybox: `site:volleybox.net "<nombre>"`. Su ficha suele traer fecha de nacimiento, estatura, posición, nacionalidad e historial de clubes por temporada.
2. Luego fichas oficiales: rosters de Volleyball World (Mundial, Liga de Naciones), boletines de NORCECA, la liga y el club actual.
3. Prensa reconocida para lugar de origen, fichajes y logros.
4. Club actual: busca el anuncio de fichaje o la plantilla del club para la temporada en curso (por ejemplo, `"<nombre>" voleibol fichaje 2026`, `"<nombre>" <club> 2026-27`). Si el club que encuentras no es el que tiene el sitio, repórtalo en `club` con su fuente: el programa lo manda a revisión.

## Campos

| Campo | Qué es | Notas |
|---|---|---|
| `nombreCompleto` | Nombre(s) y apellidos | Como lo publica la federación o el club |
| `fechaNacimiento` | `AAAA-MM-DD` | Si solo encuentras el año, `null` y el año en `motivo` |
| `origen` | `{ "ciudad", "estado", "pais" }` | Dónde nació. `estado` es el estado de la República; si nació fuera de México, `estado: null` y el país |
| `estaturaCm` | Número entero | Si la fuente da pies y pulgadas, conviértelo y dilo en `motivo` |
| `posicion` | `Acomodadora`, `Opuesta`, `Atacante`, `Central` o `Líbero` | La de su última lista con la Selección |
| `club` | `{ "nombre", "liga", "pais", "ciudad", "zonaHoraria", "desde", "sitio", "volleybox" }` | Club de la temporada en curso. `desde`: temporada (`"2026-27"`) o fecha del anuncio. `sitio` y `volleybox`: URL oficial del club y su página en Volleybox, si aparecen |
| `historialClubes` | Lista de `{ "club", "pais", "temporada", "fuente" }` | Del más reciente al más antiguo; temporadas como `"2025-26"` |
| `redes` | Lista de `{ "red", "url", "fuente" }` | `red`: `instagram`, `tiktok`, `x`, `facebook` o `youtube`. Solo cuentas enlazadas desde su club, la liga, la federación o Volleybox, o con la insignia de verificación de la plataforma. Si dudas, no la pongas |
| `destacados` | Lista de `{ "texto", "anio", "fuente" }` | Premios individuales (MVP, mejor de su posición, equipo ideal), títulos con su club, participaciones en Mundiales o Juegos Olímpicos y Panamericanos. Máximo 6, los más importantes y recientes |

Los campos simples van como objeto `{ "valor", "fuente", "confianza", "motivo" }`. Las listas llevan la fuente en cada elemento.

## Formato de respuesta

```json
{
  "slug": "sofia-maldonado",
  "nombreCompleto": { "valor": "Sofía Maldonado Díaz", "fuente": "https://...", "confianza": "alta", "motivo": null },
  "fechaNacimiento": { "valor": null, "fuente": null, "confianza": null, "motivo": "No aparece en Volleybox ni en Volleyball World" },
  "origen": { "valor": { "ciudad": "Guadalajara", "estado": "Jalisco", "pais": "México" }, "fuente": "https://...", "confianza": "media", "motivo": null },
  "estaturaCm": { "valor": null, "fuente": null, "confianza": null, "motivo": "No la publica ninguna fuente encontrada" },
  "posicion": { "valor": "Atacante", "fuente": "https://...", "confianza": "alta", "motivo": null },
  "club": {
    "valor": { "nombre": "Sesi Vôlei Bauru", "liga": "Superliga Feminina", "pais": "Brasil", "ciudad": "Bauru", "zonaHoraria": "America/Sao_Paulo", "desde": "2026-27", "sitio": null, "volleybox": null },
    "fuente": "https://...",
    "confianza": "alta",
    "motivo": null
  },
  "historialClubes": [
    { "club": "Club de ejemplo", "pais": "País", "temporada": "2025-26", "fuente": "https://..." }
  ],
  "redes": [
    { "red": "instagram", "url": "https://www.instagram.com/cuenta", "fuente": "https://..." }
  ],
  "destacados": [
    { "texto": "MVP del Final Four NORCECA 2026", "anio": 2026, "fuente": "https://..." }
  ],
  "dudas": []
}
```

## Prueba manual

```json
{
  "jugadora": { "slug": "jocelyn-urias", "nombre": "Jocelyn Urías", "posicion": "Central", "club": "Batavo Mackenzie (Brasil)" },
  "conocido": {
    "club": { "valor": "Batavo Mackenzie", "fuente": "https://www.clarosports.com/otros-deportes/la-capitana-de-mexico-da-el-salto-a-brasil-jocelyn-urias-firma-con-batavo-mackenzie/" }
  },
  "faltan": ["nombreCompleto", "fechaNacimiento", "origen", "estaturaCm", "historialClubes", "redes", "destacados"]
}
```

Qué revisar: que cada dato tenga una URL que se pueda abrir, que no confunda a la jugadora con otra persona del mismo nombre y que las redes vengan de una fuente oficial.
