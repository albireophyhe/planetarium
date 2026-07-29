import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IersEarthOrientationEstimateV1 } from "../domain";
import { useIersEarthOrientation } from "./useIersEarthOrientation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const OBSERVED: IersEarthOrientationEstimateV1 = {
  dut1: {
    seconds: 0.071,
    reportedErrorSeconds: 0.00002,
    source: "observed"
  },
  polarMotion: {
    xpRadians: 1e-6,
    ypRadians: 2e-6,
    xpReportedErrorRadians: 1e-9,
    ypReportedErrorRadians: 2e-9,
    source: "observed",
    usesPrediction: false
  }
};

describe("useIersEarthOrientation", () => {
  it("resolves an integrated estimate and refreshes safely within a UTC day", async () => {
    const second =
      deferred<IersEarthOrientationEstimateV1 | null>();
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockResolvedValueOnce(OBSERVED)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ date }) => useIersEarthOrientation(date, lookup),
      {
        initialProps: {
          date: new Date("2026-07-29T00:00:00.000Z")
        }
      }
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({
      date: new Date("2026-07-29T06:00:00.000Z")
    });
    expect(result.current.status).toBe("refreshing");
    expect(result.current.estimate).toEqual(OBSERVED);

    const predicted: IersEarthOrientationEstimateV1 = {
      ...OBSERVED,
      dut1: {
        ...OBSERVED.dut1,
        seconds: 0.072,
        source: "predicted"
      }
    };
    await act(async () => {
      second.resolve(predicted);
      await second.promise;
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.estimate).toEqual(predicted);
  });

  it("never reuses an estimate across UTC midnight", async () => {
    const nextDay =
      deferred<IersEarthOrientationEstimateV1 | null>();
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockResolvedValueOnce(OBSERVED)
      .mockReturnValueOnce(nextDay.promise);
    const { result, rerender } = renderHook(
      ({ date }) => useIersEarthOrientation(date, lookup),
      {
        initialProps: {
          date: new Date("2016-12-31T23:59:59.000Z")
        }
      }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({
      date: new Date("2017-01-01T00:00:00.000Z")
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.estimate).toBeNull();
  });

  it("reports errors, retries, and keeps auxiliary lookups fail-safe", async () => {
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValue(OBSERVED);
    const date = new Date("2026-07-29T00:00:00.000Z");
    const { result } = renderHook(() =>
      useIersEarthOrientation(date, lookup)
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    await expect(
      result.current.lookupAt(
        new Date("2026-07-29T03:00:00.000Z")
      )
    ).resolves.toEqual(OBSERVED);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.estimate).toEqual(OBSERVED);
  });
});
