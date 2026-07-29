import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import {
  decodeEopChunk,
  parseFinals2000AEop,
  validateEopChunkDescriptors,
} from "./lib/eop-data.mjs";

const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"),
  );

const [
  catalog,
  catalogLock,
  catalogV2,
  catalogLockV2,
  names,
  constellations,
  cities,
  dut1,
  dut1Lock,
  dut1Snapshot,
  eop,
  eopLock,
  fixtures,
  fixturesV2,
  diurnalAberrationFixtures,
  solarLightDeflectionFixtures,
  solarPositionFixtures,
  earthEphemeris,
] = await Promise.all([
  readJson("shared/catalog/bright-stars.v1.json"),
  readJson("shared/catalog/bright-stars.lock.v1.json"),
  readJson("shared/catalog/bright-stars.v2.json"),
  readJson("shared/catalog/bright-stars.lock.v2.json"),
  readJson("shared/catalog/star-names.v1.json"),
  readJson("shared/catalog/constellations.v1.json"),
  readJson("shared/catalog/cities.v1.json"),
  readJson("shared/eop/iers-finals2000a-dut1.v1.json"),
  readJson("shared/eop/iers-finals2000a-dut1.lock.v1.json"),
  readJson("shared/eop/source/finals2000A.snapshot.v1.json"),
  readJson("shared/eop/iers-finals2000a-eop.v1.json"),
  readJson("shared/eop/iers-finals2000a-eop.lock.v1.json"),
  readJson("shared/fixtures/astro-test-vectors.v1.json"),
  readJson("shared/fixtures/astro-test-vectors.v2.json"),
  readJson("shared/fixtures/sofa-diurnal-aberration.v1.json"),
  readJson("shared/fixtures/sofa-solar-light-deflection.v1.json"),
  readJson("shared/fixtures/sofa-solar-position.v1.json"),
  readJson("shared/ephemeris/truncated-earth-heliocentric.v1.json"),
]);

const fail = (message) => {
  console.error(`データ検証エラー: ${message}`);
  process.exitCode = 1;
};

if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.stars)) {
  fail("星表schemaVersionまたはstarsが不正です");
}
const expectedColumns = [
  "hr",
  "hd",
  "raRad",
  "decRad",
  "vMagnitude",
  "bvColor",
  "catalogName",
  "spectralType",
];
if (
  !Array.isArray(catalog.columns) ||
  catalog.columns.length !== expectedColumns.length ||
  catalog.columns.some((column, index) => column !== expectedColumns[index])
) {
  fail("星表columnsの順序が不正です");
}
if (
  catalog.epoch !== "J2000.0" ||
  catalog.units?.ra !== "radian" ||
  catalog.units?.dec !== "radian" ||
  catalog.units?.vMagnitude !== "mag" ||
  catalog.units?.bvColor !== "mag"
) {
  fail("星表epochまたはunitsが不正です");
}
if (!/^[0-9a-f]{64}$/.test(catalog.source?.sourceSha256 ?? "")) {
  fail("星表sourceSha256が不正です");
}

const hrIds = new Set();
let previousCatalogHr = 0;
for (const [index, star] of catalog.stars.entries()) {
  if (!Array.isArray(star) || star.length !== expectedColumns.length) {
    fail(`stars[${index}]の列数`);
    continue;
  }
  const [hr, hd, ra, dec, magnitude, bv, catalogName, spectralType] = star;
  if (!Number.isInteger(hr) || hr <= 0) fail(`stars[${index}]のHR番号`);
  if (hrIds.has(hr)) fail(`HR ${hr}が重複`);
  if (hr <= previousCatalogHr) fail(`HR ${hr}が昇順ではありません`);
  previousCatalogHr = hr;
  hrIds.add(hr);
  if (hd !== null && (!Number.isInteger(hd) || hd <= 0)) {
    fail(`HR ${hr}のHD番号`);
  }
  if (!(ra >= 0 && ra < Math.PI * 2)) fail(`HR ${hr}の赤経範囲`);
  if (!(dec >= -Math.PI / 2 && dec <= Math.PI / 2)) fail(`HR ${hr}の赤緯範囲`);
  if (!Number.isFinite(magnitude) || magnitude < -2 || magnitude > 6.5) {
    fail(`HR ${hr}の等級`);
  }
  if (bv !== null && !Number.isFinite(bv)) fail(`HR ${hr}のB-V`);
  if (
    catalogName !== null &&
    (typeof catalogName !== "string" || !catalogName.trim())
  ) {
    fail(`HR ${hr}のカタログ名`);
  }
  if (
    spectralType !== null &&
    (typeof spectralType !== "string" || !spectralType.trim())
  ) {
    fail(`HR ${hr}のスペクトル型`);
  }
}
const catalogContentSha256 = createHash("sha256")
  .update(JSON.stringify(catalog.stars))
  .digest("hex");
if (
  catalogLock.schemaVersion !== 1 ||
  catalogLock.artifact !== "shared/catalog/bright-stars.v1.json" ||
  catalogLock.canonicalization !== "UTF-8 JSON.stringify(catalog.stars)" ||
  catalogLock.algorithm !== "sha256" ||
  catalogLock.contentSha256 !== catalogContentSha256 ||
  catalogLock.sourceSha256 !== catalog.source?.sourceSha256 ||
  catalogLock.starCount !== catalog.stars.length ||
  catalogLock.firstHR !== catalog.stars[0]?.[0] ||
  catalogLock.lastHR !== catalog.stars.at(-1)?.[0]
) {
  fail("星表再現性ロックが現在の生成物と不一致です");
}

const expectedColumnsV2 = [
  ...expectedColumns,
  "pmRaCosDecArcsecPerYear",
  "pmDecArcsecPerYear",
  "parallaxArcsec",
  "radialVelocityKmPerSecond",
];
if (
  catalogV2.schemaVersion !== 2 ||
  catalogV2.epoch !== "J2000.0" ||
  catalogV2.referenceSystem !== "FK5" ||
  !Array.isArray(catalogV2.stars) ||
  catalogV2.stars.length !== catalog.stars.length
) {
  fail("v2星表の版、基準系、件数が不正です");
}
if (
  !Array.isArray(catalogV2.columns) ||
  catalogV2.columns.length !== expectedColumnsV2.length ||
  catalogV2.columns.some((column, index) => column !== expectedColumnsV2[index])
) {
  fail("v2星表columnsの順序が不正です");
}
if (
  catalogV2.units?.pmRaCosDec !== "arcsec/year" ||
  catalogV2.units?.pmDec !== "arcsec/year" ||
  catalogV2.units?.parallax !== "arcsec" ||
  catalogV2.units?.radialVelocity !== "km/s" ||
  catalogV2.astrometry?.properMotionConvention !==
    "pmRA = cos(dec) * d(RA)/dt" ||
  catalogV2.astrometry?.radialVelocityFrame !== "heliocentric"
) {
  fail("v2星表の固有運動規約またはunitsが不正です");
}

for (const [index, star] of catalogV2.stars.entries()) {
  if (!Array.isArray(star) || star.length !== expectedColumnsV2.length) {
    fail(`v2 stars[${index}]の列数`);
    continue;
  }
  const legacyColumns = star.slice(0, expectedColumns.length);
  if (JSON.stringify(legacyColumns) !== JSON.stringify(catalog.stars[index])) {
    fail(`v2 stars[${index}]の先頭8列がv1と不一致`);
  }
  const [pmRa, pmDec, parallax, radialVelocity] = star.slice(8);
  for (const [field, value] of [
    ["pmRaCosDec", pmRa],
    ["pmDec", pmDec],
    ["parallax", parallax],
    ["radialVelocity", radialVelocity],
  ]) {
    if (value !== null && !Number.isFinite(value)) {
      fail(`v2 HR ${star[0]}の${field}`);
    }
  }
}

const catalogV2ContentSha256 = createHash("sha256")
  .update(JSON.stringify(catalogV2.stars))
  .digest("hex");
if (
  catalogLockV2.schemaVersion !== 2 ||
  catalogLockV2.artifact !== "shared/catalog/bright-stars.v2.json" ||
  catalogLockV2.canonicalization !== "UTF-8 JSON.stringify(catalog.stars)" ||
  catalogLockV2.algorithm !== "sha256" ||
  catalogLockV2.contentSha256 !== catalogV2ContentSha256 ||
  catalogLockV2.sourceSha256 !== catalogV2.source?.sourceSha256 ||
  catalogLockV2.starCount !== catalogV2.stars.length ||
  catalogLockV2.firstHR !== catalogV2.stars[0]?.[0] ||
  catalogLockV2.lastHR !== catalogV2.stars.at(-1)?.[0]
) {
  fail("v2星表再現性ロックが現在の生成物と不一致です");
}

const namedIds = new Set();
const normalizedLabels = new Map();
const normalizeLabel = (value) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
let previousNamedHr = 0;
for (const star of names.stars) {
  if (!hrIds.has(star.hr)) fail(`固有名が未知のHR ${star.hr}を参照`);
  if (namedIds.has(star.hr)) fail(`固有名HR ${star.hr}が重複`);
  if (star.hr <= previousNamedHr) {
    fail(`固有名HR ${star.hr}が昇順ではありません`);
  }
  previousNamedHr = star.hr;
  if (!star.name?.trim() || !star.nameJa?.trim()) {
    fail(`固有名HR ${star.hr}の名称が空`);
  }
  if (!Array.isArray(star.aliases)) fail(`固有名HR ${star.hr}のaliases`);
  if (!/^[A-Z][A-Za-z]{2}$/.test(star.constellation ?? "")) {
    fail(`固有名HR ${star.hr}の星座略号`);
  }

  const localLabels = [
    ["name", star.name],
    ["nameJa", star.nameJa],
    ...(star.aliases ?? []).map((alias) => ["alias", alias]),
  ];
  const seenForStar = new Set();
  for (const [kind, label] of localLabels) {
    if (typeof label !== "string" || label !== label.trim() || !label) {
      fail(`固有名HR ${star.hr}の${kind}表記`);
      continue;
    }
    const normalized = normalizeLabel(label);
    if (seenForStar.has(normalized)) {
      fail(`固有名HR ${star.hr}内で名称 ${label} が重複`);
    }
    seenForStar.add(normalized);

    const existing = normalizedLabels.get(normalized);
    if (existing !== undefined && existing.hr !== star.hr) {
      fail(`名称 ${label} がHR ${existing.hr}とHR ${star.hr}で衝突`);
    } else {
      normalizedLabels.set(normalized, { hr: star.hr, label });
    }
  }
  namedIds.add(star.hr);
}

const constellationIds = new Set();
const constellationNames = new Set();
const constellationNamesJa = new Set();
for (const constellation of constellations.constellations) {
  if (constellationIds.has(constellation.id)) {
    fail(`星座ID ${constellation.id}が重複`);
  }
  constellationIds.add(constellation.id);
  if (!/^[A-Z][A-Za-z]{2}$/.test(constellation.id ?? "")) {
    fail(`星座ID ${constellation.id}の形式`);
  }
  for (const [label, values] of [
    [constellation.name, constellationNames],
    [constellation.nameJa, constellationNamesJa],
  ]) {
    if (typeof label !== "string" || label !== label.trim() || !label) {
      fail(`星座${constellation.id}の名称が不正`);
    } else if (values.has(normalizeLabel(label))) {
      fail(`星座名称 ${label} が重複`);
    }
    values.add(normalizeLabel(label));
  }

  const adjacency = new Map();
  const undirectedEdges = new Set();
  for (const [index, segment] of constellation.segments.entries()) {
    if (!Array.isArray(segment) || segment.length !== 2) {
      fail(`${constellation.id}の線分${index}が2点ではない`);
      continue;
    }
    const [from, to] = segment;
    if (from === to) fail(`${constellation.id}の線分${index}が同じ星を結ぶ`);
    const edgeKey = from < to ? `${from}:${to}` : `${to}:${from}`;
    if (undirectedEdges.has(edgeKey)) {
      fail(`${constellation.id}の線分${index}が重複`);
    }
    undirectedEdges.add(edgeKey);
    if (!hrIds.has(from) || !hrIds.has(to)) {
      fail(`${constellation.id}の線が未知のHR ${from}/${to}を参照`);
    }
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  }
  if (adjacency.size < 3) {
    fail(`${constellation.id}の星座線が3恒星未満`);
  }
  let componentCount = 0;
  const visited = new Set();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    componentCount += 1;
    const pending = [start];
    while (pending.length > 0) {
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...adjacency.get(current));
    }
  }
  if (constellation.componentCount !== componentCount) {
    fail(
      `${constellation.id}のcomponentCount ${constellation.componentCount} ` +
        `は計算値${componentCount}と不一致`,
    );
  }
}
if (
  constellations.graphModel?.edgeType !== "undirected" ||
  constellations.graphModel?.crossingsConnect !== false
) {
  fail("星座線graphModelが不正");
}

const cityIds = new Set();
const cityNames = new Set();
const cityNamesJa = new Set();
const cityCoordinates = new Set();
for (const city of cities.cities) {
  if (cityIds.has(city.id)) fail(`都市ID ${city.id}が重複`);
  cityIds.add(city.id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.id ?? "")) {
    fail(`都市ID ${city.id}の形式`);
  }
  for (const [label, values] of [
    [city.name, cityNames],
    [city.nameJa, cityNamesJa],
  ]) {
    if (typeof label !== "string" || label !== label.trim() || !label) {
      fail(`都市${city.id}の名称が不正`);
    } else if (values.has(normalizeLabel(label))) {
      fail(`都市名称 ${label} が重複`);
    }
    values.add(normalizeLabel(label));
  }
  if (!(city.latitude >= -90 && city.latitude <= 90)) fail(`${city.id}の緯度`);
  if (!(city.longitude >= -180 && city.longitude <= 180))
    fail(`${city.id}の経度`);
  const coordinateKey = `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;
  if (cityCoordinates.has(coordinateKey)) {
    fail(`都市${city.id}の座標 ${coordinateKey} が重複`);
  }
  cityCoordinates.add(coordinateKey);
  if (
    Math.abs(city.latitude * 10_000 - Math.round(city.latitude * 10_000)) >
      1e-8 ||
    Math.abs(city.longitude * 10_000 - Math.round(city.longitude * 10_000)) >
      1e-8
  ) {
    fail(`都市${city.id}の座標精度が4桁を超えています`);
  }
  try {
    const resolved = new Intl.DateTimeFormat("ja-JP", {
      timeZone: city.timeZone,
    }).resolvedOptions().timeZone;
    if (resolved !== city.timeZone) {
      fail(
        `${city.id}のタイムゾーン${city.timeZone}は正規名${resolved}ではありません`,
      );
    }
  } catch {
    fail(`${city.id}のタイムゾーン`);
  }
}
if (
  cities.units?.latitude !== "degree, north-positive" ||
  cities.units?.longitude !== "degree, east-positive" ||
  cities.source?.coordinatePrecisionDegrees !== 0.0001
) {
  fail("都市プリセットのunitsまたはsourceが不正");
}

if (
  dut1.schemaVersion !== 1 ||
  dut1.product !== "IERS Bulletin A finals2000A UT1-UTC" ||
  dut1.timeScale !== "UTC" ||
  dut1.units?.mjdUtc !== "day" ||
  dut1.units?.dut1 !== "second" ||
  dut1.units?.uncertainty !== "second" ||
  dut1.encoding?.maximumQuantizationErrorSeconds !== 0.0000005 ||
  !Array.isArray(dut1.chunks) ||
  dut1.chunks.length === 0
) {
  fail("IERS DUT1 manifestの版、単位、encodingが不正です");
}

const dut1ChunkFiles = await Promise.all(
  dut1.chunks.map(async (descriptor) => {
    const text = await readFile(
      new URL(`../${descriptor.file}`, import.meta.url),
      "utf8",
    );
    return {
      descriptor,
      text,
      chunk: JSON.parse(text),
    };
  }),
);
const dut1QuantizedRecords = [];
let previousDut1Mjd = null;
let previousDut1Microseconds = null;
let dut1ObservedCount = 0;
let dut1PredictedCount = 0;
let dut1ObservedThrough = null;
let dut1PredictionStarts = null;
let dut1LeapBoundaryCount = 0;
let dut1PredictionStarted = false;
let dut1ChunkRawBytes = 0;
let dut1ChunkGzipBytes = 0;

for (const { descriptor, text, chunk } of dut1ChunkFiles) {
  const rawBytes = Buffer.byteLength(text);
  const gzipBytes = gzipSync(text, { level: 9 }).byteLength;
  dut1ChunkRawBytes += rawBytes;
  dut1ChunkGzipBytes += gzipBytes;
  if (
    descriptor.file !== `shared/eop/dut1/${descriptor.startMjdUtc}.v1.json` ||
    descriptor.startMjdUtc !== chunk.startMjdUtc ||
    descriptor.recordCount !== chunk.recordCount ||
    descriptor.endMjdUtc !== chunk.startMjdUtc + chunk.recordCount - 1 ||
    descriptor.rawBytes !== rawBytes ||
    descriptor.gzipBytes !== gzipBytes ||
    descriptor.sha256 !== createHash("sha256").update(text).digest("hex") ||
    rawBytes > 262_144 ||
    gzipBytes > 65_536 ||
    chunk.dut1MicrosecondsDelta?.length !== chunk.recordCount ||
    chunk.uncertaintyMicrosecondsDelta?.length !== chunk.recordCount
  ) {
    fail(`IERS DUT1 chunk ${descriptor.file}のdescriptorが不一致です`);
  }
  if (previousDut1Mjd !== null && chunk.startMjdUtc !== previousDut1Mjd + 1) {
    fail(`IERS DUT1 chunk ${descriptor.file}の開始MJDが不連続です`);
  }

  const statuses = new Array(chunk.recordCount);
  let expectedRangeStart = 0;
  for (const range of chunk.qualityRanges ?? []) {
    const [startOffset, endOffset, status] = range;
    if (
      startOffset !== expectedRangeStart ||
      !Number.isInteger(endOffset) ||
      endOffset <= startOffset ||
      endOffset > chunk.recordCount ||
      (status !== "I" && status !== "P")
    ) {
      fail(`IERS DUT1 chunk ${descriptor.file}のquality range`);
      continue;
    }
    statuses.fill(status, startOffset, endOffset);
    expectedRangeStart = endOffset;
  }
  if (expectedRangeStart !== chunk.recordCount) {
    fail(`IERS DUT1 chunk ${descriptor.file}のquality rangeが未被覆です`);
  }

  let dut1Microseconds = 0;
  let uncertaintyMicroseconds = 0;
  let chunkObservedCount = 0;
  let chunkPredictedCount = 0;
  for (let index = 0; index < chunk.recordCount; index += 1) {
    const dut1Delta = chunk.dut1MicrosecondsDelta[index];
    const uncertaintyDelta = chunk.uncertaintyMicrosecondsDelta[index];
    if (!Number.isInteger(dut1Delta) || !Number.isInteger(uncertaintyDelta)) {
      fail(`IERS DUT1 chunk ${descriptor.file}のdeltaが整数ではありません`);
      continue;
    }
    dut1Microseconds = index === 0 ? dut1Delta : dut1Microseconds + dut1Delta;
    uncertaintyMicroseconds =
      index === 0
        ? uncertaintyDelta
        : uncertaintyMicroseconds + uncertaintyDelta;
    const mjd = chunk.startMjdUtc + index;
    const status = statuses[index];
    if (
      Math.abs(dut1Microseconds) > 1_000_000 ||
      uncertaintyMicroseconds < 0 ||
      uncertaintyMicroseconds > 1_000_000
    ) {
      fail(`IERS DUT1 MJD ${mjd}の復号値が範囲外です`);
    }
    if (status === "I") {
      if (dut1PredictionStarted) {
        fail(`IERS DUT1 MJD ${mjd}で予測後に観測値へ戻っています`);
      }
      chunkObservedCount += 1;
      dut1ObservedCount += 1;
      dut1ObservedThrough = mjd;
    } else {
      if (!dut1PredictionStarted) {
        dut1PredictionStarted = true;
        dut1PredictionStarts = mjd;
      }
      chunkPredictedCount += 1;
      dut1PredictedCount += 1;
    }
    if (previousDut1Microseconds !== null) {
      const difference =
        (dut1Microseconds - previousDut1Microseconds) / 1_000_000;
      if (Math.abs(difference) > 0.5) {
        const leapStep = Math.round(difference);
        if (Math.abs(leapStep) !== 1 || Math.abs(difference - leapStep) > 0.1) {
          fail(`IERS DUT1 MJD ${mjd}に説明できない不連続があります`);
        }
        dut1LeapBoundaryCount += 1;
      }
    }
    dut1QuantizedRecords.push([
      mjd,
      status,
      dut1Microseconds,
      uncertaintyMicroseconds,
    ]);
    previousDut1Mjd = mjd;
    previousDut1Microseconds = dut1Microseconds;
  }
  if (
    descriptor.observedCount !== chunkObservedCount ||
    descriptor.predictedCount !== chunkPredictedCount ||
    chunkObservedCount + chunkPredictedCount !== chunk.recordCount
  ) {
    fail(`IERS DUT1 chunk ${descriptor.file}のquality件数が不一致です`);
  }
}

const dut1FirstMjd = dut1QuantizedRecords[0]?.[0] ?? null;
const dut1LastMjd = dut1QuantizedRecords.at(-1)?.[0] ?? null;
if (
  dut1.coverage?.firstMjdUtc !== dut1FirstMjd ||
  dut1.coverage?.lastMjdUtc !== dut1LastMjd ||
  dut1.coverage?.observedThroughMjdUtc !== dut1ObservedThrough ||
  dut1.coverage?.predictionStartsMjdUtc !== dut1PredictionStarts ||
  dut1.coverage?.recordCount !== dut1QuantizedRecords.length ||
  dut1.coverage?.observedCount !== dut1ObservedCount ||
  dut1.coverage?.predictedCount !== dut1PredictedCount ||
  dut1.coverage?.leapSecondBoundaryCount !== dut1LeapBoundaryCount ||
  dut1ObservedCount + dut1PredictedCount !== dut1QuantizedRecords.length ||
  dut1PredictionStarts !== dut1ObservedThrough + 1
) {
  fail("IERS DUT1 coverageがchunkの再計算値と不一致です");
}

const dut1CanonicalSha256 = createHash("sha256")
  .update(JSON.stringify(dut1QuantizedRecords))
  .digest("hex");
const dut1NormalizedText = `${JSON.stringify(dut1)}\n`;
const dut1ManifestBytes = Buffer.byteLength(dut1NormalizedText);
const dut1ManifestGzipBytes = gzipSync(dut1NormalizedText, {
  level: 9,
}).byteLength;
const dut1NormalizedBytes = dut1ManifestBytes + dut1ChunkRawBytes;
const dut1NormalizedGzipBytes = dut1ManifestGzipBytes + dut1ChunkGzipBytes;
const [dut1SourceBytes, dut1FormatBytes, dut1ChecksumBytes, dut1SnapshotText] =
  await Promise.all([
    readFile(new URL("../shared/eop/source/finals2000A.all", import.meta.url)),
    readFile(
      new URL("../shared/eop/source/readme.finals2000A", import.meta.url),
    ),
    readFile(new URL("../shared/eop/source/checksums.sha512", import.meta.url)),
    readFile(
      new URL(
        "../shared/eop/source/finals2000A.snapshot.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
const dut1SourceSha256 = createHash("sha256")
  .update(dut1SourceBytes)
  .digest("hex");
const dut1SourceSha512 = createHash("sha512")
  .update(dut1SourceBytes)
  .digest("hex");
const dut1FormatSha256 = createHash("sha256")
  .update(dut1FormatBytes)
  .digest("hex");
const dut1ChecksumSha256 = createHash("sha256")
  .update(dut1ChecksumBytes)
  .digest("hex");
const officialDut1Sha512 = dut1ChecksumBytes
  .toString("utf8")
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .find(([, filename]) => filename === "finals2000A.all")?.[0];

if (
  dut1.source?.sourceSha256 !== dut1SourceSha256 ||
  dut1.source?.officialSourceSha512 !== dut1SourceSha512 ||
  dut1.source?.formatSha256 !== dut1FormatSha256 ||
  dut1.source?.checksumSha256 !== dut1ChecksumSha256 ||
  dut1Snapshot.sourceSha256 !== dut1SourceSha256 ||
  dut1Snapshot.officialSourceSha512 !== dut1SourceSha512 ||
  dut1Snapshot.formatSha256 !== dut1FormatSha256 ||
  dut1Snapshot.checksumSha256 !== dut1ChecksumSha256 ||
  officialDut1Sha512 !== dut1SourceSha512
) {
  fail("IERS DUT1原本、format、公式checksumのdigestが不一致です");
}
if (
  dut1.source?.retrievedAt !== dut1Snapshot.retrievedAt ||
  dut1.source?.sourceLastModified !== dut1Snapshot.sourceLastModified ||
  dut1.source?.url !== dut1Snapshot.sourceUrl ||
  dut1.source?.formatUrl !== dut1Snapshot.formatUrl ||
  dut1.source?.checksumUrl !== dut1Snapshot.checksumUrl ||
  dut1.source?.productMetadataUrl !== dut1Snapshot.productMetadataUrl ||
  dut1.source?.distributionUrl !== dut1Snapshot.distributionUrl ||
  dut1.source?.distributionStatement !==
    "Distribution Statement A. Approved for public release: distribution unlimited."
) {
  fail("IERS DUT1の出典または再配布メタデータが不一致です");
}
if (
  dut1Lock.schemaVersion !== 1 ||
  dut1Lock.artifact !== "shared/eop/iers-finals2000a-dut1.v1.json" ||
  dut1Lock.canonicalization !==
    "UTF-8 JSON.stringify(decoded quantized records)" ||
  dut1Lock.algorithm !== "sha256" ||
  dut1Lock.contentSha256 !== dut1CanonicalSha256 ||
  dut1Lock.sourceSha256 !== dut1SourceSha256 ||
  dut1Lock.sourceSnapshotSha256 !==
    createHash("sha256").update(dut1SnapshotText).digest("hex") ||
  dut1Lock.recordCount !== dut1QuantizedRecords.length ||
  dut1Lock.observedCount !== dut1ObservedCount ||
  dut1Lock.predictedCount !== dut1PredictedCount ||
  dut1Lock.firstMjdUtc !== dut1FirstMjd ||
  dut1Lock.lastMjdUtc !== dut1LastMjd ||
  dut1Lock.chunkCount !== dut1.chunks.length ||
  dut1Lock.normalizedBytes !== dut1NormalizedBytes ||
  dut1Lock.normalizedGzipBytes !== dut1NormalizedGzipBytes ||
  dut1SourceBytes.byteLength > 4_000_000 ||
  dut1ManifestBytes > 262_144 ||
  dut1ManifestGzipBytes > 65_536 ||
  dut1NormalizedBytes > 900_000 ||
  dut1NormalizedGzipBytes > 300_000
) {
  fail("IERS DUT1再現性ロックまたはサイズ予算が不一致です");
}

const expectedEopColumns = [
  "mjdUtc",
  "polarMotionStatus",
  "xpMicroarcseconds",
  "xpReportedErrorMicroarcseconds",
  "ypMicroarcseconds",
  "ypReportedErrorMicroarcseconds",
  "dut1Status",
  "dut1Microseconds",
  "dut1ReportedErrorMicroseconds",
];
if (
  eop.schemaVersion !== 1 ||
  eop.product !== "IERS Bulletin A finals2000A Earth orientation" ||
  eop.timeScale !== "UTC" ||
  eop.units?.mjdUtc !== "day" ||
  eop.units?.dut1 !== "second" ||
  eop.units?.dut1ReportedError !== "second" ||
  eop.units?.polarMotion !== "arcsecond" ||
  eop.units?.polarMotionReportedError !== "arcsecond" ||
  eop.statusCodes?.I !== "iers" ||
  eop.statusCodes?.P !== "predicted" ||
  eop.encoding?.dut1IntegerUnit !== "microsecond" ||
  eop.encoding?.polarMotionIntegerUnit !== "microarcsecond" ||
  eop.encoding?.maximumDut1QuantizationErrorSeconds !== 0.0000005 ||
  eop.encoding?.maximumPolarMotionQuantizationErrorArcseconds !== 0.0000005 ||
  JSON.stringify(eop.encoding?.canonicalRecordColumns) !==
    JSON.stringify(expectedEopColumns) ||
  !Array.isArray(eop.chunks) ||
  eop.chunks.length === 0 ||
  eop.chunks.length > 16
) {
  fail("IERS EOP manifestの版、単位、encodingが不正です");
}

const eopDescriptorFiles = new Set();
let previousEopDescriptorEnd = null;
try {
  validateEopChunkDescriptors(eop.chunks);
} catch (error) {
  fail(
    "IERS EOP chunk descriptorを厳格検証できません: " +
      `${error instanceof Error ? error.message : String(error)}`,
  );
}
for (const descriptor of eop.chunks ?? []) {
  if (
    typeof descriptor.file !== "string" ||
    !/^shared\/eop\/eop\/[0-9]{5,6}\.v1\.json$/.test(descriptor.file) ||
    descriptor.file !== `shared/eop/eop/${descriptor.startMjdUtc}.v1.json` ||
    eopDescriptorFiles.has(descriptor.file) ||
    !Number.isInteger(descriptor.startMjdUtc) ||
    !Number.isInteger(descriptor.endMjdUtc) ||
    !Number.isInteger(descriptor.recordCount) ||
    descriptor.recordCount < 1 ||
    descriptor.recordCount > 4_096 ||
    descriptor.endMjdUtc !==
      descriptor.startMjdUtc + descriptor.recordCount - 1 ||
    (previousEopDescriptorEnd !== null &&
      descriptor.startMjdUtc !== previousEopDescriptorEnd + 1)
  ) {
    fail("IERS EOP chunk descriptorのpath、重複または連続性");
  }
  eopDescriptorFiles.add(descriptor.file);
  previousEopDescriptorEnd = descriptor.endMjdUtc;
}

const eopChunkFiles = await Promise.all(
  (eop.chunks ?? []).map(async (descriptor) => {
    const text = await readFile(
      new URL(`../${descriptor.file}`, import.meta.url),
      "utf8",
    );
    return {
      descriptor,
      text,
      chunk: JSON.parse(text),
    };
  }),
);
const eopQuantizedRecords = [];
let eopChunkRawBytes = 0;
let eopChunkGzipBytes = 0;
let previousEopMjd = null;
let previousEopDut1Microseconds = null;
let eopPolarMotionIersCount = 0;
let eopPolarMotionPredictedCount = 0;
let eopPolarMotionIersThrough = null;
let eopPolarMotionPredictionStarts = null;
let eopPolarMotionPredictionStarted = false;
let eopDut1IersCount = 0;
let eopDut1PredictedCount = 0;
let eopDut1IersThrough = null;
let eopDut1PredictionStarts = null;
let eopDut1PredictionStarted = false;
let eopLeapBoundaryCount = 0;

for (const { descriptor, text, chunk } of eopChunkFiles) {
  const rawBytes = Buffer.byteLength(text);
  const gzipBytes = gzipSync(text, { level: 9 }).byteLength;
  eopChunkRawBytes += rawBytes;
  eopChunkGzipBytes += gzipBytes;
  let decodedRecords;
  try {
    decodedRecords = decodeEopChunk(chunk);
  } catch (error) {
    fail(
      `IERS EOP chunk ${descriptor.file}を厳格復号できません: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    continue;
  }
  if (
    descriptor.startMjdUtc !== chunk.startMjdUtc ||
    descriptor.recordCount !== chunk.recordCount ||
    descriptor.endMjdUtc !== chunk.startMjdUtc + chunk.recordCount - 1 ||
    descriptor.rawBytes !== rawBytes ||
    descriptor.gzipBytes !== gzipBytes ||
    descriptor.sha256 !== createHash("sha256").update(text).digest("hex") ||
    rawBytes > 262_144 ||
    gzipBytes > 65_536 ||
    decodedRecords.length !== descriptor.recordCount
  ) {
    fail(`IERS EOP chunk ${descriptor.file}のdescriptorが不一致です`);
  }

  let chunkPolarMotionIersCount = 0;
  let chunkPolarMotionPredictedCount = 0;
  let chunkDut1IersCount = 0;
  let chunkDut1PredictedCount = 0;
  for (const record of decodedRecords) {
    const [mjd, polarMotionStatus, , , , , dut1Status, dut1Microseconds] =
      record;
    if (previousEopMjd !== null && mjd !== previousEopMjd + 1) {
      fail(`IERS EOP MJD ${mjd}が連続日ではありません`);
    }
    if (polarMotionStatus === "I") {
      if (eopPolarMotionPredictionStarted) {
        fail(`IERS EOP MJD ${mjd}の極運動がPからIへ戻っています`);
      }
      chunkPolarMotionIersCount += 1;
      eopPolarMotionIersCount += 1;
      eopPolarMotionIersThrough = mjd;
    } else {
      if (!eopPolarMotionPredictionStarted) {
        eopPolarMotionPredictionStarted = true;
        eopPolarMotionPredictionStarts = mjd;
      }
      chunkPolarMotionPredictedCount += 1;
      eopPolarMotionPredictedCount += 1;
    }
    if (dut1Status === "I") {
      if (eopDut1PredictionStarted) {
        fail(`IERS EOP MJD ${mjd}のDUT1がPからIへ戻っています`);
      }
      chunkDut1IersCount += 1;
      eopDut1IersCount += 1;
      eopDut1IersThrough = mjd;
    } else {
      if (!eopDut1PredictionStarted) {
        eopDut1PredictionStarted = true;
        eopDut1PredictionStarts = mjd;
      }
      chunkDut1PredictedCount += 1;
      eopDut1PredictedCount += 1;
    }
    if (previousEopDut1Microseconds !== null) {
      const difference =
        (dut1Microseconds - previousEopDut1Microseconds) / 1_000_000;
      if (Math.abs(difference) > 0.5) {
        const leapStep = Math.round(difference);
        if (Math.abs(leapStep) !== 1 || Math.abs(difference - leapStep) > 0.1) {
          fail(`IERS EOP MJD ${mjd}のDUT1不連続が不正です`);
        }
        eopLeapBoundaryCount += 1;
      }
    }
    eopQuantizedRecords.push([...record]);
    previousEopMjd = mjd;
    previousEopDut1Microseconds = dut1Microseconds;
  }
  if (
    descriptor.polarMotionIersCount !== chunkPolarMotionIersCount ||
    descriptor.polarMotionPredictedCount !== chunkPolarMotionPredictedCount ||
    descriptor.dut1IersCount !== chunkDut1IersCount ||
    descriptor.dut1PredictedCount !== chunkDut1PredictedCount ||
    chunkPolarMotionIersCount + chunkPolarMotionPredictedCount !==
      descriptor.recordCount ||
    chunkDut1IersCount + chunkDut1PredictedCount !== descriptor.recordCount
  ) {
    fail(`IERS EOP chunk ${descriptor.file}の品質件数が不一致です`);
  }
}

let parsedSourceEop;
try {
  parsedSourceEop = parseFinals2000AEop(dut1SourceBytes);
} catch (error) {
  fail(
    "保存finals2000A原本をEOPとして厳格解析できません: " +
      `${error instanceof Error ? error.message : String(error)}`,
  );
}
const sourceEopQuantizedRecords = parsedSourceEop?.records.map((record) => [
  record[0],
  record[1],
  Math.round(record[2] * 1_000_000),
  Math.round(record[3] * 1_000_000),
  Math.round(record[4] * 1_000_000),
  Math.round(record[5] * 1_000_000),
  record[6],
  Math.round(record[7] * 1_000_000),
  Math.round(record[8] * 1_000_000),
]);
if (
  JSON.stringify(sourceEopQuantizedRecords) !==
    JSON.stringify(eopQuantizedRecords) ||
  JSON.stringify(parsedSourceEop?.coverage) !== JSON.stringify(eop.coverage)
) {
  fail("IERS EOP生成物が保存原本の正規化値と一致しません");
}

const eopFirstMjd = eopQuantizedRecords[0]?.[0] ?? null;
const eopLastMjd = eopQuantizedRecords.at(-1)?.[0] ?? null;
if (
  eop.coverage?.firstSampleMjdUtc !== eopFirstMjd ||
  eop.coverage?.lastSampleMjdUtc !== eopLastMjd ||
  eop.coverage?.recordCount !== eopQuantizedRecords.length ||
  eop.coverage?.polarMotion?.iersThroughMjdUtc !== eopPolarMotionIersThrough ||
  eop.coverage?.polarMotion?.predictionStartsMjdUtc !==
    eopPolarMotionPredictionStarts ||
  eop.coverage?.polarMotion?.iersCount !== eopPolarMotionIersCount ||
  eop.coverage?.polarMotion?.predictedCount !== eopPolarMotionPredictedCount ||
  eop.coverage?.dut1?.iersThroughMjdUtc !== eopDut1IersThrough ||
  eop.coverage?.dut1?.predictionStartsMjdUtc !== eopDut1PredictionStarts ||
  eop.coverage?.dut1?.iersCount !== eopDut1IersCount ||
  eop.coverage?.dut1?.predictedCount !== eopDut1PredictedCount ||
  eop.coverage?.dut1?.leapSecondBoundaryCount !== eopLeapBoundaryCount ||
  eopPolarMotionPredictionStarts !== eopPolarMotionIersThrough + 1 ||
  eopDut1PredictionStarts !== eopDut1IersThrough + 1
) {
  fail("IERS EOP coverageがchunkの再計算値と一致しません");
}

const eopLegacyDut1Records = eopQuantizedRecords.map((record) => [
  record[0],
  record[6],
  record[7],
  record[8],
]);
if (
  JSON.stringify(eopLegacyDut1Records) !== JSON.stringify(dut1QuantizedRecords)
) {
  fail("IERS EOPのDUT1列が互換DUT1生成物と一致しません");
}

const eopCanonicalSha256 = createHash("sha256")
  .update(JSON.stringify(eopQuantizedRecords))
  .digest("hex");
const eopNormalizedText = `${JSON.stringify(eop)}\n`;
const eopManifestBytes = Buffer.byteLength(eopNormalizedText);
const eopManifestGzipBytes = gzipSync(eopNormalizedText, {
  level: 9,
}).byteLength;
const eopNormalizedBytes = eopManifestBytes + eopChunkRawBytes;
const eopNormalizedGzipBytes = eopManifestGzipBytes + eopChunkGzipBytes;

if (
  eop.source?.sourceSha256 !== dut1SourceSha256 ||
  eop.source?.officialSourceSha512 !== dut1SourceSha512 ||
  eop.source?.formatSha256 !== dut1FormatSha256 ||
  eop.source?.checksumSha256 !== dut1ChecksumSha256 ||
  eop.source?.retrievedAt !== dut1Snapshot.retrievedAt ||
  eop.source?.sourceLastModified !== dut1Snapshot.sourceLastModified ||
  eop.source?.url !== dut1Snapshot.sourceUrl ||
  eop.source?.formatUrl !== dut1Snapshot.formatUrl ||
  eop.source?.checksumUrl !== dut1Snapshot.checksumUrl ||
  eop.source?.productMetadataUrl !== dut1Snapshot.productMetadataUrl ||
  eop.source?.distributionUrl !== dut1Snapshot.distributionUrl ||
  eop.source?.distributionStatement !==
    "Distribution Statement A. Approved for public release: distribution unlimited." ||
  eop.source?.reportedErrorSemantics !==
    "The source labels these columns as error; no confidence level or covariance is asserted."
) {
  fail("IERS EOPの出典、digestまたは誤差semanticが不一致です");
}

if (
  eopLock.schemaVersion !== 1 ||
  eopLock.artifact !== "shared/eop/iers-finals2000a-eop.v1.json" ||
  eopLock.canonicalization !==
    "UTF-8 JSON.stringify(decoded quantized records)" ||
  eopLock.algorithm !== "sha256" ||
  eopLock.contentSha256 !== eopCanonicalSha256 ||
  eopLock.sourceSha256 !== dut1SourceSha256 ||
  eopLock.sourceSnapshotSha256 !==
    createHash("sha256").update(dut1SnapshotText).digest("hex") ||
  eopLock.recordCount !== eopQuantizedRecords.length ||
  eopLock.polarMotionIersCount !== eopPolarMotionIersCount ||
  eopLock.polarMotionPredictedCount !== eopPolarMotionPredictedCount ||
  eopLock.dut1IersCount !== eopDut1IersCount ||
  eopLock.dut1PredictedCount !== eopDut1PredictedCount ||
  eopLock.missingPolarMotionTailRows !==
    eop.coverage.polarMotion.missingTailRows ||
  eopLock.missingDut1TailRows !== eop.coverage.dut1.missingTailRows ||
  eopLock.firstSampleMjdUtc !== eopFirstMjd ||
  eopLock.lastSampleMjdUtc !== eopLastMjd ||
  eopLock.chunkCount !== eop.chunks.length ||
  eopLock.normalizedBytes !== eopNormalizedBytes ||
  eopLock.normalizedGzipBytes !== eopNormalizedGzipBytes ||
  eopManifestBytes > 262_144 ||
  eopManifestGzipBytes > 65_536 ||
  eopNormalizedBytes > 900_000 ||
  eopNormalizedGzipBytes > 300_000
) {
  fail("IERS EOP再現性ロックまたはサイズ予算が不一致です");
}

if (
  fixtures.schemaVersion !== 1 ||
  fixtures.angleUnit !== "degree" ||
  !Array.isArray(fixtures.julianDates) ||
  !Array.isArray(fixtures.horizontalCoordinates) ||
  !Array.isArray(fixtures.projections) ||
  !Array.isArray(fixtures.realStarPositions) ||
  !Array.isArray(fixtures.precessionVectors) ||
  !Array.isArray(fixtures.angularDistances) ||
  !Array.isArray(fixtures.solarPositions) ||
  !Array.isArray(fixtures.twilightPhases)
) {
  fail("共有テストベクトルの配列が不足");
}

const fixtureGroups = [
  "julianDates",
  "siderealTimes",
  "horizontalCoordinates",
  "projections",
  "realStarPositions",
  "precessionVectors",
  "angularDistances",
  "solarPositions",
  "twilightPhases",
];
const allFixtureIds = new Map();
for (const group of fixtureGroups) {
  const ids = new Set();
  for (const vector of fixtures[group] ?? []) {
    if (
      typeof vector.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vector.id)
    ) {
      fail(`共有ベクトル${group}のIDが空`);
    } else if (ids.has(vector.id)) {
      fail(`共有ベクトル${group}のID ${vector.id}が重複`);
    } else if (allFixtureIds.has(vector.id)) {
      fail(
        `共有ベクトルID ${vector.id}が${allFixtureIds.get(vector.id)}と` +
          `${group}で重複`,
      );
    }
    ids.add(vector.id);
    allFixtureIds.set(vector.id, group);
  }
}
const expectedToleranceNames = new Set([
  "basicAngleDegrees",
  "projectionNormalized",
  "realStarDegrees",
  "precessionDegrees",
  "angularDistanceDegrees",
  "solarDegrees",
]);
for (const [name, tolerance] of Object.entries(fixtures.tolerances ?? {})) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    fail(`共有ベクトル許容誤差${name}が不正`);
  }
  if (!expectedToleranceNames.delete(name)) {
    fail(`共有ベクトルに未知の許容誤差${name}`);
  }
}
if (expectedToleranceNames.size > 0) {
  fail(`共有ベクトル許容誤差が不足: ${[...expectedToleranceNames].join(", ")}`);
}
if (
  !fixtures.reference?.startsWith("docs/astronomy-model.md version 1") ||
  fixtures.supportedDateRange?.minimum !== "1900-01-01T00:00:00.000Z" ||
  fixtures.supportedDateRange?.maximum !== "2100-12-31T23:59:59.999Z"
) {
  fail("共有ベクトルの参照モデルまたは対応期間が不正");
}
const supportedMinimum = Date.parse(fixtures.supportedDateRange?.minimum);
const supportedMaximum = Date.parse(fixtures.supportedDateRange?.maximum);
for (const group of ["julianDates", "realStarPositions", "solarPositions"]) {
  for (const vector of fixtures[group] ?? []) {
    const milliseconds = Date.parse(vector.iso);
    if (
      !Number.isFinite(milliseconds) ||
      milliseconds < supportedMinimum ||
      milliseconds > supportedMaximum
    ) {
      fail(`共有ベクトル${group}/${vector.id}の日時が対応期間外`);
    }
  }
}

const catalogByHr = new Map(catalog.stars.map((star) => [star[0], star]));
for (const vector of fixtures.realStarPositions ?? []) {
  const catalogStar = catalogByHr.get(vector.star?.hr);
  if (!catalogStar) {
    fail(`実星ケース${vector.id}が未知のHR ${vector.star?.hr}を参照`);
    continue;
  }
  const expectedRaDegrees = (catalogStar[2] * 180) / Math.PI;
  const expectedDecDegrees = (catalogStar[3] * 180) / Math.PI;
  if (Math.abs(vector.star.rightAscension - expectedRaDegrees) > 1e-7) {
    fail(`実星ケース${vector.id}の赤経が星表と不一致`);
  }
  if (Math.abs(vector.star.declination - expectedDecDegrees) > 1e-7) {
    fail(`実星ケース${vector.id}の赤緯が星表と不一致`);
  }
  if (
    !Number.isFinite(vector.expected?.altitude) ||
    vector.expected.altitude < -90 ||
    vector.expected.altitude > 90 ||
    !(vector.expected?.azimuth >= 0 && vector.expected.azimuth < 360)
  ) {
    fail(`実星ケース${vector.id}の期待地平座標`);
  }
}

for (const vector of fixtures.precessionVectors ?? []) {
  if (
    !Number.isFinite(vector.julianDate) ||
    vector.julianDate < 2_415_020.5 ||
    vector.julianDate > 2_488_434.5 ||
    !(vector.rightAscension >= 0 && vector.rightAscension < 360) ||
    !(vector.declination >= -90 && vector.declination <= 90) ||
    !(
      vector.expected?.rightAscension >= 0 &&
      vector.expected.rightAscension < 360
    ) ||
    !(vector.expected?.declination >= -90 && vector.expected.declination <= 90)
  ) {
    fail(`歳差ケース${vector.id}の座標範囲`);
  }
}

for (const vector of fixtures.angularDistances ?? []) {
  if (
    !["equatorial", "horizontal"].includes(vector.coordinateSystem) ||
    !Number.isFinite(vector.expected) ||
    vector.expected < 0 ||
    vector.expected > 180
  ) {
    fail(`角距離ケース${vector.id}が不正`);
  }
}

for (const vector of fixtures.projections ?? []) {
  if (
    !Number.isFinite(vector.altitude) ||
    vector.altitude < -90 ||
    vector.altitude > 90 ||
    !Number.isFinite(vector.azimuth) ||
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y)
  ) {
    fail(`投影ケース${vector.id}が不正`);
  }
}

const validPhases = new Set([
  "day",
  "civil",
  "nautical",
  "astronomical",
  "night",
]);
for (const vector of fixtures.solarPositions ?? []) {
  if (
    !validPhases.has(vector.expected?.phase) ||
    !Number.isFinite(vector.expected?.rightAscension) ||
    !(
      vector.expected.rightAscension >= 0 &&
      vector.expected.rightAscension < 360
    ) ||
    !(
      vector.expected?.declination >= -90 && vector.expected.declination <= 90
    ) ||
    !(vector.expected?.altitude >= -90 && vector.expected.altitude <= 90) ||
    !(vector.expected?.azimuth >= 0 && vector.expected.azimuth < 360)
  ) {
    fail(`太陽ケース${vector.id}の薄明区分`);
  }
}
for (const vector of fixtures.twilightPhases ?? []) {
  if (!Number.isFinite(vector.altitude) || !validPhases.has(vector.expected)) {
    fail(`薄明境界ケースが不正`);
  }
}

const requiredSites = new Set([
  "tokyo",
  "greenwich",
  "sydney",
  "equator",
  "tromso",
]);
const requiredStars = new Set(["Polaris", "Sirius", "Vega", "Arcturus"]);
for (const vector of fixtures.realStarPositions ?? []) {
  requiredSites.delete(vector.location?.id);
  requiredStars.delete(vector.star?.name);
}
if (requiredSites.size > 0) {
  fail(`実星ケースの必須地点が不足: ${[...requiredSites].join(", ")}`);
}
if (requiredStars.size > 0) {
  fail(`実星ケースの必須恒星が不足: ${[...requiredStars].join(", ")}`);
}
for (const [group, requiredIds] of [
  ["projections", ["zenith", "nadir", "north-horizon", "east-horizon"]],
  [
    "angularDistances",
    ["ra-wrap", "near-zenith-opposite-azimuths", "equatorial-antipodes"],
  ],
  [
    "twilightPhases",
    [
      "day-boundary",
      "civil-boundary",
      "nautical-boundary",
      "astronomical-boundary",
    ],
  ],
]) {
  const available = new Set((fixtures[group] ?? []).map(({ id }) => id));
  const missing = requiredIds.filter((id) => !available.has(id));
  if (missing.length > 0) {
    fail(`共有ベクトル${group}の必須ケースが不足: ${missing.join(", ")}`);
  }
}

const fixtureV2Groups = [
  "earthRotationAngles",
  "meanSiderealTimes",
  "nutationAngles",
  "fukushimaWilliamsAngles",
  "aberrationVectors",
  "refractionCoefficients",
  "composedApparentPositions",
];
const fixtureV2Ids = new Set();
if (
  fixturesV2.schemaVersion !== 2 ||
  fixturesV2.angleUnit !== "radian" ||
  !fixturesV2.reference?.implementation?.startsWith(
    "IAU SOFA ANSI C release 2023-10-11",
  )
) {
  fail("v2共有テストベクトルの版または出典が不正");
}
for (const group of fixtureV2Groups) {
  if (!Array.isArray(fixturesV2[group]) || fixturesV2[group].length === 0) {
    fail(`v2共有テストベクトル${group}が不足`);
    continue;
  }
  for (const vector of fixturesV2[group]) {
    if (fixtureV2Ids.has(vector.id)) {
      fail(`v2共有ベクトルID ${vector.id}が重複`);
    }
    fixtureV2Ids.add(vector.id);
  }
}
for (const vector of fixturesV2.composedApparentPositions ?? []) {
  const velocity = vector.aberration?.observerBarycentricVelocityC ?? [];
  if (
    !hrIds.has(vector.starHR) ||
    !Number.isFinite(Date.parse(vector.iso)) ||
    velocity.length !== 3 ||
    velocity.some((value) => !Number.isFinite(value)) ||
    Math.hypot(...velocity) >= 1 ||
    Object.values(vector.expected ?? {}).some(
      (value) => !Number.isFinite(value),
    )
  ) {
    fail(`v2合成ベクトル${vector.id}が不正`);
  }
}
const scan = fixturesV2.accuracyScan;
const calculatedDateSamples =
  Math.floor(
    (scan.range.maximumJulianDate - scan.range.minimumJulianDate) /
      scan.dateStepDays,
  ) + 1;
const calculatedDirectionSamples =
  calculatedDateSamples *
  (360 / scan.directionGrid.rightAscensionStepDegrees) *
  scan.directionGrid.declinationsDegrees.length;
if (
  scan.dateSamples !== calculatedDateSamples ||
  scan.directionGrid.samples !== calculatedDirectionSamples
) {
  fail("v2精度スキャンのサンプル件数が不一致");
}
for (const measurement of [
  scan.siderealLeadingEquationOfEquinoxes,
  scan.jplApproximateAberrationVersusSofaEpv00,
]) {
  if (
    !Number.isFinite(measurement.maximumDifferenceMilliarcseconds) ||
    !Number.isFinite(measurement.rmsDifferenceMilliarcseconds) ||
    measurement.maximumDifferenceMilliarcseconds < 0 ||
    measurement.rmsDifferenceMilliarcseconds < 0 ||
    measurement.rmsDifferenceMilliarcseconds >
      measurement.maximumDifferenceMilliarcseconds
  ) {
    fail("v2精度スキャンの誤差測定値が不正");
  }
}

const requiredDiurnalAberrationIds = [
  "tokyo-meridian-south-1900",
  "tokyo-pole-j2000",
  "tokyo-east-velocity-aligned-2100",
  "equator-meridian-j2000",
  "latitude-75-meridian-2026",
  "sydney-meridian-2026",
  "tokyo-height-1000m-2026",
];
const diurnalAberrationIds = new Set();
if (
  diurnalAberrationFixtures.schemaVersion !== 1 ||
  diurnalAberrationFixtures.oracle !==
    "IAU SOFA ANSI C 2023-10-11 unmodified apio/atioq" ||
  diurnalAberrationFixtures.driver !==
    "script/sofa_observer_effects_oracle.c --fixtures" ||
  !/^[0-9a-f]{64}$/.test(
    diurnalAberrationFixtures.retrievedArchiveSha256 ?? "",
  ) ||
  !Array.isArray(diurnalAberrationFixtures.cases)
) {
  fail("日周光行差SOFA fixtureの版または出典が不正");
}
for (const vector of diurnalAberrationFixtures.cases ?? []) {
  const geometric = vector.geometricHorizontalEnu ?? [];
  const expected = vector.expectedHorizontalEnu ?? [];
  if (diurnalAberrationIds.has(vector.id)) {
    fail(`日周光行差fixture ID ${vector.id}が重複`);
  }
  diurnalAberrationIds.add(vector.id);
  if (
    geometric.length !== 3 ||
    expected.length !== 3 ||
    [...geometric, ...expected].some(
      (component) => !Number.isFinite(component),
    ) ||
    Math.abs(Math.hypot(...geometric) - 1) > 2e-15 ||
    Math.abs(Math.hypot(...expected) - 1) > 2e-15 ||
    !Number.isFinite(vector.diurnalAberrationMagnitude) ||
    vector.diurnalAberrationMagnitude < 0 ||
    vector.diurnalAberrationMagnitude >= 1 ||
    !Number.isFinite(vector.separationArcseconds) ||
    vector.separationArcseconds < 0 ||
    vector.separationArcseconds > 1
  ) {
    fail(`日周光行差fixture ${vector.id}のベクトルまたは値が不正`);
  }
}
const missingDiurnalAberrationIds = requiredDiurnalAberrationIds.filter(
  (id) => !diurnalAberrationIds.has(id),
);
if (missingDiurnalAberrationIds.length > 0) {
  fail(
    "日周光行差fixtureの必須ケースが不足: " +
      missingDiurnalAberrationIds.join(", "),
  );
}

const requiredSolarLightDeflectionIds = [
  "official-t-sofa-c-ldsun",
  "orthogonal-one-au",
  "exact-solar-center-one-au",
  "below-limiter-one-au",
  "above-limiter-one-au",
  "below-limiter-ten-au",
];
const solarLightDeflectionIds = new Set();
if (
  solarLightDeflectionFixtures.schemaVersion !== 1 ||
  solarLightDeflectionFixtures.oracle !==
    "IAU SOFA ANSI C 2023-10-11 unmodified ldsun/ld" ||
  solarLightDeflectionFixtures.driver !==
    "script/sofa_light_deflection_oracle.c" ||
  solarLightDeflectionFixtures.expectedVectors !==
    "raw iauLdsun output; normalized by Planetarium tests before comparison" ||
  [
    solarLightDeflectionFixtures.retrievedArchiveSha256,
    solarLightDeflectionFixtures.officialTestProgramSha256,
    solarLightDeflectionFixtures.ldSourceSha256,
    solarLightDeflectionFixtures.ldsunSourceSha256,
  ].some((hash) => !/^[0-9a-f]{64}$/.test(hash ?? "")) ||
  !Array.isArray(solarLightDeflectionFixtures.cases)
) {
  fail("太陽重力光偏向SOFA fixtureの版または出典が不正");
}
for (const vector of solarLightDeflectionFixtures.cases ?? []) {
  const natural = vector.naturalDirection ?? [];
  const sunToObserver = vector.sunToObserverUnitDirection ?? [];
  const expected = vector.expectedDeflectedDirection ?? [];
  if (solarLightDeflectionIds.has(vector.id)) {
    fail(`太陽重力光偏向fixture ID ${vector.id}が重複`);
  }
  solarLightDeflectionIds.add(vector.id);
  if (
    natural.length !== 3 ||
    sunToObserver.length !== 3 ||
    expected.length !== 3 ||
    [...natural, ...sunToObserver, ...expected].some(
      (component) => !Number.isFinite(component),
    ) ||
    Math.abs(Math.hypot(...natural) - 1) > 1e-9 ||
    Math.abs(Math.hypot(...sunToObserver) - 1) > 1e-9 ||
    Math.abs(Math.hypot(...expected) - 1) > 1e-9 ||
    !Number.isFinite(vector.sunObserverDistanceAu) ||
    vector.sunObserverDistanceAu <= 0
  ) {
    fail(`太陽重力光偏向fixture ${vector.id}のベクトルまたは距離が不正`);
  }
}
const missingSolarLightDeflectionIds = requiredSolarLightDeflectionIds.filter(
  (id) => !solarLightDeflectionIds.has(id),
);
if (missingSolarLightDeflectionIds.length > 0) {
  fail(
    "太陽重力光偏向fixtureの必須ケースが不足: " +
      missingSolarLightDeflectionIds.join(", "),
  );
}

const requiredSolarPositionIds = [
  "greenwich-march-equinox-j2000",
  "tokyo-iers-eop-2026-midnight",
  "tokyo-iers-eop-2026-noon",
  "sydney-december-solstice-2050",
  "tromso-polar-night-2099",
  "greenwich-compact-ephemeris-maximum-2061",
  "greenwich-truncated-ephemeris-maximum-2098",
  "mauna-kea-high-altitude-sunrise-2026",
];
const solarPositionIds = new Set();
if (
  solarPositionFixtures.schemaVersion !== 1 ||
  solarPositionFixtures.oracle !==
    "IAU SOFA ANSI C 2023-10-11 unmodified epv00/ab/pnm06a/c2i06a/pvtob/apio13/atioq" ||
  solarPositionFixtures.driver !== "script/sofa_solar_position_oracle.c" ||
  !/^[0-9a-f]{64}$/.test(solarPositionFixtures.retrievedArchiveSha256 ?? "") ||
  !Array.isArray(solarPositionFixtures.cases)
) {
  fail("太陽位置SOFA fixtureの版または出典が不正");
}
for (const vector of solarPositionFixtures.cases ?? []) {
  const equatorial = vector.expectedApparentEquatorialRadians ?? [];
  const horizontal = vector.expectedHorizontalEnu ?? [];
  const heliocentricEarth = vector.expectedHeliocentricEarthPositionAu ?? [];
  if (solarPositionIds.has(vector.id)) {
    fail(`太陽位置fixture ID ${vector.id}が重複`);
  }
  solarPositionIds.add(vector.id);
  if (
    equatorial.length !== 2 ||
    horizontal.length !== 3 ||
    heliocentricEarth.length !== 3 ||
    [...equatorial, ...horizontal, ...heliocentricEarth].some(
      (component) => !Number.isFinite(component),
    ) ||
    Math.abs(Math.hypot(...horizontal) - 1) > 2e-15 ||
    !Number.isFinite(Date.parse(vector.observedAtIso ?? ""))
  ) {
    fail(`太陽位置fixture ${vector.id}のベクトルまたは日時が不正`);
  }
}
const missingSolarPositionIds = requiredSolarPositionIds.filter(
  (id) => !solarPositionIds.has(id),
);
if (missingSolarPositionIds.length > 0) {
  fail(
    "太陽位置fixtureの必須ケースが不足: " + missingSolarPositionIds.join(", "),
  );
}

const ephemerisGroups = [
  "e0x",
  "e0y",
  "e0z",
  "e1x",
  "e1y",
  "e1z",
  "e2x",
  "e2y",
  "e2z",
];
const retainedEphemerisTerms = ephemerisGroups.reduce(
  (sum, group) => sum + (earthEphemeris.series?.[group]?.length ?? 0),
  0,
);
if (
  earthEphemeris.schemaVersion !== 1 ||
  earthEphemeris.model !== "truncated-vsop2000-earth-heliocentric" ||
  earthEphemeris.truncation?.fullTermCount !== 1_323 ||
  earthEphemeris.truncation?.retainedTermCount !== 100 ||
  retainedEphemerisTerms !== 100 ||
  earthEphemeris.source?.sourceFileSha256 !==
    "939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a"
) {
  fail("地球暦の版、出典、または項数が不正");
}
for (const group of ephemerisGroups) {
  for (const [index, term] of (
    earthEphemeris.series?.[group] ?? []
  ).entries()) {
    if (
      !Array.isArray(term) ||
      term.length !== 3 ||
      term.some((value) => !Number.isFinite(value))
    ) {
      fail(`地球暦${group}[${index}]が有限な3係数ではない`);
    }
  }
}

if (!process.exitCode) {
  console.log(
    `共有データOK: ${catalog.stars.length}恒星 / ${names.stars.length}固有名 / ` +
      `${constellations.constellations.length}星座 / ${cities.cities.length}地点 / ` +
      `${dut1.coverage.recordCount}日DUT1 / ` +
      `${eop.coverage.recordCount}日EOP / ` +
      `${diurnalAberrationIds.size}日周光行差fixture / ` +
      `${solarLightDeflectionIds.size}太陽光偏向fixture / ` +
      `${solarPositionIds.size}太陽位置fixture / ` +
      `${retainedEphemerisTerms}項地球暦`,
  );
}
