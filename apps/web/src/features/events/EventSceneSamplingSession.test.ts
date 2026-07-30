import { describe, expect, it } from "vitest";
import {
  clampEventSceneInstant,
  eventSceneContactRange,
  eventSceneProjectionInstants,
  eventSceneProjectionSampleCount,
} from "./EventSceneSamplingSession";
import type {
  EventContact,
  LocalCircumstances,
} from "../../domain/events/types";

function contact(
  phase: EventContact["phase"],
  milliseconds: number,
): EventContact {
  return {
    aboveHorizon: true,
    bodies: {},
    instantUtc: new Date(milliseconds),
    phase,
    positionAngleRadians: null,
  };
}

function circumstances(
  contacts: readonly EventContact[],
): LocalCircumstances {
  return {
    contacts,
    event: {
      canonicalEpochUtc: new Date(2_000),
      classificationHint: "partial",
      id: "se-20000101",
      kind: "solar-eclipse",
      targetStarHR: null,
      title: "test",
    },
    localClassification: "partial",
    maximum: contacts[0]!,
  } as unknown as LocalCircumstances;
}

describe("event scene sampling helpers", () => {
  it("uses the complete solved contact interval regardless of order", () => {
    expect(
      eventSceneContactRange(
        circumstances([
          contact("maximum", 2_000),
          contact("solar-c4", 4_000),
          contact("solar-c1", 1_000),
        ]),
      ),
    ).toEqual({
      endMilliseconds: 4_000,
      startMilliseconds: 1_000,
    });
  });

  it("disables arbitrary-time simulation without an interval", () => {
    expect(
      eventSceneContactRange(
        circumstances([contact("maximum", 2_000)]),
      ),
    ).toBeNull();
  });

  it("builds a deterministic inclusive physical-sampling grid", () => {
    const instants = eventSceneProjectionInstants(
      {
        endMilliseconds: 2_000,
        startMilliseconds: 1_000,
      },
      5,
      [new Date(1_100), new Date(1_500)],
    );
    expect(instants.map((instant) => instant.getTime())).toEqual([
      1_000, 1_100, 1_250, 1_500, 1_750, 2_000,
    ]);
  });

  it("rejects an invalid or out-of-session projection anchor", () => {
    const range = {
      endMilliseconds: 2_000,
      startMilliseconds: 1_000,
    };
    expect(() =>
      eventSceneProjectionInstants(range, 2, [
        new Date(Number.NaN),
      ]),
    ).toThrow(RangeError);
    expect(() =>
      eventSceneProjectionInstants(range, 2, [new Date(999)]),
    ).toThrow(RangeError);
  });

  it("uses event-specific physical grid cadence with a safety cap", () => {
    const oneHour = {
      endMilliseconds: 3_600_000,
      startMilliseconds: 0,
    };
    expect(
      eventSceneProjectionSampleCount("solar-eclipse", oneHour),
    ).toBe(31);
    expect(
      eventSceneProjectionSampleCount("lunar-eclipse", oneHour),
    ).toBe(21);
    expect(
      eventSceneProjectionSampleCount("lunar-occultation", oneHour),
    ).toBe(61);
    expect(
      eventSceneProjectionSampleCount("lunar-occultation", {
        endMilliseconds: 86_400_000,
        startMilliseconds: 0,
      }),
    ).toBe(257);
  });

  it("clamps playback to the loaded session", () => {
    const range = {
      endMilliseconds: 2_000,
      startMilliseconds: 1_000,
    };
    expect(clampEventSceneInstant(500, range)).toBe(1_000);
    expect(clampEventSceneInstant(1_500, range)).toBe(1_500);
    expect(clampEventSceneInstant(2_500, range)).toBe(2_000);
    expect(() => clampEventSceneInstant(Number.NaN, range)).toThrow(
      RangeError,
    );
  });
});
