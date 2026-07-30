# Panel Admin — convenciones vigentes

> Complementa [`panel_admin_v1.md`](./panel_admin_v1.md) y [`panel_admin_v2.md`](./panel_admin_v2.md),
> que son las specs de lo que se construyó. Este documento es lo contrario: las reglas que hay
> que respetar al tocar `apps/admin/` de aquí en adelante. Si el código y este archivo se
> contradicen, gana el código — pero entonces corrige el archivo.

## Ciclo de render

`state` (`src/store.ts`) → `setState(patch)` → `render()` (`src/router.ts`) reconstruye el
`innerHTML` de `#app` completo. No hay diffing ni componentes: **el DOM es desechable**.

Consecuencias que se olvidan y cuestan un bug:

- Lo que el usuario escribió y no está en `state` se pierde en el siguiente `setState`. Los
  handlers que leen inputs (`readEditorForm`, `readNewsletterForm`, el prompt de imagen)
  tienen que leer **antes** de cualquier `setState`.
- No se agregan listeners a nodos concretos: se van con el próximo render. Todo va por
  delegación en `#app` (`src/main.ts`).

## Acciones: `data-action` + mapa de handlers

Los eventos se delegan una sola vez en `#app` y se resuelven por atributo:

- click → `clickHandlers` en `src/actions.ts` (`Record<accion, (el) => void>`).
- submit → `handleSubmit`; change → `handleChange`.

Agregar una acción = una entrada en el mapa, nunca un `if` nuevo en el delegador. Las
mutaciones con lógica propia viven en las funciones `submit*` del mismo archivo, no inline en
el mapa. El lookup usa `Object.hasOwn` a propósito: sin él, un `data-action="toString"`
resolvería contra `Object.prototype`.

## Badges y estados

Un solo mapa `STATUS_STYLE_MAP` + `STATUS_LABEL` en `src/util.ts` alimenta `statusStyle()` y
`badge(key, label?)`. Toda pastilla de estado sale de ahí. No volver a escribir
`style="background:var(--brand-soft);color:var(--brand)"` en una pantalla: si falta un estado,
se agrega al mapa.

Igual con los chips: `.padmin-chip` + `.active` / `.active-accent` en `styles/panel.css`, no
colores inline según el flag de activo.

## Semántica y accesibilidad

Estas tres son las que ya se rompieron una vez:

1. **`<button type="button">` antes que `<span role="button" tabindex="0">`.** Si el contenido
   es solo un ícono/SVG, lleva `aria-label`; si tiene estado, `aria-pressed` o `aria-expanded`
   (ver la campana y el toggle de sonido en `src/shell.ts`).
2. **Nunca `role="button"` en un contenedor que lleva controles dentro.** Los descendientes de
   `role="button"` son presentacionales: los botones internos de la fila desaparecen para el
   lector de pantalla. El patrón correcto está en `pickerRow` (`screens/editor.ts`) y en la fila
   de temas (`screens/radar.ts`): la fila conserva el click por comodidad de ratón, sin `role`
   ni `tabindex`, y un hijo (`<button>` o `<a>`) es la entrada por teclado. `role="button"` solo
   en filas de puro texto, como las del dashboard, que sí las activa el handler de
   Enter/Espacio de `src/main.ts`.
3. **Overlays cerrables por teclado.** Escape cierra la capa de arriba, y lo hace clickeando el
   `.padmin-overlay-bg` del último overlay, que ya trae el `data-action` de cierre — un modal
   nuevo no necesita registrar nada. Sin overlay abierto, Escape cierra el panel de
   notificaciones, que además se cierra al clickear fuera de `.padmin-bell-wrap`.

El foco visible es global (`.padmin button:focus-visible, .padmin [data-action]:focus-visible`).
No anularlo con `outline: none`.

## Móvil y PWA

El panel se instala como PWA y la mayoría del uso editorial es en teléfono:

- `100dvh` después de `100vh` (fallback por cascada) para la toolbar dinámica de iOS Safari.
- `viewport-fit=cover` + `env(safe-area-inset-bottom)` donde algo se pegue al borde inferior.
- Inputs a `16px` en móvil: por debajo de eso iOS hace auto-zoom al enfocar.
- Targets táctiles ~36px (techo conocido y documentado en el CSS: no son los 44px de la HIG
  para no reventar las filas de filtros).
- Tablas anchas: `min-width` + columnas en una clase `padmin-cols-*`, nunca
  `grid-template-columns` inline, y la sombra de `.padmin-card` avisa que hay scroll lateral.

## Check

`apps/api/scripts/check-admin-panel.js` (grupo `unit` de `run-checks.js`) carga el grafo real
de módulos con stubs de DOM, renderiza todas las pantallas y afirma que ninguna imprime
`undefined`. Atrapa imports rotos y campos mal nombrados sin navegador ni Postgres. Una
pantalla nueva se agrega a su lista de `screens`; lógica de cierre/teclado nueva, a sus asserts.

Validación completa de un cambio en el panel:

```bash
cd apps/admin && npx tsc --noEmit && npm test && npm run build
cd ../api && node scripts/run-checks.js unit
```
