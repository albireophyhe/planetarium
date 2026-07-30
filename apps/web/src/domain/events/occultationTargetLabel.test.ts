// @vitest-environment node

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatOccultationTargetLabel } from "./occultationTargetLabel";

const chunksDirectory = fileURLToPath(
  new URL("../../../../../shared/events/chunks/", import.meta.url),
);

const EXPECTED_BUNDLED_DESIGNATIONS = Object.freeze({
  "123Zet Tau": "123 ζ Tau",
  "13Mu Gem": "13 μ Gem",
  "19Del Sgr": "19 δ Sgr",
  "20Sig Sco": "20 σ Sco",
  "22Lam Sgr": "22 λ Sgr",
  "23Tau Sco": "23 τ Sco",
  "25Eta Tau": "25 η Tau",
  "27Eps Gem": "27 ε Gem",
  "41Pi Sgr": "41 π Sgr",
  "49Del Cap": "49 δ Cap",
  "6Pi Sco": "6 π Sco",
  "7Del Sco": "7 δ Sco",
  "8Bet1Sco": "8 β¹ Sco",
  "9Alp2Lib": "9 α² Lib",
});

type RawTarget = {
  readonly label: string;
  readonly labelJa: string | null;
};

type RawChunk = {
  readonly events: readonly {
    readonly kind: string;
    readonly target?: RawTarget;
  }[];
};

async function bundledTargets(): Promise<readonly RawTarget[]> {
  const files = (await readdir(chunksDirectory))
    .filter((file) => file.endsWith(".v1.json"))
    .sort();
  const targets: RawTarget[] = [];
  for (const file of files) {
    const chunk = JSON.parse(
      await readFile(`${chunksDirectory}${file}`, "utf8"),
    ) as RawChunk;
    for (const event of chunk.events) {
      if (
        event.kind === "lunar-occultation" &&
        event.target !== undefined
      ) {
        targets.push(event.target);
      }
    }
  }
  return targets;
}

describe("formatOccultationTargetLabel", () => {
  it("formats every unique bundled raw BSC designation", async () => {
    const targets = await bundledTargets();
    const rawDesignations = [
      ...new Set(
        targets
          .filter(({ labelJa }) => labelJa === null)
          .map(({ label }) => label),
      ),
    ].sort();

    expect(rawDesignations).toEqual(
      Object.keys(EXPECTED_BUNDLED_DESIGNATIONS).sort(),
    );
    for (const label of rawDesignations) {
      expect(formatOccultationTargetLabel(label, null)).toBe(
        EXPECTED_BUNDLED_DESIGNATIONS[
          label as keyof typeof EXPECTED_BUNDLED_DESIGNATIONS
        ],
      );
    }
  });

  it("preserves every bundled Japanese proper name", async () => {
    const targets = await bundledTargets();
    const localizedTargets = new Map(
      targets
        .filter(
          (
            target,
          ): target is RawTarget & { readonly labelJa: string } =>
            target.labelJa !== null,
        )
        .map(({ label, labelJa }) => [label, labelJa]),
    );

    expect([...localizedTargets.entries()].sort()).toEqual([
      ["Aldebaran", "アルデバラン"],
      ["Antares", "アンタレス"],
      ["Elnath", "エルナト"],
      ["Nunki", "ヌンキ"],
      ["Regulus", "レグルス"],
      ["Spica", "スピカ"],
    ]);
    for (const [label, labelJa] of localizedTargets) {
      expect(formatOccultationTargetLabel(label, labelJa)).toBe(
        labelJa,
      );
    }
  });

  it("passes proper names and unrecognized catalogue text through", () => {
    expect(
      formatOccultationTargetLabel("Aldebaran", null),
    ).toBe("Aldebaran");
    expect(
      formatOccultationTargetLabel("HR 1457", null),
    ).toBe("HR 1457");
  });
});
