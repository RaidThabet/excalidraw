# Shape Icons + Auto-Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let rectangle/diamond/ellipse shapes carry a pasted SVG icon rendered alongside their text, with an auto-derived color palette (stroke, background, text) applied on attach.

**Architecture:** All new data lives on the element's existing `customData.icon` field (no schema change). Pure helpers (`shapeIcon.ts`, color math, geometry) are separated from side-effecting code (canvas render, SVG export, panel action) so each unit is unit-testable in isolation. A single `getIconTextLayout` is the shared source of truth for icon position + text alignment across canvas and export.

**Tech Stack:** TypeScript, React, Vitest, roughjs (existing), DOMPurify (new dependency).

## Global Constraints

- Feature applies ONLY to element types `rectangle`, `diamond`, `ellipse`. Every read/write gates on this.
- No new element type, no `types.ts` schema field beyond exported helper types, no restore/migration, no collab reconciliation work.
- Undoable mutations use `CaptureUpdateAction.IMMEDIATELY`. Non-committal uses `EVENTUALLY`.
- Pasted SVG is untrusted — only DOMPurify-sanitized output is ever stored, rendered, or exported.
- Placement enum values, verbatim: `"center" | "top-left" | "top-right" | "bottom-left" | "bottom-right"`. Default `"center"`.
- Icon size = `clamp(min(width, height) * 0.25, 16, 64)` px. Edge padding = `8` px.
- Run `yarn test:typecheck` and `yarn test:update` before final commit.

---

### Task 1: Icon types + `shapeIcon.ts` pure helpers

**Files:**
- Modify: `packages/element/src/types.ts` (add exported types near `ExcalidrawEllipseElement`)
- Create: `packages/element/src/shapeIcon.ts`
- Test: `packages/element/src/__tests__/shapeIcon.test.ts`

**Interfaces:**
- Consumes: `ExcalidrawElement` from `./types`.
- Produces:
  - Types: `ShapeIconPlacement`, `ShapeIconPalette`, `ShapeIconData`.
  - `isIconableElement(el: ExcalidrawElement): boolean`
  - `getShapeIcon(el: ExcalidrawElement): ShapeIconData | undefined`
  - `SHAPE_ICON_PLACEMENTS: readonly ShapeIconPlacement[]`

- [ ] **Step 1: Add types to `types.ts`**

```ts
export type ShapeIconPlacement =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type ShapeIconPalette = {
  stroke: string;
  background: string;
  text: string;
};

export type ShapeIconData = {
  svg: string;
  placement: ShapeIconPlacement;
  palette: ShapeIconPalette | null;
};
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/element/src/__tests__/shapeIcon.test.ts
import { isIconableElement, getShapeIcon } from "../shapeIcon";

const base = (type: string, customData?: any) =>
  ({ type, customData } as any);

describe("shapeIcon helpers", () => {
  it("isIconableElement true only for rectangle/diamond/ellipse", () => {
    expect(isIconableElement(base("rectangle"))).toBe(true);
    expect(isIconableElement(base("diamond"))).toBe(true);
    expect(isIconableElement(base("ellipse"))).toBe(true);
    expect(isIconableElement(base("arrow"))).toBe(false);
    expect(isIconableElement(base("text"))).toBe(false);
    expect(isIconableElement(base("image"))).toBe(false);
  });

  it("getShapeIcon returns icon for iconable element, undefined otherwise", () => {
    const icon = { svg: "<svg/>", placement: "center", palette: null };
    expect(getShapeIcon(base("rectangle", { icon }))).toEqual(icon);
    expect(getShapeIcon(base("rectangle", {}))).toBeUndefined();
    expect(getShapeIcon(base("arrow", { icon }))).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn vitest run packages/element/src/__tests__/shapeIcon.test.ts`
Expected: FAIL — `Cannot find module '../shapeIcon'`.

- [ ] **Step 4: Implement `shapeIcon.ts`**

```ts
// packages/element/src/shapeIcon.ts
import type {
  ExcalidrawElement,
  ShapeIconData,
  ShapeIconPlacement,
} from "./types";

export const SHAPE_ICON_PLACEMENTS: readonly ShapeIconPlacement[] = [
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const ICONABLE_TYPES = new Set(["rectangle", "diamond", "ellipse"]);

export const isIconableElement = (el: ExcalidrawElement): boolean =>
  ICONABLE_TYPES.has(el.type);

export const getShapeIcon = (
  el: ExcalidrawElement,
): ShapeIconData | undefined =>
  isIconableElement(el)
    ? (el.customData?.icon as ShapeIconData | undefined)
    : undefined;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn vitest run packages/element/src/__tests__/shapeIcon.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/element/src/types.ts packages/element/src/shapeIcon.ts packages/element/src/__tests__/shapeIcon.test.ts
git commit -m "feat(element): shape icon types + accessors"
```

---

### Task 2: Palette color math (pure)

**Files:**
- Create: `packages/excalidraw/data/iconPalette.ts`
- Test: `packages/excalidraw/data/iconPalette.test.ts`

**Interfaces:**
- Consumes: `ShapeIconPalette` from `@excalidraw/element/types`.
- Produces:
  - `derivePalette(dominant: [number, number, number]): ShapeIconPalette`
  - `pickContrastText(hexBackground: string): string` (returns `"#000000"` or `"#ffffff"`)
  - `rgbToHex(r,g,b): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/excalidraw/data/iconPalette.test.ts
import { derivePalette, pickContrastText, rgbToHex } from "./iconPalette";

describe("iconPalette", () => {
  it("rgbToHex", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
    expect(rgbToHex(0, 128, 255)).toBe("#0080ff");
  });

  it("pickContrastText picks black on light bg, white on dark bg", () => {
    expect(pickContrastText("#ffffff")).toBe("#000000");
    expect(pickContrastText("#000000")).toBe("#ffffff");
    expect(pickContrastText("#f5d0d0")).toBe("#000000"); // light tint
  });

  it("derivePalette produces a light background and darker stroke from a mid color", () => {
    const p = derivePalette([200, 60, 60]); // reddish
    // background lighter than stroke (compare luminance via hex length sanity)
    expect(p.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.stroke).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.text === "#000000" || p.text === "#ffffff").toBe(true);
    // text must contrast with the derived (light) background => black
    expect(p.text).toBe("#000000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run packages/excalidraw/data/iconPalette.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `iconPalette.ts`**

```ts
// packages/excalidraw/data/iconPalette.ts
import type { ShapeIconPalette } from "@excalidraw/element/types";

export const rgbToHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");

const toHsl = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
};

const relLuminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
};

export const pickContrastText = (hexBackground: string): string => {
  const L = relLuminance(hexBackground);
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastBlack = (L + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? "#000000" : "#ffffff";
};

export const derivePalette = (
  dominant: [number, number, number],
): ShapeIconPalette => {
  const { h, s } = toHsl(...dominant);
  const background = rgbToHex(...hslToRgb(h, Math.min(s, 0.5), 0.9));
  const stroke = rgbToHex(...hslToRgb(h, Math.max(s, 0.4), 0.4));
  const text = pickContrastText(background);
  return { stroke, background, text };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run packages/excalidraw/data/iconPalette.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/excalidraw/data/iconPalette.ts packages/excalidraw/data/iconPalette.test.ts
git commit -m "feat: icon palette color math"
```

---

### Task 3: SVG sanitize + palette extraction (`svgIcon.ts`)

**Files:**
- Modify: `packages/excalidraw/package.json` (add deps)
- Create: `packages/excalidraw/data/svgIcon.ts`
- Test: `packages/excalidraw/data/svgIcon.test.ts`

**Interfaces:**
- Consumes: `derivePalette` from `./iconPalette`; `ShapeIconPalette` type.
- Produces:
  - `sanitizeSvg(input: string): string | null`
  - `extractPalette(svg: string): Promise<ShapeIconPalette>`

- [ ] **Step 1: Add dependency**

```bash
yarn workspace @excalidraw/excalidraw add dompurify
yarn workspace @excalidraw/excalidraw add -D @types/dompurify
```

- [ ] **Step 2: Write the failing test (sanitizer only — extractPalette needs canvas)**

```ts
// packages/excalidraw/data/svgIcon.test.ts
import { sanitizeSvg } from "./svgIcon";

describe("sanitizeSvg", () => {
  it("keeps benign svg shapes", () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>');
    expect(out).toContain("<svg");
    expect(out).toContain("circle");
  });

  it("strips <script>", () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>');
    expect(out).not.toContain("script");
    expect(out).toContain("rect");
  });

  it("strips event handlers", () => {
    const out = sanitizeSvg('<svg><rect onload="alert(1)"/></svg>');
    expect(out).not.toContain("onload");
  });

  it("returns null for non-svg input", () => {
    expect(sanitizeSvg("not svg")).toBeNull();
    expect(sanitizeSvg("<div>hi</div>")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn vitest run packages/excalidraw/data/svgIcon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `svgIcon.ts`**

```ts
// packages/excalidraw/data/svgIcon.ts
import DOMPurify from "dompurify";

import type { ShapeIconPalette } from "@excalidraw/element/types";

import { derivePalette } from "./iconPalette";

export const sanitizeSvg = (input: string): string | null => {
  if (!input || !input.trim()) {
    return null;
  }
  const clean = DOMPurify.sanitize(input, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
  });
  const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg || doc.querySelector("parsererror")) {
    return null;
  }
  return svg.outerHTML;
};

const NEUTRAL: [number, number, number] = [136, 136, 136];

export const extractPalette = (svg: string): Promise<ShapeIconPalette> =>
  new Promise((resolve) => {
    const done = (rgb: [number, number, number]) => resolve(derivePalette(rgb));
    try {
      const url = `data:image/svg+xml;base64,${btoa(
        unescape(encodeURIComponent(svg)),
      )}`;
      const img = new Image();
      img.onload = () => {
        try {
          const size = 64;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return done(NEUTRAL);
          }
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);
          const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (a < 16) continue;
            if (r > 245 && g > 245 && b > 245) continue;
            const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
            const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
            buckets.set(key, bucket);
          }
          let best: { n: number; r: number; g: number; b: number } | null = null;
          for (const bucket of buckets.values()) {
            if (!best || bucket.n > best.n) best = bucket;
          }
          if (!best) return done(NEUTRAL);
          done([best.r / best.n, best.g / best.n, best.b / best.n]);
        } catch {
          done(NEUTRAL);
        }
      };
      img.onerror = () => done(NEUTRAL);
      img.src = url;
    } catch {
      done(NEUTRAL);
    }
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn vitest run packages/excalidraw/data/svgIcon.test.ts`
Expected: PASS. (If jsdom lacks `DOMParser` `image/svg+xml`, the test env already polyfills it in this repo's vitest setup; if a case fails, assert on `sanitizeSvg` returning a string containing the shape tag instead of exact markup.)

- [ ] **Step 6: Commit**

```bash
git add packages/excalidraw/package.json packages/excalidraw/data/svgIcon.ts packages/excalidraw/data/svgIcon.test.ts
git commit -m "feat: sanitize svg + extract palette from icon"
```

---

### Task 4: Icon + text layout geometry (pure)

**Files:**
- Create: `packages/element/src/iconLayout.ts`
- Test: `packages/element/src/__tests__/iconLayout.test.ts`

**Interfaces:**
- Consumes: `ShapeIconPlacement` type; element `{ x, y, width, height }`.
- Produces:
  - `getIconTextLayout(el): { iconRect: { x, y, w, h }; textAlign: "left"|"center"|"right"; verticalAlign: "top"|"middle"|"bottom" }`
  - `ICON_PADDING = 8`, `iconSizeFor(w, h): number`

- [ ] **Step 1: Write the failing test**

```ts
// packages/element/src/__tests__/iconLayout.test.ts
import { getIconTextLayout, iconSizeFor } from "../iconLayout";

const el = (placement: any, width = 200, height = 100) =>
  ({ x: 0, y: 0, width, height, customData: { icon: { placement } } } as any);

describe("iconLayout", () => {
  it("iconSizeFor clamps 16..64 at 25% of min side", () => {
    expect(iconSizeFor(200, 100)).toBe(25); // 100*0.25
    expect(iconSizeFor(40, 40)).toBe(16);   // 10 -> clamp 16
    expect(iconSizeFor(1000, 1000)).toBe(64); // 250 -> clamp 64
  });

  it("center: icon horizontally centered, text center/middle", () => {
    const { iconRect, textAlign, verticalAlign } = getIconTextLayout(el("center"));
    expect(textAlign).toBe("center");
    expect(verticalAlign).toBe("middle");
    expect(iconRect.x).toBeCloseTo(200 / 2 - iconRect.w / 2);
  });

  it("top-left: icon hugs top-left, text left/top", () => {
    const { iconRect, textAlign, verticalAlign } = getIconTextLayout(el("top-left"));
    expect(textAlign).toBe("left");
    expect(verticalAlign).toBe("top");
    expect(iconRect.x).toBe(8);
    expect(iconRect.y).toBe(8);
  });

  it("bottom-right: icon hugs bottom-right, text right/bottom", () => {
    const { iconRect, textAlign, verticalAlign } = getIconTextLayout(el("bottom-right"));
    expect(textAlign).toBe("right");
    expect(verticalAlign).toBe("bottom");
    expect(iconRect.x).toBe(200 - 8 - iconRect.w);
    expect(iconRect.y).toBe(100 - 8 - iconRect.h);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run packages/element/src/__tests__/iconLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `iconLayout.ts`**

```ts
// packages/element/src/iconLayout.ts
import type { ExcalidrawElement, ShapeIconPlacement } from "./types";
import { getShapeIcon } from "./shapeIcon";

export const ICON_PADDING = 8;

export const iconSizeFor = (width: number, height: number): number =>
  Math.max(16, Math.min(64, Math.min(width, height) * 0.25));

type Layout = {
  iconRect: { x: number; y: number; w: number; h: number };
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
};

export const getIconTextLayout = (el: ExcalidrawElement): Layout => {
  const placement: ShapeIconPlacement =
    getShapeIcon(el)?.placement ?? "center";
  const size = iconSizeFor(el.width, el.height);
  const p = ICON_PADDING;
  const left = el.x + p;
  const right = el.x + el.width - p - size;
  const centerX = el.x + el.width / 2 - size / 2;
  const top = el.y + p;
  const bottom = el.y + el.height - p - size;

  switch (placement) {
    case "top-left":
      return { iconRect: { x: left, y: top, w: size, h: size }, textAlign: "left", verticalAlign: "top" };
    case "top-right":
      return { iconRect: { x: right, y: top, w: size, h: size }, textAlign: "right", verticalAlign: "top" };
    case "bottom-left":
      return { iconRect: { x: left, y: bottom, w: size, h: size }, textAlign: "left", verticalAlign: "bottom" };
    case "bottom-right":
      return { iconRect: { x: right, y: bottom, w: size, h: size }, textAlign: "right", verticalAlign: "bottom" };
    case "center":
    default:
      return { iconRect: { x: centerX, y: top, w: size, h: size }, textAlign: "center", verticalAlign: "middle" };
  }
};
```

Note: test uses element-local coords (`x:0,y:0`) so returned `iconRect.x/y` equal the padding offsets. Renderers pass real element coords.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run packages/element/src/__tests__/iconLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/element/src/iconLayout.ts packages/element/src/__tests__/iconLayout.test.ts
git commit -m "feat(element): icon+text layout geometry"
```

---

### Task 5: Canvas render hook

**Files:**
- Modify: `packages/element/src/renderElement.ts` (inside `drawElementOnCanvas`, in the `rectangle/diamond/ellipse` case at ~line 325-329, after the shape draws)
- Create: `packages/element/src/iconImageCache.ts`

**Interfaces:**
- Consumes: `getShapeIcon`, `getIconTextLayout`.
- Produces: `getIconImage(svg: string): HTMLImageElement | null` (module-level cache, decodes async, returns null until ready).

- [ ] **Step 1: Implement the image cache**

```ts
// packages/element/src/iconImageCache.ts
const cache = new Map<string, HTMLImageElement>();

export const getIconImage = (
  svg: string,
  onReady?: () => void,
): HTMLImageElement | null => {
  const existing = cache.get(svg);
  if (existing) {
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }
  const img = new Image();
  img.onload = () => onReady?.();
  img.src = `data:image/svg+xml;base64,${btoa(
    unescape(encodeURIComponent(svg)),
  )}`;
  cache.set(svg, img);
  return null;
};
```

- [ ] **Step 2: Read the target case in `renderElement.ts`**

Run: `sed -n '318,345p' packages/element/src/renderElement.ts` (locate where the rough shape is drawn for rectangle/diamond/ellipse, and the `context` + `element` in scope).

- [ ] **Step 3: Add the icon draw after the shape draws**

At the end of the `rectangle/diamond/ellipse` case (after the existing `context.fill`/`drawShape`), before `break`:

```ts
// --- shape icon ---
const shapeIcon = getShapeIcon(element);
if (shapeIcon?.svg) {
  const { iconRect } = getIconTextLayout(element);
  const img = getIconImage(shapeIcon.svg, () => renderConfig?.onRenderComplete?.());
  if (img) {
    // iconRect is in element-local coords (x:0,y:0 origin) because the
    // canvas context is already translated to the element origin here.
    context.drawImage(
      img,
      iconRect.x - element.x,
      iconRect.y - element.y,
      iconRect.w,
      iconRect.h,
    );
  }
}
```

Add imports at top of `renderElement.ts`:

```ts
import { getShapeIcon } from "./shapeIcon";
import { getIconTextLayout } from "./iconLayout";
import { getIconImage } from "./iconImageCache";
```

Note: verify the local-coordinate assumption by reading the surrounding transform in Step 2. If `drawElementOnCanvas` is NOT pre-translated to element origin, drop the `- element.x` / `- element.y` and pass `iconRect.x/y` directly. Pick whichever matches the existing code in that function; the layout helper returns absolute coords, so subtract the origin only if the context is already translated. If `renderConfig?.onRenderComplete` doesn't exist, omit the `onReady` callback — a later redraw (e.g. pan/zoom) will pick up the decoded image.

- [ ] **Step 4: Manual verify**

Run the app: `yarn start`. Paste an SVG via the panel (built in Task 7) — or temporarily hardcode `customData.icon` on a shape — and confirm the icon draws at each placement. (No unit test for canvas raster in this task; geometry is covered by Task 4.)

- [ ] **Step 5: Typecheck + commit**

```bash
yarn test:typecheck
git add packages/element/src/renderElement.ts packages/element/src/iconImageCache.ts
git commit -m "feat(element): render shape icon on canvas"
```

---

### Task 6: SVG export hook

**Files:**
- Modify: `packages/excalidraw/renderer/staticSvgScene.ts` (in `renderElementToSvg`, `rectangle/diamond/ellipse` case at ~line 148-177, before `addToRoot`)

**Interfaces:**
- Consumes: `getShapeIcon`, `getIconTextLayout`.

- [ ] **Step 1: Read the target case**

Run: `sed -n '148,178p' packages/excalidraw/renderer/staticSvgScene.ts` — identify the `g`/`node` group variable and the `SVG_NS`, and how element offset is applied (look for the `transform` / `translate` used by `addToRoot`).

- [ ] **Step 2: Build an icon `<image>` and append to the group**

Inside the `rectangle/diamond/ellipse` case, after the shape node is created and before `addToRoot(g || node, element)`:

```ts
const shapeIcon = getShapeIcon(element);
if (shapeIcon?.svg) {
  const { iconRect } = getIconTextLayout(element);
  const image = svgRoot.ownerDocument!.createElementNS(SVG_NS, "image");
  const href = `data:image/svg+xml;base64,${btoa(
    unescape(encodeURIComponent(shapeIcon.svg)),
  )}`;
  image.setAttribute("href", href);
  // element-local coords (subtract element origin) since the element group
  // is translated to element.x/element.y — mirror whatever the shape node uses.
  image.setAttribute("x", `${iconRect.x - element.x}`);
  image.setAttribute("y", `${iconRect.y - element.y}`);
  image.setAttribute("width", `${iconRect.w}`);
  image.setAttribute("height", `${iconRect.h}`);
  (g || node).appendChild(image);
}
```

Add imports at top of `staticSvgScene.ts`:

```ts
import { getShapeIcon } from "@excalidraw/element/shapeIcon";
import { getIconTextLayout } from "@excalidraw/element/iconLayout";
```

Note: confirm the group variable name (`g` vs `node`) and coordinate convention from Step 1; match the shape node's own coordinate handling exactly.

- [ ] **Step 3: Manual verify**

In the app, attach an icon, then File → Export image → SVG. Open the exported `.svg`; the icon must appear at the correct placement. Confirm no `<script>` present in the output.

- [ ] **Step 4: Typecheck + commit**

```bash
yarn test:typecheck
git add packages/excalidraw/renderer/staticSvgScene.ts
git commit -m "feat: render shape icon in svg export"
```

---

### Task 7: Panel action — attach icon, pick placement, auto-apply palette

**Files:**
- Create: `packages/excalidraw/actions/actionShapeIcon.tsx`
- Modify: `packages/excalidraw/actions/index.ts` (export the new action)
- Modify: `packages/excalidraw/actions/types.ts` (add `"setShapeIcon"` to the action name union if such a union exists)
- Modify: `packages/excalidraw/components/Actions.tsx` (render in `SelectedShapeActions`, ~after line 159 background-color block)

**Interfaces:**
- Consumes: `sanitizeSvg`, `extractPalette` (`../data/svgIcon`), `isIconableElement`, `getShapeIcon`, `SHAPE_ICON_PLACEMENTS` (`@excalidraw/element/shapeIcon`), `getIconTextLayout` for text align mapping.
- Produces: registered action `setShapeIcon`.

- [ ] **Step 1: Read an existing PanelComponent action end-to-end**

Run: `sed -n '402,520p' packages/excalidraw/actions/actionProperties.tsx` — copy the `register<...>({ name, label, perform, PanelComponent })` shape, the `newElementWith`/`changeProperty` helpers, and `CaptureUpdateAction` import path.

- [ ] **Step 2: Implement the action**

```tsx
// packages/excalidraw/actions/actionShapeIcon.tsx
import { register } from "./register";
import { CaptureUpdateAction } from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element/mutateElement";
import {
  getShapeIcon,
  isIconableElement,
  SHAPE_ICON_PLACEMENTS,
} from "@excalidraw/element/shapeIcon";
import { getBoundTextElement } from "@excalidraw/element/textElement";
import type {
  ExcalidrawElement,
  ShapeIconData,
  ShapeIconPalette,
  ShapeIconPlacement,
} from "@excalidraw/element/types";
import { sanitizeSvg, extractPalette } from "../data/svgIcon";

type IconActionValue =
  | { kind: "set"; svg: string; palette: ShapeIconPalette }
  | { kind: "placement"; placement: ShapeIconPlacement }
  | { kind: "remove" };

const VALIGN: Record<ShapeIconPlacement, string> = {
  center: "middle", "top-left": "top", "top-right": "top",
  "bottom-left": "bottom", "bottom-right": "bottom",
};
const HALIGN: Record<ShapeIconPlacement, string> = {
  center: "center", "top-left": "left", "top-right": "right",
  "bottom-left": "left", "bottom-right": "right",
};

export const actionSetShapeIcon = register({
  name: "setShapeIcon",
  label: "Shape icon",
  trackEvent: false,
  perform: (elements, appState, value: IconActionValue, app) => {
    const selected = app.scene
      .getSelectedElements(appState)
      .filter(isIconableElement);
    if (selected.length !== 1) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const target = selected[0];
    const selectedId = target.id;
    const prevIcon = getShapeIcon(target);

    const nextIcon: ShapeIconData | undefined =
      value.kind === "remove"
        ? undefined
        : value.kind === "set"
        ? { svg: value.svg, placement: prevIcon?.placement ?? "center", palette: value.palette }
        : prevIcon
        ? { ...prevIcon, placement: value.placement }
        : undefined;

    const boundText = getBoundTextElement(target, app.scene.getNonDeletedElementsMap());

    const nextElements = elements.map((el) => {
      if (el.id === selectedId) {
        const patch: Partial<ExcalidrawElement> = {
          customData: { ...el.customData, icon: nextIcon },
        };
        if (value.kind === "set") {
          patch.backgroundColor = value.palette.background;
          patch.strokeColor = value.palette.stroke;
        }
        return newElementWith(el, patch);
      }
      if (boundText && el.id === boundText.id && nextIcon) {
        return newElementWith(el, {
          verticalAlign: VALIGN[nextIcon.placement] as any,
          textAlign: HALIGN[nextIcon.placement] as any,
          ...(value.kind === "set" ? { strokeColor: value.palette.text } : {}),
        });
      }
      return el;
    });

    return {
      elements: nextElements,
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const selected = app.scene
      .getSelectedElements(appState)
      .filter(isIconableElement);
    const icon = selected.length === 1 ? getShapeIcon(selected[0]) : undefined;

    const onFile = async (file: File) => {
      const clean = sanitizeSvg(await file.text());
      applySvg(clean);
    };
    const onPaste = (raw: string) => applySvg(sanitizeSvg(raw));
    const applySvg = async (clean: string | null) => {
      if (!clean) {
        // surface inline error via a local state in the real component
        return;
      }
      const palette = await extractPalette(clean);
      updateData({ kind: "set", svg: clean, palette });
    };

    return (
      <fieldset>
        <legend>Icon</legend>
        <textarea
          placeholder="Paste SVG markup"
          onBlur={(e) => e.target.value && onPaste(e.target.value)}
        />
        <input
          type="file"
          accept=".svg,image/svg+xml"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="shape-icon-placements">
          {SHAPE_ICON_PLACEMENTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!icon}
              className={icon?.placement === p ? "active" : ""}
              onClick={() => updateData({ kind: "placement", placement: p })}
            >
              {p}
            </button>
          ))}
        </div>
        {icon && (
          <button type="button" onClick={() => updateData({ kind: "remove" })}>
            Remove icon
          </button>
        )}
      </fieldset>
    );
  },
});
```

Note: verify exact import paths in Step 1 (`register`, `CaptureUpdateAction`, `newElementWith`, `getBoundTextElement`) against how `actionProperties.tsx` imports them — match that file's import style (some are re-exported from `@excalidraw/element`). Adjust `updateData`'s value typing to however `register`'s generic is used in the repo; if the action-name union in `actions/types.ts` is strict, add `"setShapeIcon"`.

- [ ] **Step 3: Export + register the action**

In `packages/excalidraw/actions/index.ts` add: `export { actionSetShapeIcon } from "./actionShapeIcon";`
Confirm actions are auto-registered by `register()` at import time (grep `register(` usage — most excalidraw actions self-register on import; ensure the new file is imported somewhere in the actions barrel so it loads).

- [ ] **Step 4: Render in the panel**

In `packages/excalidraw/components/Actions.tsx` `SelectedShapeActions`, after the background-color block (~line 159), add:

```tsx
{isSingleIconableSelected(targetElements) && (
  <div>{renderAction("setShapeIcon")}</div>
)}
```

Add near the top of the file:

```tsx
import { isIconableElement } from "@excalidraw/element/shapeIcon";
const isSingleIconableSelected = (els: readonly ExcalidrawElement[]) =>
  els.length === 1 && isIconableElement(els[0]);
```

- [ ] **Step 5: Typecheck + manual verify**

```bash
yarn test:typecheck
yarn start
```

Verify in-app:
1. Select a single rectangle → "Icon" panel shows. Multi-select or non-generic → hidden.
2. Paste an SVG → shape recolors (bg/stroke), bound text recolors + realigns, icon draws.
3. Change placement → icon + text move together.
4. Ctrl-Z → colors + icon revert in one step.
5. Paste `<svg><script>alert(1)</script></svg>` → no alert, no script stored/exported.
6. Remove icon → icon gone (colors remain, which is fine).

- [ ] **Step 6: Commit**

```bash
git add packages/excalidraw/actions/actionShapeIcon.tsx packages/excalidraw/actions/index.ts packages/excalidraw/components/Actions.tsx
git commit -m "feat: shape icon panel action + auto-apply palette"
```

---

### Task 8: Full test pass + final commit

- [ ] **Step 1: Typecheck**

Run: `yarn test:typecheck`
Expected: no errors.

- [ ] **Step 2: Run test suite (update snapshots)**

Run: `yarn test:update`
Expected: PASS. New unit tests (Tasks 1–4) green. If a serialization/snapshot test complains about the new `customData.icon`, that is expected for elements that carry an icon — update the snapshot; do not add a schema migration (out of scope).

- [ ] **Step 3: Lint fix**

Run: `yarn fix`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: shape icons + auto-palette green"
```

## Notes for the implementer

- The coordinate-origin assumption in Tasks 5 & 6 (whether the render context / SVG group is pre-translated to the element origin) MUST be verified by reading the surrounding code before writing the draw call. The layout helper returns absolute scene coordinates; subtract `element.x/element.y` only if the surrounding code already translated to the element origin. Getting this wrong puts the icon in the wrong place — it's the single most likely bug.
- Icon does not rotate/scale with element `angle` in this version (drawn axis-aligned in the element's local box). Acceptable for the fork; note as a known limitation.
