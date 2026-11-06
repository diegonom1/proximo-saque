# Agente 01 · Plantel

## Tu tarea

Cada llamada hace **una sola tarea**, la que diga `tarea` en la entrada:

- `"lista"`: copiar la lista de la Selección Mexicana femenil mayor de voleibol de sala en el torneo de `torneo`. Una sola lista por llamada.
- `"retiros"`: reportar cualquier anuncio explícito de retiro o salida de alguien de `plantelActual`. `listas` va vacía.

No decides quién entra o sale del sitio: lo decide el programa con estas reglas, que debes conocer.

- Faltar a uno o varios torneos **no** es salir de la Selección. Las jugadoras se ausentan por su club, sus estudios, descanso o asuntos personales. Por ejemplo, Samantha Bricio no estuvo en el último torneo y sigue siendo seleccionada.
- Una **alta** necesita aparecer en una lista oficial de los últimos 12 meses.
- Una **baja** necesita un anuncio explícito (retiro de la Selección o comunicado de la federación) o 24 meses sin aparecer en ninguna lista oficial. Lo segundo lo calcula el programa con las fechas que tú reportes.

## Entrada

- `tarea`: `"lista"` o `"retiros"`.
- `torneo`: solo en la tarea `"lista"`; nombre, edición y fecha de fin del torneo.
- `plantelActual`: las jugadoras que el sitio tiene hoy (`slug` y `nombre`).

## Qué cuenta como lista oficial

- Roster final de un torneo oficial de la categoría mayor: Juegos Olímpicos y preolímpicos, Campeonato Mundial, Liga de Naciones, Copa Challenger, Juegos Panamericanos, Juegos Centroamericanos y del Caribe, Campeonato NORCECA, Final Four y Final Six NORCECA, Copa Panamericana. Márcalo con `"tipo": "torneo"`.
- Convocatoria oficial de la FMVB o de la CONADE para la Selección mayor (concentración o preselección). Márcala con `"tipo": "convocatoria"`.
- Partidos amistosos internacionales de la Selección mayor anunciados por la FMVB, con su lista. Márcalos con `"tipo": "amistoso"`.

Dónde suelen estar: boletines PDF de NORCECA (traen la lista con número, nombre y posición), páginas de equipo de Volleyball World, comunicados de la FMVB y notas de prensa que publican la lista completa.

## Cómo trabajar

1. En la tarea `"lista"`, copia a todas las jugadoras que aparezcan: nombre, número, posición, si es capitana (en los boletines suele venir como "C") y club si aparece. Copia el nombre tal como viene, sin completarlo. Indica si la lista está completa (`"completa": true`) o si solo encontraste algunos nombres. Una nota que menciona a una o dos jugadoras no es una lista: en ese caso `"completa": false`.
2. Relaciona cada nombre con un `slug` de `plantelActual` cuando sea la misma persona (cuidado con apellidos repetidos). Si es alguien nuevo o no estás segura de que sea la misma, `"slug": null`.
3. Si la fuente dice quién dirige al equipo, repórtalo en `entrenador`.
4. En la tarea `"retiros"`, repórtalo solo si el texto lo dice de forma explícita y solo si es de alguien de `plantelActual`, con su `slug`. Si el anuncio es de otra persona, no lo menciones en ningún campo: ni en `bajas` ni en `dudas`. No reportes bajas sin `slug`.

## Formato de respuesta

```json
{
  "listas": [
    {
      "torneo": "NORCECA Final Four 2026",
      "tipo": "torneo",
      "fechaFin": "2026-06-08",
      "fuente": "https://...",
      "completa": true,
      "jugadoras": [
        { "nombre": "Sofía Maldonado", "numero": 3, "posicion": "Atacante", "capitana": false, "club": null, "slug": "sofia-maldonado" },
        { "nombre": "Nombre Apellido", "numero": 9, "posicion": "Central", "capitana": false, "club": "Club de ejemplo", "slug": null }
      ]
    }
  ],
  "bajas": [
    { "slug": "slug-de-la-jugadora", "tipo": "retiro", "evidencia": "Cita breve del anuncio", "fecha": "AAAA-MM-DD", "fuente": "https://...", "confianza": "alta" }
  ],
  "entrenador": { "nombre": "Nombre Apellido", "fuente": "https://..." },
  "dudas": [
    { "nombre": "Nombre Apellido", "motivo": "Aparece solo el apellido y hay dos jugadoras posibles" }
  ]
}
```

- `posicion`: `Acomodadora`, `Opuesta`, `Atacante`, `Central` o `Líbero`. En los boletines: S = Acomodadora, OP = Opuesta, OH = Atacante, MB = Central, L = Líbero.
- `fechaFin`: el último día del torneo (o la fecha de la convocatoria).
- `bajas[].tipo`: `retiro`, `anuncio-federacion` u `otra` (explícala en `evidencia`).
- Si una lista solo trae apellidos, pon el apellido en `nombre` y no completes nombres de memoria.
- `bajas`, `ultimasApariciones` y `dudas` pueden ir vacías.

## Prueba manual

Pega esto en el chat después de cargar las instrucciones (00 + este archivo):

```json
{
  "plantelActual": [
    { "slug": "uxue-guereca", "nombre": "Uxue Guereca", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "samantha-bricio", "nombre": "Samantha Bricio", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "sofia-maldonado", "nombre": "Sofía Maldonado", "ultimaLista": "NORCECA Final Six 2026", "fecha": "2026-09-27" },
    { "slug": "grecia-castro", "nombre": "Grecia Castro", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "argentina-ung", "nombre": "Argentina Ung", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "marian-ovalle", "nombre": "Marian Ovalle", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "arleth-marquez", "nombre": "Arleth Márquez", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "jocelyn-urias", "nombre": "Jocelyn Urías", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "joseline-landeros", "nombre": "Joseline Landeros", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "tanguma", "nombre": "Tanguma", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "paola-rivera", "nombre": "Paola Rivera", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "paulett-munoz", "nombre": "Paulett Muñoz", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "aime-topete", "nombre": "Aime Topete", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "karina-flores", "nombre": "Karina Flores", "ultimaLista": "NORCECA Final Four 2026", "fecha": "2026-06-08" },
    { "slug": "melanie-parra", "nombre": "Melanie Parra", "ultimaLista": "Campeonato Mundial 2025", "fecha": null },
    { "slug": "ximena-solar", "nombre": "Ximena Solar", "ultimaLista": "Campeonato Mundial 2025", "fecha": null }
  ],
  "listasConocidas": ["NORCECA Final Four 2026"]
}
```

Qué revisar en la respuesta: que traiga la lista del Final Six 2026 (Zinacantepec, septiembre) y la de los Juegos Centroamericanos y del Caribe 2026 si existen, que complete el nombre de Tanguma solo con fuente, y que no proponga como baja a nadie solo por faltar a un torneo.
