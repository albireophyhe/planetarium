import { describe, expect, it } from "vitest";
import { selectRenderableStars } from "../app/renderCatalogPolicy";
import {
  constellations,
  namedStars,
} from "./catalogMetadata";
import { stars } from "./data";
import {
  renderMagnitudeLimit,
  renderStars,
  requiredRenderStarHrs,
} from "./renderData";

describe("initial render star artifact", () => {
  it("exactly reproduces the application selection policy", () => {
    const requiredHrs = new Set([
      ...namedStars.map((star) => star.hr),
      ...constellations.flatMap((constellation) =>
        constellation.segments.flatMap(([startHr, endHr]) => [
          startHr,
          endHr,
        ]),
      ),
    ]);
    const expected = selectRenderableStars(
      stars,
      requiredHrs,
      renderMagnitudeLimit,
    );

    expect([...requiredRenderStarHrs]).toEqual(
      [...requiredHrs].sort((first, second) => first - second),
    );
    expect(renderStars).toEqual(expected);
    expect(renderStars).toHaveLength(1_630);
  });

  it("retains every required star and no unneeded faint star", () => {
    const renderedHrs = new Set(renderStars.map((star) => star.hr));

    expect(
      [...requiredRenderStarHrs].every((hr) =>
        renderedHrs.has(hr),
      ),
    ).toBe(true);
    expect(
      renderStars.filter(
        (star) =>
          star.vMagnitude > renderMagnitudeLimit &&
          !requiredRenderStarHrs.has(star.hr),
      ),
    ).toEqual([]);
  });
});
