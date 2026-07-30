import { describe, expect, it } from "vitest";
import {
  formatZonedDateTime,
  formatZonedDateTimeInput,
  timeZoneOffsetSecondsAtLocalDateTime,
  zonedLocalToDate
} from "./index";

describe("time-zone conversion", () => {
  it("resolves whole-second offsets at local year boundaries", () => {
    expect(
      timeZoneOffsetSecondsAtLocalDateTime(
        "1900-01-01T00:00:00.000",
        "UTC"
      )
    ).toBe(0);
    expect(
      timeZoneOffsetSecondsAtLocalDateTime(
        "1900-01-01T00:00:00.000",
        "Asia/Tokyo"
      )
    ).toBe(9 * 60 * 60);
  });

  it("converts a Tokyo wall time to its instant", () => {
    expect(
      zonedLocalToDate("2026-07-29T12:34", "Asia/Tokyo").toISOString()
    ).toBe("2026-07-29T03:34:00.000Z");
  });

  it("formats an instant for datetime-local input", () => {
    expect(
      formatZonedDateTimeInput(
        new Date("2026-07-29T03:34:00.000Z"),
        "Asia/Tokyo"
      )
    ).toBe("2026-07-29T12:34");
  });

  it("formats a reader-facing localized date", () => {
    const result = formatZonedDateTime(
      new Date("2026-07-29T03:34:00.000Z"),
      "Asia/Tokyo",
      "en-CA"
    );
    expect(result).toContain("Jul");
    expect(result).toContain("12:34");
  });

  it("rejects a nonexistent spring-forward wall time", () => {
    expect(() =>
      zonedLocalToDate(
        "2024-03-10T02:30",
        "America/New_York"
      )
    ).toThrow(/does not exist/);
  });

  it("supports explicit fall-back disambiguation", () => {
    const earlier = zonedLocalToDate(
      "2024-11-03T01:30",
      "America/New_York",
      "earlier"
    );
    const later = zonedLocalToDate(
      "2024-11-03T01:30",
      "America/New_York",
      "later"
    );

    expect(earlier.toISOString()).toBe("2024-11-03T05:30:00.000Z");
    expect(later.toISOString()).toBe("2024-11-03T06:30:00.000Z");
    expect(() =>
      zonedLocalToDate(
        "2024-11-03T01:30",
        "America/New_York",
        "reject"
      )
    ).toThrow(/ambiguous/);
  });

  it("validates calendar values", () => {
    expect(() =>
      zonedLocalToDate("2026-02-30T12:00", "UTC")
    ).toThrow(/invalid calendar/);
  });

  it("rejects invalid IANA identifiers with a stable message", () => {
    for (const operation of [
      () =>
        zonedLocalToDate(
          "2026-07-29T12:34",
          "Mars/Olympus_Mons"
        ),
      () =>
        formatZonedDateTime(
          new Date("2026-07-29T03:34:00.000Z"),
          "Mars/Olympus_Mons"
        ),
      () =>
        formatZonedDateTimeInput(
          new Date("2026-07-29T03:34:00.000Z"),
          "Mars/Olympus_Mons"
        )
    ]) {
      expect(operation).toThrow(
        "Invalid IANA time zone: Mars/Olympus_Mons"
      );
    }
  });

  it("rejects invalid Date objects before formatting", () => {
    const invalid = new Date(Number.NaN);
    expect(() =>
      formatZonedDateTime(invalid, "UTC")
    ).toThrow("Date must be valid");
    expect(() =>
      formatZonedDateTimeInput(invalid, "UTC")
    ).toThrow("Date must be valid");
  });

  it("supports non-hour offsets", () => {
    expect(
      zonedLocalToDate(
        "2026-07-29T12:34",
        "Pacific/Chatham"
      ).toISOString()
    ).toBe("2026-07-28T23:49:00.000Z");
  });

  it("handles Lord Howe's 30-minute DST gap and overlap", () => {
    expect(() =>
      zonedLocalToDate(
        "2024-10-06T02:15",
        "Australia/Lord_Howe"
      )
    ).toThrow(/does not exist/);

    const earlier = zonedLocalToDate(
      "2024-04-07T01:45",
      "Australia/Lord_Howe",
      "earlier"
    );
    const later = zonedLocalToDate(
      "2024-04-07T01:45",
      "Australia/Lord_Howe",
      "later"
    );
    expect(earlier.toISOString()).toBe("2024-04-06T14:45:00.000Z");
    expect(later.toISOString()).toBe("2024-04-06T15:15:00.000Z");
  });

  it("rejects unsupported disambiguation values at runtime", () => {
    expect(() =>
      zonedLocalToDate(
        "2026-07-29T12:34",
        "UTC",
        "compatible" as never
      )
    ).toThrow(/must be earlier, later, or reject/);
  });
});
