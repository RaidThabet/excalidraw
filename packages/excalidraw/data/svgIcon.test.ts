import { sanitizeSvg } from "./svgIcon";

describe("sanitizeSvg", () => {
  it("keeps benign svg shapes", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
    );
    expect(out).toContain("<svg");
    expect(out).toContain("circle");
  });

  it("strips <script>", () => {
    const out = sanitizeSvg("<svg><script>alert(1)</script><rect/></svg>");
    expect(out).not.toContain("script");
    expect(out).toContain("rect");
  });

  it("strips event handlers", () => {
    const out = sanitizeSvg('<svg><rect onload="alert(1)"/></svg>');
    expect(out).not.toContain("onload");
  });

  it("returns null for non-svg input", () => {
    expect(sanitizeSvg("not svg")).toBeNull();
    expect(sanitizeSvg("<div>hi</div>")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
  });
});
