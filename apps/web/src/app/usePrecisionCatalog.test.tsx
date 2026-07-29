import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrecisionStarCatalogV2 } from "../domain";
import { loadPrecisionStarCatalogV2 } from "../domain";
import { usePrecisionCatalog } from "./usePrecisionCatalog";

vi.mock("../domain", async (importOriginal) => {
  const original = await importOriginal<typeof import("../domain")>();
  return {
    ...original,
    loadPrecisionStarCatalogV2: vi.fn(),
  };
});

const TEST_CATALOG: PrecisionStarCatalogV2 = {
  starByHR: new Map(),
  stars: [],
};

describe("usePrecisionCatalog", () => {
  beforeEach(() => {
    vi.mocked(loadPrecisionStarCatalogV2).mockReset();
  });

  it("loads the v2 catalog and exposes it as one ready state", async () => {
    vi.mocked(loadPrecisionStarCatalogV2).mockResolvedValue(TEST_CATALOG);

    const { result } = renderHook(() => usePrecisionCatalog());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.catalog).toBe(TEST_CATALOG);
  });

  it("keeps failure recoverable through an explicit retry", async () => {
    vi.mocked(loadPrecisionStarCatalogV2)
      .mockRejectedValueOnce(new Error("transient chunk failure"))
      .mockResolvedValueOnce(TEST_CATALOG);

    const { result } = renderHook(() => usePrecisionCatalog());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.catalog).toBeNull();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.catalog).toBe(TEST_CATALOG);
    expect(loadPrecisionStarCatalogV2).toHaveBeenCalledTimes(2);
  });
});
