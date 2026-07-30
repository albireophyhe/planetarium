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

export type SettledEarthOrientationFrame = Readonly<{
  estimate: IersEarthOrientationEstimateV1 | null;
  instantMs: number;
  sourceIdentifier: string | null;
  status: "ready" | "unavailable" | "error";
}>;

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
 * The current estimate is exposed only after the exact requested instant
 * settles. `settledFrame` retains the last complete
 * instant/EOP/status/source tuple so callers can keep one atomic published
 * frame while a newer request is pending.
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
  const [requestPending, setRequestPending] = useState(true);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const latestRequestRef = useRef({
    dayMjdUtc: requestedDayMjdUtc,
    instantMs
  });
  const lastSettledRequestRef = useRef({
    instantMs: null as number | null,
    retryAttempt: -1
  });

  useLayoutEffect(() => {
    latestRequestRef.current = {
      dayMjdUtc: requestedDayMjdUtc,
      instantMs
    };
  }, [instantMs, requestedDayMjdUtc]);

  useEffect(() => {
    if (
      lastSettledRequestRef.current.instantMs === instantMs &&
      lastSettledRequestRef.current.retryAttempt === retryAttempt
    ) {
      return;
    }
    let cancelled = false;
    const requestedDate = new Date(instantMs);

    void lookup(requestedDate)
      .then(async (estimate) => {
        const sourceIdentifier =
          await sourceIdentifierForEstimate(estimate, lookup);
        if (
          cancelled ||
          latestRequestRef.current.dayMjdUtc !== requestedDayMjdUtc ||
          latestRequestRef.current.instantMs !== instantMs
        ) {
          return;
        }
        lastSettledRequestRef.current = {
          instantMs,
          retryAttempt
        };
        setState({
          dayMjdUtc: requestedDayMjdUtc,
          estimate,
          instantMs,
          sourceIdentifier,
          status: estimate === null ? "unavailable" : "ready"
        });
        setRequestPending(false);
      })
      .catch(() => {
        if (
          cancelled ||
          latestRequestRef.current.dayMjdUtc !== requestedDayMjdUtc ||
          latestRequestRef.current.instantMs !== instantMs
        ) {
          return;
        }
        lastSettledRequestRef.current = {
          instantMs,
          retryAttempt
        };
        setState({
          dayMjdUtc: requestedDayMjdUtc,
          estimate: null,
          instantMs,
          sourceIdentifier: null,
          status: "error"
        });
        setRequestPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instantMs, lookup, requestedDayMjdUtc, retryAttempt]);

  const sameDay =
    requestedDayMjdUtc !== null &&
    state.dayMjdUtc === requestedDayMjdUtc;
  const current =
    state.instantMs === instantMs && !requestPending;
  const estimate = current ? state.estimate : null;
  let status: IersEarthOrientationStatus;
  if (current) {
    status = state.status;
  } else if (sameDay && state.status === "ready") {
    status = "refreshing";
  } else {
    status = "loading";
  }

  const retry = useCallback(() => {
    setRequestPending(true);
    setRetryAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  const lookupAt = useCallback(
    (requestedDate: Date) =>
      lookup(new Date(requestedDate.getTime())),
    [lookup]
  );

  const settledFrame = useMemo<SettledEarthOrientationFrame | null>(
    () =>
      state.instantMs === null
        ? null
        : Object.freeze({
            estimate: state.estimate,
            instantMs: state.instantMs,
            sourceIdentifier: state.sourceIdentifier,
            status: state.status
          }),
    [
      state.estimate,
      state.instantMs,
      state.sourceIdentifier,
      state.status
    ]
  );

  return {
    estimate,
    isCurrent: current,
    lookupAt,
    retry,
    settledFrame,
    sourceIdentifier: current ? state.sourceIdentifier : null,
    status
  } as const;
}
