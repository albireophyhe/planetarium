import {
  resolveTimeScales,
  type EarthOrientationOptions,
} from "../precision";

export interface EventTimeScaleNotices {
  readonly dominantContributors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Converts precision-pipeline time-scale warning codes into event-language
 * notices. Event times are presented as UTC, so the leap-second and
 * pre-1972 assumptions must remain visible alongside the contact result.
 */
export function eventTimeScaleNotices(
  instantUtc: Date,
  earthOrientation?: EarthOrientationOptions,
): EventTimeScaleNotices {
  const warningCodes = resolveTimeScales(
    instantUtc,
    earthOrientation,
  ).warnings;
  const dominantContributors: string[] = [];
  const warnings: string[] = [];

  if (warningCodes.includes("pre-1972-utc-tt-approximation")) {
    dominantContributors.push("1972年以前のUTC−TT近似");
    warnings.push(
      "1972年以前のUTCとTTの差は近似値です。接触時刻を精密観測には使用しないでください。",
    );
  }
  if (warningCodes.includes("future-leap-seconds-unknown")) {
    dominantContributors.push("将来のうるう秒が未確定");
    warnings.push(
      "将来のうるう秒は未確定です。UTCの接触時刻は今後のIERS発表で変わる可能性があります。",
    );
  }

  return {
    dominantContributors: Object.freeze(dominantContributors),
    warnings: Object.freeze(warnings),
  };
}
