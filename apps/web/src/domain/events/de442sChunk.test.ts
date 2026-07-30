import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DE442S_EARTH_MOON_MASS_RATIO,
  decodeDe442sChunk,
  De442sEphemerisProvider,
  evaluateDe442sSeries,
  type DecodedDe442sChunk,
} from "./de442sChunk";
import {
  selectDe442sChunk,
  validateDe442sManifest,
  type De442sManifest,
} from "./de442sManifest";

interface FixtureSeries {
  readonly seriesId: "emb" | "sun" | "moon";
  readonly packedPositionKilometers: readonly [number, number, number];
  readonly packedVelocityKilometersPerSecond: readonly [
    number,
    number,
    number,
  ];
}

interface FixtureSample {
  readonly id: string;
  readonly julianDateTdb: number;
  readonly secondsPastJ2000Tdb: number;
  readonly chunkId: string;
  readonly series: readonly FixtureSeries[];
}

interface EphemerisFixture {
  readonly sampleCases: readonly FixtureSample[];
}

const sharedDirectory = resolve(process.cwd(), "../../shared");

let manifest: De442sManifest;
let fixture: EphemerisFixture;

async function decodedChunk(
  id: string,
): Promise<DecodedDe442sChunk> {
  const chunk = manifest.chunks.find((candidate) => candidate.id === id);
  if (chunk === undefined) {
    throw new Error(`Missing test chunk ${id}`);
  }
  const bytes = await readFile(
    join(sharedDirectory, `ephemeris/de442s/chunks/${id}.v1.bin`),
  );
  return decodeDe442sChunk(bytes, chunk);
}

function fixtureSeries(
  sample: FixtureSample,
  id: FixtureSeries["seriesId"],
): FixtureSeries {
  const series = sample.series.find((candidate) => candidate.seriesId === id);
  if (series === undefined) {
    throw new Error(`Missing fixture series ${id}`);
  }
  return series;
}

function expectVectorClose(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
  digits: number,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    expect(actual[axis]).toBeCloseTo(expected[axis]!, digits);
  }
}

beforeAll(async () => {
  const [manifestText, fixtureText] = await Promise.all([
    readFile(
      join(
        sharedDirectory,
        "ephemeris/de442s/de442s-manifest.v1.json",
      ),
      "utf8",
    ),
    readFile(
      join(sharedDirectory, "fixtures/de442s-ephemeris.v1.json"),
      "utf8",
    ),
  ]);
  manifest = validateDe442sManifest(
    JSON.parse(manifestText) as unknown,
  );
  fixture = JSON.parse(fixtureText) as EphemerisFixture;
});

describe("DE442s little-endian chunk runtime", () => {
  it("matches the packed fixture in Float64 evaluation", async () => {
    const sample = fixture.sampleCases.find(
      (candidate) => candidate.id === "sample-2026-eclipse-era",
    );
    if (sample === undefined) {
      throw new Error("Missing 2026 fixture sample");
    }
    const chunk = await decodedChunk(sample.chunkId);
    for (const id of ["emb", "sun", "moon"] as const) {
      const state = evaluateDe442sSeries(
        chunk,
        id,
        sample.secondsPastJ2000Tdb,
      );
      const expected = fixtureSeries(sample, id);
      expectVectorClose(
        state.positionKilometers,
        expected.packedPositionKilometers,
        7,
      );
      expectVectorClose(
        state.velocityKilometersPerDay,
        expected.packedVelocityKilometersPerSecond.map(
          (component) => component * 86_400,
        ) as [number, number, number],
        7,
      );
    }
  });

  it("reconstructs Earth, geocentric Moon, and geocentric Sun using DE442 masses", async () => {
    const sample = fixture.sampleCases.find(
      (candidate) => candidate.id === "sample-2026-eclipse-era",
    );
    if (sample === undefined) {
      throw new Error("Missing 2026 fixture sample");
    }
    const chunk = await decodedChunk(sample.chunkId);
    const provider = new De442sEphemerisProvider([chunk]);
    const result = provider.state(sample.julianDateTdb);
    const emb = fixtureSeries(sample, "emb").packedPositionKilometers;
    const sun = fixtureSeries(sample, "sun").packedPositionKilometers;
    const moon = fixtureSeries(sample, "moon").packedPositionKilometers;
    const expectedEarth = emb.map(
      (component, axis) =>
        component - moon[axis]! / DE442S_EARTH_MOON_MASS_RATIO,
    ) as [number, number, number];
    const expectedMoon = moon.map(
      (component) =>
        component * (1 + 1 / DE442S_EARTH_MOON_MASS_RATIO),
    ) as [number, number, number];
    const expectedSun = sun.map(
      (component, axis) => component - expectedEarth[axis]!,
    ) as [number, number, number];

    expect(DE442S_EARTH_MOON_MASS_RATIO).toBeCloseTo(
      81.300_568_466_341_66,
      12,
    );
    expectVectorClose(
      result.earthBarycentric.positionKilometers,
      expectedEarth,
      6,
    );
    expectVectorClose(
      result.moonGeocentric.positionKilometers,
      expectedMoon,
      6,
    );
    expectVectorClose(
      result.sunGeocentric.positionKilometers,
      expectedSun,
      6,
    );
    expect(provider.stateCoverage).toEqual({
      startJulianDateTdb: chunk.manifest.startJulianDateTdb,
      endJulianDateTdb: chunk.manifest.endJulianDateTdb,
      endIsIncluded: true,
    });
    expect(Object.isFrozen(provider.stateCoverage)).toBe(true);
  });

  it("gives the same state from either duplicated boundary chunk", async () => {
    const [left, right] = await Promise.all([
      decodedChunk("1995-2000"),
      decodedChunk("2000-2005"),
    ]);
    const boundary = 2_451_544.5;
    const leftState = new De442sEphemerisProvider([left]).state(boundary);
    const rightState = new De442sEphemerisProvider([right]).state(boundary);

    expectVectorClose(
      leftState.earthBarycentric.positionKilometers,
      rightState.earthBarycentric.positionKilometers,
      9,
    );
    expectVectorClose(
      leftState.moonGeocentric.positionKilometers,
      rightState.moonGeocentric.positionKilometers,
      9,
    );
    expectVectorClose(
      leftState.sunGeocentric.positionKilometers,
      rightState.sunGeocentric.positionKilometers,
      9,
    );
  });

  it("publishes contiguous loaded coverage and rejects chunk gaps", async () => {
    const [left, right, separated] = await Promise.all([
      decodedChunk("1995-2000"),
      decodedChunk("2000-2005"),
      decodedChunk("2005-2010"),
    ]);
    const provider = new De442sEphemerisProvider([right, left]);

    expect(provider.stateCoverage).toEqual({
      startJulianDateTdb: left.manifest.startJulianDateTdb,
      endJulianDateTdb: right.manifest.endJulianDateTdb,
      endIsIncluded: true,
    });
    expect(() =>
      new De442sEphemerisProvider([left, separated]),
    ).toThrow(/contiguous coverage/);
  });

  it("rejects corrupt magic, directory metadata, coefficients, and padding", async () => {
    const declared = selectDe442sChunk(manifest, 2_461_265);
    const original = await readFile(
      join(
        sharedDirectory,
        `ephemeris/de442s/chunks/${declared.id}.v1.bin`,
      ),
    );

    const badMagic = Uint8Array.from(original);
    badMagic[0] = 0;
    expect(() => decodeDe442sChunk(badMagic, declared)).toThrow(
      /wrong magic/,
    );

    const badDirectory = Uint8Array.from(original);
    new DataView(badDirectory.buffer).setUint32(56, 136, true);
    expect(() => decodeDe442sChunk(badDirectory, declared)).toThrow(
      /dataOffsetBytes/,
    );

    const firstEmb = declared.series[0]!;
    const badCoefficient = Uint8Array.from(original);
    new DataView(badCoefficient.buffer).setUint32(
      firstEmb.dataOffsetBytes + 16,
      0x7fc0_0000,
      true,
    );
    expect(() => decodeDe442sChunk(badCoefficient, declared)).toThrow(
      /coefficient is not finite/,
    );

    const badPadding = Uint8Array.from(original);
    badPadding[
      firstEmb.dataOffsetBytes + firstEmb.recordStrideBytes - 1
    ] = 1;
    expect(() => decodeDe442sChunk(badPadding, declared)).toThrow(
      /non-zero padding/,
    );
  });

  it("rejects state evaluation outside the chunks held by a provider", async () => {
    const chunk = await decodedChunk("2025-2030");
    const provider = new De442sEphemerisProvider([chunk]);
    expect(() => provider.state(Number.NaN)).toThrow(/must be finite/);
    expect(() => provider.state(2_470_000)).toThrow(
      /not loaded in this provider/,
    );
  });
});
