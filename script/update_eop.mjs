import {
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildEopArtifacts,
  buildDut1Artifacts,
  createSnapshot,
  EOP_CHECKSUM_URL,
  EOP_FORMAT_URL,
  EOP_PATHS,
  EOP_SOURCE_URL,
  DUT1_PATHS
} from "./lib/eop-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (
  !["--fetch", "--build", "--check"].includes(mode) ||
  process.argv.length !== 3
) {
  throw new Error(
    "明示的に --fetch（ネット更新）、--build（ローカル再生成）、" +
      "--check（非変更検証）のいずれかを指定してください"
  );
}

const absolutePath = (relativePath) => path.join(root, relativePath);
const readSnapshotInputs = async () => {
  const [sourceBytes, formatBytes, checksumBytes, snapshotText] =
    await Promise.all([
      readFile(absolutePath(EOP_PATHS.source)),
      readFile(absolutePath(EOP_PATHS.format)),
      readFile(absolutePath(EOP_PATHS.checksums)),
      readFile(absolutePath(EOP_PATHS.snapshot), "utf8")
    ]);
  return {
    sourceBytes,
    formatBytes,
    checksumBytes,
    snapshotText,
    snapshot: JSON.parse(snapshotText)
  };
};

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "planetarium-iers-eop-builder/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`${url} の取得に失敗しました: ${response.status}`);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    lastModified: response.headers.get("last-modified")
  };
}

async function fetchSnapshotInputs() {
  // The source and official checksum can be published a few moments apart.
  // Retry the complete immutable candidate instead of accepting a mixed pair.
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const [source, format, checksums] = await Promise.all([
        fetchBytes(EOP_SOURCE_URL),
        fetchBytes(EOP_FORMAT_URL),
        fetchBytes(EOP_CHECKSUM_URL)
      ]);
      const sourceLastModified = new Date(
        source.lastModified ?? Number.NaN
      );
      if (!Number.isFinite(sourceLastModified.getTime())) {
        throw new Error("finals2000A.allのLast-Modifiedがありません");
      }
      const snapshot = createSnapshot({
        retrievedAt: new Date().toISOString(),
        sourceLastModified: sourceLastModified.toISOString(),
        sourceBytes: source.bytes,
        formatBytes: format.bytes,
        checksumBytes: checksums.bytes
      });
      const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
      return {
        sourceBytes: source.bytes,
        formatBytes: format.bytes,
        checksumBytes: checksums.bytes,
        snapshot,
        snapshotText
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const inputs =
  mode === "--fetch"
    ? await fetchSnapshotInputs()
    : await readSnapshotInputs();
const artifacts = buildEopArtifacts(inputs);
const legacyDut1Artifacts = buildDut1Artifacts(inputs);

async function assertArtifactsMatch(paths, built, label) {
  const [actualData, actualLock, actualChunkNames, actualChunkTexts] =
    await Promise.all([
      readFile(absolutePath(paths.data), "utf8"),
      readFile(absolutePath(paths.lock), "utf8"),
      readdir(absolutePath(paths.chunks)),
      Promise.all(
        built.chunks.map((chunk) =>
          readFile(absolutePath(chunk.relativePath), "utf8")
        )
      )
    ]);
  const expectedChunkNames = built.chunks
    .map((chunk) => path.basename(chunk.relativePath))
    .sort();
  if (
    actualData !== built.dataText ||
    actualLock !== built.lockText ||
    JSON.stringify(actualChunkNames.sort()) !==
      JSON.stringify(expectedChunkNames) ||
    actualChunkTexts.some(
      (text, index) => text !== built.chunks[index].text
    )
  ) {
    throw new Error(
      `${label}生成物が保存原本からの決定的な再生成結果と一致しません`
    );
  }
}

if (mode === "--check") {
  await Promise.all([
    assertArtifactsMatch(EOP_PATHS, artifacts, "EOP"),
    assertArtifactsMatch(
      DUT1_PATHS,
      legacyDut1Artifacts,
      "互換DUT1"
    )
  ]);
  console.log(
    `EOPオフライン再現性OK: ${artifacts.lock.recordCount}日 / ` +
      `${artifacts.lock.contentSha256}`
  );
  console.log(
    "互換DUT1オフライン再現性OK: " +
      `${legacyDut1Artifacts.lock.contentSha256}`
  );
  process.exit(0);
}

const writes = [
  [EOP_PATHS.data, artifacts.dataText],
  [EOP_PATHS.lock, artifacts.lockText],
  ...artifacts.chunks.map((chunk) => [
    chunk.relativePath,
    chunk.text
  ]),
  [DUT1_PATHS.data, legacyDut1Artifacts.dataText],
  [DUT1_PATHS.lock, legacyDut1Artifacts.lockText],
  ...legacyDut1Artifacts.chunks.map((chunk) => [
    chunk.relativePath,
    chunk.text
  ])
];
if (mode === "--fetch") {
  writes.push(
    [EOP_PATHS.source, inputs.sourceBytes],
    [EOP_PATHS.format, inputs.formatBytes],
    [EOP_PATHS.checksums, inputs.checksumBytes],
    [EOP_PATHS.snapshot, inputs.snapshotText]
  );
}
for (const [relativePath] of writes) {
  await mkdir(path.dirname(absolutePath(relativePath)), {
    recursive: true
  });
}
await Promise.all(
  writes.map(([relativePath, contents]) =>
    writeFile(absolutePath(relativePath), contents)
  )
);

console.log(
  `EOP ${artifacts.lock.recordCount}日を生成しました: ` +
    `${artifacts.lock.firstSampleMjdUtc}–` +
    `${artifacts.lock.lastSampleMjdUtc} / ` +
    `${artifacts.lock.chunkCount} chunks / ` +
    `${artifacts.lock.normalizedBytes} bytes`
);
console.log(
  `互換DUT1 ${legacyDut1Artifacts.lock.recordCount}日も再生成しました`
);
