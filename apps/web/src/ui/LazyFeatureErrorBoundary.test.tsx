import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyFeatureErrorBoundary } from "./LazyFeatureErrorBoundary";

function BrokenFeature(): never {
  throw new Error("chunk unavailable");
}

describe("LazyFeatureErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isolates a lazy feature failure from the rest of the application", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <main>
        <p>星図は利用できます。</p>
        <LazyFeatureErrorBoundary
          fallback={<p role="alert">ヘルプを読み込めませんでした。</p>}
          featureName="Help dialog"
        >
          <BrokenFeature />
        </LazyFeatureErrorBoundary>
      </main>,
    );

    expect(screen.getByText("星図は利用できます。")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ヘルプを読み込めませんでした。",
    );
    expect(
      consoleError.mock.calls.some(
        ([message]) => message === "Help dialog failed to load",
      ),
    ).toBe(true);
  });
});
