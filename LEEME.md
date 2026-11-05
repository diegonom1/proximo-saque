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

Después de la fase 0 habrá una carpeta por jugadora en `public/fotos/jugadoras/`. En cada una van:

- `tarjeta.jpg`: retrato vertical 4:5 (mínimo 1000 × 1250), con la cara en la parte de arriba.
- `fondo.jpg`: foto horizontal grande (mínimo 2000 px de ancho), con la jugadora hacia un lado.
- `recorte.png` (opcional): la jugadora sin fondo, para el efecto de profundidad.
- `credito.txt`: de quién es la foto, por ejemplo `Foto: FMVB — https://...`.

En `public/fotos/seleccion/` van `hero.jpg` (horizontal, 2400 px de ancho) y `hero-movil.jpg` (vertical, 1080 × 1920).

Si no tienen todas, no pasa nada: el sitio pone iniciales y número mientras tanto. También pueden darle las fotos a Claude Code tal cual y pedirle: "Acomódalas y recórtalas según CLAUDE.md".

## Antes de la fase 5

- Saquen una clave gratis de la API de Gemini en [Google AI Studio](https://aistudio.google.com/). Es aparte de su plan de estudiante.
- Prueben los agentes en AI Studio con las instrucciones de `agentes/README.md`.
