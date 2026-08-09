import { describeIconPath, groupIconsByCategory } from "./iconLibrary";

import type { LibraryIcon } from "./iconLibrary";

const icon = (id: string, name: string, category: string): LibraryIcon => ({
  id,
  name,
  category,
  svg: "<svg/>",
});

describe("describeIconPath", () => {
  it("drops the .svg extension", () => {
    expect(describeIconPath("acme.svg")).toEqual({
      name: "acme",
      category: "",
    });
    expect(describeIconPath("ACME.SVG").name).toBe("ACME");
  });

  it("uses nested folders as the category, ignoring the dropped root folder", () => {
    // the root folder is the user's own container, not a meaningful group
    expect(describeIconPath("icons/brand/acme.svg")).toEqual({
      name: "acme",
      category: "brand",
    });
    expect(describeIconPath("icons/brand/logos/acme.svg")).toEqual({
      name: "acme",
      category: "brand/logos",
    });
  });

  it("treats a file directly in the dropped folder as uncategorised", () => {
    expect(describeIconPath("icons/acme.svg")).toEqual({
      name: "acme",
      category: "",
    });
  });
});

describe("groupIconsByCategory", () => {
  it("groups by category, sorting groups and their icons by name", () => {
    const grouped = groupIconsByCategory([
      icon("b", "zeta", "shapes"),
      icon("a", "alpha", "shapes"),
      icon("c", "solo", ""),
      icon("d", "beta", "brand"),
    ]);

    expect(grouped.map((g) => g.category)).toEqual(["", "brand", "shapes"]);
    expect(grouped[2].icons.map((i) => i.name)).toEqual(["alpha", "zeta"]);
  });

  it("returns nothing for an empty library", () => {
    expect(groupIconsByCategory([])).toEqual([]);
  });
});
