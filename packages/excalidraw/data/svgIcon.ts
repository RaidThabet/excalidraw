import DOMPurify from "dompurify";

import type { ShapeIconPalette } from "@excalidraw/element/types";

import { derivePalette } from "./iconPalette";

export const sanitizeSvg = (input: string): string | null => {
  if (!input || !input.trim()) {
    return null;
  }
  const clean = DOMPurify.sanitize(input, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
  const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg || doc.querySelector("parsererror")) {
    return null;
  }
  return svg.outerHTML;
};

const NEUTRAL: [number, number, number] = [136, 136, 136];

/**
 * Renders SVG as an image source rather than inlined markup. Browsers do not
 * execute scripts in image-loaded SVG, so previewing stored icons this way is
 * safe without having to trust what is already in the library.
 */
export const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

export const extractPalette = (svg: string): Promise<ShapeIconPalette> =>
  new Promise((resolve) => {
    const done = (rgb: [number, number, number]) => resolve(derivePalette(rgb));
    try {
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
          const buckets = new Map<
            string,
            { n: number; r: number; g: number; b: number }
          >();
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (a < 16) {
              continue;
            }
            if (r > 245 && g > 245 && b > 245) {
              continue;
            }
            const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
            const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            bucket.n++;
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            buckets.set(key, bucket);
          }
          let best: { n: number; r: number; g: number; b: number } | null =
            null;
          for (const bucket of buckets.values()) {
            if (!best || bucket.n > best.n) {
              best = bucket;
            }
          }
          if (!best) {
            return done(NEUTRAL);
          }
          done([best.r / best.n, best.g / best.n, best.b / best.n]);
        } catch {
          done(NEUTRAL);
        }
      };
      img.onerror = () => done(NEUTRAL);
      img.src = svgToDataUrl(svg);
    } catch {
      done(NEUTRAL);
    }
  });
