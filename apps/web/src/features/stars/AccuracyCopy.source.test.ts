import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const starDetailsSource = readFileSync(
  resolve(process.cwd(), "src/features/stars/StarDetails.tsx"),
  "utf8",
);
const helpSource = readFileSync(
  resolve(process.cwd(), "src/features/help/HelpDialog.tsx"),
  "utf8",
);
const accuracySources = [starDetailsSource, helpSource].map((source) =>
  source.replace(/\s+/gu, ""),
);

describe("star-position accuracy copy source contract", () => {
  it("keeps the in-coverage estimate scoped to ordinary vacuum use", () => {
    for (const source of accuracySources) {
      expect(source).toContain(
        "BSC5Pの格納分解能から見た真空中の通常目安",
      );
      expect(source).toContain("全恒星の実測精度を保証する値ではありません");
      expect(source).toContain("大気差ON時の表示高度は別です");
    }
  });

  it("keeps fallback EOP and UTC assumptions visible", () => {
    for (const source of accuracySources) {
      expect(source).toContain("時角の最大約13.5秒角");
      expect(source).toContain(
        "現行の整数うるう秒UTCを前提にしたDUT1だけの条件付き目安",
      );
      expect(source).toContain("xp/yp=0による方向差も");
      expect(source).toContain("最大約0.6秒角");
      expect(source).toContain("1972年以前はTAI−UTC=0秒");
      expect(source).toContain("将来は既知最後の37秒を仮定するUTC近似");
    }
  });

  it("keeps the bundled EOP coverage copy current", () => {
    const normalizedHelpSource = helpSource.replace(/\s+/gu, "");
    expect(normalizedHelpSource).toContain(
      "1973年1月2日〜2027年8月7日",
    );
    expect(normalizedHelpSource).toContain("2026年7月31日取得版");
    expect(normalizedHelpSource).toContain(
      "2026年7月30日までが観測値",
    );
  });
});
