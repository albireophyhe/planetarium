import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const projectRoot = resolve(import.meta.dirname, "..");
const canonicalOutput = resolve(
  projectRoot,
  "shared/ephemeris/truncated-earth-heliocentric.v1.json",
);
const sourceFileSha256 =
  "939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a";
const archiveSha256 =
  "d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2";
const retainedTermCount = 100;
const referenceSpanJulianYears = 100;
const groupNames = [
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
const numberPattern = "[+-]?\\d+(?:\\.\\d*)?[eE][+-]\\d+";

const { values } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    output: { type: "string" },
    source: { type: "string" },
  },
});

if (!values.source) {
  throw new Error(
    "Usage: node script/build_earth_ephemeris.mjs " +
      "--source /path/to/official/epv00.c [--check]",
  );
}

const sourcePath = resolve(values.source);
const source = await readFile(sourcePath, "utf8");
const actualSourceSha256 = createHash("sha256")
  .update(source)
  .digest("hex");
if (actualSourceSha256 !== sourceFileSha256) {
  throw new Error(
    `Unexpected source SHA-256: ${actualSourceSha256}; ` +
      `expected ${sourceFileSha256}`,
  );
}

const parsedGroups = Object.fromEntries(
  groupNames.map((groupName) => {
    const match = source.match(
      new RegExp(
        `static const double ${groupName}\\[\\] = \\{([\\s\\S]*?)\\};`,
      ),
    );
    if (!match?.[1]) {
      throw new Error(`Could not find coefficient group ${groupName}`);
    }
    const valuesInGroup = [
      ...match[1].matchAll(new RegExp(numberPattern, "g")),
    ].map(([literal]) => Number(literal));
    if (valuesInGroup.length % 3 !== 0) {
      throw new Error(
        `${groupName} has ${valuesInGroup.length} values, not triplets`,
      );
    }
    const terms = [];
    for (let index = 0; index < valuesInGroup.length; index += 3) {
      terms.push([
        valuesInGroup[index],
        valuesInGroup[index + 1],
        valuesInGroup[index + 2],
      ]);
    }
    return [groupName, terms];
  }),
);

const candidates = groupNames.flatMap((groupName, groupOrder) => {
  const timePower = Number(groupName[1]);
  return parsedGroups[groupName].map((term, termIndex) => ({
    contributionBoundAu:
      Math.abs(term[0]) * referenceSpanJulianYears ** timePower,
    groupName,
    groupOrder,
    term,
    termIndex,
  }));
});
if (candidates.length !== 1_323) {
  throw new Error(
    `Expected 1323 heliocentric terms, received ${candidates.length}`,
  );
}

const retained = new Set(
  [...candidates]
    .sort(
      (left, right) =>
        right.contributionBoundAu - left.contributionBoundAu ||
        left.groupOrder - right.groupOrder ||
        left.termIndex - right.termIndex,
    )
    .slice(0, retainedTermCount)
    .map(({ groupName, termIndex }) => `${groupName}:${termIndex}`),
);
const series = Object.fromEntries(
  groupNames.map((groupName) => [
    groupName,
    parsedGroups[groupName].filter((_term, termIndex) =>
      retained.has(`${groupName}:${termIndex}`),
    ),
  ]),
);
const actualRetainedTermCount = Object.values(series).reduce(
  (sum, terms) => sum + terms.length,
  0,
);
if (actualRetainedTermCount !== retainedTermCount) {
  throw new Error(
    `Expected ${retainedTermCount} retained terms, ` +
      `received ${actualRetainedTermCount}`,
  );
}

const artifact = {
  schemaVersion: 1,
  model: "truncated-vsop2000-earth-heliocentric",
  source: {
    release: "IAU SOFA ANSI C 2023-10-11",
    sourceRoutine: "epv00",
    sourceFileSha256,
    archiveUrl: "https://www.iausofa.org/s/sofa_c-20231011tar.gz",
    archiveSha256,
  },
  truncation: {
    rule:
      "top terms by abs(amplitude) * " +
      "referenceSpanJulianYears ** timePower",
    referenceSpanJulianYears,
    fullTermCount: candidates.length,
    retainedTermCount,
  },
  units: {
    amplitude: "au",
    phase: "radian",
    frequency: "radian per Julian year",
  },
  bcrsOrientationMatrix: [
    [1, 0.000000211284, -0.000000091603],
    [-0.000000230286, 0.917482137087, -0.397776982902],
    [0, 0.397776982902, 0.917482137087],
  ],
  series,
};
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
const outputPath = values.output
  ? resolve(values.output)
  : canonicalOutput;

if (values.check) {
  const current = await readFile(outputPath, "utf8");
  if (current !== serialized) {
    throw new Error(
      `${outputPath} is not reproducible from ${sourcePath}`,
    );
  }
  console.log(
    `地球暦係数: ${retainedTermCount}/${candidates.length}項を再現確認`,
  );
} else {
  await writeFile(outputPath, serialized);
  console.log(
    `地球暦係数: ${retainedTermCount}/${candidates.length}項を${outputPath}へ生成`,
  );
}
