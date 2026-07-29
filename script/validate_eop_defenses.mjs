import { readFile } from "node:fs/promises";
import {
  decodeEopChunk,
  parseFinals2000AEop,
  validateEopChunkDescriptors
} from "./lib/eop-data.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(
    new URL("shared/eop/iers-finals2000a-eop.v1.json", root),
    "utf8"
  )
);
const firstChunk = JSON.parse(
  await readFile(new URL(manifest.chunks[0].file, root), "utf8")
);
const source = await readFile(
  new URL("shared/eop/source/finals2000A.all", root),
  "utf8"
);

function expectRejected(label, operation) {
  let rejected = false;
  try {
    operation();
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(`EOP防御検査で${label}が受理されました`);
  }
}

decodeEopChunk(firstChunk);
validateEopChunkDescriptors(manifest.chunks);

expectRejected("未知のchunk key", () =>
  decodeEopChunk({ ...firstChunk, unexpected: true })
);

const qualityGap = structuredClone(firstChunk);
qualityGap.polarMotionQualityRanges[0][0] = 1;
expectRejected("quality range gap", () =>
  decodeEopChunk(qualityGap)
);

const overflow = structuredClone(firstChunk);
overflow.xpMicroarcsecondsDelta[1] = Number.MAX_SAFE_INTEGER;
expectRejected("delta累積overflow", () =>
  decodeEopChunk(overflow)
);

const traversal = structuredClone(manifest.chunks);
traversal[0].file =
  "shared/eop/eop/../../source/finals2000A.all";
expectRejected("descriptor path traversal", () =>
  validateEopChunkDescriptors(traversal)
);

const descriptorGap = structuredClone(manifest.chunks);
descriptorGap[1].startMjdUtc += 1;
descriptorGap[1].endMjdUtc += 1;
descriptorGap[1].file =
  `shared/eop/eop/${descriptorGap[1].startMjdUtc}.v1.json`;
expectRejected("descriptor MJD gap", () =>
  validateEopChunkDescriptors(descriptorGap)
);

const partialPolarMotionLines = source.trimEnd().split(/\n/);
const firstLine = partialPolarMotionLines[0].replace(/\r$/, "");
partialPolarMotionLines[0] =
  firstLine.slice(0, 27) + "         " + firstLine.slice(36);
expectRejected("部分欠測の極運動固定幅列", () =>
  parseFinals2000AEop(
    Buffer.from(`${partialPolarMotionLines.join("\n")}\n`)
  )
);

const independentQualityLines = source.trimEnd().split(/\n/);
const boundaryIndex = independentQualityLines.findIndex(
  (line) => Number(line.slice(7, 15)) === 61_244
);
if (boundaryIndex < 0) {
  throw new Error("EOP防御検査のI/P境界fixtureがありません");
}
const boundaryLine = independentQualityLines[boundaryIndex];
independentQualityLines[boundaryIndex] =
  boundaryLine.slice(0, 16) + "P" + boundaryLine.slice(17);
const independentlyParsed = parseFinals2000AEop(
  Buffer.from(`${independentQualityLines.join("\n")}\n`)
);
if (
  independentlyParsed.coverage.polarMotion
    .predictionStartsMjdUtc !== 61_244 ||
  independentlyParsed.coverage.dut1.predictionStartsMjdUtc !==
    61_245
) {
  throw new Error("EOP防御検査でPM/UT1品質flagが混同されました");
}

console.log(
  "EOP防御検査OK: exact keys / quality gap / overflow / " +
    "path traversal / descriptor gap / partial row / independent flags"
);
