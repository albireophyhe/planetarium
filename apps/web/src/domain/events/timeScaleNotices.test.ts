import { describe, expect, it } from "vitest";
import { eventTimeScaleNotices } from "./timeScaleNotices";

describe("eventTimeScaleNotices", () => {
  it("keeps ordinary, historically settled UTC event times quiet", () => {
    expect(
      eventTimeScaleNotices(new Date("2026-08-12T18:13:22Z")),
    ).toEqual({
      dominantContributors: [],
      warnings: [],
    });
  });

  it("labels event UTC after the currently announced leap-second horizon", () => {
    const notices = eventTimeScaleNotices(
      new Date("2028-08-12T18:13:22Z"),
    );

    expect(notices.dominantContributors.join(" ")).toContain(
      "うるう秒",
    );
    expect(notices.warnings.join(" ")).toContain("IERS");
  });

  it("labels the pre-1972 UTC−TT approximation", () => {
    const notices = eventTimeScaleNotices(
      new Date("1969-03-18T04:00:00Z"),
    );

    expect(notices.dominantContributors.join(" ")).toContain(
      "UTC−TT近似",
    );
    expect(notices.warnings.join(" ")).toContain("精密観測");
  });
});
