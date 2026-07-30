import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const paths = {
  catalog: "shared/catalog/bright-stars.v1.json",
  catalogLock: "shared/catalog/bright-stars.lock.v1.json",
  constellations: "shared/catalog/constellations.v1.json",
  names: "shared/catalog/star-names.v1.json",
  output: "shared/catalog/render-stars.v1.json",
  outputLock: "shared/catalog/render-stars.lock.v1.json",
};
const magnitudeLimit = 5;
const selectionAlgorithm =
  "vMagnitude <= magnitudeLimit || requiredHrs.has(hr)";
const canonicalization = "UTF-8 JSON.stringify(catalog)";

const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter((arg) => arg !== "--check");
if (unknownArgs.length > 0) {
  throw new Error(`未対応の引数です: ${unknownArgs.join(", ")}`);
}
const checkOnly = args.has("--check");

const absolutePath = (relativePath) => path.join(root, relativePath);
const readJson = async (relativePath) =>
  JSON.parse(await readFile(absolutePath(relativePath), "utf8"));
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const jsonSha256 = (value) => sha256(JSON.stringify(value));

const [catalog, catalogLock, names, constellations] =
  await Promise.all([
    readJson(paths.catalog),
    readJson(paths.catalogLock),
    readJson(paths.names),
    readJson(paths.constellations),
  ]);

if (
  catalog.schemaVersion !== 1 ||
  !Array.isArray(catalog.stars) ||
  !Array.isArray(catalog.columns)
) {
  throw new Error("入力の bright-stars.v1.json が不正です。");
}
if (
  catalogLock.contentSha256 !== jsonSha256(catalog.stars) ||
  catalogLock.starCount !== catalog.stars.length
) {
  throw new Error(
    "bright-stars.v1.json と再現性ロックが一致しません。",
  );
}
if (
  !Array.isArray(names.stars) ||
  !Array.isArray(constellations.constellations)
) {
  throw new Error("固有名または星座線の入力が不正です。");
}

const requiredHrs = new Set(
  names.stars.map(({ hr }) => hr),
);
for (const constellation of constellations.constellations) {
  for (const [startHr, endHr] of constellation.segments) {
    requiredHrs.add(startHr);
    requiredHrs.add(endHr);
  }
}
const sortedRequiredHrs = [...requiredHrs].sort(
  (first, second) => first - second,
);
const sourceHrs = new Set(catalog.stars.map(([hr]) => hr));
const missingRequiredHrs = sortedRequiredHrs.filter(
  (hr) => !sourceHrs.has(hr),
);
if (missingRequiredHrs.length > 0) {
  throw new Error(
    `完全星表に存在しない必須HRです: ${missingRequiredHrs.join(", ")}`,
  );
}

const stars = catalog.stars.filter(
  ([hr, , , , vMagnitude]) =>
    vMagnitude <= magnitudeLimit || requiredHrs.has(hr),
);
const renderCatalog = {
  schemaVersion: 1,
  purpose: "web-initial-render-fallback",
  epoch: catalog.epoch,
  units: catalog.units,
  columns: catalog.columns,
  selection: {
    algorithm: selectionAlgorithm,
    magnitudeLimit,
    requiredHrs: sortedRequiredHrs,
  },
  source: {
    catalogArtifact: paths.catalog,
    catalogContentSha256: catalogLock.contentSha256,
    namedStarsArtifact: paths.names,
    namedStarsContentSha256: jsonSha256(names.stars),
    constellationsArtifact: paths.constellations,
    constellationsContentSha256: jsonSha256(
      constellations.constellations,
    ),
  },
  stars,
};
const contentSha256 = jsonSha256(renderCatalog);
const lock = {
  schemaVersion: 1,
  artifact: paths.output,
  canonicalization,
  algorithm: "sha256",
  contentSha256,
  sourceCatalogContentSha256: catalogLock.contentSha256,
  starCount: stars.length,
  firstHR: stars[0]?.[0] ?? null,
  lastHR: stars.at(-1)?.[0] ?? null,
};
const output = `${JSON.stringify(renderCatalog)}\n`;
const lockOutput = `${JSON.stringify(lock, null, 2)}\n`;

if (checkOnly) {
  const [currentOutput, currentLock] = await Promise.all([
    readFile(absolutePath(paths.output), "utf8").catch(() => null),
    readFile(absolutePath(paths.outputLock), "utf8").catch(
      () => null,
    ),
  ]);
  const stale = [];
  if (currentOutput !== output) stale.push(paths.output);
  if (currentLock !== lockOutput) stale.push(paths.outputLock);
  if (stale.length > 0) {
    throw new Error(
      `初期描画星表が入力と一致しません: ${stale.join(", ")}。` +
        " npm run data:build:render を実行してください。",
    );
  }
  console.log(
    `初期描画星表の再現性OK: ${stars.length}件` +
      ` contentSha256=${contentSha256}`,
  );
} else {
  await Promise.all([
    writeFile(absolutePath(paths.output), output),
    writeFile(absolutePath(paths.outputLock), lockOutput),
  ]);
  console.log(
    `${stars.length}件を ${paths.output} へ保存しました。` +
      ` contentSha256=${contentSha256}`,
  );
}
