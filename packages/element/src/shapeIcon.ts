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

/**
 * Returns the sole iconable element in a selection, or null.
 *
 * A selection may legitimately contain more than one element while still
 * targeting a single shape — e.g. a container plus its bound text element.
 * We only care that exactly one *iconable* element is present, so bound text
 * (a non-iconable "text" element) does not hide the icon panel.
 */
export const getSingleIconableTarget = (
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null => {
  const iconable = elements.filter(isIconableElement);
  return iconable.length === 1 ? iconable[0] : null;
};
