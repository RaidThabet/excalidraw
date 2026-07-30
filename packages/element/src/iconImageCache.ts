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
