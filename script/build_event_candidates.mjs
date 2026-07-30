import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  EVENT_CANDIDATE_PATHS,
  buildCandidateFixture,
  buildCandidateManifest,
  buildEclipseCandidates,
  buildLunarOccultationCandidates,
  groupCandidatesIntoChunks,
  verifyCandidatesAgainstNasa,
} from "./lib/event-candidates.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    "output-root": { type: "string" },
    source: { type: "string" },
    "verify-nasa": { type: "boolean", default: false },
  },
});

if (!values.source) {
  throw new Error(
    "Usage: node script/build_event_candidates.mjs " +
      "--source /path/to/de442s.bsp [--check] [--verify-nasa]",
  );
}

const outputRoot = resolve(values["output-root"] ?? projectRoot);
const sourcePath = resolve(values.source);
const [sourceBytes, starCatalog, starNames] = await Promise.all([
  readFile(sourcePath),
  readFile(
    join(projectRoot, "shared/catalog/bright-stars.v2.json"),
    "utf8",
  ).then(JSON.parse),
  readFile(
    join(projectRoot, "shared/catalog/star-names.v1.json"),
    "utf8",
  ).then(JSON.parse),
]);
const eclipseCandidates = buildEclipseCandidates(sourceBytes);
const occultations = buildLunarOccultationCandidates(
  sourceBytes,
  starCatalog,
  starNames,
);
const candidates = [
  ...eclipseCandidates,
  ...occultations.candidates,
].sort(
  (left, right) =>
    left.maximumJulianDateTdb - right.maximumJulianDateTdb ||
    left.id.localeCompare(right.id),
);
const chunks = groupCandidatesIntoChunks(candidates);
const manifest = buildCandidateManifest(
  chunks,
  {
    id: "NASA HEASARC BSC5P bright-stars.v2",
    artifact: "shared/catalog/bright-stars.v2.json",
    referenceSystem: starCatalog.referenceSystem,
    epoch: starCatalog.epoch,
    sourceUrl: starCatalog.source.url,
    sourceSha256: starCatalog.source.sourceSha256,
    starsContentSha256: createHash("sha256")
      .update(JSON.stringify(starCatalog.stars))
      .digest("hex"),
  },
  occultations.selectedStars,
);
const fixture = buildCandidateFixture(candidates, manifest);
const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
const serializedFixture = `${JSON.stringify(fixture, null, 2)}\n`;

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(join(projectRoot, relativePath), "utf8"),
  );
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validatorsBySchema = new Map();
for (const [data, schemaPath, label] of [
  [manifest, EVENT_CANDIDATE_PATHS.manifestSchema, "manifest"],
  [fixture, EVENT_CANDIDATE_PATHS.fixtureSchema, "fixture"],
  ...chunks.map((chunk) => [
    chunk.artifact,
    EVENT_CANDIDATE_PATHS.chunkSchema,
    chunk.file,
  ]),
]) {
  let validate = validatorsBySchema.get(schemaPath);
  if (!validate) {
    validate = ajv.compile(await readJson(schemaPath));
    validatorsBySchema.set(schemaPath, validate);
  }
  if (!validate(data)) {
    throw new Error(
      `${label} does not match ${schemaPath}: ` +
        JSON.stringify(validate.errors),
    );
  }
}

if (
  !fixture.checks.allCenturyCountsMatch ||
  !fixture.checks.allKnownCasesWithinTolerance ||
  !fixture.checks.allKnownOccultationsPresent
) {
  throw new Error("generated candidates do not satisfy fixed fixtures");
}

if (values["verify-nasa"]) {
  const results = await verifyCandidatesAgainstNasa(candidates);
  for (const result of results) {
    console.log(
      `NASA ${result.kind} ${result.startYear}-${result.endYear}: ` +
        `${result.generatedCount} events; max seed delta ` +
        `${result.maximumSeedDifferenceSeconds.toFixed(1)} s; mean ` +
        `${result.meanSeedDifferenceSeconds.toFixed(1)} s; class-hint ` +
        `mismatches ${result.classificationHintMismatchCount}`,
    );
  }
}

async function compareGeneratedFile(relativePath, expected) {
  const absolutePath = join(outputRoot, relativePath);
  let actual;
  try {
    actual = await readFile(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${absolutePath} is missing`, { cause: error });
    }
    throw error;
  }
  const expectedBytes = Buffer.from(expected, "utf8");
  if (!actual.equals(expectedBytes)) {
    throw new Error(
      `${absolutePath} is not reproducible from ${sourcePath}`,
    );
  }
}

if (values.check) {
  await compareGeneratedFile(
    EVENT_CANDIDATE_PATHS.manifest,
    serializedManifest,
  );
  await compareGeneratedFile(
    EVENT_CANDIDATE_PATHS.fixture,
    serializedFixture,
  );
  for (const chunk of chunks) {
    await compareGeneratedFile(chunk.file, chunk.serialized);
  }
  const chunksDirectory = join(
    outputRoot,
    EVENT_CANDIDATE_PATHS.chunks,
  );
  const actualChunkNames = (await readdir(chunksDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const expectedChunkNames = chunks
    .map((chunk) => chunk.file.split("/").at(-1))
    .sort();
  if (
    actualChunkNames.length !== expectedChunkNames.length ||
    actualChunkNames.some(
      (name, index) => name !== expectedChunkNames[index],
    )
  ) {
    throw new Error(
      `${chunksDirectory} contains an unexpected JSON chunk set`,
    );
  }
  console.log(
    `Event candidates: ${candidates.length} events / ` +
      `${chunks.length} chunks reproduced`,
  );
} else {
  await mkdir(
    join(outputRoot, dirname(EVENT_CANDIDATE_PATHS.manifest)),
    { recursive: true },
  );
  await mkdir(
    join(outputRoot, EVENT_CANDIDATE_PATHS.chunks),
    { recursive: true },
  );
  await mkdir(
    join(outputRoot, dirname(EVENT_CANDIDATE_PATHS.fixture)),
    { recursive: true },
  );
  const chunksDirectory = join(
    outputRoot,
    EVENT_CANDIDATE_PATHS.chunks,
  );
  const expectedChunkNames = new Set(
    chunks.map((chunk) => chunk.file.split("/").at(-1)),
  );
  const staleChunkNames = (await readdir(chunksDirectory)).filter(
    (name) =>
      name.endsWith(".json") && !expectedChunkNames.has(name),
  );
  await Promise.all(
    staleChunkNames.map((name) =>
      unlink(join(chunksDirectory, name)),
    ),
  );
  await Promise.all([
    writeFile(
      join(outputRoot, EVENT_CANDIDATE_PATHS.manifest),
      serializedManifest,
    ),
    writeFile(
      join(outputRoot, EVENT_CANDIDATE_PATHS.fixture),
      serializedFixture,
    ),
    ...chunks.map((chunk) =>
      writeFile(
        join(outputRoot, chunk.file),
        chunk.serialized,
      ),
    ),
  ]);
  console.log(
    `Event candidates: ${candidates.length} events / ` +
      `${manifest.statistics.totalChunkBytes} bytes generated under ` +
      `${join(outputRoot, EVENT_CANDIDATE_PATHS.directory)}`,
  );
}
