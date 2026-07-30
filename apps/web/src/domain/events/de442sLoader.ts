import {
  decodeDe442sChunk,
  De442sEphemerisProvider,
  type DecodedDe442sChunk,
} from "./de442sChunk";
import {
  DE442S_MANIFEST_FILE,
  De442sFormatError,
  selectDe442sChunk,
  selectDe442sChunksForRange,
  validateDe442sManifest,
  type De442sChunkManifest,
  type De442sManifest,
} from "./de442sManifest";

const MAXIMUM_MANIFEST_BYTES = 262_144;
const DEFAULT_MAXIMUM_CACHED_CHUNKS = 3;
const MAXIMUM_ALLOWED_CACHED_CHUNKS = 3;
const DOT_SEGMENT_PATTERN =
  /(?:^|[/\\])(?:\.|%2e)(?:\.|%2e)?(?:[/\\]|$)/i;

export type De442sAssetFetch = (
  rootRelativePath: string,
  signal?: AbortSignal,
) => Promise<Response>;

export interface De442sEphemerisLoaderOptions {
  /**
   * Same-origin directory containing the manifest and `chunks/`.
   * `/event-data/de442s/` is the production deployment location.
   */
  readonly baseUrl: string | URL;
  /**
   * Audited transport injection. It receives only a root-relative static
   * asset path and an internal cancellation signal.
   */
  readonly fetch: De442sAssetFetch;
  /**
   * Browser document URL used to prove same-origin. Tests and non-window
   * runtimes can provide it explicitly.
   */
  readonly pageUrl?: string | URL;
  /** Bounded to three: current and at most two neighboring five-year chunks. */
  readonly maximumCachedChunks?: number;
}

export interface De442sLoadOptions {
  readonly signal?: AbortSignal;
  /**
   * Intersects an intentionally padded calculation range with the bundled
   * kernel coverage. Strict rejection remains the default.
   */
  readonly clipToCoverage?: boolean;
}

interface SharedRequest<T> {
  readonly controller: AbortController;
  promise: Promise<T>;
  subscribers: number;
  settled: boolean;
}

export class De442sLoadError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(`Unable to load DE442s: ${message}`, options);
    this.name = "De442sLoadError";
  }
}

function abortError(): DOMException {
  return new DOMException("DE442s loading was cancelled", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortError();
  }
}

function createSharedRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): SharedRequest<T> {
  const controller = new AbortController();
  const request: SharedRequest<T> = {
    controller,
    subscribers: 0,
    settled: false,
    promise: Promise.resolve(undefined as T),
  };
  request.promise = operation(controller.signal).then(
    (value) => {
      request.settled = true;
      return value;
    },
    (error: unknown) => {
      request.settled = true;
      throw error;
    },
  );
  return request;
}

function subscribe<T>(
  request: SharedRequest<T>,
  signal: AbortSignal | undefined,
  onAllSubscribersCancelled: () => void,
): Promise<T> {
  if (signal?.aborted === true) {
    return Promise.reject(abortError());
  }
  request.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let active = true;
    const finish = (): void => {
      if (!active) {
        return;
      }
      active = false;
      signal?.removeEventListener("abort", onAbort);
      request.subscribers -= 1;
    };
    const onAbort = (): void => {
      if (!active) {
        return;
      }
      finish();
      if (!request.settled && request.subscribers === 0) {
        onAllSubscribersCancelled();
      }
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    request.promise.then(
      (value) => {
        if (!active) {
          return;
        }
        finish();
        resolve(value);
      },
      (error: unknown) => {
        if (!active) {
          return;
        }
        finish();
        reject(error);
      },
    );
  });
}

function runtimePageUrl(explicit: string | URL | undefined): URL {
  if (explicit !== undefined) {
    return new URL(explicit);
  }
  if (typeof globalThis.location?.href === "string") {
    return new URL(globalThis.location.href);
  }
  throw new TypeError(
    "pageUrl is required when no browser location is available",
  );
}

function trustedBaseUrl(
  input: string | URL,
  pageUrl: URL,
): URL {
  const raw = input.toString();
  if (DOT_SEGMENT_PATTERN.test(raw) || raw.includes("\\")) {
    throw new TypeError("DE442s base URL must not contain dot segments");
  }
  const baseUrl = new URL(input, pageUrl);
  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.origin !== pageUrl.origin ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    throw new TypeError("DE442s base URL must be a clean same-origin URL");
  }
  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname += "/";
  }
  return baseUrl;
}

function assetPath(baseUrl: URL, relativePath: string): string {
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    DOT_SEGMENT_PATTERN.test(relativePath)
  ) {
    throw new TypeError("DE442s asset path must be relative and canonical");
  }
  const resolved = new URL(relativePath, baseUrl);
  if (
    resolved.origin !== baseUrl.origin ||
    !resolved.pathname.startsWith(baseUrl.pathname) ||
    resolved.search !== "" ||
    resolved.hash !== ""
  ) {
    throw new TypeError("DE442s asset path escaped its base URL");
  }
  return resolved.pathname;
}

function chunkAssetPath(
  baseUrl: URL,
  chunk: De442sChunkManifest,
): string {
  // Never resolve `chunk.file` itself. Validation pins it to the repository
  // path, while deployment paths are rebuilt from the validated chunk id.
  return assetPath(baseUrl, `chunks/${chunk.id}.v1.bin`);
}

function ensureResponse(
  response: Response,
  requestPath: string,
  pageUrl: URL,
): void {
  if (!response.ok) {
    throw new De442sLoadError(
      `${requestPath} returned HTTP ${response.status}`,
    );
  }
  if (response.redirected) {
    throw new De442sLoadError(`${requestPath} redirected unexpectedly`);
  }
  if (response.url !== "") {
    const responseUrl = new URL(response.url, pageUrl);
    if (
      responseUrl.origin !== pageUrl.origin ||
      responseUrl.pathname !== requestPath ||
      responseUrl.search !== "" ||
      responseUrl.hash !== ""
    ) {
      throw new De442sLoadError(
        `${requestPath} returned data from an unexpected URL`,
      );
    }
  }
}

async function responseBytes(
  response: Response,
  requestPath: string,
  maximumBytes: number,
  exactBytes: number | null,
  pageUrl: URL,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  ensureResponse(response, requestPath, pageUrl);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      throw new De442sLoadError(
        `${requestPath} has an invalid Content-Length`,
      );
    }
  }
  throwIfAborted(signal);
  const bytes = await response.arrayBuffer();
  throwIfAborted(signal);
  if (
    bytes.byteLength > maximumBytes ||
    (exactBytes !== null && bytes.byteLength !== exactBytes)
  ) {
    throw new De442sLoadError(
      `${requestPath} has an unexpected byte length`,
    );
  }
  return bytes;
}

async function sha256Hex(
  bytes: ArrayBuffer,
  signal: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new De442sLoadError(
      "Web Crypto SHA-256 is unavailable in this browser",
    );
  }
  const digest = await subtle.digest("SHA-256", bytes);
  throwIfAborted(signal);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function parseManifest(bytes: ArrayBuffer): De442sManifest {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new De442sLoadError("manifest is not valid UTF-8", {
      cause: error,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new De442sLoadError("manifest is not valid JSON", {
      cause: error,
    });
  }
  try {
    return validateDe442sManifest(value);
  } catch (error) {
    if (error instanceof De442sFormatError) {
      throw new De442sLoadError("manifest failed validation", {
        cause: error,
      });
    }
    throw error;
  }
}

export class De442sEphemerisLoader {
  readonly #assetFetch: De442sAssetFetch;
  readonly #baseUrl: URL;
  readonly #pageUrl: URL;
  readonly #maximumCachedChunks: number;
  readonly #chunkCache = new Map<string, DecodedDe442sChunk>();
  readonly #chunkRequests = new Map<
    string,
    SharedRequest<DecodedDe442sChunk>
  >();
  #manifest: De442sManifest | null = null;
  #manifestRequest: SharedRequest<De442sManifest> | null = null;

  public constructor(options: De442sEphemerisLoaderOptions) {
    if (typeof options.fetch !== "function") {
      throw new TypeError("DE442s fetch transport must be provided");
    }
    const maximumCachedChunks =
      options.maximumCachedChunks ?? DEFAULT_MAXIMUM_CACHED_CHUNKS;
    if (
      !Number.isInteger(maximumCachedChunks) ||
      maximumCachedChunks < 1 ||
      maximumCachedChunks > MAXIMUM_ALLOWED_CACHED_CHUNKS
    ) {
      throw new RangeError(
        "DE442s chunk cache must contain between one and three chunks",
      );
    }
    this.#assetFetch = options.fetch;
    this.#pageUrl = runtimePageUrl(options.pageUrl);
    this.#baseUrl = trustedBaseUrl(options.baseUrl, this.#pageUrl);
    this.#maximumCachedChunks = maximumCachedChunks;
  }

  public async loadManifest(
    options: De442sLoadOptions = {},
  ): Promise<De442sManifest> {
    throwIfAborted(options.signal);
    if (this.#manifest !== null) {
      return this.#manifest;
    }
    let request = this.#manifestRequest;
    if (request === null || request.controller.signal.aborted) {
      const manifestPath = assetPath(
        this.#baseUrl,
        DE442S_MANIFEST_FILE,
      );
      request = createSharedRequest(async (signal) => {
        const response = await this.#assetFetch(manifestPath, signal);
        const bytes = await responseBytes(
          response,
          manifestPath,
          MAXIMUM_MANIFEST_BYTES,
          null,
          this.#pageUrl,
          signal,
        );
        return parseManifest(bytes);
      });
      this.#manifestRequest = request;
      request.promise.then(
        (manifest) => {
          if (this.#manifestRequest === request) {
            this.#manifest = manifest;
            this.#manifestRequest = null;
          }
        },
        () => {
          if (this.#manifestRequest === request) {
            this.#manifestRequest = null;
          }
        },
      );
    }
    return subscribe(request, options.signal, () => {
      if (this.#manifestRequest === request) {
        this.#manifestRequest = null;
      }
      request.controller.abort();
    });
  }

  public async load(
    tdbJulianDate: number,
    options: De442sLoadOptions = {},
  ): Promise<De442sEphemerisProvider> {
    const manifest = await this.loadManifest(options);
    throwIfAborted(options.signal);
    const chunk = selectDe442sChunk(manifest, tdbJulianDate);
    const decoded = await this.#loadChunk(chunk, options.signal);
    throwIfAborted(options.signal);
    return new De442sEphemerisProvider([decoded]);
  }

  /**
   * Loads every five-year chunk intersecting a closed calculation interval.
   * Independent chunks start together, avoiding a boundary waterfall.
   */
  public async loadRange(
    startJulianDateTdb: number,
    endJulianDateTdb: number,
    options: De442sLoadOptions = {},
  ): Promise<De442sEphemerisProvider> {
    const manifest = await this.loadManifest(options);
    throwIfAborted(options.signal);
    const effectiveStart = options.clipToCoverage
      ? Math.max(
          startJulianDateTdb,
          manifest.coverage.startJulianDateTdb,
        )
      : startJulianDateTdb;
    const effectiveEnd = options.clipToCoverage
      ? Math.min(
          endJulianDateTdb,
          manifest.coverage.endJulianDateTdb,
        )
      : endJulianDateTdb;
    if (effectiveEnd < effectiveStart) {
      throw new RangeError(
        "DE442s range does not intersect the bundled coverage",
      );
    }
    const chunks = selectDe442sChunksForRange(
      manifest,
      effectiveStart,
      effectiveEnd,
    );
    if (chunks.length > MAXIMUM_ALLOWED_CACHED_CHUNKS) {
      throw new RangeError(
        "A DE442s calculation range may span at most three chunks",
      );
    }
    const decoded = await Promise.all(
      chunks.map((chunk) => this.#loadChunk(chunk, options.signal)),
    );
    throwIfAborted(options.signal);
    return new De442sEphemerisProvider(decoded);
  }

  public clearCachedChunks(): void {
    this.#chunkCache.clear();
  }

  async #loadChunk(
    chunk: De442sChunkManifest,
    signal: AbortSignal | undefined,
  ): Promise<DecodedDe442sChunk> {
    throwIfAborted(signal);
    const cached = this.#chunkCache.get(chunk.id);
    if (cached !== undefined) {
      this.#chunkCache.delete(chunk.id);
      this.#chunkCache.set(chunk.id, cached);
      return cached;
    }

    let request = this.#chunkRequests.get(chunk.id);
    if (request === undefined || request.controller.signal.aborted) {
      const chunkPath = chunkAssetPath(this.#baseUrl, chunk);
      request = createSharedRequest(async (requestSignal) => {
        const response = await this.#assetFetch(chunkPath, requestSignal);
        const bytes = await responseBytes(
          response,
          chunkPath,
          chunk.byteLength,
          chunk.byteLength,
          this.#pageUrl,
          requestSignal,
        );
        const actualSha256 = await sha256Hex(bytes, requestSignal);
        if (actualSha256 !== chunk.sha256) {
          throw new De442sLoadError(
            `${chunkPath} failed its SHA-256 check`,
          );
        }
        return decodeDe442sChunk(bytes, chunk);
      });
      this.#chunkRequests.set(chunk.id, request);
      request.promise.then(
        (decoded) => {
          if (this.#chunkRequests.get(chunk.id) === request) {
            this.#chunkRequests.delete(chunk.id);
            this.#insertCachedChunk(decoded);
          }
        },
        () => {
          if (this.#chunkRequests.get(chunk.id) === request) {
            this.#chunkRequests.delete(chunk.id);
          }
        },
      );
    }
    const decoded = await subscribe(request, signal, () => {
      if (this.#chunkRequests.get(chunk.id) === request) {
        this.#chunkRequests.delete(chunk.id);
      }
      request.controller.abort();
    });
    // Resolution and cache insertion share a microtask boundary. Touching here
    // makes the just-used chunk most recent even with concurrent consumers.
    this.#insertCachedChunk(decoded);
    return decoded;
  }

  #insertCachedChunk(chunk: DecodedDe442sChunk): void {
    this.#chunkCache.delete(chunk.manifest.id);
    this.#chunkCache.set(chunk.manifest.id, chunk);
    while (this.#chunkCache.size > this.#maximumCachedChunks) {
      const oldestId = this.#chunkCache.keys().next().value;
      if (oldestId === undefined) {
        break;
      }
      this.#chunkCache.delete(oldestId);
    }
  }
}

export function createDe442sEphemerisLoader(
  options: De442sEphemerisLoaderOptions,
): De442sEphemerisLoader {
  return new De442sEphemerisLoader(options);
}
