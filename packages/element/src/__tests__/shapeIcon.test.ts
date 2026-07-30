// packages/element/src/__tests__/shapeIcon.test.ts
import { isIconableElement, getShapeIcon } from "../shapeIcon";

const base = (type: string, customData?: any) =>
  ({ type, customData } as any);

describe("shapeIcon helpers", () => {
  it("isIconableElement true only for rectangle/diamond/ellipse", () => {
    expect(isIconableElement(base("rectangle"))).toBe(true);
    expect(isIconableElement(base("diamond"))).toBe(true);
    expect(isIconableElement(base("ellipse"))).toBe(true);
    expect(isIconableElement(base("arrow"))).toBe(false);
    expect(isIconableElement(base("text"))).toBe(false);
    expect(isIconableElement(base("image"))).toBe(false);
  });

  it("getShapeIcon returns icon for iconable element, undefined otherwise", () => {
    const icon = { svg: "<svg/>", placement: "center", palette: null };
    expect(getShapeIcon(base("rectangle", { icon }))).toEqual(icon);
    expect(getShapeIcon(base("rectangle", {}))).toBeUndefined();
    expect(getShapeIcon(base("arrow", { icon }))).toBeUndefined();
  });
});
