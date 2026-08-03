import {
  getIconTextLayout,
  getIconTextInset,
  getIconTextAlignment,
  getInlineIconRow,
  iconSizeFor,
  ICON_TEXT_GAP,
} from "../iconLayout";

/** element carrying an icon with the container (inline) layout turned off */
const plain = (placement: any, width = 200, height = 100) =>
  ({
    type: "rectangle",
    x: 0,
    y: 0,
    width,
    height,
    customData: {
      icon: { placement, svg: "<svg/>", isContainer: false },
    },
  } as any);

const el = (placement: any, width = 200, height = 100) =>
  ({
    type: "rectangle",
    x: 0,
    y: 0,
    width,
    height,
    customData: { icon: { placement, svg: "<svg/>" } },
  } as any);

describe("iconLayout", () => {
  it("iconSizeFor clamps 16..64 at 25% of min side", () => {
    expect(iconSizeFor(200, 100)).toBe(25);
    expect(iconSizeFor(40, 40)).toBe(16);
    expect(iconSizeFor(1000, 1000)).toBe(64);
  });

  it("center: icon horizontally centered, text center/middle", () => {
    const { iconRect, textAlign, verticalAlign } = getIconTextLayout(
      el("center"),
    );
    expect(textAlign).toBe("center");
    expect(verticalAlign).toBe("middle");
    expect(iconRect.x).toBeCloseTo(200 / 2 - iconRect.w / 2);
  });

  it("top-left: icon hugs top-left, text left/top", () => {
    const { iconRect, textAlign, verticalAlign } = getIconTextLayout(
      el("top-left"),
    );
    expect(textAlign).toBe("left");
    expect(verticalAlign).toBe("top");
    expect(iconRect.x).toBe(8);
    expect(iconRect.y).toBe(8);
  });

  describe("getIconTextInset — space the icon reserves in the text box", () => {
    it("no icon -> no inset", () => {
      const bare = { type: "rectangle", x: 0, y: 0, width: 200, height: 100 };
      expect(getIconTextInset(bare as any)).toEqual({
        left: 0,
        right: 0,
        top: 0,
      });
    });

    it("left placements reserve space on the left (icon then text)", () => {
      const reserved = iconSizeFor(200, 100) + ICON_TEXT_GAP;
      expect(getIconTextInset(el("top-left"))).toEqual({
        left: reserved,
        right: 0,
        top: 0,
      });
      expect(getIconTextInset(el("bottom-left"))).toEqual({
        left: reserved,
        right: 0,
        top: 0,
      });
    });

    it("right placements reserve space on the right (text then icon)", () => {
      const reserved = iconSizeFor(200, 100) + ICON_TEXT_GAP;
      expect(getIconTextInset(el("top-right"))).toEqual({
        left: 0,
        right: reserved,
        top: 0,
      });
      expect(getIconTextInset(el("bottom-right"))).toEqual({
        left: 0,
        right: reserved,
        top: 0,
      });
    });

    it("center reserves space above (icon stacked over text)", () => {
      const reserved = iconSizeFor(200, 100) + ICON_TEXT_GAP;
      expect(getIconTextInset(el("center"))).toEqual({
        left: 0,
        right: 0,
        top: reserved,
      });
    });

    it("reserves nothing when the icon is not a container layout", () => {
      // text stays centered in the shape, so the icon claims no text space
      expect(getIconTextInset(plain("top-left"))).toEqual({
        left: 0,
        right: 0,
        top: 0,
      });
      expect(getIconTextInset(plain("center"))).toEqual({
        left: 0,
        right: 0,
        top: 0,
      });
    });
  });

  describe("getIconTextAlignment", () => {
    it("container layout aligns text to the icon's own edge", () => {
      expect(getIconTextAlignment(el("top-left"))).toEqual({
        textAlign: "left",
        verticalAlign: "top",
      });
      expect(getIconTextAlignment(el("bottom-right"))).toEqual({
        textAlign: "right",
        verticalAlign: "bottom",
      });
    });

    it("non-container layout keeps text centered regardless of placement", () => {
      for (const placement of ["top-left", "bottom-right", "center"]) {
        expect(getIconTextAlignment(plain(placement))).toEqual({
          textAlign: "center",
          verticalAlign: "middle",
        });
      }
    });

    it("no icon keeps text centered", () => {
      const bare = { type: "rectangle", x: 0, y: 0, width: 200, height: 100 };
      expect(getIconTextAlignment(bare as any)).toEqual({
        textAlign: "center",
        verticalAlign: "middle",
      });
    });
  });

  describe("getInlineIconRow — the row text shares with the icon", () => {
    it("returns the icon's vertical band for container corner placements", () => {
      const size = iconSizeFor(200, 100);
      expect(getInlineIconRow(el("top-left"))).toEqual({ y: 8, height: size });
      expect(getInlineIconRow(el("bottom-right"))).toEqual({
        y: 100 - 8 - size,
        height: size,
      });
    });

    it("returns null when there is no shared row", () => {
      expect(getInlineIconRow(el("center"))).toBeNull(); // stacked
      expect(getInlineIconRow(plain("top-left"))).toBeNull(); // not container
      const bare = { type: "rectangle", x: 0, y: 0, width: 200, height: 100 };
      expect(getInlineIconRow(bare as any)).toBeNull();
    });
  });

  it("bottom-right: icon hugs bottom-right, text right/bottom", () => {
    const { iconRect, textAlign, verticalAlign } = getIconTextLayout(
      el("bottom-right"),
    );
    expect(textAlign).toBe("right");
    expect(verticalAlign).toBe("bottom");
    expect(iconRect.x).toBe(200 - 8 - iconRect.w);
    expect(iconRect.y).toBe(100 - 8 - iconRect.h);
  });
});
