import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { usePlaybackClock } from "./usePlaybackClock";

type MediaQueryChangeListener = (event: MediaQueryListEvent) => void;

function createMotionPreference(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<MediaQueryChangeListener>();
  const query = {
    addEventListener: vi.fn(
      (_type: string, listener: MediaQueryChangeListener) => {
        listeners.add(listener);
      },
    ),
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    removeEventListener: vi.fn(
      (_type: string, listener: MediaQueryChangeListener) => {
        listeners.delete(listener);
      },
    ),
  } as unknown as MediaQueryList;

  return {
    query,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function createAnimationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id);
  });

  return {
    cancelAnimationFrame,
    requestAnimationFrame,
    runNext(now: number) {
      const entry = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!entry) {
        throw new Error("No animation frame was scheduled");
      }
      const [id, callback] = entry;
      callbacks.delete(id);
      callback(now);
    },
  };
}

describe("usePlaybackClock", () => {
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "hidden",
  );

  beforeEach(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalHiddenDescriptor) {
      Object.defineProperty(
        document,
        "hidden",
        originalHiddenDescriptor,
      );
    } else {
      Reflect.deleteProperty(document, "hidden");
    }
  });

  it("advances from animation-frame time and reports the supported maximum", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const onBoundary = vi.fn();
    const onDateChange = vi.fn();

    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2100-12-31T23:59:59.900Z"),
        onBoundary,
        onDateChange,
      }),
    );

    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);

    act(() => frames.runNext(1_100));

    expect(onDateChange).toHaveBeenCalledTimes(1);
    expect(onDateChange.mock.calls[0]?.[0].toISOString()).toBe(
      "2100-12-31T23:59:59.999Z",
    );
    expect(onBoundary).toHaveBeenCalledWith("maximum");
    expect(result.current.isPlaying).toBe(false);
  });

  it("reports the supported minimum when reverse playback reaches it", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const onBoundary = vi.fn();
    const onDateChange = vi.fn();

    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("1900-01-01T00:00:00.100Z"),
        onBoundary,
        onDateChange,
      }),
    );

    act(() => {
      result.current.setDirection(-1);
    });
    act(() => result.current.play());
    act(() => frames.runNext(1_100));

    expect(onDateChange.mock.calls[0]?.[0].toISOString()).toBe(
      "1900-01-01T00:00:00.000Z",
    );
    expect(onBoundary).toHaveBeenCalledWith("minimum");
    expect(result.current.isPlaying).toBe(false);
  });

  it("refuses play immediately at the outward maximum boundary", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const onBoundary = vi.fn();
    const onDateChange = vi.fn();
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2100-12-31T23:59:59.999Z"),
        onBoundary,
        onDateChange,
      }),
    );

    act(() => result.current.play());

    expect(result.current.isPlaying).toBe(false);
    expect(onBoundary).toHaveBeenCalledOnce();
    expect(onBoundary).toHaveBeenCalledWith("maximum");
    expect(onDateChange).not.toHaveBeenCalled();
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("refuses toggle immediately at the outward minimum boundary", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const onBoundary = vi.fn();
    const onDateChange = vi.fn();
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("1900-01-01T00:00:00.000Z"),
        onBoundary,
        onDateChange,
      }),
    );

    act(() => result.current.setDirection(-1));
    act(() => result.current.toggle());

    expect(result.current.isPlaying).toBe(false);
    expect(onBoundary).toHaveBeenCalledOnce();
    expect(onBoundary).toHaveBeenCalledWith("minimum");
    expect(onDateChange).not.toHaveBeenCalled();
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("allows play and toggle inward from the exact boundaries", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const onBoundary = vi.fn();
    const onDateChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ date }) =>
        usePlaybackClock({
          date,
          onBoundary,
          onDateChange,
        }),
      {
        initialProps: {
          date: new Date("2100-12-31T23:59:59.999Z"),
        },
      },
    );

    act(() => result.current.setDirection(-1));
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    expect(onBoundary).not.toHaveBeenCalled();

    act(() => result.current.pause());
    rerender({
      date: new Date("1900-01-01T00:00:00.000Z"),
    });
    act(() => result.current.setDirection(1));
    act(() => result.current.toggle());

    expect(result.current.isPlaying).toBe(true);
    expect(onBoundary).not.toHaveBeenCalled();
    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it("uses a new direction when setDirection and play share one act", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const onBoundary = vi.fn();
    const { result, rerender } = renderHook(
      ({ date }) =>
        usePlaybackClock({
          date,
          onBoundary,
          onDateChange: vi.fn(),
        }),
      {
        initialProps: {
          date: new Date("1900-01-01T00:00:00.000Z"),
        },
      },
    );

    act(() => {
      result.current.setDirection(-1);
      result.current.play();
    });

    expect(result.current.direction).toBe(-1);
    expect(result.current.isPlaying).toBe(false);
    expect(onBoundary).toHaveBeenLastCalledWith("minimum");
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();

    onBoundary.mockClear();
    rerender({
      date: new Date("2100-12-31T23:59:59.999Z"),
    });
    act(() => {
      result.current.setDirection(-1);
      result.current.play();
    });

    expect(result.current.direction).toBe(-1);
    expect(result.current.isPlaying).toBe(true);
    expect(onBoundary).not.toHaveBeenCalled();
    expect(frames.requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it.each([
    {
      boundary: "maximum" as const,
      date: "2100-12-31T23:59:59.999Z",
      inwardDirection: -1 as const,
      outwardDirection: 1 as const,
    },
    {
      boundary: "minimum" as const,
      date: "1900-01-01T00:00:00.000Z",
      inwardDirection: 1 as const,
      outwardDirection: -1 as const,
    },
  ])(
    "stops immediately when direction turns outward at $boundary",
    ({
      boundary,
      date,
      inwardDirection,
      outwardDirection,
    }) => {
      const motion = createMotionPreference();
      vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
      const frames = createAnimationFrames();
      vi.stubGlobal(
        "requestAnimationFrame",
        frames.requestAnimationFrame,
      );
      vi.stubGlobal(
        "cancelAnimationFrame",
        frames.cancelAnimationFrame,
      );
      const onBoundary = vi.fn();
      const { result } = renderHook(() =>
        usePlaybackClock({
          date: new Date(date),
          onBoundary,
          onDateChange: vi.fn(),
        }),
      );

      act(() => {
        result.current.setDirection(inwardDirection);
        result.current.play();
      });
      expect(result.current.isPlaying).toBe(true);

      act(() =>
        result.current.setDirection(outwardDirection),
      );

      expect(result.current.direction).toBe(outwardDirection);
      expect(result.current.isPlaying).toBe(false);
      expect(onBoundary).toHaveBeenCalledOnce();
      expect(onBoundary).toHaveBeenCalledWith(boundary);
      expect(frames.cancelAnimationFrame).toHaveBeenCalled();
    },
  );

  it("composes play then toggle as sequential actions in one act", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2026-07-29T00:00:00.000Z"),
        onBoundary: vi.fn(),
        onDateChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.play();
      result.current.toggle();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("composes two toggles as sequential actions in one act", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2026-07-29T00:00:00.000Z"),
        onBoundary: vi.fn(),
        onDateChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.toggle();
      result.current.toggle();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("stops an inward play turned outward in the same act", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const onBoundary = vi.fn();
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2100-12-31T23:59:59.999Z"),
        onBoundary,
        onDateChange: vi.fn(),
      }),
    );

    act(() => result.current.setDirection(-1));
    act(() => {
      result.current.play();
      result.current.setDirection(1);
    });

    expect(result.current.direction).toBe(1);
    expect(result.current.isPlaying).toBe(false);
    expect(onBoundary).toHaveBeenCalledOnce();
    expect(onBoundary).toHaveBeenCalledWith("maximum");
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("pauses when the document becomes hidden", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2026-07-29T00:00:00.000Z"),
        onBoundary: vi.fn(),
        onDateChange: vi.fn(),
      }),
    );

    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.isPlaying).toBe(false);
    expect(frames.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("blocks playback and pauses an active clock when reduced motion is enabled", () => {
    const motion = createMotionPreference();
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2026-07-29T00:00:00.000Z"),
        onBoundary: vi.fn(),
        onDateChange: vi.fn(),
      }),
    );

    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);

    act(() => motion.setMatches(true));

    expect(result.current.motionRestricted).toBe(true);
    expect(result.current.isPlaying).toBe(false);

    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(false);
  });

  it("starts restricted when reduced motion is already requested", () => {
    const motion = createMotionPreference(true);
    vi.stubGlobal("matchMedia", vi.fn(() => motion.query));
    const frames = createAnimationFrames();
    vi.stubGlobal("requestAnimationFrame", frames.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", frames.cancelAnimationFrame);
    const { result } = renderHook(() =>
      usePlaybackClock({
        date: new Date("2026-07-29T00:00:00.000Z"),
        onBoundary: vi.fn(),
        onDateChange: vi.fn(),
      }),
    );

    expect(result.current.motionRestricted).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(false);
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
