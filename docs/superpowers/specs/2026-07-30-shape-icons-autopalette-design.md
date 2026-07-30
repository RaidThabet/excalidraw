# Shape Icons + Auto-Palette — Design

**Date:** 2026-07-30
**Status:** Approved (design)
**Target:** Personal fork / experiment

## Summary

Let generic Excalidraw shapes (rectangle, diamond, ellipse) carry a user-supplied
SVG icon rendered alongside their bound text, and auto-derive a color palette
(stroke, background, text) from that icon. Placement of the icon+text unit is
user-selectable among five anchor positions. Icon renders on the live canvas and
in PNG/SVG exports.

Because this is a personal fork, data lives on the existing `customData` escape
hatch — no formal element schema change, serialization version bump, or collab
reconciliation work.

## Non-goals

- No new element type. No schema migration / restore versioning.
- No collaboration reconciliation guarantees for the new data.
- No built-in icon library / picker (SVG is pasted or uploaded by the user).
- Not supported on arrows, lines, freedraw, images, frames, embeddables, text.

## Data Model

Stored on the three generic shapes via `customData`:

```ts
type ShapeIconPlacement =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type ShapeIconPalette = {
  stroke: string;      // hex
  background: string;  // hex
  text: string;        // hex, WCAG-contrast-checked against background
};

type ShapeIconData = {
  svg: string;                   // sanitized SVG markup
  placement: ShapeIconPlacement; // default "center"
  palette: ShapeIconPalette | null; // cached extraction result
};

// on the element:
customData?: { icon?: ShapeIconData }
```

Notes:
- `palette` is cached so we don't re-rasterize/re-extract on every render.
  Recomputed when the SVG changes.
- Only rectangle/diamond/ellipse read/write this. A helper
  `getShapeIcon(element)` returns `element.customData?.icon` only for those types
  (returns `undefined` otherwise) so render/panel code has one gate.

## Units / Boundaries

Keep each piece small and independently testable:

1. **`shapeIcon.ts`** (new, `packages/element/src/`) — pure helpers:
   - `getShapeIcon(element)` — typed accessor + type gate.
   - `isIconableElement(element)` — boolean for the three generic types.
   - `withShapeIcon(icon)` — build the `customData` patch object.
   - No DOM, no React. Unit-testable.

2. **`svgIcon.ts`** (new, `packages/excalidraw/data/` or `packages/utils`) —
   sanitize + palette extraction:
   - `sanitizeSvg(input: string): string | null` — DOMPurify with SVG profile;
     returns `null` if input isn't valid SVG after sanitization.
   - `extractPalette(svg: string): Promise<ShapeIconPalette>` — rasterize +
     dominant-color cluster + derive stroke/bg/text.
   - Depends on DOMPurify (**new dependency — must be added**; excalidraw
     currently ships only `@braintree/sanitize-url`, no HTML/SVG sanitizer) and
     an offscreen canvas.
   - The pure color math (`derivePalette(dominant): ShapeIconPalette`,
     `pickContrastText(bg): string`) is split out so it's testable without a
     real canvas.

3. **Canvas renderer hook** — in `drawElementOnCanvas`
   (`packages/element/src/renderElement.ts`): after the shape is drawn, if the
   element has an icon, draw it. Icon SVG → `Image` (data URL) → `drawImage` at
   the computed anchor rect. Cache the decoded `Image` per svg string to avoid
   re-decoding each frame (module-level `Map<string, HTMLImageElement>`).

4. **SVG export hook** — in `staticSvgScene.ts`: inline the sanitized SVG as a
   nested `<svg>`/`<image>` positioned at the same anchor rect so exports match
   the canvas.

5. **Placement + anchor geometry** — one shared function
   `getIconTextLayout(element)` returning the icon rect (x, y, w, h) and the
   `textAlign` / `verticalAlign` the bound text should use for a given
   `placement`. Both renderers and the panel use it — single source of truth so
   canvas and export never drift.

6. **Panel control** — React component in the right-hand properties panel,
   visible only when a single `isIconableElement` shape is selected:
   - SVG paste textarea + file picker (`.svg`).
   - Inline error (reuse the existing hex-input error styling) on invalid SVG.
   - 5-position placement picker.
   - "Remove icon" button.

## Data Flow

### Attaching an icon (auto-apply palette, undoable)

```
user pastes/uploads SVG
  -> sanitizeSvg(input)
       -> null? show inline error, stop
  -> extractPalette(cleanSvg)            (async: rasterize + cluster)
  -> mutateElement(shape, {
       customData: { ...customData, icon: {
         svg: cleanSvg,
         placement: existing ?? "center",
         palette,
       }},
       backgroundColor: palette.background,
       strokeColor: palette.stroke,
     })
  -> if bound text exists: mutate its strokeColor -> palette.text,
     and set textAlign/verticalAlign per placement
  -> all mutations captured as a SINGLE history entry (undo restores prior
     colors + prior/absent icon in one step)
```

### Changing placement

```
user picks a placement
  -> mutateElement(shape, { customData.icon.placement })
  -> update bound text textAlign/verticalAlign
  -> single history entry
```

### Rendering (canvas + export)

```
draw shape (existing) -> getShapeIcon(element)?
  -> getIconTextLayout(element) -> icon rect
  -> canvas: drawImage(cachedImage(svg), rect)
     export: inline <svg>/<image> at rect
```

## Placement / Anchor Geometry

`placement` positions the icon+text unit inside the shape's content box (shape
bounds minus a small padding):

| placement     | icon anchor            | text align / vAlign      |
|---------------|------------------------|--------------------------|
| center        | centered, above text   | center / middle          |
| top-left      | top-left corner        | left / top               |
| top-right     | top-right corner       | right / top              |
| bottom-left   | bottom-left corner     | left / bottom            |
| bottom-right  | bottom-right corner    | right / bottom           |

- Icon default size: `min(shapeWidth, shapeHeight) * 0.25`, clamped to
  `[16, 64]` px. Fixed aspect (square) — SVG scaled to fit, preserving ratio.
- Padding: 8px from the anchored edge(s).
- For `center`, icon sits directly above the text block, both centered as a
  group; for corners, icon hugs the corner and text aligns to the same corner.
- Bound text align is *driven by* placement (we set it on attach / placement
  change). The user can still manually override text align afterward; we don't
  fight that on every render — placement only writes align at the moment it
  changes.

## Auto-Palette Extraction

1. Wrap sanitized SVG in a data URL, load into an `Image`, `drawImage` onto a
   small offscreen canvas (e.g. 64x64).
2. `getImageData`, iterate pixels; skip alpha < 16 and near-white
   (all channels > 245) so the icon's own strokes dominate over transparent
   backgrounds.
3. Bucket remaining pixels into a coarse RGB histogram (e.g. 4 bits/channel);
   pick the modal bucket's average as the **dominant** color.
   - Fallback: if no qualifying pixels (e.g. all white/transparent), dominant =
     a neutral gray and we still produce a valid palette.
4. Derive:
   - `background` = dominant lightened toward white (~85% lightness in HSL).
   - `stroke` = dominant darkened (~45% lightness).
   - `text` = black or white, whichever has higher WCAG contrast ratio vs
     `background`.

Pure functions `derivePalette` and `pickContrastText` hold steps 4; steps 1–3
are the canvas-dependent part.

## Error Handling

- Invalid / empty SVG after sanitization → inline panel error, no mutation.
- Sanitizer removes `<script>`, event-handler attributes (`on*`), external refs
  (`href`/`xlink:href` to non-data URLs) → prevents stored-XSS via pasted SVG.
- `extractPalette` failure (decode error) → attach icon anyway with a neutral
  fallback palette; log a warning. Icon attach never hard-fails on color math.
- Rendering: if a stored svg fails to decode into an `Image`, skip drawing the
  icon (shape still renders normally).

## Security

Pasted SVG is untrusted input. Two render paths, two risk levels:

- **Canvas:** SVG loaded as an `Image` via data URL — browsers do not execute
  scripts in image-loaded SVG, so canvas is low-risk on its own.
- **Export:** the SVG is inlined into the exported SVG document. If that export
  is later opened standalone in a browser, embedded scripts/handlers WOULD run.
  This is the real XSS surface and why sanitization is mandatory.

Mitigation: add **DOMPurify** (new dependency) and sanitize with
`USE_PROFILES: { svg: true, svgFilters: true }`, stripping
scripts / event handlers (`on*`) / external references. Only the sanitized
string is ever stored, rendered, or exported. (Alternative if avoiding a new
dep is preferred: a manual `DOMParser`-based allowlist sanitizer — more code,
easier to get wrong; DOMPurify recommended.)

## Testing

Scoped light for a fork:

- `sanitizeSvg`: strips `<script>`, `onload=`, external `href`; keeps benign
  shapes; returns `null` on non-SVG.
- `derivePalette` / `pickContrastText`: known dominant color → expected
  bg/stroke; contrast picks black on light bg, white on dark bg.
- `extractPalette`: a known solid-color SVG → that color as dominant (runs in
  jsdom/canvas if available; otherwise gate behind env check).
- `getIconTextLayout`: each placement → expected align + anchor quadrant.

Skip: full canvas render snapshots, collaboration reconciliation, restore/schema
tests (out of scope for the fork).

## Files Touched

New:
- `packages/element/src/shapeIcon.ts`
- `packages/excalidraw/data/svgIcon.ts`
- panel component (e.g. `packages/excalidraw/components/ShapeIconControl.tsx`)
- test files alongside the above.

Modified:
- `packages/excalidraw/package.json` — add `dompurify` (+ `@types/dompurify`).
- `packages/element/src/types.ts` — `ShapeIconData` types (exported).
- `packages/element/src/renderElement.ts` — canvas icon draw.
- `packages/excalidraw/renderer/staticSvgScene.ts` — export icon draw.
- properties panel wiring (where per-selection controls are assembled).

## Open Questions

None blocking. Icon default size (25% clamped 16–64px) and 8px padding are
starting values, tunable during implementation.
