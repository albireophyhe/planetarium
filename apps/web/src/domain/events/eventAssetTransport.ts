const EVENT_MANIFEST_PATH =
  "/event-data/de442s/de442s-manifest.v1.json";
const EVENT_CHUNK_PATH =
  /^\/event-data\/de442s\/chunks\/\d{4}-\d{4}\.v1\.bin$/;
const EVENT_CANDIDATE_MANIFEST_PATH =
  "/event-data/candidates/event-candidates-manifest.v1.json";
const EVENT_CANDIDATE_CHUNK_PATH =
  /^\/event-data\/candidates\/chunks\/\d{4}-\d{4}\.v1\.json$/;

export type EventAssetFetch = (
  path: string,
  signal?: AbortSignal,
) => Promise<Response>;

export function isAllowedEventAssetPath(path: string): boolean {
  return (
    path === EVENT_MANIFEST_PATH ||
    EVENT_CHUNK_PATH.test(path) ||
    path === EVENT_CANDIDATE_MANIFEST_PATH ||
    EVENT_CANDIDATE_CHUNK_PATH.test(path)
  );
}

/**
 * The only audited runtime transport used by the astronomy event feature.
 *
 * Accepting a root-relative path that matches a closed allowlist prevents
 * observer coordinates, dates, search terms, or external origins from being
 * added to the request. Event assets are static and contain no user data.
 */
export const fetchEventAsset: EventAssetFetch = async (
  path,
  signal,
) => {
  if (!isAllowedEventAssetPath(path)) {
    throw new TypeError("Event asset path is not allowed");
  }
  return globalThis.fetch(path, {
    cache:
      path === EVENT_MANIFEST_PATH ||
      path === EVENT_CANDIDATE_MANIFEST_PATH
        ? "no-cache"
        : "force-cache",
    credentials: "same-origin",
    method: "GET",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
};

export const eventManifestPath = EVENT_MANIFEST_PATH;
export const eventCandidateManifestPath =
  EVENT_CANDIDATE_MANIFEST_PATH;
