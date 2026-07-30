import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  dateToMjdUtc,
  loadIersEarthOrientationService,
  lookupIersEarthOrientation,
  type IersEarthOrientationEstimateV1
} from "../domain";

export type IersEarthOrientationStatus =
  | "loading"
  | "ready"
  | "refreshing"
  | "unavailable"
  | "error";

type EarthOrientationLookup = (
  date: Date
) => Promise<IersEarthOrientationEstimateV1 | null>;

type ResolvedState = {
  readonly dayMjdUtc: number | null;
  readonly estimate: IersEarthOrientationEstimateV1 | null;
  readonly instantMs: number | null;
  readonly sourceIdentifier: string | null;
  readonly status: "ready" | "unavailable" | "error";
};

const INITIAL_STATE: ResolvedState = {
  dayMjdUtc: null,
  estimate: null,
  instantMs: null,
  sourceIdentifier: null,
  status: "unavailable"
};

async function sourceIdentifierForEstimate(
  estimate: IersEarthOrientationEstimateV1 | null,
  lookup: EarthOrientationLookup,
) {
  if (!estimate || lookup !== lookupIersEarthOrientation) {
    return null;
  }
  try {
    const source = (await loadIersEarthOrientationService()).source;
    return `${source.title}; retrievedAt=${source.retrievedAt}; sha256=${source.sourceSha256}; DUT1=${estimate.dut1.source}; xp/yp=${estimate.polarMotion.source}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the bundled integrated IERS EOP estimate without allowing an older
 * asynchronous request to overwrite a newer observation time.
 *
 * A same-UTC-day estimate remains a safe temporary playback seed. It is
 * never reused across UTC midnight because DUT1 can step at a leap second.
 */
export function useIersEarthOrientation(
  date: Date,
  lookup: EarthOrientationLookup =
    lookupIersEarthOrientation
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
    instantMs
  });
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    latestRequestRef.current = {
      dayMjdUtc: requestedDayMjdUtc,
      instantMs
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
      .then(async (estimate) => {
        const sourceIdentifier =
          await sourceIdentifierForEstimate(estimate, lookup);
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
          if (!isLatest && hasSameDayEstimate) {
            return current;
          }
          return {
            dayMjdUtc: requestedDayMjdUtc,
            estimate,
            instantMs,
            sourceIdentifier,
            status: estimate === null ? "unavailable" : "ready"
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
            sourceIdentifier: null,
            status: "error"
          };
        });
      });
  }, [instantMs, lookup, requestedDayMjdUtc, retryAttempt]);

  const sameDay =
    requestedDayMjdUtc !== null &&
    state.dayMjdUtc === requestedDayMjdUtc;
  const current = state.instantMs === instantMs;
  const estimate = sameDay ? state.estimate : null;
  let status: IersEarthOrientationStatus;
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
            status: "unavailable"
          }
        : currentState
    );
    setRetryAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  const lookupAt = useCallback(
    (requestedDate: Date) =>
      lookup(new Date(requestedDate.getTime())),
    [lookup]
  );

  return {
    estimate,
    isCurrent: current,
    lookupAt,
    retry,
    sourceIdentifier: sameDay ? state.sourceIdentifier : null,
    status
  } as const;
}
