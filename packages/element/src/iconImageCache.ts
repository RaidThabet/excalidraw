const cache = new Map<string, HTMLImageElement>();

const toDataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

const load = (svg: string): HTMLImageElement => {
  const existing = cache.get(svg);
  if (existing) {
    return existing;
  }
  const img = new Image();
  img.src = toDataUrl(svg);
  cache.set(svg, img);
  return img;
};

export const getIconImage = (
  svg: string,
  onReady?: () => void,
): HTMLImageElement | null => {
  const cached = cache.get(svg);
  if (cached) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  const img = load(svg);
  img.onload = () => onReady?.();
  return null;
};

/**
 * Decodes an icon into the cache and resolves once it is drawable.
 *
 * Attaching an icon has to await this first. Renderers are synchronous: the
 * canvas draws whatever is in the cache at that instant, and nothing schedules
 * another frame when a decode finishes later. Without preloading, a freshly
 * attached icon is invisible until some unrelated edit happens to repaint the
 * scene — which read as "the icon doesn't show up until you pick a position".
 */
export const preloadIconImage = (svg: string): Promise<void> =>
  new Promise((resolve) => {
    const img = load(svg);
    if (img.complete) {
      resolve();
      return;
    }
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    // a broken SVG must not hang the caller; the renderer just skips drawing it
    img.addEventListener("error", done, { once: true });
  });
