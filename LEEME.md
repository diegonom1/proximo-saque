# Próximo Saque v2 · Kit para Claude Code

## Qué trae

- `CLAUDE.md`: el plan completo. Claude Code lo lee solo al abrir la carpeta.
- `agentes/`: las instrucciones de cada agente de IA y cómo probarlas en AI Studio.
- `v1/`: el sitio que ya tienen, para que Claude Code reutilice su código y sus datos.

## Cómo arrancar

1. Descompriman esta carpeta donde vayan a trabajar.
2. Ábranla con Claude Code (app de escritorio o terminal). Si usan Claude Code en la web, primero súbanla a un repositorio nuevo de GitHub.
3. Vayan fase por fase. Al terminar cada una, pídanle que les muestre cómo se ve antes de seguir.

| Fase | Mensaje para Claude Code |
|---|---|
| 0 | Lee CLAUDE.md y haz la fase 0. Al terminar, dime qué carpetas de fotos creaste. |
| 1 | Haz la fase 1: el inicio, sin animaciones. |
| 2 | Haz la fase 2: el perfil de jugadora. |
| 3 | Haz la fase 3: la agenda. |
| 4 | Haz la fase 4: los agentes en modo simulado, con pruebas. |
| 5 | Haz la fase 5 y dime paso a paso qué tengo que configurar en GitHub. |
| 6 | Haz la fase 6: las animaciones. |
| 7 | Haz la fase 7 y dame el resultado de Lighthouse en celular. |

## Fotos

Dejen las fotos tal cual en `fotos-originales/<slug>/` (cualquier nombre y formato, incluso HEIC del iPhone) y las de la Selección en `fotos-originales/seleccion/`. El `slug` es el nombre de la carpeta de cada jugadora en `src/assets/fotos/jugadoras/`. Luego corran:

```
npm run fotos
```

La primera vez crea un entorno de Python y descarga el modelo de recorte (cerca de 1 GB), así que tarda unos minutos. Después solo procesa las fotos que cambiaron. Necesita 10 GB de memoria disponibles: si no los hay, avisa y no carga el modelo, así que cierren Chrome y vuelvan a correrlo.

Genera en `src/assets/fotos/`:

- `tarjeta.jpg`: retrato vertical 4:5 con la cara en la parte de arriba.
- `fondo.jpg`: foto grande para el perfil.
- `recorte.png`: la jugadora sin fondo, para el efecto de profundidad.
- `hero.jpg` y `hero-movil.jpg`: para la portada, en `seleccion/`.
- `credito.txt`: lo crea vacío. Escriban de quién es la foto, por ejemplo `Foto: FMVB — https://...`. **Sin crédito la foto no se publica**: en `npm run dev` se ve, pero en el sitio real sale con iniciales.

El script muestra el avance y cuánto tardó cada foto. Al terminar, abran `fotos-originales/vista-previa.jpg` y lean los avisos: dicen si una foto quedó con poca resolución y si falta un crédito. Revisen sobre todo el cabello y que no se haya comido el balón.

| Comando | Qué hace |
|---|---|
| `npm run fotos` | Procesa lo que cambió, con un solo modelo. |
| `npm run fotos -- --comparar` | Recorta con los dos modelos y los pone lado a lado en la hoja. Tarda el doble. |
| `npm run fotos -- --solo <slug>` | Procesa solo esa carpeta. |
| `npm run fotos -- --forzar` | Vuelve a procesar aunque nada haya cambiado. |
| `npm run fotos -- --help` | Muestra estas opciones. |

Se pueden combinar: `npm run fotos -- --comparar --solo samantha-bricio`.

El recorte usa `birefnet-general`. Para cambiarlo en una jugadora, creen `fotos-originales/<slug>/modelo.txt` con la palabra `portrait` (o `general`) y corran `npm run fotos`: recorta esa foto sola, sin `--forzar`.

- Si una carpeta trae varias fotos, el script usa la más vertical para la tarjeta y la más horizontal para el fondo. Para elegir ustedes, pongan `tarjeta`, `fondo` o `recorte` en el nombre del archivo.
- El script no quita marcas de agua, pero un recorte puede dejar fuera una que esté en la orilla. Respeten los permisos de cada foto.
- Si no tienen todas las fotos, no pasa nada: el sitio pone iniciales y número mientras tanto.

## Probar los agentes sin gastar llamadas

```
npm run agentes:simulado
```

Corre todo el proceso con respuestas guardadas en `scripts/pruebas/` y muestra qué encontró y qué descartó, sin escribir nada en `data/`.

## Antes de la fase 5

- Saquen una clave gratis de la API de Gemini en [Google AI Studio](https://aistudio.google.com/). Es aparte de su plan de estudiante.
- Prueben los agentes en AI Studio con las instrucciones de `agentes/README.md`.
