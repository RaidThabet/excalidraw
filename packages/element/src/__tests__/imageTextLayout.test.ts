import {
  computeImageTextPosition,
  getImageTextPosition,
  IMAGE_TEXT_GAP,
} from "../imageTextLayout";

// 200x100 image at (50, 40)
const image = (textPosition?: string) =>
  ({
    type: "image",
    x: 50,
    y: 40,
    width: 200,
    height: 100,
    customData: textPosition ? { textPosition } : undefined,
  } as any);

const text = { width: 60, height: 20 };

describe("imageTextLayout", () => {
  it("defaults to bottom", () => {
    expect(getImageTextPosition(image())).toBe("bottom");
    expect(getImageTextPosition(image("left"))).toBe("left");
  });

  it("bottom: below the image, horizontally centered", () => {
    expect(computeImageTextPosition(image("bottom"), text)).toEqual({
      x: 50 + 200 / 2 - 60 / 2,
      y: 40 + 100 + IMAGE_TEXT_GAP,
    });
  });

  it("top: above the image, horizontally centered", () => {
    expect(computeImageTextPosition(image("top"), text)).toEqual({
      x: 50 + 200 / 2 - 60 / 2,
      y: 40 - IMAGE_TEXT_GAP - 20,
    });
  });

  it("left: left of the image, vertically centered", () => {
    expect(computeImageTextPosition(image("left"), text)).toEqual({
      x: 50 - IMAGE_TEXT_GAP - 60,
      y: 40 + 100 / 2 - 20 / 2,
    });
  });

  it("right: right of the image, vertically centered", () => {
    expect(computeImageTextPosition(image("right"), text)).toEqual({
      x: 50 + 200 + IMAGE_TEXT_GAP,
      y: 40 + 100 / 2 - 20 / 2,
    });
  });

  it("never overlaps the image", () => {
    for (const position of ["top", "bottom", "left", "right"]) {
      const img = image(position);
      const { x, y } = computeImageTextPosition(img, text);
      const overlaps =
        x < img.x + img.width &&
        x + text.width > img.x &&
        y < img.y + img.height &&
        y + text.height > img.y;
      expect(overlaps).toBe(false);
    }
  });
});
