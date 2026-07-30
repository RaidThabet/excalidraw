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
