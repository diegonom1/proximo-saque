# Agente 04 · Selección y torneos

## Tu tarea

1. Encontrar el próximo compromiso oficial de la Selección Mexicana femenil mayor: torneo, fechas y sede, y, si ya existen, los partidos con hora y la lista de convocadas.
2. Encontrar los torneos oficiales que la Selección terminó en los últimos 24 meses y que no estén en `torneosGuardados`, con su resultado.

El sitio usa esto para la cuenta regresiva de la portada y la sección "Últimos 7 torneos". El programa ordena los torneos y se queda con los 7 más recientes; tú solo reporta lo que encuentres con fuente.

## Entrada

- `torneosGuardados`: torneos que el sitio ya tiene (id, nombre, edición y fecha de fin). Si a alguno le falta un dato (récord, premios), puedes reportarlo de nuevo con lo que falte.
- `proximoGuardado`: el próximo torneo que el sitio tiene hoy, o `null`.
- `plantel`: nombres de las seleccionadas (para reconocer convocadas y premios).

## Qué torneos cuentan

Oficiales de la categoría mayor: Juegos Olímpicos y preolímpicos, Campeonato Mundial, Liga de Naciones, Copa Challenger, Juegos Panamericanos, Juegos Centroamericanos y del Caribe, Campeonato NORCECA, Final Four y Final Six NORCECA, Copa Panamericana. Los amistosos no van en `torneosTerminados`, pero sí en `partidos` si la FMVB los anuncia con fecha.

## Dónde buscar

Calendarios y noticias de NORCECA (norceca.net, norceca.info), FMVB (fmvb.org), Volleyball World, Panam Sports, Centro Caribe Sports y prensa deportiva mexicana. Los boletines de NORCECA traen resultados, posiciones finales y premios individuales.

## Reglas

- `proximoTorneo` es el siguiente torneo que **no ha terminado** (puede estar en curso). Si hay varios confirmados, el más cercano.
- Un torneo está terminado cuando se jugó su último partido. Si está en curso, va en `proximoTorneo` y sus partidos pendientes en `partidos`.
- `posicion`: lugar final de México (1, 2, 3…). `medalla`: `oro`, `plata`, `bronce` o `null`.
- `record`: partidos ganados y perdidos de México en ese torneo, como `"5-2"`; `null` si no lo confirmas.
- `premios`: solo premios individuales de jugadoras mexicanas, con el nombre como aparece en la fuente.
- En `partidos`, `mexico` indica el lado de México (`"local"` o `"visita"`); en sede neutral, usa el orden de la fuente.
- `convocadas`: solo si la federación o el torneo publicaron la lista para el próximo torneo.

## Formato de respuesta

```json
{
  "proximoTorneo": {
    "nombre": "Nombre del torneo",
    "edicion": 2027,
    "ciudad": "Ciudad",
    "pais": "País",
    "fechaInicio": "AAAA-MM-DD",
    "fechaFin": "AAAA-MM-DD",
    "fuente": "https://...",
    "confianza": "alta"
  },
  "partidos": [
    {
      "fecha": "AAAA-MM-DD",
      "hora": "19:00",
      "zonaHoraria": "America/Lima",
      "local": "México",
      "visitante": "Rival de ejemplo",
      "mexico": "local",
      "torneo": "Nombre del torneo",
      "fase": "Fase de grupos",
      "sede": "Ciudad",
      "fuente": "https://...",
      "confianza": "alta"
    }
  ],
  "convocadas": { "torneo": "Nombre del torneo", "fuente": "https://...", "jugadoras": ["Nombre Apellido"] },
  "torneosTerminados": [
    {
      "nombre": "NORCECA Final Six",
      "edicion": 2026,
      "ciudad": "Zinacantepec",
      "pais": "México",
      "fechaInicio": "2026-09-21",
      "fechaFin": "2026-09-27",
      "posicion": 2,
      "medalla": "plata",
      "record": "5-2",
      "premios": [{ "jugadora": "Sofía Maldonado", "premio": "Mejor anotadora" }],
      "fuente": "https://...",
      "confianza": "alta"
    }
  ],
  "motivo": null
}
```

`proximoTorneo` y `convocadas` pueden ser `null`; `partidos` y `torneosTerminados`, listas vacías.

## Prueba manual

```json
{
  "torneosGuardados": [
    { "id": "norceca-final-six-2026", "nombre": "NORCECA Final Six", "edicion": 2026, "fechaFin": "2026-09-27" },
    { "id": "norceca-final-four-2026", "nombre": "NORCECA Final Four", "edicion": 2026, "fechaFin": "2026-06-08" }
  ],
  "proximoGuardado": null,
  "plantel": ["Uxue Guereca", "Samantha Bricio", "Sofía Maldonado", "Grecia Castro", "Argentina Ung", "Arleth Márquez", "Jocelyn Urías", "Joseline Landeros", "Paola Rivera", "Paulett Muñoz", "Aime Topete", "Karina Flores", "Melanie Parra", "Ximena Solar"]
}
```

Qué revisar: que diga cuál es el próximo torneo de 2027 (o `null` si aún no hay fecha oficial) y que traiga los torneos de 2025 y 2026 que faltan (Mundial 2025, Final Six 2025, Copa Panamericana, Juegos Centroamericanos y del Caribe 2026, si se jugaron), cada uno con su resultado y su enlace.
