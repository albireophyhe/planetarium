import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export const EOP_SOURCE_URL =
  "https://maia.usno.navy.mil/ser7/finals2000A.all";
export const EOP_FORMAT_URL =
  "https://maia.usno.navy.mil/ser7/readme.finals2000A";
export const EOP_CHECKSUM_URL =
  "https://maia.usno.navy.mil/ser7/checksums.sha512";
export const EOP_PRODUCT_METADATA_URL =
  "https://datacenter.iers.org/versionMetadata.php?filename=" +
  "latestVersionMeta%2F9_FINALS.ALL_IAU2000_V2013_019.txt";
export const EOP_DISTRIBUTION_URL =
  "https://maia.usno.navy.mil/products/daily";
export const EOP_DISTRIBUTION_STATEMENT =
  "Distribution Statement A. Approved for public release: distribution unlimited.";

export const DUT1_SOURCE_URL = EOP_SOURCE_URL;
export const DUT1_FORMAT_URL = EOP_FORMAT_URL;
export const DUT1_CHECKSUM_URL = EOP_CHECKSUM_URL;
export const DUT1_PRODUCT_METADATA_URL = EOP_PRODUCT_METADATA_URL;
export const DUT1_DISTRIBUTION_URL = EOP_DISTRIBUTION_URL;
export const DUT1_DISTRIBUTION_STATEMENT =
  EOP_DISTRIBUTION_STATEMENT;

export const EOP_PATHS = Object.freeze({
  data: "shared/eop/iers-finals2000a-eop.v1.json",
  lock: "shared/eop/iers-finals2000a-eop.lock.v1.json",
  chunks: "shared/eop/eop",
  source: "shared/eop/source/finals2000A.all",
  format: "shared/eop/source/readme.finals2000A",
  checksums: "shared/eop/source/checksums.sha512",
  snapshot: "shared/eop/source/finals2000A.snapshot.v1.json"
});

export const DUT1_PATHS = Object.freeze({
  data: "shared/eop/iers-finals2000a-dut1.v1.json",
  lock: "shared/eop/iers-finals2000a-dut1.lock.v1.json",
  chunks: "shared/eop/dut1",
  source: "shared/eop/source/finals2000A.all",
  format: "shared/eop/source/readme.finals2000A",
  checksums: "shared/eop/source/checksums.sha512",
  snapshot: "shared/eop/source/finals2000A.snapshot.v1.json"
});

export const EOP_SIZE_BUDGET = Object.freeze({
  sourceBytes: 4_000_000,
  formatBytes: 16_384,
  checksumBytes: 16_384,
  manifestBytes: 262_144,
  manifestGzipBytes: 65_536,
  chunkBytes: 262_144,
  chunkGzipBytes: 65_536,
  normalizedBytes: 900_000,
  normalizedGzipBytes: 300_000,
  records: 22_000
});

export const DUT1_SIZE_BUDGET = EOP_SIZE_BUDGET;

const MILLISECONDS_PER_DAY = 86_400_000;
const UNIX_EPOCH_MJD = 40_587;
const EOP_CHUNK_RECORDS = 4_096;
const DUT1_CHUNK_RECORDS = EOP_CHUNK_RECORDS;
const MICROSECONDS_PER_SECOND = 1_000_000;
const MICROARCSECONDS_PER_ARCSECOND = 1_000_000;

export function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

function fail(message) {
  throw new Error(`finals2000A: ${message}`);
}

function parseFixedNumber(line, start, end, label, lineNumber) {
  const text = line.slice(start, end).trim();
  if (text === "") {
    fail(`${lineNumber}行目の${label}が欠測です`);
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    fail(`${lineNumber}行目の${label}が固定小数形式ではありません`);
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    fail(`${lineNumber}行目の${label}が有限数ではありません`);
  }
  return value;
}

function calendarMjd(line, mjd, lineNumber) {
  const shortYear = parseFixedNumber(line, 0, 2, "年", lineNumber);
  const month = parseFixedNumber(line, 2, 4, "月", lineNumber);
  const day = parseFixedNumber(line, 4, 6, "日", lineNumber);
  const year = shortYear + (mjd <= 51_543 ? 1900 : 2000);
  if (
    !Number.isInteger(shortYear) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    fail(`${lineNumber}行目の暦日が不正です`);
  }
  const timestamp = Date.UTC(year, month - 1, day);
  const convertedMjd = timestamp / MILLISECONDS_PER_DAY + UNIX_EPOCH_MJD;
  if (
    new Date(timestamp).getUTCFullYear() !== year ||
    new Date(timestamp).getUTCMonth() !== month - 1 ||
    new Date(timestamp).getUTCDate() !== day ||
    convertedMjd !== mjd
  ) {
    fail(`${lineNumber}行目の暦日とMJDが一致しません`);
  }
}

/**
 * Parse the paired Bulletin A polar-motion and UT1 columns.
 *
 * Zero-based slices correspond to the official one-based specification:
 * MJD 8-15; PM flag 17, x 19-27, x error 28-36, y 38-46, y error 47-55;
 * UT1 flag 58, UT1-UTC 59-68, UT1-UTC error 69-78.
 *
 * The v1 normalized product intentionally requires paired, continuous daily
 * PM and UT1 coverage. The two I/P streams remain independent and are never
 * inferred from one another.
 */
export function parseFinals2000AEop(sourceBytes) {
  if (sourceBytes.byteLength > EOP_SIZE_BUDGET.sourceBytes) {
    fail(
      `原本がサイズ予算${EOP_SIZE_BUDGET.sourceBytes} bytesを超えています`
    );
  }
  const sourceText = Buffer.from(sourceBytes).toString("utf8");
  if (sourceText.includes("\uFFFD")) {
    fail("原本をUTF-8として復号できません");
  }
  const lines = sourceText.split(/\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0) fail("原本が空です");

  const polarMotionRecords = [];
  const dut1Records = [];
  let previousSourceMjd = null;

  let missingPolarMotionTailRows = 0;
  let missingPolarMotionTailStarted = false;
  let polarMotionIersCount = 0;
  let polarMotionPredictedCount = 0;
  let polarMotionPredictionStartsMjdUtc = null;
  let polarMotionIersThroughMjdUtc = null;
  let previousPolarMotionMjd = null;
  let polarMotionPredictionStarted = false;

  let missingUt1TailRows = 0;
  let missingUt1TailStarted = false;
  let dut1IersCount = 0;
  let dut1PredictedCount = 0;
  let dut1PredictionStartsMjdUtc = null;
  let dut1IersThroughMjdUtc = null;
  let previousDut1Mjd = null;
  let previousDut1 = null;
  let leapSecondBoundaryCount = 0;
  let dut1PredictionStarted = false;

  for (const [index, sourceLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = sourceLine.endsWith("\r")
      ? sourceLine.slice(0, -1)
      : sourceLine;
    if (line.length < 15 || line.includes("\0")) {
      fail(`${lineNumber}行目が固定幅レコードとして短すぎます`);
    }
    const paddedLine = line.padEnd(78, " ");
    const mjd = parseFixedNumber(
      paddedLine,
      7,
      15,
      "MJD",
      lineNumber
    );
    if (!Number.isInteger(mjd)) {
      fail(`${lineNumber}行目のMJDが日次00:00 UTCではありません`);
    }
    calendarMjd(paddedLine, mjd, lineNumber);
    if (
      previousSourceMjd !== null &&
      mjd !== previousSourceMjd + 1
    ) {
      fail(`${lineNumber}行目の原本MJDが連続日ではありません`);
    }
    previousSourceMjd = mjd;

    const polarMotionStatus = paddedLine.slice(16, 17);
    const xpText = paddedLine.slice(18, 27).trim();
    const xpErrorText = paddedLine.slice(27, 36).trim();
    const ypText = paddedLine.slice(37, 46).trim();
    const ypErrorText = paddedLine.slice(46, 55).trim();
    const polarMotionFields = [
      polarMotionStatus.trim(),
      xpText,
      xpErrorText,
      ypText,
      ypErrorText
    ];
    const polarMotionMissing = polarMotionFields.every(
      (value) => value === ""
    );
    const polarMotionComplete = polarMotionFields.every(
      (value) => value !== ""
    );
    if (!polarMotionMissing && !polarMotionComplete) {
      fail(`${lineNumber}行目の極運動列が部分欠測です`);
    }
    if (polarMotionMissing) {
      missingPolarMotionTailStarted = true;
      missingPolarMotionTailRows += 1;
    } else {
      if (missingPolarMotionTailStarted) {
        fail(`${lineNumber}行目で欠測末尾の後に極運動値が再開しています`);
      }
      if (
        polarMotionStatus !== "I" &&
        polarMotionStatus !== "P"
      ) {
        fail(
          `${lineNumber}行目の極運動フラグ` +
            `${JSON.stringify(polarMotionStatus)}が不正です`
        );
      }
      if (
        polarMotionPredictionStarted &&
        polarMotionStatus === "I"
      ) {
        fail(`${lineNumber}行目で極運動予測値の後にIERS値へ戻っています`);
      }
      if (
        previousPolarMotionMjd !== null &&
        mjd !== previousPolarMotionMjd + 1
      ) {
        fail(`${lineNumber}行目の極運動MJDが連続日ではありません`);
      }
      const xpArcseconds = parseFixedNumber(
        paddedLine,
        18,
        27,
        "極運動xp",
        lineNumber
      );
      const xpReportedErrorArcseconds = parseFixedNumber(
        paddedLine,
        27,
        36,
        "極運動xp公表誤差",
        lineNumber
      );
      const ypArcseconds = parseFixedNumber(
        paddedLine,
        37,
        46,
        "極運動yp",
        lineNumber
      );
      const ypReportedErrorArcseconds = parseFixedNumber(
        paddedLine,
        46,
        55,
        "極運動yp公表誤差",
        lineNumber
      );
      if (
        Math.abs(xpArcseconds) > 2 ||
        Math.abs(ypArcseconds) > 2
      ) {
        fail(`${lineNumber}行目の極運動が±2秒角を超えています`);
      }
      if (
        xpReportedErrorArcseconds < 0 ||
        xpReportedErrorArcseconds > 1 ||
        ypReportedErrorArcseconds < 0 ||
        ypReportedErrorArcseconds > 1
      ) {
        fail(`${lineNumber}行目の極運動公表誤差が範囲外です`);
      }
      if (polarMotionStatus === "I") {
        polarMotionIersCount += 1;
        polarMotionIersThroughMjdUtc = mjd;
      } else {
        if (!polarMotionPredictionStarted) {
          polarMotionPredictionStarted = true;
          polarMotionPredictionStartsMjdUtc = mjd;
        }
        polarMotionPredictedCount += 1;
      }
      polarMotionRecords.push([
        mjd,
        polarMotionStatus,
        xpArcseconds,
        xpReportedErrorArcseconds,
        ypArcseconds,
        ypReportedErrorArcseconds
      ]);
      previousPolarMotionMjd = mjd;
    }

    const dut1Status = paddedLine.slice(57, 58);
    const dut1Text = paddedLine.slice(58, 68).trim();
    const dut1ErrorText = paddedLine.slice(68, 78).trim();
    const ut1Missing =
      dut1Status.trim() === "" &&
      dut1Text === "" &&
      dut1ErrorText === "";
    const ut1Complete =
      dut1Status.trim() !== "" &&
      dut1Text !== "" &&
      dut1ErrorText !== "";

    if (!ut1Missing && !ut1Complete) {
      fail(`${lineNumber}行目のUT1列が部分欠測です`);
    }
    if (ut1Missing) {
      missingUt1TailStarted = true;
      missingUt1TailRows += 1;
      continue;
    }
    if (missingUt1TailStarted) {
      fail(`${lineNumber}行目で欠測末尾の後にUT1値が再開しています`);
    }
    if (dut1Status !== "I" && dut1Status !== "P") {
      fail(
        `${lineNumber}行目のUT1フラグ` +
          `${JSON.stringify(dut1Status)}が不正です`
      );
    }
    if (dut1PredictionStarted && dut1Status === "I") {
      fail(`${lineNumber}行目でUT1予測値の後にIERS値へ戻っています`);
    }

    const dut1Seconds = parseFixedNumber(
      line,
      58,
      68,
      "UT1-UTC",
      lineNumber
    );
    const reportedErrorSeconds = parseFixedNumber(
      paddedLine,
      68,
      78,
      "UT1-UTC公表誤差",
      lineNumber
    );
    if (Math.abs(dut1Seconds) > 1) {
      fail(`${lineNumber}行目のUT1-UTCが±1秒を超えています`);
    }
    if (reportedErrorSeconds < 0 || reportedErrorSeconds > 1) {
      fail(`${lineNumber}行目のUT1-UTC公表誤差が範囲外です`);
    }
    if (
      previousDut1Mjd !== null &&
      mjd !== previousDut1Mjd + 1
    ) {
      fail(`${lineNumber}行目のMJDが連続日ではありません`);
    }
    if (previousDut1 !== null) {
      const difference = dut1Seconds - previousDut1;
      if (Math.abs(difference) > 0.5) {
        const leapStep = Math.round(difference);
        if (
          Math.abs(leapStep) !== 1 ||
          Math.abs(difference - leapStep) > 0.1
        ) {
          fail(`${lineNumber}行目に説明できないUT1-UTC不連続があります`);
        }
        leapSecondBoundaryCount += 1;
      }
    }

    if (dut1Status === "I") {
      dut1IersCount += 1;
      dut1IersThroughMjdUtc = mjd;
    } else {
      if (!dut1PredictionStarted) {
        dut1PredictionStarted = true;
        dut1PredictionStartsMjdUtc = mjd;
      }
      dut1PredictedCount += 1;
    }
    dut1Records.push([
      mjd,
      dut1Status,
      dut1Seconds,
      reportedErrorSeconds
    ]);
    previousDut1Mjd = mjd;
    previousDut1 = dut1Seconds;
  }

  if (polarMotionRecords.length === 0) {
    fail("極運動レコードがありません");
  }
  if (dut1Records.length === 0) fail("UT1-UTCレコードがありません");
  if (
    polarMotionRecords.length !== dut1Records.length ||
    polarMotionRecords[0][0] !== dut1Records[0][0] ||
    polarMotionRecords.at(-1)[0] !== dut1Records.at(-1)[0]
  ) {
    fail("v1で必要な極運動とUT1の連続収録範囲が一致しません");
  }
  if (polarMotionRecords.length > EOP_SIZE_BUDGET.records) {
    fail(`レコード件数が予算${EOP_SIZE_BUDGET.records}を超えています`);
  }
  if (
    polarMotionIersCount === 0 ||
    polarMotionPredictedCount === 0 ||
    dut1IersCount === 0 ||
    dut1PredictedCount === 0
  ) {
    fail("極運動またはUT1にIERS値・予測値の一方がありません");
  }

  const records = polarMotionRecords.map((polarMotion, index) => {
    const dut1 = dut1Records[index];
    if (polarMotion[0] !== dut1[0]) {
      fail(`MJD ${polarMotion[0]}の極運動とUT1が整列していません`);
    }
    return [
      polarMotion[0],
      polarMotion[1],
      polarMotion[2],
      polarMotion[3],
      polarMotion[4],
      polarMotion[5],
      dut1[1],
      dut1[2],
      dut1[3]
    ];
  });
  return {
    records,
    coverage: {
      firstSampleMjdUtc: records[0][0],
      lastSampleMjdUtc: records.at(-1)[0],
      recordCount: records.length,
      sourceRowCount: lines.length,
      polarMotion: {
        iersThroughMjdUtc: polarMotionIersThroughMjdUtc,
        predictionStartsMjdUtc:
          polarMotionPredictionStartsMjdUtc,
        iersCount: polarMotionIersCount,
        predictedCount: polarMotionPredictedCount,
        missingTailRows: missingPolarMotionTailRows
      },
      dut1: {
        iersThroughMjdUtc: dut1IersThroughMjdUtc,
        predictionStartsMjdUtc: dut1PredictionStartsMjdUtc,
        iersCount: dut1IersCount,
        predictedCount: dut1PredictedCount,
        missingTailRows: missingUt1TailRows,
        leapSecondBoundaryCount
      }
    }
  };
}

export function parseFinals2000ADut1(sourceBytes) {
  const parsed = parseFinals2000AEop(sourceBytes);
  return {
    records: parsed.records.map((record) => [
      record[0],
      record[6],
      record[7],
      record[8]
    ]),
    coverage: {
      firstMjdUtc: parsed.coverage.firstSampleMjdUtc,
      lastMjdUtc: parsed.coverage.lastSampleMjdUtc,
      observedThroughMjdUtc:
        parsed.coverage.dut1.iersThroughMjdUtc,
      predictionStartsMjdUtc:
        parsed.coverage.dut1.predictionStartsMjdUtc,
      recordCount: parsed.coverage.recordCount,
      observedCount: parsed.coverage.dut1.iersCount,
      predictedCount: parsed.coverage.dut1.predictedCount,
      missingUt1TailRows:
        parsed.coverage.dut1.missingTailRows,
      leapSecondBoundaryCount:
        parsed.coverage.dut1.leapSecondBoundaryCount
    }
  };
}

function assertSnapshot(snapshot, sourceBytes, formatBytes, checksumBytes) {
  if (
    snapshot?.schemaVersion !== 1 ||
    snapshot.sourceUrl !== DUT1_SOURCE_URL ||
    snapshot.formatUrl !== DUT1_FORMAT_URL ||
    snapshot.checksumUrl !== DUT1_CHECKSUM_URL ||
    snapshot.productMetadataUrl !== DUT1_PRODUCT_METADATA_URL ||
    snapshot.distributionUrl !== DUT1_DISTRIBUTION_URL ||
    !Number.isFinite(Date.parse(snapshot.retrievedAt)) ||
    !Number.isFinite(Date.parse(snapshot.sourceLastModified))
  ) {
    fail("取得スナップショットのメタデータが不正です");
  }
  for (const [label, value] of [
    ["sourceSha256", snapshot.sourceSha256],
    ["officialSourceSha512", snapshot.officialSourceSha512],
    ["formatSha256", snapshot.formatSha256],
    ["checksumSha256", snapshot.checksumSha256]
  ]) {
    if (!new RegExp(`^[0-9a-f]{${label.includes("512") ? 128 : 64}}$`).test(value)) {
      fail(`取得スナップショットの${label}が不正です`);
    }
  }
  if (sourceBytes.byteLength > DUT1_SIZE_BUDGET.sourceBytes) {
    fail("原本がサイズ予算を超えています");
  }
  if (formatBytes.byteLength > DUT1_SIZE_BUDGET.formatBytes) {
    fail("format説明がサイズ予算を超えています");
  }
  if (checksumBytes.byteLength > DUT1_SIZE_BUDGET.checksumBytes) {
    fail("checksum一覧がサイズ予算を超えています");
  }

  const sourceSha256 = digest("sha256", sourceBytes);
  const sourceSha512 = digest("sha512", sourceBytes);
  if (
    sourceSha256 !== snapshot.sourceSha256 ||
    sourceSha512 !== snapshot.officialSourceSha512 ||
    digest("sha256", formatBytes) !== snapshot.formatSha256 ||
    digest("sha256", checksumBytes) !== snapshot.checksumSha256
  ) {
    fail("取得スナップショットと保存原本のdigestが一致しません");
  }

  const checksumText = Buffer.from(checksumBytes).toString("utf8");
  const officialSourceSha512 = checksumText
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, filename]) => filename === "finals2000A.all")?.[0];
  if (officialSourceSha512 !== sourceSha512) {
    fail("USNO公式SHA-512一覧とfinals2000A.allが一致しません");
  }
}

export function createSnapshot({
  retrievedAt,
  sourceLastModified,
  sourceBytes,
  formatBytes,
  checksumBytes
}) {
  const officialSourceSha512 = Buffer.from(checksumBytes)
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, filename]) => filename === "finals2000A.all")?.[0];
  const calculatedSourceSha512 = digest("sha512", sourceBytes);
  if (officialSourceSha512 !== calculatedSourceSha512) {
    fail("取得原本がUSNO公式SHA-512一覧と一致しません");
  }
  const snapshot = {
    schemaVersion: 1,
    retrievedAt,
    sourceLastModified,
    sourceUrl: DUT1_SOURCE_URL,
    sourceSha256: digest("sha256", sourceBytes),
    officialSourceSha512,
    formatUrl: DUT1_FORMAT_URL,
    formatSha256: digest("sha256", formatBytes),
    checksumUrl: DUT1_CHECKSUM_URL,
    checksumSha256: digest("sha256", checksumBytes),
    productMetadataUrl: DUT1_PRODUCT_METADATA_URL,
    distributionUrl: DUT1_DISTRIBUTION_URL
  };
  return snapshot;
}

export function buildDut1Artifacts({
  sourceBytes,
  formatBytes,
  checksumBytes,
  snapshot,
  snapshotText
}) {
  assertSnapshot(snapshot, sourceBytes, formatBytes, checksumBytes);
  const { records, coverage } = parseFinals2000ADut1(sourceBytes);
  const quantizedRecords = records.map(
    ([mjd, status, dut1Seconds, uncertaintySeconds]) => [
      mjd,
      status,
      Math.round(dut1Seconds * MICROSECONDS_PER_SECOND),
      Math.round(uncertaintySeconds * MICROSECONDS_PER_SECOND)
    ]
  );
  const encodeDeltaSeries = (values) =>
    values.map((value, index) =>
      index === 0 ? value : value - values[index - 1]
    );
  const createQualityRanges = (chunkRecords) => {
    const ranges = [];
    let startOffset = 0;
    for (let index = 1; index <= chunkRecords.length; index += 1) {
      if (
        index === chunkRecords.length ||
        chunkRecords[index][1] !== chunkRecords[startOffset][1]
      ) {
        ranges.push([
          startOffset,
          index,
          chunkRecords[startOffset][1]
        ]);
        startOffset = index;
      }
    }
    return ranges;
  };
  const chunks = [];
  for (
    let startIndex = 0;
    startIndex < quantizedRecords.length;
    startIndex += DUT1_CHUNK_RECORDS
  ) {
    const chunkRecords = quantizedRecords.slice(
      startIndex,
      startIndex + DUT1_CHUNK_RECORDS
    );
    const startMjdUtc = chunkRecords[0][0];
    const chunk = {
      schemaVersion: 1,
      startMjdUtc,
      recordCount: chunkRecords.length,
      qualityRanges: createQualityRanges(chunkRecords),
      dut1MicrosecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[2])
      ),
      uncertaintyMicrosecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[3])
      )
    };
    const text = `${JSON.stringify(chunk)}\n`;
    const rawBytes = Buffer.byteLength(text);
    const gzipBytes = gzipSync(text, { level: 9 }).byteLength;
    if (
      rawBytes > DUT1_SIZE_BUDGET.chunkBytes ||
      gzipBytes > DUT1_SIZE_BUDGET.chunkGzipBytes
    ) {
      fail(
        `MJD ${startMjdUtc} chunkが個別予算を超えています: ` +
          `${rawBytes} raw / ${gzipBytes} gzip`
      );
    }
    const relativePath =
      `${DUT1_PATHS.chunks}/${startMjdUtc}.v1.json`;
    chunks.push({
      data: chunk,
      text,
      relativePath,
      descriptor: {
        file: relativePath,
        startMjdUtc,
        endMjdUtc:
          startMjdUtc + chunkRecords.length - 1,
        recordCount: chunkRecords.length,
        observedCount: chunkRecords.filter(
          (record) => record[1] === "I"
        ).length,
        predictedCount: chunkRecords.filter(
          (record) => record[1] === "P"
        ).length,
        rawBytes,
        gzipBytes,
        sha256: digest("sha256", text)
      }
    });
  }

  const data = {
    schemaVersion: 1,
    product: "IERS Bulletin A finals2000A UT1-UTC",
    timeScale: "UTC",
    units: {
      mjdUtc: "day",
      dut1: "second",
      uncertainty: "second"
    },
    source: {
      title: "IERS Bulletin A finals2000A",
      url: snapshot.sourceUrl,
      formatUrl: snapshot.formatUrl,
      checksumUrl: snapshot.checksumUrl,
      productMetadataUrl: snapshot.productMetadataUrl,
      retrievedAt: snapshot.retrievedAt,
      sourceLastModified: snapshot.sourceLastModified,
      sourceSha256: snapshot.sourceSha256,
      officialSourceSha512: snapshot.officialSourceSha512,
      formatSha256: snapshot.formatSha256,
      checksumSha256: snapshot.checksumSha256,
      attribution: "IERS Rapid Service/Prediction Center at USNO",
      distributionStatement: DUT1_DISTRIBUTION_STATEMENT,
      distributionUrl: snapshot.distributionUrl,
      rawSnapshot: DUT1_PATHS.source,
      formatSnapshot: DUT1_PATHS.format,
      checksumSnapshot: DUT1_PATHS.checksums
    },
    statusCodes: {
      I: "observed",
      P: "predicted"
    },
    encoding: {
      mjdUtc: "chunk.startMjdUtc + zero-based record index",
      numeric:
        "first absolute integer microseconds followed by signed daily deltas",
      quality:
        "qualityRanges entries are [startOffset, endOffsetExclusive, I|P]",
      maximumQuantizationErrorSeconds: 0.0000005
    },
    coverage,
    chunks: chunks.map(({ descriptor }) => descriptor)
  };
  const dataText = `${JSON.stringify(data)}\n`;
  const dataBytes = Buffer.byteLength(dataText);
  const dataGzipBytes = gzipSync(dataText, { level: 9 }).byteLength;
  if (
    dataBytes > DUT1_SIZE_BUDGET.manifestBytes ||
    dataGzipBytes > DUT1_SIZE_BUDGET.manifestGzipBytes
  ) {
    fail(
      `manifestが個別予算を超えています: ` +
        `${dataBytes} raw / ${dataGzipBytes} gzip`
    );
  }

  const contentSha256 = digest(
    "sha256",
    JSON.stringify(quantizedRecords)
  );
  const normalizedBytes =
    dataBytes +
    chunks.reduce(
      (total, chunk) => total + chunk.descriptor.rawBytes,
      0
    );
  const normalizedGzipBytes =
    dataGzipBytes +
    chunks.reduce(
      (total, chunk) => total + chunk.descriptor.gzipBytes,
      0
    );
  if (
    normalizedBytes > DUT1_SIZE_BUDGET.normalizedBytes ||
    normalizedGzipBytes > DUT1_SIZE_BUDGET.normalizedGzipBytes
  ) {
    fail(
      `正規化データ合計が予算を超えています: ` +
        `${normalizedBytes} raw / ${normalizedGzipBytes} gzip`
    );
  }
  const lock = {
    schemaVersion: 1,
    artifact: DUT1_PATHS.data,
    canonicalization:
      "UTF-8 JSON.stringify(decoded quantized records)",
    algorithm: "sha256",
    contentSha256,
    sourceSha256: snapshot.sourceSha256,
    sourceSnapshotSha256: digest("sha256", snapshotText),
    recordCount: coverage.recordCount,
    observedCount: coverage.observedCount,
    predictedCount: coverage.predictedCount,
    firstMjdUtc: coverage.firstMjdUtc,
    lastMjdUtc: coverage.lastMjdUtc,
    chunkCount: chunks.length,
    normalizedBytes,
    normalizedGzipBytes
  };
  const lockText = `${JSON.stringify(lock, null, 2)}\n`;
  return {
    data,
    dataText,
    chunks,
    lock,
    lockText
  };
}

const EOP_CHUNK_KEYS = Object.freeze([
  "schemaVersion",
  "startMjdUtc",
  "recordCount",
  "dut1QualityRanges",
  "polarMotionQualityRanges",
  "dut1MicrosecondsDelta",
  "dut1ReportedErrorMicrosecondsDelta",
  "xpMicroarcsecondsDelta",
  "xpReportedErrorMicroarcsecondsDelta",
  "ypMicroarcsecondsDelta",
  "ypReportedErrorMicroarcsecondsDelta"
]);
const EOP_CHUNK_DESCRIPTOR_KEYS = Object.freeze([
  "file",
  "startMjdUtc",
  "endMjdUtc",
  "recordCount",
  "polarMotionIersCount",
  "polarMotionPredictedCount",
  "dut1IersCount",
  "dut1PredictedCount",
  "rawBytes",
  "gzipBytes",
  "sha256"
]);

function assertExactObjectKeys(value, expectedKeys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    fail(`${label}がobjectではありません`);
  }
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some(
      (key, index) => key !== sortedExpectedKeys[index]
    )
  ) {
    fail(`${label}のkey集合が不正です`);
  }
}

function decodeQualityRanges(ranges, recordCount, label) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    fail(`${label}が空です`);
  }
  const statuses = new Array(recordCount);
  let expectedStart = 0;
  let predictionStarted = false;
  for (const [index, range] of ranges.entries()) {
    if (
      !Array.isArray(range) ||
      range.length !== 3 ||
      range[0] !== expectedStart ||
      !Number.isInteger(range[1]) ||
      range[1] <= range[0] ||
      range[1] > recordCount ||
      (range[2] !== "I" && range[2] !== "P")
    ) {
      fail(`${label}[${index}]が不正です`);
    }
    if (predictionStarted && range[2] === "I") {
      fail(`${label}が予測値からIERS値へ戻っています`);
    }
    if (range[2] === "P") predictionStarted = true;
    statuses.fill(range[2], range[0], range[1]);
    expectedStart = range[1];
  }
  if (expectedStart !== recordCount) {
    fail(`${label}がchunk全体を被覆していません`);
  }
  return statuses;
}

function decodeDeltaSeries(
  values,
  recordCount,
  minimum,
  maximum,
  label
) {
  if (!Array.isArray(values) || values.length !== recordCount) {
    fail(`${label}の長さがrecordCountと一致しません`);
  }
  const decoded = [];
  let current = 0;
  for (const [index, delta] of values.entries()) {
    if (!Number.isSafeInteger(delta)) {
      fail(`${label}[${index}]がsafe integerではありません`);
    }
    current = index === 0 ? delta : current + delta;
    if (
      !Number.isSafeInteger(current) ||
      current < minimum ||
      current > maximum
    ) {
      fail(`${label}[${index}]の累積値が範囲外です`);
    }
    decoded.push(current);
  }
  return decoded;
}

/**
 * Strictly decode a normalized EOP chunk into canonical quantized records.
 *
 * Record layout:
 * [mjd, pmStatus, xpMicroas, xpErrorMicroas, ypMicroas, ypErrorMicroas,
 *  dut1Status, dut1Microseconds, dut1ErrorMicroseconds]
 */
export function decodeEopChunk(chunk) {
  assertExactObjectKeys(chunk, EOP_CHUNK_KEYS, "EOP chunk");
  if (
    chunk.schemaVersion !== 1 ||
    !Number.isSafeInteger(chunk.startMjdUtc) ||
    chunk.startMjdUtc < 30_000 ||
    chunk.startMjdUtc > 100_000 ||
    !Number.isInteger(chunk.recordCount) ||
    chunk.recordCount < 1 ||
    chunk.recordCount > EOP_CHUNK_RECORDS
  ) {
    fail("EOP chunk headerが不正です");
  }
  const polarMotionStatuses = decodeQualityRanges(
    chunk.polarMotionQualityRanges,
    chunk.recordCount,
    "polarMotionQualityRanges"
  );
  const dut1Statuses = decodeQualityRanges(
    chunk.dut1QualityRanges,
    chunk.recordCount,
    "dut1QualityRanges"
  );
  const dut1Microseconds = decodeDeltaSeries(
    chunk.dut1MicrosecondsDelta,
    chunk.recordCount,
    -MICROSECONDS_PER_SECOND,
    MICROSECONDS_PER_SECOND,
    "dut1MicrosecondsDelta"
  );
  const dut1ReportedErrorMicroseconds = decodeDeltaSeries(
    chunk.dut1ReportedErrorMicrosecondsDelta,
    chunk.recordCount,
    0,
    MICROSECONDS_PER_SECOND,
    "dut1ReportedErrorMicrosecondsDelta"
  );
  const xpMicroarcseconds = decodeDeltaSeries(
    chunk.xpMicroarcsecondsDelta,
    chunk.recordCount,
    -2 * MICROARCSECONDS_PER_ARCSECOND,
    2 * MICROARCSECONDS_PER_ARCSECOND,
    "xpMicroarcsecondsDelta"
  );
  const xpReportedErrorMicroarcseconds = decodeDeltaSeries(
    chunk.xpReportedErrorMicroarcsecondsDelta,
    chunk.recordCount,
    0,
    MICROARCSECONDS_PER_ARCSECOND,
    "xpReportedErrorMicroarcsecondsDelta"
  );
  const ypMicroarcseconds = decodeDeltaSeries(
    chunk.ypMicroarcsecondsDelta,
    chunk.recordCount,
    -2 * MICROARCSECONDS_PER_ARCSECOND,
    2 * MICROARCSECONDS_PER_ARCSECOND,
    "ypMicroarcsecondsDelta"
  );
  const ypReportedErrorMicroarcseconds = decodeDeltaSeries(
    chunk.ypReportedErrorMicroarcsecondsDelta,
    chunk.recordCount,
    0,
    MICROARCSECONDS_PER_ARCSECOND,
    "ypReportedErrorMicroarcsecondsDelta"
  );

  return Object.freeze(
    Array.from({ length: chunk.recordCount }, (_, index) =>
      Object.freeze([
        chunk.startMjdUtc + index,
        polarMotionStatuses[index],
        xpMicroarcseconds[index],
        xpReportedErrorMicroarcseconds[index],
        ypMicroarcseconds[index],
        ypReportedErrorMicroarcseconds[index],
        dut1Statuses[index],
        dut1Microseconds[index],
        dut1ReportedErrorMicroseconds[index]
      ])
    )
  );
}

function quantize(value, scale, label) {
  const quantized = Math.round(value * scale);
  if (
    !Number.isSafeInteger(quantized) ||
    Math.abs(quantized / scale - value) >
      0.500_001 / scale
  ) {
    fail(`${label}を安全に量子化できません`);
  }
  return quantized;
}

function encodeDeltaSeries(values) {
  return values.map((value, index) =>
    index === 0 ? value : value - values[index - 1]
  );
}

function createQualityRanges(chunkRecords, statusIndex) {
  const ranges = [];
  let startOffset = 0;
  for (let index = 1; index <= chunkRecords.length; index += 1) {
    if (
      index === chunkRecords.length ||
      chunkRecords[index][statusIndex] !==
        chunkRecords[startOffset][statusIndex]
    ) {
      ranges.push([
        startOffset,
        index,
        chunkRecords[startOffset][statusIndex]
      ]);
      startOffset = index;
    }
  }
  return ranges;
}

function countStatus(records, statusIndex, status) {
  return records.filter(
    (record) => record[statusIndex] === status
  ).length;
}

export function validateEopChunkDescriptors(descriptors) {
  if (
    !Array.isArray(descriptors) ||
    descriptors.length < 1 ||
    descriptors.length > 16
  ) {
    fail("EOP chunk descriptor配列の件数が不正です");
  }
  const files = new Set();
  let previousEndMjdUtc = null;
  let totalRecordCount = 0;
  return Object.freeze(
    descriptors.map((descriptor, index) => {
      assertExactObjectKeys(
        descriptor,
        EOP_CHUNK_DESCRIPTOR_KEYS,
        `EOP chunk descriptor ${index}`
      );
      const expectedFile =
        `shared/eop/eop/${descriptor.startMjdUtc}.v1.json`;
      if (
        typeof descriptor.file !== "string" ||
        !/^shared\/eop\/eop\/[0-9]{5,6}\.v1\.json$/.test(
          descriptor.file
        ) ||
        descriptor.file !== expectedFile ||
        files.has(descriptor.file) ||
        !Number.isSafeInteger(descriptor.startMjdUtc) ||
        descriptor.startMjdUtc < 30_000 ||
        descriptor.startMjdUtc > 100_000 ||
        !Number.isSafeInteger(descriptor.endMjdUtc) ||
        !Number.isInteger(descriptor.recordCount) ||
        descriptor.recordCount < 1 ||
        descriptor.recordCount > EOP_CHUNK_RECORDS ||
        descriptor.endMjdUtc !==
          descriptor.startMjdUtc + descriptor.recordCount - 1 ||
        (previousEndMjdUtc !== null &&
          descriptor.startMjdUtc !== previousEndMjdUtc + 1)
      ) {
        fail(`EOP chunk descriptor ${index}のpathまたは日付範囲が不正です`);
      }
      for (const qualityCount of [
        descriptor.polarMotionIersCount,
        descriptor.polarMotionPredictedCount,
        descriptor.dut1IersCount,
        descriptor.dut1PredictedCount
      ]) {
        if (
          !Number.isInteger(qualityCount) ||
          qualityCount < 0 ||
          qualityCount > descriptor.recordCount
        ) {
          fail(`EOP chunk descriptor ${index}の品質件数が不正です`);
        }
      }
      if (
        descriptor.polarMotionIersCount +
          descriptor.polarMotionPredictedCount !==
          descriptor.recordCount ||
        descriptor.dut1IersCount +
          descriptor.dut1PredictedCount !==
          descriptor.recordCount ||
        !Number.isInteger(descriptor.rawBytes) ||
        descriptor.rawBytes < 1 ||
        descriptor.rawBytes > EOP_SIZE_BUDGET.chunkBytes ||
        !Number.isInteger(descriptor.gzipBytes) ||
        descriptor.gzipBytes < 1 ||
        descriptor.gzipBytes >
          EOP_SIZE_BUDGET.chunkGzipBytes ||
        typeof descriptor.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(descriptor.sha256)
      ) {
        fail(`EOP chunk descriptor ${index}の件数、サイズまたはdigestが不正です`);
      }
      files.add(descriptor.file);
      previousEndMjdUtc = descriptor.endMjdUtc;
      totalRecordCount += descriptor.recordCount;
      if (totalRecordCount > EOP_SIZE_BUDGET.records) {
        fail("EOP chunk descriptorの合計record予算を超えています");
      }
      return Object.freeze({ ...descriptor });
    })
  );
}

export function buildEopArtifacts({
  sourceBytes,
  formatBytes,
  checksumBytes,
  snapshot,
  snapshotText
}) {
  assertSnapshot(snapshot, sourceBytes, formatBytes, checksumBytes);
  const { records, coverage } = parseFinals2000AEop(sourceBytes);
  const quantizedRecords = records.map(
    ([
      mjd,
      polarMotionStatus,
      xpArcseconds,
      xpReportedErrorArcseconds,
      ypArcseconds,
      ypReportedErrorArcseconds,
      dut1Status,
      dut1Seconds,
      dut1ReportedErrorSeconds
    ]) => [
      mjd,
      polarMotionStatus,
      quantize(
        xpArcseconds,
        MICROARCSECONDS_PER_ARCSECOND,
        `MJD ${mjd} xp`
      ),
      quantize(
        xpReportedErrorArcseconds,
        MICROARCSECONDS_PER_ARCSECOND,
        `MJD ${mjd} xp公表誤差`
      ),
      quantize(
        ypArcseconds,
        MICROARCSECONDS_PER_ARCSECOND,
        `MJD ${mjd} yp`
      ),
      quantize(
        ypReportedErrorArcseconds,
        MICROARCSECONDS_PER_ARCSECOND,
        `MJD ${mjd} yp公表誤差`
      ),
      dut1Status,
      quantize(
        dut1Seconds,
        MICROSECONDS_PER_SECOND,
        `MJD ${mjd} DUT1`
      ),
      quantize(
        dut1ReportedErrorSeconds,
        MICROSECONDS_PER_SECOND,
        `MJD ${mjd} DUT1公表誤差`
      )
    ]
  );

  const chunks = [];
  for (
    let startIndex = 0;
    startIndex < quantizedRecords.length;
    startIndex += EOP_CHUNK_RECORDS
  ) {
    const chunkRecords = quantizedRecords.slice(
      startIndex,
      startIndex + EOP_CHUNK_RECORDS
    );
    const startMjdUtc = chunkRecords[0][0];
    const chunk = {
      schemaVersion: 1,
      startMjdUtc,
      recordCount: chunkRecords.length,
      dut1QualityRanges: createQualityRanges(chunkRecords, 6),
      polarMotionQualityRanges: createQualityRanges(
        chunkRecords,
        1
      ),
      dut1MicrosecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[7])
      ),
      dut1ReportedErrorMicrosecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[8])
      ),
      xpMicroarcsecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[2])
      ),
      xpReportedErrorMicroarcsecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[3])
      ),
      ypMicroarcsecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[4])
      ),
      ypReportedErrorMicroarcsecondsDelta: encodeDeltaSeries(
        chunkRecords.map((record) => record[5])
      )
    };
    const decoded = decodeEopChunk(chunk);
    if (
      JSON.stringify(decoded) !== JSON.stringify(chunkRecords)
    ) {
      fail(`MJD ${startMjdUtc} chunkのencode/decodeが一致しません`);
    }
    const text = `${JSON.stringify(chunk)}\n`;
    const rawBytes = Buffer.byteLength(text);
    const gzipBytes = gzipSync(text, { level: 9 }).byteLength;
    if (
      rawBytes > EOP_SIZE_BUDGET.chunkBytes ||
      gzipBytes > EOP_SIZE_BUDGET.chunkGzipBytes
    ) {
      fail(
        `MJD ${startMjdUtc} EOP chunkが個別予算を超えています: ` +
          `${rawBytes} raw / ${gzipBytes} gzip`
      );
    }
    const relativePath =
      `${EOP_PATHS.chunks}/${startMjdUtc}.v1.json`;
    chunks.push({
      data: chunk,
      text,
      relativePath,
      descriptor: {
        file: relativePath,
        startMjdUtc,
        endMjdUtc:
          startMjdUtc + chunkRecords.length - 1,
        recordCount: chunkRecords.length,
        polarMotionIersCount: countStatus(
          chunkRecords,
          1,
          "I"
        ),
        polarMotionPredictedCount: countStatus(
          chunkRecords,
          1,
          "P"
        ),
        dut1IersCount: countStatus(chunkRecords, 6, "I"),
        dut1PredictedCount: countStatus(
          chunkRecords,
          6,
          "P"
        ),
        rawBytes,
        gzipBytes,
        sha256: digest("sha256", text)
      }
    });
  }

  const descriptors = validateEopChunkDescriptors(
    chunks.map(({ descriptor }) => descriptor)
  );
  const data = {
    schemaVersion: 1,
    product: "IERS Bulletin A finals2000A Earth orientation",
    timeScale: "UTC",
    units: {
      mjdUtc: "day",
      dut1: "second",
      dut1ReportedError: "second",
      polarMotion: "arcsecond",
      polarMotionReportedError: "arcsecond"
    },
    source: {
      title: "IERS Bulletin A finals2000A",
      url: snapshot.sourceUrl,
      formatUrl: snapshot.formatUrl,
      checksumUrl: snapshot.checksumUrl,
      productMetadataUrl: snapshot.productMetadataUrl,
      retrievedAt: snapshot.retrievedAt,
      sourceLastModified: snapshot.sourceLastModified,
      sourceSha256: snapshot.sourceSha256,
      officialSourceSha512: snapshot.officialSourceSha512,
      formatSha256: snapshot.formatSha256,
      checksumSha256: snapshot.checksumSha256,
      attribution: "IERS Rapid Service/Prediction Center at USNO",
      distributionStatement: EOP_DISTRIBUTION_STATEMENT,
      distributionUrl: snapshot.distributionUrl,
      rawSnapshot: EOP_PATHS.source,
      formatSnapshot: EOP_PATHS.format,
      checksumSnapshot: EOP_PATHS.checksums,
      reportedErrorSemantics:
        "The source labels these columns as error; no confidence level or covariance is asserted."
    },
    statusCodes: {
      I: "iers",
      P: "predicted"
    },
    encoding: {
      mjdUtc: "chunk.startMjdUtc + zero-based record index",
      numeric:
        "each series stores its first absolute integer followed by signed daily deltas",
      dut1IntegerUnit: "microsecond",
      polarMotionIntegerUnit: "microarcsecond",
      quality:
        "independent DUT1 and polar-motion ranges are [startOffset, endOffsetExclusive, I|P]",
      maximumDut1QuantizationErrorSeconds: 0.0000005,
      maximumPolarMotionQuantizationErrorArcseconds: 0.0000005,
      canonicalRecordColumns: [
        "mjdUtc",
        "polarMotionStatus",
        "xpMicroarcseconds",
        "xpReportedErrorMicroarcseconds",
        "ypMicroarcseconds",
        "ypReportedErrorMicroarcseconds",
        "dut1Status",
        "dut1Microseconds",
        "dut1ReportedErrorMicroseconds"
      ]
    },
    coverage,
    chunks: descriptors
  };
  const dataText = `${JSON.stringify(data)}\n`;
  const dataBytes = Buffer.byteLength(dataText);
  const dataGzipBytes = gzipSync(dataText, { level: 9 }).byteLength;
  if (
    dataBytes > EOP_SIZE_BUDGET.manifestBytes ||
    dataGzipBytes > EOP_SIZE_BUDGET.manifestGzipBytes
  ) {
    fail(
      `EOP manifestが個別予算を超えています: ` +
        `${dataBytes} raw / ${dataGzipBytes} gzip`
    );
  }

  const contentSha256 = digest(
    "sha256",
    JSON.stringify(quantizedRecords)
  );
  const normalizedBytes =
    dataBytes +
    chunks.reduce(
      (total, chunk) => total + chunk.descriptor.rawBytes,
      0
    );
  const normalizedGzipBytes =
    dataGzipBytes +
    chunks.reduce(
      (total, chunk) => total + chunk.descriptor.gzipBytes,
      0
    );
  if (
    normalizedBytes > EOP_SIZE_BUDGET.normalizedBytes ||
    normalizedGzipBytes >
      EOP_SIZE_BUDGET.normalizedGzipBytes
  ) {
    fail(
      `EOP正規化データ合計が予算を超えています: ` +
        `${normalizedBytes} raw / ${normalizedGzipBytes} gzip`
    );
  }
  const lock = {
    schemaVersion: 1,
    artifact: EOP_PATHS.data,
    canonicalization:
      "UTF-8 JSON.stringify(decoded quantized records)",
    algorithm: "sha256",
    contentSha256,
    sourceSha256: snapshot.sourceSha256,
    sourceSnapshotSha256: digest("sha256", snapshotText),
    recordCount: coverage.recordCount,
    polarMotionIersCount: coverage.polarMotion.iersCount,
    polarMotionPredictedCount:
      coverage.polarMotion.predictedCount,
    dut1IersCount: coverage.dut1.iersCount,
    dut1PredictedCount: coverage.dut1.predictedCount,
    missingPolarMotionTailRows:
      coverage.polarMotion.missingTailRows,
    missingDut1TailRows: coverage.dut1.missingTailRows,
    firstSampleMjdUtc: coverage.firstSampleMjdUtc,
    lastSampleMjdUtc: coverage.lastSampleMjdUtc,
    chunkCount: chunks.length,
    normalizedBytes,
    normalizedGzipBytes
  };
  const lockText = `${JSON.stringify(lock, null, 2)}\n`;
  return {
    data,
    dataText,
    chunks,
    lock,
    lockText
  };
}
