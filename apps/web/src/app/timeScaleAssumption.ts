import type { ResolvedTimeScales } from "../domain";

type TimeScaleAssumptionInput = Pick<
  ResolvedTimeScales,
  "taiMinusUtcSeconds" | "warnings"
>;

function formatSeconds(seconds: number) {
  return Number.isInteger(seconds)
    ? String(Object.is(seconds, -0) ? 0 : seconds)
    : seconds.toFixed(3).replace(/\.?0+$/, "");
}

/**
 * Returns concise reader-facing copy only when the default UTC→TT conversion
 * relies on an explicit approximation.
 */
export function timeScaleAssumptionText(
  timeScales: TimeScaleAssumptionInput | null,
): string | null {
  if (!timeScales) {
    return null;
  }

  if (
    timeScales.warnings.includes(
      "pre-1972-utc-tt-approximation",
    )
  ) {
    return "時刻系：TAI−UTC=0秒近似（1972年以前）";
  }

  if (
    timeScales.warnings.includes("future-leap-seconds-unknown")
  ) {
    return `時刻系：将来うるう秒不明・${formatSeconds(
      timeScales.taiMinusUtcSeconds,
    )}秒仮定（TAI−UTC）`;
  }

  return null;
}
