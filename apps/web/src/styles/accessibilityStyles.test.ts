import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/styles/index.css"),
  "utf8",
);
const sphereStylesheet = readFileSync(
  resolve(process.cwd(), "src/features/sky/SkySphere3D.css"),
  "utf8",
);

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );
  if (!match?.[1]) {
    throw new Error(`CSS rule not found: ${selector}`);
  }
  return match[1];
}

function cssDeclaration(rule: string, property: string) {
  const match = rule.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  if (!match?.[1]) {
    throw new Error(`CSS declaration not found: ${property}`);
  }
  return match[1].trim();
}

function relativeLuminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received: ${hex}`);
  }
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("accessibility CSS contracts", () => {
  it("keeps normal-size primary text above the WCAG AA contrast threshold", () => {
    const rootRule = cssRule(":root");
    const accentStrong = cssDeclaration(rootRule, "--accent-strong");

    expect(contrastRatio("#ffffff", accentStrong)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the inline-error dismiss control at least 24 CSS pixels tall", () => {
    const dismissRule = cssRule(".inline-error button");
    const minimumHeight = Number.parseFloat(
      cssDeclaration(dismissRule, "min-height"),
    );

    expect(minimumHeight).toBeGreaterThanOrEqual(24);
  });

  it("keeps the 300px one-row 3D controls after wider breakpoint rules", () => {
    const compactBreakpoint = sphereStylesheet.lastIndexOf(
      "@media (max-width: 300px)",
    );
    const widerBreakpoint = sphereStylesheet.lastIndexOf(
      "@media (max-width: 430px)",
    );

    expect(compactBreakpoint).toBeGreaterThan(widerBreakpoint);
    expect(
      sphereStylesheet.slice(compactBreakpoint),
    ).toContain('grid-template-areas: "left up reset down right"');
  });
});
