import { describe, expect, it } from "vitest";
import { selectRenderableStars } from "./renderCatalogPolicy";

describe("selectRenderableStars", () => {
  const catalog = [
    { hr: 1, vMagnitude: 1 },
    { hr: 2, vMagnitude: 5 },
    { hr: 3, vMagnitude: 5.1 },
    { hr: 4, vMagnitude: 6.5 },
  ] as const;

  it("keeps the magnitude boundary and required anchors in source order", () => {
    expect(
      selectRenderableStars(catalog, new Set([4])).map((star) => star.hr),
    ).toEqual([1, 2, 4]);
  });

  it("rejects a non-finite policy value", () => {
    expect(() =>
      selectRenderableStars(catalog, new Set(), Number.NaN),
    ).toThrow(/finite/);
  });
});
