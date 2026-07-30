import { getShapeIcon } from "./shapeIcon";

import type { ExcalidrawElement, ShapeIconPlacement } from "./types";

export const ICON_PADDING = 8;

export const iconSizeFor = (width: number, height: number): number =>
  Math.max(16, Math.min(64, Math.min(width, height) * 0.25));

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
