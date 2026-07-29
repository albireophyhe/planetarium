import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dateToMjdUtc,
  lookupIersDut1,
  type Dut1Estimate,
} from "../domain";

export type IersDut1Status =
  | "loading"
  | "ready"
  | "refreshing"
  | "unavailable"
  | "error";

type Dut1Lookup = (date: Date) => Promise<Dut1Estimate | null>;

type ResolvedState = {
  readonly dayMjdUtc: number | null;
  readonly estimate: Dut1Estimate | null;
  readonly instantMs: number | null;
  readonly status: "ready" | "unavailable" | "error";
};

const INITIAL_STATE: ResolvedState = {
  dayMjdUtc: null,
  estimate: null,
  instantMs: null,
  status: "unavailable",
};

/**
 * Resolve the bundled IERS DUT1 value without allowing an older asynchronous
 * request to overwrite a newer observation time.
 *
 * While playback remains within one UTC day, the most recently resolved value
 * stays usable for the sub-millisecond promise turn needed to interpolate the
 * next frame. It is never reused across a UTC-day boundary, where a leap-second
 * discontinuity could otherwise make a stale value materially wrong.
 */
export function useIersDut1(
  date: Date,
  lookup: Dut1Lookup = lookupIersDut1,
) {
  const instantMs = date.getTime();
  const requestedDayMjdUtc = useMemo(() => {
    const mjd = dateToMjdUtc(new Date(instantMs));
    return mjd === null ? null : Math.floor(mjd);
  }, [instantMs]);
  const [state, setState] = useState<ResolvedState>(INITIAL_STATE);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const latestRequestRef = useRef({
    dayMjdUtc: requestedDayMjdUtc,
    instantMs,
  });
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    latestRequestRef.current = {
      dayMjdUtc: requestedDayMjdUtc,
      instantMs,
    };
  }, [instantMs, requestedDayMjdUtc]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestedDate = new Date(instantMs);

    void lookup(requestedDate)
      .then((estimate) => {
        if (
          !mountedRef.current ||
          latestRequestRef.current.dayMjdUtc !== requestedDayMjdUtc
        ) {
          return;
        }
        setState((current) => {
          const isLatest =
            latestRequestRef.current.instantMs === instantMs;
          const hasSameDayEstimate =
            current.dayMjdUtc === requestedDayMjdUtc &&
            current.estimate !== null;
          // A slow first chunk request may be superseded many times during
          // playback. Its same-day value is still a safe temporary seed; an
          // older result never replaces a newer successful interpolation.
          if (!isLatest && hasSameDayEstimate) {
            return current;
          }
          return {
            dayMjdUtc: requestedDayMjdUtc,
            estimate,
            instantMs,
            status: estimate === null ? "unavailable" : "ready",
          };
        });
      })
      .catch(() => {
        if (
          !mountedRef.current ||
          latestRequestRef.current.dayMjdUtc !== requestedDayMjdUtc
        ) {
          return;
        }
        setState((current) => {
          if (
            latestRequestRef.current.instantMs !== instantMs ||
            (current.dayMjdUtc === requestedDayMjdUtc &&
              current.estimate !== null)
          ) {
            return current;
          }
          return {
            dayMjdUtc: requestedDayMjdUtc,
            estimate: null,
            instantMs,
            status: "error",
          };
        });
      });
  }, [instantMs, lookup, requestedDayMjdUtc, retryAttempt]);

  const sameDay =
    requestedDayMjdUtc !== null &&
    state.dayMjdUtc === requestedDayMjdUtc;
  const current = state.instantMs === instantMs;
  const estimate = sameDay ? state.estimate : null;
  let status: IersDut1Status;
  if (current) {
    status = state.status;
  } else if (sameDay && state.status === "ready") {
    status = "refreshing";
  } else {
    status = "loading";
  }

  const retry = useCallback(() => {
    setState((currentState) =>
      currentState.status === "error"
        ? {
            ...currentState,
            instantMs: null,
            status: "unavailable",
          }
        : currentState,
    );
    setRetryAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  const lookupAt = useCallback(
    async (requestedDate: Date) => {
      try {
        return await lookup(new Date(requestedDate.getTime()));
      } catch {
        // Precision-v2 explicitly falls back to DUT1=0 when bundled
        // Earth-orientation data cannot be read. Auxiliary consumers such
        // as the selected-star track must retain the same safe contract.
        return null;
      }
    },
    [lookup],
  );

  return {
    estimate,
    isCurrent: current,
    lookupAt,
    retry,
    status,
  } as const;
}
