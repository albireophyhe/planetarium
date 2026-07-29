import { describe, expect, it } from "vitest";
import {
  assertValidObservingLocation,
  equatorialToHorizontal,
  ObservingLocationValidationError,
  validateObservingLocation
} from "./index";

describe("observing-location validation", () => {
  it("accepts valid locations including geographic boundaries", () => {
    for (const location of [
      { latitude: 35.6812, longitude: 139.7671, timeZone: "Asia/Tokyo" },
      { latitude: 90, longitude: 180, timeZone: "UTC" },
      { latitude: -90, longitude: -180, timeZone: "Etc/UTC" }
    ]) {
      const result = validateObservingLocation(location);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(location);
        expect(result.issues).toHaveLength(0);
      }
    }
  });

  it("returns stable, field-specific issues for invalid input", () => {
    const result = validateObservingLocation({
      latitude: Number.NaN,
      longitude: 181,
      timeZone: "Mars/Olympus_Mons"
    });
    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          field: "latitude",
          code: "latitude-not-finite"
        }),
        expect.objectContaining({
          field: "longitude",
          code: "longitude-out-of-range"
        }),
        expect.objectContaining({
          field: "timeZone",
          code: "time-zone-invalid"
        })
      ]
    });
  });

  it("rejects non-objects and blank time zones without throwing", () => {
    expect(validateObservingLocation(null)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          field: "location",
          code: "invalid-location"
        })
      ]
    });
    expect(
      validateObservingLocation({
        latitude: 0,
        longitude: 0,
        timeZone: " "
      })
    ).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          field: "timeZone",
          code: "time-zone-empty"
        })
      ]
    });
  });

  it("throws a typed aggregate error at calculation boundaries", () => {
    const invalid = {
      latitude: 91,
      longitude: Number.POSITIVE_INFINITY,
      timeZone: "UTC"
    };
    expect(() => assertValidObservingLocation(invalid)).toThrow(
      ObservingLocationValidationError
    );
    expect(() =>
      equatorialToHorizontal(
        { rightAscension: 0, declination: 0 },
        new Date("2026-01-01T00:00:00.000Z"),
        invalid
      )
    ).toThrow(/Latitude must be between -90 and 90/);
  });

  it("revalidates a mutable runtime object after a field changes", () => {
    const location = {
      latitude: 0,
      longitude: 0,
      timeZone: "UTC"
    };
    expect(validateObservingLocation(location).ok).toBe(true);
    location.latitude = 91;
    const result = validateObservingLocation(location);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("latitude-out-of-range");
    }
  });
});
