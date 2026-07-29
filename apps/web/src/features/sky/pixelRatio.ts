export const MAX_SKY_DEVICE_PIXEL_RATIO = 2;

/**
 * Keeps both sky renderers sharp without allowing unusually dense displays
 * to allocate an unbounded backing store.
 */
export function skyDevicePixelRatio(
  value: number | undefined,
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 1;
  }
  return Math.min(Math.max(value, 1), MAX_SKY_DEVICE_PIXEL_RATIO);
}
