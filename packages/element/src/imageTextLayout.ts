import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  ImageTextPosition,
} from "./types";

export const IMAGE_TEXT_POSITIONS: readonly ImageTextPosition[] = [
  "top",
  "bottom",
  "left",
  "right",
];

/** space between the image's edge and its label */
export const IMAGE_TEXT_GAP = 8;

export const DEFAULT_IMAGE_TEXT_POSITION: ImageTextPosition = "bottom";

/**
 * An image's label sits OUTSIDE the image — an image is opaque, so text drawn
 * over it would be unreadable, and growing the image to fit text would
 * distort the picture.
 */
export const getImageTextPosition = (
  el: ExcalidrawElement,
): ImageTextPosition =>
  (el.customData?.textPosition as ImageTextPosition | undefined) ??
  DEFAULT_IMAGE_TEXT_POSITION;

/**
 * Top-left corner for an image's label, placed just outside the given edge and
 * centered along it.
 */
export const computeImageTextPosition = (
  image: ExcalidrawElement,
  text: Pick<ExcalidrawTextElement, "width" | "height">,
): { x: number; y: number } => {
  const centerX = image.x + image.width / 2 - text.width / 2;
  const centerY = image.y + image.height / 2 - text.height / 2;

  switch (getImageTextPosition(image)) {
    case "top":
      return { x: centerX, y: image.y - IMAGE_TEXT_GAP - text.height };
    case "left":
      return { x: image.x - IMAGE_TEXT_GAP - text.width, y: centerY };
    case "right":
      return { x: image.x + image.width + IMAGE_TEXT_GAP, y: centerY };
    case "bottom":
    default:
      return { x: centerX, y: image.y + image.height + IMAGE_TEXT_GAP };
  }
};
