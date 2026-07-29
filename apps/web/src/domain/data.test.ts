import { describe, expect, it } from "vitest";
import {
  calculateStarPosition,
  cities,
  constellations,
  namedStarByHR,
  namedStars,
  starByHR,
  stars
} from "./index";

describe("catalogue adapters", () => {
  it("loads the complete naked-eye catalogue into indexed records", () => {
    expect(stars).toHaveLength(8_404);
    expect(starByHR.size).toBe(stars.length);
    expect(starByHR.get(2491)?.hd).toBe(48915);
    for (let index = 1; index < stars.length; index += 1) {
      expect(stars[index].hr).toBeGreaterThan(stars[index - 1].hr);
    }
  });

  it("indexes every curated named star", () => {
    expect(namedStars.length).toBeGreaterThan(40);
    expect(namedStarByHR.size).toBe(namedStars.length);
    expect(namedStarByHR.get(2491)?.nameJa).toBe("シリウス");
  });

  it("keeps constellation endpoints and cities resolvable", () => {
    for (const constellation of constellations) {
      for (const [firstHR, secondHR] of constellation.segments) {
        expect(starByHR.has(firstHR)).toBe(true);
        expect(starByHR.has(secondHR)).toBe(true);
      }
    }
    expect(cities.find(({ id }) => id === "tokyo")?.timeZone).toBe(
      "Asia/Tokyo"
    );
  });

  it("calculates a finite display position for a catalogue star", () => {
    const sirius = starByHR.get(2491);
    const tokyo = cities.find(({ id }) => id === "tokyo");
    expect(sirius).toBeDefined();
    expect(tokyo).toBeDefined();
    if (sirius === undefined || tokyo === undefined) {
      throw new Error("Fixture data is missing");
    }

    const position = calculateStarPosition(
      sirius,
      new Date("2026-01-15T12:00:00.000Z"),
      tokyo
    );
    expect(Number.isFinite(position.horizontal.altitude)).toBe(true);
    expect(Number.isFinite(position.projection.x)).toBe(true);
    expect(Number.isFinite(position.projection.y)).toBe(true);
  });

  it("calculates every catalogue row deterministically without invalid output", () => {
    const tokyo = cities.find(({ id }) => id === "tokyo");
    expect(tokyo).toBeDefined();
    if (tokyo === undefined) {
      throw new Error("Tokyo fixture data is missing");
    }

    const date = new Date("2026-07-29T12:00:00.000Z");
    let processed = 0;
    let visible = 0;
    for (const star of stars) {
      const position = calculateStarPosition(star, date, tokyo);
      if (
        !Number.isFinite(position.equatorial.rightAscension) ||
        !Number.isFinite(position.equatorial.declination) ||
        !Number.isFinite(position.horizontal.altitude) ||
        !Number.isFinite(position.horizontal.azimuth) ||
        !Number.isFinite(position.projection.x) ||
        !Number.isFinite(position.projection.y)
      ) {
        throw new Error(`HR ${star.hr} produced a non-finite position`);
      }
      if (
        position.equatorial.rightAscension < 0 ||
        position.equatorial.rightAscension >= 2 * Math.PI ||
        position.horizontal.azimuth < 0 ||
        position.horizontal.azimuth >= 2 * Math.PI
      ) {
        throw new Error(`HR ${star.hr} produced a non-normalized angle`);
      }
      processed += 1;
      if (position.horizontal.altitude >= 0) {
        visible += 1;
      }
    }

    expect(processed).toBe(8_404);
    expect(visible).toBeGreaterThan(3_000);
    expect(visible).toBeLessThan(5_500);
  });
});
