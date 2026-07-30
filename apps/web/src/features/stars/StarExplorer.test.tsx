import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StarViewModel } from "../../app/types";
import { StarExplorer } from "./StarExplorer";

const TEST_ASTROMETRY = {
  annualParallaxMode: null,
  apparentDecRad: null,
  apparentRaRad: null,
  azimuthDefined: true,
  calculationModel: "v1",
  diurnalAberrationMode: null,
  geometricAltitudeDeg: 0,
  geometricAzimuthDefined: true,
  geometricAzimuthDeg: 0,
  parallaxArcsec: null,
  pmDecArcsecPerYear: null,
  pmRaCosDecArcsecPerYear: null,
  polarMotionMode: null,
  radialVelocityKmPerSecond: null,
  refractionMode: null,
  solarLightDeflectionMode: null,
  spaceMotionMode: null,
} as const;

const TEST_STARS: readonly StarViewModel[] = [
  {
    ...TEST_ASTROMETRY,
    aliases: [],
    altitudeDeg: 42,
    azimuthDeg: 10,
    catalogName: "Alpha",
    constellation: "テスト座",
    decRad: 0,
    englishName: "Alpha",
    hr: 1,
    japaneseName: "アルファ",
    raRad: 0,
    vMagnitude: 1,
  },
  {
    ...TEST_ASTROMETRY,
    aliases: [],
    altitudeDeg: 25,
    azimuthDeg: 20,
    catalogName: "Beta",
    constellation: "テスト座",
    decRad: 0,
    englishName: "Beta",
    hr: 2,
    japaneseName: "ベータ",
    raRad: 0,
    vMagnitude: 2,
  },
  {
    ...TEST_ASTROMETRY,
    aliases: [],
    altitudeDeg: 8,
    azimuthDeg: 30,
    catalogName: "Gamma",
    constellation: "テスト座",
    decRad: 0,
    englishName: "Gamma",
    hr: 3,
    japaneseName: "ガンマ",
    raRad: 0,
    vMagnitude: 3,
  },
  {
    ...TEST_ASTROMETRY,
    aliases: ["Dog Star"],
    altitudeDeg: -18,
    azimuthDeg: 40,
    catalogName: "Sirius",
    constellation: "おおいぬ座",
    decRad: 0,
    englishName: "Sirius",
    hr: 4,
    japaneseName: "シリウス",
    raRad: 0,
    vMagnitude: -1.46,
  },
];

function ExplorerHarness() {
  const [selectedHr, setSelectedHr] = useState<number | null>(1);
  return (
    <StarExplorer
      allStars={TEST_STARS}
      onQueryChange={() => undefined}
      onSelect={setSelectedHr}
      onVisibleModeChange={() => undefined}
      query=""
      selectedHr={selectedHr}
      visibleMode="above"
    />
  );
}

describe("StarExplorer keyboard navigation", () => {
  it("moves selection and roving focus with arrows, Home, and End", async () => {
    const user = userEvent.setup();
    render(<ExplorerHarness />);
    const options = screen.getAllByRole("option");

    options[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveFocus();
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{End}");
    expect(options[2]).toHaveFocus();
    expect(options[2]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(options[0]).toHaveFocus();
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("offers a direct recovery when every search match is below the horizon", async () => {
    const user = userEvent.setup();

    function RecoveryHarness() {
      const [selectedHr, setSelectedHr] = useState<number | null>(null);
      const [visibleMode, setVisibleMode] = useState<"above" | "all">(
        "above",
      );
      return (
        <StarExplorer
          allStars={TEST_STARS}
          onQueryChange={() => undefined}
          onSelect={setSelectedHr}
          onVisibleModeChange={setVisibleMode}
          query="シリウス"
          selectedHr={selectedHr}
          visibleMode={visibleMode}
        />
      );
    }

    render(<RecoveryHarness />);
    expect(
      screen.getByText("一致する星は現在すべて地平線下です。"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "1個を「すべて」で見る" }),
    );
    const sirius = screen.getByRole("option", {
      name: /シリウス、等級−1\.46、高度−18°/,
    });
    expect(sirius).toHaveAttribute("aria-selected", "true");
    expect(sirius).not.toHaveAccessibleName(/等級-1\.46/);
    expect(sirius).not.toHaveAccessibleName(/高度-18°/);
    expect(screen.getByRole("radio", { name: "すべて" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("focuses from the slash shortcut and offers a focus-preserving clear button", async () => {
    const user = userEvent.setup();

    function SearchHarness() {
      const [query, setQuery] = useState("");
      return (
        <StarExplorer
          allStars={TEST_STARS}
          onQueryChange={setQuery}
          onSelect={() => undefined}
          onVisibleModeChange={() => undefined}
          query={query}
          selectedHr={null}
          visibleMode="above"
        />
      );
    }

    render(<SearchHarness />);
    const input = screen.getByRole("searchbox", { name: "星を検索" });
    await user.keyboard("/");
    expect(input).toHaveFocus();

    await user.type(input, "アルファ");
    await user.click(
      screen.getByRole("button", { name: "検索をクリア" }),
    );
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("keeps tracking a selected star below the horizon and can reveal it without changing selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    function TrackingHarness() {
      const [stars, setStars] =
        useState<readonly StarViewModel[]>(TEST_STARS);
      const [visibleMode, setVisibleMode] = useState<"above" | "all">(
        "above",
      );

      return (
        <>
          <button
            onClick={() => {
              setStars((current) =>
                current.map((star) =>
                  star.hr === 1
                    ? { ...star, altitudeDeg: -3 }
                    : star,
                ),
              );
            }}
            type="button"
          >
            選択星を地平線下へ移動
          </button>
          <StarExplorer
            allStars={stars}
            onQueryChange={() => undefined}
            onSelect={onSelect}
            onVisibleModeChange={setVisibleMode}
            query=""
            selectedHr={1}
            visibleMode={visibleMode}
          />
        </>
      );
    }

    render(<TrackingHarness />);
    expect(
      screen.getByRole("option", { name: /アルファ/ }),
    ).toHaveAttribute("aria-selected", "true");

    await user.click(
      screen.getByRole("button", {
        name: "選択星を地平線下へ移動",
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "選択中：アルファ",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "現在は地平線下です。追跡は継続しています。",
    );
    expect(
      screen.queryByRole("option", { name: /アルファ/ }),
    ).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "アルファを一覧に表示",
      }),
    );

    const revealedOption = screen.getByRole("option", {
      name: /アルファ/,
    });
    expect(
      screen.getByRole("radio", { name: "すべて" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(revealedOption).toHaveAttribute("aria-selected", "true");
    expect(revealedOption).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
