export type OnDemandFrameScheduler = {
  cancelPending: () => void;
  dispose: () => void;
  request: () => void;
};

type RequestFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (handle: number) => void;

export function createOnDemandFrameScheduler(
  draw: FrameRequestCallback,
  requestFrame: RequestFrame = requestAnimationFrame,
  cancelFrame: CancelFrame = cancelAnimationFrame,
): OnDemandFrameScheduler {
  let disposed = false;
  let pendingHandle: number | null = null;

  function cancelPending() {
    if (pendingHandle === null) {
      return;
    }
    cancelFrame(pendingHandle);
    pendingHandle = null;
  }

  return {
    cancelPending,
    dispose() {
      disposed = true;
      cancelPending();
    },
    request() {
      if (disposed || pendingHandle !== null) {
        return;
      }
      pendingHandle = requestFrame((time) => {
        pendingHandle = null;
        if (!disposed) {
          draw(time);
        }
      });
    },
  };
}
