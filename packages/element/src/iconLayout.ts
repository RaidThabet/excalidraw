import { DEFAULT_SHAPE_ICON_PLACEMENT, getShapeIcon } from "./shapeIcon";

import type { ExcalidrawElement, ShapeIconPlacement } from "./types";

export const ICON_PADDING = 8;

/** breathing room between the icon and the text sitting next to it */
export const ICON_TEXT_GAP = 6;

export const iconSizeFor = (width: number, height: number): number =>
  Math.max(16, Math.min(64, Math.min(width, height) * 0.25));

/** bounds for a manually chosen icon size */
export const MIN_ICON_SIZE = 8;
export const MAX_ICON_SIZE = 512;

/**
 * The icon's edge length: the user's chosen size when set, otherwise derived
 * from the shape. Clamped so a stored value can never render inside-out or
 * swallow the shape.
 */
export const getIconSize = (el: ExcalidrawElement): number => {
  const manual = getShapeIcon(el)?.size;
  return typeof manual === "number" && Number.isFinite(manual)
    ? Math.max(MIN_ICON_SIZE, Math.min(MAX_ICON_SIZE, manual))
    : iconSizeFor(el.width, el.height);
};

/**
 * Whether the icon lays the text out alongside itself ("container" shapes) or
 * leaves the text centered in the shape while the icon sits in its corner.
 *
 * Icons stored before the flag existed were laid out inline, so a missing value
 * means `true`.
 */
export const isContainerLayout = (
  icon: { isContainer?: boolean } | undefined,
): boolean => !!icon && icon.isContainer !== false;

/**
 * How much of the bound text's content box the icon claims for itself.
 *
 * Corner placements read as a single row — `[icon] text` on the left, or
 * `text [icon]` on the right — so the icon reserves horizontal space and the
 * text fills what's left of that row. `center` stacks the icon above the text,
 * so it reserves vertical space instead.
 *
 * A non-container icon claims nothing: the text stays centered in the shape.
 */
export const getIconTextInset = (
  el: ExcalidrawElement,
): { left: number; right: number; top: number } => {
  const none = { left: 0, right: 0, top: 0 };
  const icon = getShapeIcon(el);
  if (!icon?.svg || !isContainerLayout(icon)) {
    return none;
  }
  const reserved = getIconSize(el) + ICON_TEXT_GAP;

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
  const placement: ShapeIconPlacement =
    getShapeIcon(el)?.placement ?? DEFAULT_SHAPE_ICON_PLACEMENT;
  const size = getIconSize(el);
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

/**
 * How the bound text should align for this element's icon. Container shapes
 * align the text to the icon's own edge so the two read as one row; everything
 * else keeps the text centered in the shape.
 */
export const getIconTextAlignment = (
  el: ExcalidrawElement,
): Pick<Layout, "textAlign" | "verticalAlign"> => {
  const icon = getShapeIcon(el);
  if (!icon?.svg || !isContainerLayout(icon)) {
    return { textAlign: "center", verticalAlign: "middle" };
  }
  const { textAlign, verticalAlign } = getIconTextLayout(el);
  return { textAlign, verticalAlign };
};

/**
 * The vertical band the icon and text share, for the placements where they sit
 * on one row. Text is centered against this band so `[icon] text` lines up
 * instead of the text hugging the row's top or bottom edge.
 *
 * Returns null when there is no shared row: the stacked `center` placement, a
 * non-container icon, or no icon at all.
 */
export const getInlineIconRow = (
  el: ExcalidrawElement,
): { y: number; height: number } | null => {
  const icon = getShapeIcon(el);
  if (!icon?.svg || !isContainerLayout(icon) || icon.placement === "center") {
    return null;
  }
  const { iconRect } = getIconTextLayout(el);
  return { y: iconRect.y, height: iconRect.h };
};
