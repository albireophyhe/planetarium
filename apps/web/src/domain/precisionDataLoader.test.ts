import { describe, expect, it } from "vitest";
import { loadPrecisionStarCatalogV2 } from "./index";

describe("precision catalog loader", () => {
  it("loads, freezes, and reuses the separately chunked v2 catalog", async () => {
    const firstRequest = loadPrecisionStarCatalogV2();
    const secondRequest = loadPrecisionStarCatalogV2();

    expect(secondRequest).toBe(firstRequest);

    const catalog = await firstRequest;
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.stars)).toBe(true);
    expect(Object.isFrozen(catalog.stars[0])).toBe(true);
    expect(Object.isFrozen(catalog.starByHR)).toBe(true);
    expect("set" in catalog.starByHR).toBe(false);
    expect(catalog.stars).toHaveLength(8_404);
    expect(catalog.starByHR.get(2)).toBe(catalog.stars[0]);
    expect(catalog.starByHR.get(9_110)).toBe(
      catalog.stars[catalog.stars.length - 1]
    );
  });
});
