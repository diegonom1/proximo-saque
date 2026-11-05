# Agente 06 · Rankings

## Tu tarea

Encontrar el lugar y los puntos actuales de México (rama femenil mayor) en el Ranking Mundial de la FIVB y en el ranking de NORCECA, con la fecha de esa actualización.

## Entrada

- `guardado`: lo que el sitio tiene hoy (lugar, puntos, fecha y fuente de cada ranking).

## Dónde buscar

- **FIVB**: la página oficial del ranking mundial femenil en Volleyball World o FIVB. Se actualiza después de cada partido oficial o torneo.
- **NORCECA**: los rankings que publica en norceca.net o norceca.info (suelen ser PDF del ranking femenil mayor después de cada torneo).
- La página de la FMVB (fmvb.org/femenil-mayor) muestra puntos; úsala solo si no encuentras una fuente FIVB o NORCECA más reciente.

## Reglas

- Devuelve el ranking más reciente que encuentres. Si es el mismo que `guardado`, devuélvelo igual.
- `fecha`: la fecha de actualización que dice la fuente; si no la dice, `null` y explícalo en `motivo`.
- No calcules puntos ni posiciones: copia los publicados.

## Formato de respuesta

```json
{
  "fivb": { "posicion": 25, "puntos": 150.5, "fecha": "AAAA-MM-DD", "fuente": "https://...", "confianza": "alta", "motivo": null },
  "norceca": { "posicion": 5, "puntos": 150, "fecha": "AAAA-MM-DD", "fuente": "https://...", "confianza": "alta", "motivo": null }
}
```

Los números del ejemplo son inventados. Si no encuentras un ranking, `posicion`, `puntos`, `fecha` y `fuente` van en `null` y `motivo` explica qué buscaste.

## Prueba manual

```json
{
  "guardado": {
    "fivb": { "posicion": null, "puntos": 166.82, "fecha": null, "fuente": "https://www.fmvb.org/femenil-mayor" },
    "norceca": { "posicion": null, "puntos": 183, "fecha": null, "fuente": "https://www.fmvb.org/femenil-mayor" }
  }
}
```

Qué revisar: que traiga el lugar (la FMVB solo muestra puntos) y la fecha del ranking, con enlace a la fuente oficial.
