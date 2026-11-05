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

La primera vez crea un entorno de Python y descarga el modelo de recorte (cerca de 1 GB), así que tarda unos minutos. Después solo procesa las fotos que cambiaron. Necesita 6 GB de memoria disponibles: si no los hay, avisa y no carga el modelo, así que cierren Chrome y vuelvan a correrlo.

Genera en `src/assets/fotos/`:

- `tarjeta.jpg`: retrato vertical 4:5 con la cara en la parte de arriba.
- `fondo.jpg`: foto grande para el perfil.
- `recorte.png`: la jugadora sin fondo, para el efecto de profundidad.
- `hero.jpg` y `hero-movil.jpg`: para la portada, en `seleccion/`.
- `credito.txt`: lo crea vacío. Escriban de quién es la foto, por ejemplo `Foto: FMVB — https://...`.

Al terminar, abran `fotos-originales/vista-previa.jpg` y lean los avisos: dicen si una foto quedó con poca resolución y si falta un crédito. La hoja muestra los dos recortes de cada jugadora lado a lado. Revisen sobre todo el cabello y que no se haya comido el balón.

Para cambiar de recorte, creen `fotos-originales/<slug>/modelo.txt` con la palabra `general` (o `portrait`) y corran `npm run fotos` otra vez; tarda un segundo.

- Si una carpeta trae varias fotos, el script usa la más vertical para la tarjeta y la más horizontal para el fondo. Para elegir ustedes, pongan `tarjeta`, `fondo` o `recorte` en el nombre del archivo.
- El script no quita marcas de agua, pero un recorte puede dejar fuera una que esté en la orilla. Respeten los permisos de cada foto.
- Si no tienen todas las fotos, no pasa nada: el sitio pone iniciales y número mientras tanto.

## Antes de la fase 5

- Saquen una clave gratis de la API de Gemini en [Google AI Studio](https://aistudio.google.com/). Es aparte de su plan de estudiante.
- Prueben los agentes en AI Studio con las instrucciones de `agentes/README.md`.
