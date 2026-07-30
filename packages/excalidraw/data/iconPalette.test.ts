import { derivePalette, pickContrastText, rgbToHex } from "./iconPalette";

describe("iconPalette", () => {
  it("rgbToHex", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
    expect(rgbToHex(0, 128, 255)).toBe("#0080ff");
  });

  it("pickContrastText picks black on light bg, white on dark bg", () => {
    expect(pickContrastText("#ffffff")).toBe("#000000");
    expect(pickContrastText("#000000")).toBe("#ffffff");
    expect(pickContrastText("#f5d0d0")).toBe("#000000");
  });

  it("derivePalette produces a light background and darker stroke", () => {
    const p = derivePalette([200, 60, 60]);
    expect(p.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.stroke).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.text === "#000000" || p.text === "#ffffff").toBe(true);
    expect(p.text).toBe("#000000");
  });
});
