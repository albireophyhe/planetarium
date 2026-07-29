import type {
  IersEarthOrientationEstimateV1,
  IersEarthOrientationServiceV1
} from "./earthOrientation";

let servicePromise:
  | Promise<IersEarthOrientationServiceV1>
  | undefined;

/**
 * Load the compact integrated IERS EOP manifest. The five daily-value chunks
 * remain lazy and are shared by DUT1 and polar-motion consumers.
 */
export function loadIersEarthOrientationService(): Promise<IersEarthOrientationServiceV1> {
  servicePromise ??= import("./earthOrientationData")
    .then(
      ({ iersEarthOrientationService }) =>
        iersEarthOrientationService
    )
    .catch((error: unknown) => {
      servicePromise = undefined;
      throw error;
    });
  return servicePromise;
}

export async function lookupIersEarthOrientation(
  date: Date
): Promise<IersEarthOrientationEstimateV1 | null> {
  const service = await loadIersEarthOrientationService();
  return service.lookup(date);
}
