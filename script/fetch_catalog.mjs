import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "shared/catalog/bright-stars.v1.json");
const lockPath = path.join(
  root,
  "shared/catalog/bright-stars.lock.v1.json"
);
const sourceUrl = new URL("https://heasarc.gsfc.nasa.gov/xamin/query");
const fields = [
  "hr",
  "hd",
  "alt_name",
  "cra",
  "cdec",
  "vmag",
  "bv_color",
  "spect_type"
];

sourceUrl.search = new URLSearchParams({
  table: "bsc5p",
  fields: fields.join(","),
  constraint: "vmag<=6.5",
  format: "stream",
  sortvar: "hr",
  resultmax: "20000"
}).toString();

const response = await fetch(sourceUrl, {
  headers: {
    "user-agent": "planetarium-catalog-builder/1.0"
  }
});

if (!response.ok) {
  throw new Error(`BSC5Pの取得に失敗しました: ${response.status}`);
}

const sourceText = await response.text();
const lines = sourceText.trim().split(/\r?\n/);
const header = lines.shift()?.split("|");

if (!header || header.join(",") !== fields.join(",")) {
  throw new Error(`想定外の列です: ${header?.join(",") ?? "なし"}`);
}

const parseRightAscension = (value) => {
  const compact = value.trim();
  const hours = Number(compact.slice(0, 2));
  const minutes = Number(compact.slice(2, 4));
  const seconds = Number(compact.slice(4));
  return ((hours + minutes / 60 + seconds / 3600) * 15 * Math.PI) / 180;
};

const parseDeclination = (value) => {
  const compact = value.trim();
  const sign = compact.startsWith("-") ? -1 : 1;
  const digits = compact.slice(1);
  const degrees = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  const seconds = Number(digits.slice(4));
  return (sign * (degrees + minutes / 60 + seconds / 3600) * Math.PI) / 180;
};

const cleanText = (value) => {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned === "" ? null : cleaned;
};

const stars = [];

for (const line of lines) {
  const values = line.split("|");
  if (values.length !== fields.length) {
    continue;
  }

  const [hrValue, hdValue, altName, raValue, decValue, vmagValue, bvValue, spectralType] =
    values;
  const hr = Number(hrValue);
  const magnitude = Number(vmagValue);
  const raRad = parseRightAscension(raValue);
  const decRad = parseDeclination(decValue);

  if (
    !Number.isInteger(hr) ||
    !Number.isFinite(magnitude) ||
    !Number.isFinite(raRad) ||
    !Number.isFinite(decRad)
  ) {
    continue;
  }

  stars.push([
    hr,
    hdValue.trim() === "" ? null : Number(hdValue),
    Number(raRad.toFixed(10)),
    Number(decRad.toFixed(10)),
    Number(magnitude.toFixed(3)),
    bvValue.trim() === "" ? null : Number(Number(bvValue).toFixed(3)),
    cleanText(altName),
    cleanText(spectralType)
  ]);
}
stars.sort((first, second) => first[0] - second[0]);
for (let index = 1; index < stars.length; index += 1) {
  if (stars[index - 1][0] === stars[index][0]) {
    throw new Error(`HR ${stars[index][0]} が重複しています`);
  }
}

const catalog = {
  schemaVersion: 1,
  epoch: "J2000.0",
  units: {
    ra: "radian",
    dec: "radian",
    vMagnitude: "mag",
    bvColor: "mag"
  },
  source: {
    title: "NASA HEASARC Bright Star Catalog (BSC5P)",
    url: "https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html",
    dataPortal: "https://data.nasa.gov/dataset/bright-star-catalog",
    retrievedAt: new Date().toISOString(),
    query: Object.fromEntries(sourceUrl.searchParams),
    sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
    attribution: "NASA HEASARC; derived from Bright Star Catalog, 5th Edition"
  },
  columns: [
    "hr",
    "hd",
    "raRad",
    "decRad",
    "vMagnitude",
    "bvColor",
    "catalogName",
    "spectralType"
  ],
  stars
};
const contentSha256 = createHash("sha256")
  .update(JSON.stringify(stars))
  .digest("hex");
const lock = {
  schemaVersion: 1,
  artifact: "shared/catalog/bright-stars.v1.json",
  canonicalization: "UTF-8 JSON.stringify(catalog.stars)",
  algorithm: "sha256",
  contentSha256,
  sourceSha256: catalog.source.sourceSha256,
  starCount: stars.length,
  firstHR: stars[0]?.[0] ?? null,
  lastHR: stars.at(-1)?.[0] ?? null
};

await mkdir(path.dirname(outputPath), { recursive: true });
await Promise.all([
  writeFile(outputPath, `${JSON.stringify(catalog)}\n`),
  writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
]);

console.log(
  `${stars.length}件を ${path.relative(root, outputPath)} へ保存しました。` +
    ` contentSha256=${contentSha256}`
);
