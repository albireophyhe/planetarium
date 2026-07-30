import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IersEarthOrientationEstimateV1 } from "../domain";
import { useIersEarthOrientation } from "./useIersEarthOrientation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
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
    expect(result.current.estimate).toBeNull();
    expect(result.current.settledFrame).toMatchObject({
      estimate: OBSERVED,
      instantMs: Date.parse("2026-07-29T00:00:00.000Z"),
      status: "ready"
    });

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
    expect(result.current.settledFrame).toMatchObject({
      estimate: predicted,
      instantMs: Date.parse("2026-07-29T06:00:00.000Z"),
      status: "ready"
    });
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
    expect(result.current.settledFrame).toMatchObject({
      estimate: OBSERVED,
      instantMs: Date.parse("2016-12-31T23:59:59.000Z"),
      status: "ready"
    });
  });

  it("commits only the latest request when same-day responses resolve out of order", async () => {
    const first = deferred<IersEarthOrientationEstimateV1 | null>();
    const latest = deferred<IersEarthOrientationEstimateV1 | null>();
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(latest.promise);
    const { result, rerender } = renderHook(
      ({ date }) => useIersEarthOrientation(date, lookup),
      {
        initialProps: {
          date: new Date("2026-07-29T00:00:00.000Z")
        }
      }
    );

    rerender({
      date: new Date("2026-07-29T00:00:01.000Z")
    });
    await act(async () => {
      first.resolve(OBSERVED);
      await first.promise;
    });
    expect(result.current.settledFrame).toBeNull();

    const latestEstimate = {
      ...OBSERVED,
      dut1: {
        ...OBSERVED.dut1,
        seconds: 0.073
      }
    };
    await act(async () => {
      latest.resolve(latestEstimate);
      await latest.promise;
    });
    expect(result.current.settledFrame).toMatchObject({
      estimate: latestEstimate,
      instantMs: Date.parse("2026-07-29T00:00:01.000Z"),
      status: "ready"
    });
  });

  it("settles a real latest-request failure without letting a stale failure replace it", async () => {
    const stale = deferred<IersEarthOrientationEstimateV1 | null>();
    const latest = deferred<IersEarthOrientationEstimateV1 | null>();
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    const { result, rerender } = renderHook(
      ({ date }) => useIersEarthOrientation(date, lookup),
      {
        initialProps: {
          date: new Date("2026-07-29T23:59:59.000Z")
        }
      }
    );

    rerender({
      date: new Date("2026-07-30T00:00:00.000Z")
    });
    await act(async () => {
      stale.reject(new Error("stale chunk failure"));
      await stale.promise.catch(() => undefined);
    });
    expect(result.current.settledFrame).toBeNull();

    await act(async () => {
      latest.reject(new Error("latest chunk failure"));
      await latest.promise.catch(() => undefined);
    });
    expect(result.current.settledFrame).toMatchObject({
      estimate: null,
      instantMs: Date.parse("2026-07-30T00:00:00.000Z"),
      status: "error"
    });
    expect(result.current.status).toBe("error");
  });

  it("restores an already settled instant without a fallible duplicate lookup", async () => {
    const newer =
      deferred<IersEarthOrientationEstimateV1 | null>();
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockResolvedValueOnce(OBSERVED)
      .mockReturnValueOnce(newer.promise);
    const settledDate = new Date("2026-07-29T00:00:00.000Z");
    const { result, rerender } = renderHook(
      ({ date }) => useIersEarthOrientation(date, lookup),
      {
        initialProps: { date: settledDate }
      }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({
      date: new Date("2026-07-29T00:00:01.000Z")
    });
    expect(result.current.isCurrent).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);

    rerender({ date: new Date(settledDate.getTime()) });
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.estimate).toEqual(OBSERVED);
    expect(lookup).toHaveBeenCalledTimes(2);

    await act(async () => {
      newer.reject(new Error("cancelled newer request"));
      await newer.promise.catch(() => undefined);
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.settledFrame).toMatchObject({
      estimate: OBSERVED,
      instantMs: settledDate.getTime(),
      status: "ready"
    });
  });

  it("reports errors, retries, and propagates auxiliary integrity failures", async () => {
    const lookup = vi
      .fn<
        (
          date: Date
        ) => Promise<IersEarthOrientationEstimateV1 | null>
      >()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockRejectedValueOnce(new Error("chunk digest mismatch"))
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
    ).rejects.toThrow("chunk digest mismatch");
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    expect(result.current.isCurrent).toBe(false);
    expect(result.current.settledFrame).toMatchObject({
      estimate: null,
      instantMs: date.getTime(),
      status: "error"
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.estimate).toEqual(OBSERVED);
  });
});
