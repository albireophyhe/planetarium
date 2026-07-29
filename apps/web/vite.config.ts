import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import {
  copyFile,
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

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

export default defineConfig({
  plugins: [react(), cloudflare(), distributeSofaNotice],
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
