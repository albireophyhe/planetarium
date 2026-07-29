import { createOnDemandFrameScheduler } from "./onDemandFrameScheduler";
import { describe, expect, it, vi } from "vitest";

describe("on-demand frame scheduler", () => {
  it("coalesces repeated requests into one rendered frame", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const draw = vi.fn();
    const scheduler = createOnDemandFrameScheduler(
      draw,
      (callback) => {
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
      (handle) => callbacks.delete(handle),
    );

    scheduler.request();
    scheduler.request();
    scheduler.request();

    expect(callbacks.size).toBe(1);
    callbacks.get(1)?.(16);
    expect(draw).toHaveBeenCalledTimes(1);

    scheduler.request();
    expect(callbacks.size).toBe(2);
    callbacks.get(2)?.(32);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("cancels pending work and never draws after disposal", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const draw = vi.fn();
    const scheduler = createOnDemandFrameScheduler(
      draw,
      (callback) => {
        callbacks.set(7, callback);
        return 7;
      },
      (handle) => callbacks.delete(handle),
    );

    scheduler.request();
    const orphanedCallback = callbacks.get(7);
    scheduler.dispose();
    orphanedCallback?.(16);
    scheduler.request();

    expect(callbacks.size).toBe(0);
    expect(draw).not.toHaveBeenCalled();
  });
});
