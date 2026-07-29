import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Dut1Estimate } from "../domain";
import { useIersDut1 } from "./useIersDut1";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

const OBSERVED: Dut1Estimate = {
  dut1Seconds: 0.071,
  source: "observed",
  uncertaintySeconds: 0.000_02,
};

describe("useIersDut1", () => {
  it("resolves a bundled estimate and refreshes safely within a UTC day", async () => {
    const second = deferred<Dut1Estimate | null>();
    const lookup = vi
      .fn<(date: Date) => Promise<Dut1Estimate | null>>()
      .mockResolvedValueOnce(OBSERVED)
      .mockReturnValueOnce(second.promise);
    const initial = new Date("2026-07-29T00:00:00.000Z");
    const { result, rerender } = renderHook(
      ({ date }) => useIersDut1(date, lookup),
      { initialProps: { date: initial } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.estimate).toEqual(OBSERVED);

    rerender({ date: new Date("2026-07-29T06:00:00.000Z") });
    expect(result.current.status).toBe("refreshing");
    expect(result.current.estimate).toEqual(OBSERVED);

    const predicted: Dut1Estimate = {
      dut1Seconds: 0.072,
      source: "predicted",
      uncertaintySeconds: 0.001,
    };
    await act(async () => {
      second.resolve(predicted);
      await second.promise;
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.estimate).toEqual(predicted);
  });

  it("never reuses an estimate across a UTC-day boundary", async () => {
    const nextDay = deferred<Dut1Estimate | null>();
    const lookup = vi
      .fn<(date: Date) => Promise<Dut1Estimate | null>>()
      .mockResolvedValueOnce(OBSERVED)
      .mockReturnValueOnce(nextDay.promise);
    const { result, rerender } = renderHook(
      ({ date }) => useIersDut1(date, lookup),
      {
        initialProps: {
          date: new Date("2016-12-31T23:59:59.000Z"),
        },
      },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ date: new Date("2017-01-01T00:00:00.000Z") });
    expect(result.current.status).toBe("loading");
    expect(result.current.estimate).toBeNull();
  });

  it("ignores a superseded request and reports unavailable or error", async () => {
    const first = deferred<Dut1Estimate | null>();
    const lookup = vi
      .fn<(date: Date) => Promise<Dut1Estimate | null>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(null);
    const { result, rerender } = renderHook(
      ({ date }) => useIersDut1(date, lookup),
      {
        initialProps: {
          date: new Date("2026-07-29T00:00:00.000Z"),
        },
      },
    );

    rerender({ date: new Date("2100-01-01T00:00:00.000Z") });
    await waitFor(() =>
      expect(result.current.status).toBe("unavailable"),
    );
    await act(async () => {
      first.resolve(OBSERVED);
      await first.promise;
    });
    expect(result.current.status).toBe("unavailable");
    expect(result.current.estimate).toBeNull();

    const failingLookup = vi.fn(async () => {
      throw new Error("chunk unavailable");
    });
    const failed = renderHook(() =>
      useIersDut1(
        new Date("2026-07-29T00:00:00.000Z"),
        failingLookup,
      ),
    );
    await waitFor(() =>
      expect(failed.result.current.status).toBe("error"),
    );
  });

  it("accepts a slow same-day seed during rapid playback", async () => {
    const first = deferred<Dut1Estimate | null>();
    const later = deferred<Dut1Estimate | null>();
    const lookup = vi
      .fn<(date: Date) => Promise<Dut1Estimate | null>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(later.promise);
    const { result, rerender } = renderHook(
      ({ date }) => useIersDut1(date, lookup),
      {
        initialProps: {
          date: new Date("2026-07-29T00:00:00.000Z"),
        },
      },
    );
    rerender({ date: new Date("2026-07-29T00:00:01.000Z") });

    await act(async () => {
      first.resolve(OBSERVED);
      await first.promise;
    });
    expect(result.current.status).toBe("refreshing");
    expect(result.current.estimate).toEqual(OBSERVED);

    const latest = { ...OBSERVED, dut1Seconds: 0.071_001 };
    await act(async () => {
      later.resolve(latest);
      await later.promise;
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.estimate).toEqual(latest);
  });

  it("retries a failed bundled lookup without changing the observation time", async () => {
    const recovered: Dut1Estimate = {
      dut1Seconds: 0.072,
      source: "predicted",
      uncertaintySeconds: 0.001,
    };
    const lookup = vi
      .fn<(date: Date) => Promise<Dut1Estimate | null>>()
      .mockRejectedValueOnce(new Error("temporary chunk failure"))
      .mockResolvedValueOnce(recovered);
    const date = new Date("2026-07-29T00:00:00.000Z");
    const { result } = renderHook(() => useIersDut1(date, lookup));

    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.estimate).toEqual(recovered);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls[0]?.[0]).toEqual(date);
    expect(lookup.mock.calls[1]?.[0]).toEqual(date);
  });

  it("keeps auxiliary lookups on the documented DUT1=0 fallback", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("chunk unavailable");
    });
    const date = new Date("2026-07-29T00:00:00.000Z");
    const { result } = renderHook(() => useIersDut1(date, lookup));

    await waitFor(() => expect(result.current.status).toBe("error"));
    await expect(
      result.current.lookupAt(
        new Date("2026-07-29T03:00:00.000Z"),
      ),
    ).resolves.toBeNull();
  });
});
