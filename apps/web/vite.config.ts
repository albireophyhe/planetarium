import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import {
  cp,
  copyFile,
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const canonicalSofaNotice = fileURLToPath(
  new URL(
    "../../shared/licenses/IAU-SOFA-derived-work-notice.md",
    import.meta.url
  )
);
const distributedSofaNotice = fileURLToPath(
  new URL(
    "./dist/licenses/IAU-SOFA-derived-work-notice.md",
    import.meta.url
  )
);
const distributedAssetsIgnore = fileURLToPath(
  new URL("./dist/.assetsignore", import.meta.url)
);
const canonicalEventDataRoot = fileURLToPath(
  new URL("../../shared/ephemeris/de442s", import.meta.url)
);
const distributedEventDataRoot = fileURLToPath(
  new URL("./dist/event-data/de442s", import.meta.url)
);
const canonicalEventCandidateDataRoot = fileURLToPath(
  new URL("../../shared/events", import.meta.url)
);
const distributedEventCandidateDataRoot = fileURLToPath(
  new URL("./dist/event-data/candidates", import.meta.url)
);

const distributeSofaNotice = {
  name: "distribute-sofa-derived-work-notice",
  apply: "build" as const,
  async closeBundle() {
    await mkdir(dirname(distributedSofaNotice), { recursive: true });
    await copyFile(canonicalSofaNotice, distributedSofaNotice);

    const ignoredPaths = new Set(
      (await readFile(distributedAssetsIgnore, "utf8"))
        .split(/\r?\n/)
        .filter(Boolean)
    );
    ignoredPaths.add(".wrangler");
    await writeFile(
      distributedAssetsIgnore,
      `${[...ignoredPaths].join("\n")}\n`,
      "utf8"
    );
  }
};

const EVENT_DATA_PREFIX = "/event-data/de442s/";
const EVENT_CHUNK_PATH =
  /^\/event-data\/de442s\/chunks\/\d{4}-\d{4}\.v1\.bin$/;
const EVENT_CANDIDATE_PREFIX = "/event-data/candidates/";
const EVENT_CANDIDATE_CHUNK_PATH =
  /^\/event-data\/candidates\/chunks\/\d{4}-\d{4}\.v1\.json$/;

function eventDataSourcePath(pathname: string) {
  if (pathname === `${EVENT_DATA_PREFIX}de442s-manifest.v1.json`) {
    return join(canonicalEventDataRoot, "de442s-manifest.v1.json");
  }
  if (EVENT_CHUNK_PATH.test(pathname)) {
    return join(
      canonicalEventDataRoot,
      "chunks",
      basename(pathname)
    );
  }
  if (
    pathname ===
    `${EVENT_CANDIDATE_PREFIX}event-candidates-manifest.v1.json`
  ) {
    return join(
      canonicalEventCandidateDataRoot,
      "event-candidates-manifest.v1.json"
    );
  }
  if (EVENT_CANDIDATE_CHUNK_PATH.test(pathname)) {
    return join(
      canonicalEventCandidateDataRoot,
      "chunks",
      basename(pathname)
    );
  }
  return null;
}

const distributeEventData: Plugin = {
  name: "distribute-astronomy-event-data",
  apply: "build",
  async closeBundle() {
    await Promise.all([
      mkdir(distributedEventDataRoot, { recursive: true }),
      mkdir(distributedEventCandidateDataRoot, {
        recursive: true
      })
    ]);
    await Promise.all([
      copyFile(
        join(canonicalEventDataRoot, "de442s-manifest.v1.json"),
        join(distributedEventDataRoot, "de442s-manifest.v1.json")
      ),
      cp(
        join(canonicalEventDataRoot, "chunks"),
        join(distributedEventDataRoot, "chunks"),
        { recursive: true }
      ),
      copyFile(
        join(
          canonicalEventCandidateDataRoot,
          "event-candidates-manifest.v1.json"
        ),
        join(
          distributedEventCandidateDataRoot,
          "event-candidates-manifest.v1.json"
        )
      ),
      cp(
        join(canonicalEventCandidateDataRoot, "chunks"),
        join(distributedEventCandidateDataRoot, "chunks"),
        { recursive: true }
      )
    ]);
  }
};

const serveEventData: Plugin = {
  name: "serve-astronomy-event-data",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (!request.url) {
        next();
        return;
      }
      const pathname = new URL(
        request.url,
        "http://planetarium.invalid"
      ).pathname;
      if (
        !pathname.startsWith(EVENT_DATA_PREFIX) &&
        !pathname.startsWith(EVENT_CANDIDATE_PREFIX)
      ) {
        next();
        return;
      }
      const sourcePath = eventDataSourcePath(pathname);
      if (!sourcePath) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      try {
        const body = await readFile(sourcePath);
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          pathname.endsWith(".json")
            ? "application/json; charset=utf-8"
            : "application/octet-stream"
        );
        response.setHeader("Cache-Control", "no-store");
        response.end(body);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : null;
        if (code === "ENOENT") {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }
        next(error);
      }
    });
  }
};

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    distributeSofaNotice,
    distributeEventData,
    serveEventData
  ],
  build: {
    // Expected data chunks are governed by the stricter raw/gzip gates in
    // config/web-budgets.json; keep Vite's advisory aligned with that cap.
    chunkSizeWarningLimit: 720,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "catalog-v1",
              test: /shared[\\/]catalog[\\/].+\.v1\.json$/,
              priority: 20
            },
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 15
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              maxSize: 350_000,
              priority: 10
            }
          ]
        }
      }
    }
  },
  server: {
    port: 4173,
    strictPort: true
  }
});
