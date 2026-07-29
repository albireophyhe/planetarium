import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SkyStar } from "../../app/types";
import { SkySphere3D } from "./SkySphere3D";

function star(index: number): SkyStar {
  return {
    altitudeDeg: 20 + index,
    azimuthDeg: index * 15,
    bvColor: 0.4,
    hr: index,
    label: index === 16 ? null : `星${index}`,
    projectionX: 0,
    projectionY: 0,
    vMagnitude: index / 10,
  };
}

function renderMarkup() {
  const markup = renderToStaticMarkup(
    <SkySphere3D
      constellationLines
      constellations={[]}
      nightMode={false}
      onReady={vi.fn()}
      onSelect={vi.fn()}
      onUnavailable={vi.fn()}
      selectedHr={16}
      selectedStarTrack={null}
      solarPosition={{
        altitudeDeg: -12.5,
        azimuthDeg: 270,
        projectionX: -0.8,
        projectionY: 0,
      }}
      starLabels
      stars={Array.from({ length: 16 }, (_, index) => star(index + 1))}
      trackDescriptionId="selected-track-description"
      twilight="civil"
    />,
  );
  const root = document.createElement("div");
  root.innerHTML = markup;
  return root;
}

describe("SkySphere3D accessible static contract", () => {
  it("describes keyboard controls and the star-list alternative", () => {
    const root = renderMarkup();
    const canvas = root.querySelector("canvas");
    const describedBy = canvas?.getAttribute("aria-describedby") ?? "";
    const description = describedBy
      .split(/\s+/)
      .map(
        (id) =>
          root.querySelector(`[id="${id}"]`)?.textContent,
      )
      .join(" ");

    expect(description).toContain("矢印キー");
    expect(description).toContain("プラスキーとマイナスキー");
    expect(description).toContain("Homeキー");
    expect(description).toContain("下の一覧");
    expect(description).toContain("フォーカス中はスクロール");
    expect(description).toContain(
      "太陽は高度−13°、方位270°、地平線下",
    );
    expect(describedBy).toContain("selected-track-description");
    expect(canvas).toHaveStyle({ touchAction: "pan-y" });
  });

  it("bounds the DOM label overlay and includes an unnamed selected star", () => {
    const root = renderMarkup();
    const labels = root.querySelectorAll(".sky-sphere3d__star-label");

    expect(labels).toHaveLength(12);
    expect(labels[0]).toHaveTextContent("HR 16");
    expect(
      root.querySelector(".sky-sphere3d__star-labels"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(root.firstElementChild).toHaveClass(
      "sky-sphere3d--twilight-civil",
    );
    expect(
      root.querySelector(".sky-sphere3d__solar-label"),
    ).toHaveTextContent("太陽");
  });
});
