import { getShapeIcon } from "./shapeIcon";

import type { ExcalidrawElement, ShapeIconPlacement } from "./types";

export const ICON_PADDING = 8;

/** breathing room between the icon and the text sitting next to it */
export const ICON_TEXT_GAP = 6;

export const iconSizeFor = (width: number, height: number): number =>
  Math.max(16, Math.min(64, Math.min(width, height) * 0.25));

/**
 * How much of the bound text's content box the icon claims for itself.
 *
 * Corner placements read as a single row — `[icon] text` on the left, or
 * `text [icon]` on the right — so the icon reserves horizontal space and the
 * text fills what's left of that row. `center` stacks the icon above the text,
 * so it reserves vertical space instead.
 */
export const getIconTextInset = (
  el: ExcalidrawElement,
): { left: number; right: number; top: number } => {
  const none = { left: 0, right: 0, top: 0 };
  const icon = getShapeIcon(el);
  if (!icon?.svg) {
    return none;
  }
  const reserved = iconSizeFor(el.width, el.height) + ICON_TEXT_GAP;

  switch (icon.placement) {
    case "top-left":
    case "bottom-left":
      return { ...none, left: reserved };
    case "top-right":
    case "bottom-right":
      return { ...none, right: reserved };
    case "center":
    default:
      return { ...none, top: reserved };
  }
};

type Layout = {
  iconRect: { x: number; y: number; w: number; h: number };
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
};

export const getIconTextLayout = (el: ExcalidrawElement): Layout => {
  const placement: ShapeIconPlacement = getShapeIcon(el)?.placement ?? "center";
  const size = iconSizeFor(el.width, el.height);
  const p = ICON_PADDING;
  const left = el.x + p;
  const right = el.x + el.width - p - size;
  const centerX = el.x + el.width / 2 - size / 2;
  const top = el.y + p;
  const bottom = el.y + el.height - p - size;

  switch (placement) {
    case "top-left":
      return {
        iconRect: { x: left, y: top, w: size, h: size },
        textAlign: "left",
        verticalAlign: "top",
      };
    case "top-right":
      return {
        iconRect: { x: right, y: top, w: size, h: size },
        textAlign: "right",
        verticalAlign: "top",
      };
    case "bottom-left":
      return {
        iconRect: { x: left, y: bottom, w: size, h: size },
        textAlign: "left",
        verticalAlign: "bottom",
      };
    case "bottom-right":
      return {
        iconRect: { x: right, y: bottom, w: size, h: size },
        textAlign: "right",
        verticalAlign: "bottom",
      };
    case "center":
    default:
      return {
        iconRect: { x: centerX, y: top, w: size, h: size },
        textAlign: "center",
        verticalAlign: "middle",
      };
  }
};
