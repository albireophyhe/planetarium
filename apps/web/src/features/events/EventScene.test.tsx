import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  EventBodyPosition,
  EventClassification,
  EventContact,
  EventKind,
  LocalCircumstances,
} from "../../domain/events/types";
import { EventScene } from "./EventScene";

function body(
  altitude: number,
  azimuth: number,
  angularRadiusRadians: number | null,
): EventBodyPosition {
  return {
    altitudeAzimuth: {
      altitude,
      azimuth,
      azimuthDefined: true,
    },
    angularRadiusRadians,
    distanceKilometers:
      angularRadiusRadians === null ? null : 380_000,
  };
}

function contact(
  bodies: EventContact["bodies"],
  overrides: Partial<EventContact> = {},
): EventContact {
  return {
    aboveHorizon: true,
    bodies,
    instantUtc: new Date("2026-08-12T18:30:12.000Z"),
    phase: "maximum",
    positionAngleRadians: null,
    ...overrides,
  };
}

function forecast(
  kind: EventKind,
  maximum: EventContact,
  localClassification: EventClassification,
): LocalCircumstances {
  return {
    boundaryUncertain: false,
    boundaryUncertaintyReason: null,
    contacts: [maximum],
    event: {
      canonicalEpochUtc: maximum.instantUtc,
      dataVersion: "test-v1",
      globalClassification: localClassification,
      id: `event-${kind}`,
      kind,
      targetStarHR:
        kind === "lunar-occultation" ? 7001 : null,
      title:
        kind === "solar-eclipse"
          ? "テスト日食"
          : kind === "lunar-eclipse"
            ? "テスト月食"
            : "テスト恒星掩蔽",
    },
    localClassification,
    magnitude: kind === "lunar-eclipse" ? 1.032 : null,
    maximum,
    obscuration: kind === "solar-eclipse" ? 0.85 : null,
    observer: {
      heightMeters: 10,
      horizontalAccuracyMeters: 15,
      latitude: 35,
      locationSource: "device-geolocation",
      longitude: 139,
      name: "テスト地点",
      timeZone: "Asia/Tokyo",
    },
    provenance: {
      algorithmVersion: "test",
      deltaTModel: "test",
      dut1Quality: "observed",
      eopId: "test",
      eopRetrievedAt: "2026-01-01T00:00:00.000Z",
      eopSourceSha256: "e".repeat(64),
      ephemerisId: "test",
      ephemerisSourceSha256: "a".repeat(64),
      limbProfileId: null,
      lunarRadiusModel: "mean-spherical-limb",
      polarMotionQuality: "observed",
    },
    uncertainty: {
      dominantContributors: [],
      observerLocationMeters: 15,
      pathKilometers: null,
      tier: "normal",
      timingSeconds: 1,
    },
    visibility: "fully-visible",
    warnings: [],
  };
}

describe("EventScene", () => {
  it("renders calculated solar-disc geometry with an accessible description", () => {
    const maximum = contact({
      moon: body(0.4, 1.008, 0.005),
      sun: body(0.4, 1, 0.004),
    });
    const { container } = render(
      <EventScene
        circumstances={forecast(
          "solar-eclipse",
          maximum,
          "partial",
        )}
      />,
    );

    const figure = screen.getByRole("figure", {
      name: "相対配置",
    });
    const caption = figure.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(
      within(figure).getByRole("img", {
        name: "テスト日食、最大の相対配置",
      }),
    ).toBeInTheDocument();
    expect(within(figure).getByText("角度比例")).toBeInTheDocument();
    expect(
      within(caption as HTMLElement).getByText(/中心間隔・角半径/),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-body="sun"]')).toHaveLength(
      1,
    );
    expect(container.querySelectorAll('[data-body="moon"]')).toHaveLength(
      1,
    );
  });

  it("uses an explicitly selected contact instead of the default maximum", () => {
    const maximum = contact({
      moon: body(0.4, 1.002, 0.005),
      sun: body(0.4, 1, 0.004),
    });
    const selectedContact = contact(
      {
        moon: body(0.5, 1.009, 0.005),
        sun: body(0.5, 1, 0.004),
      },
      {
        instantUtc: new Date("2026-08-12T17:38:05.000Z"),
        phase: "solar-c1",
        positionAngleRadians: 1.2,
      },
    );
    render(
      <EventScene
        circumstances={forecast(
          "solar-eclipse",
          maximum,
          "partial",
        )}
        sample={selectedContact}
      />,
    );

    const figure = screen.getByRole("figure", {
      name: "相対配置",
    });
    expect(figure).toHaveTextContent("部分食開始（C1）");
    expect(figure).toHaveTextContent("2026/08/13 02:38:05");
    expect(
      within(figure).getByRole("img", {
        name: "テスト日食、部分食開始（C1）の相対配置",
      }),
    ).toBeInTheDocument();
  });

  it("renders computed umbra and penumbra at a common angular scale", () => {
    const maximum = contact(
      {
        moon: body(0.6, 2, 0.0045),
      },
      {
        lunarShadow: {
          centerPositionAngleRadians: 0.8,
          centerSeparationRadians: 0.006,
          penumbralAngularRadiusRadians: 0.012,
          umbralAngularRadiusRadians: 0.008,
        },
      },
    );
    const { container } = render(
      <EventScene
        circumstances={forecast(
          "lunar-eclipse",
          maximum,
          "total",
        )}
      />,
    );

    const caption = container.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(screen.getByText("角度比例")).toBeInTheDocument();
    expect(
      within(caption as HTMLElement).getByText(
        /影中心方向を、天球上の角度に比例/,
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-body="penumbra"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-body="umbra"]'),
    ).toHaveLength(1);
    expect(screen.getByText("地球本影")).toBeInTheDocument();
    expect(screen.getByText("地球半影")).toBeInTheDocument();
  });

  it("makes the lunar legacy fallback unmistakably schematic", () => {
    const maximum = contact({
      moon: body(0.6, 2, 0.0045),
    });
    const { container } = render(
      <EventScene
        circumstances={forecast(
          "lunar-eclipse",
          maximum,
          "partial",
        )}
      />,
    );

    const caption = container.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(screen.getByText("概略表示")).toBeInTheDocument();
    expect(
      within(caption as HTMLElement).getByText(
        /局地分類だけを伝える概略図/,
      ),
    ).toBeInTheDocument();
    expect(
      within(caption as HTMLElement).getByText(
        /月の位置・影との中心間隔・円の大きさは実際の値を表しません/,
      ),
    ).toBeInTheDocument();
  });

  it("explains that an occulted target locator is behind the Moon", () => {
    const maximum = contact({
      moon: body(0.5, 1, 0.005),
      target: body(0.5, 1.002, null),
    });
    const { container } = render(
      <EventScene
        circumstances={forecast(
          "lunar-occultation",
          maximum,
          "occultation",
        )}
      />,
    );

    const caption = container.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(
      within(caption as HTMLElement).getByText(/月面裏の位置/),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        ".event-scene__star--hidden[data-body=\"target\"]",
      ),
    ).toHaveLength(2);
    expect(screen.getByText("月半径比")).toBeInTheDocument();
  });

  it("shows a data-shortage state instead of fabricated geometry", () => {
    const maximum = contact({
      sun: body(0.4, 1, 0.004),
    });
    const { container } = render(
      <EventScene
        circumstances={forecast(
          "solar-eclipse",
          maximum,
          "partial",
        )}
      />,
    );

    const caption = container.querySelector("figcaption");
    expect(caption).not.toBeNull();
    expect(screen.getByText("配置データ不足")).toBeInTheDocument();
    expect(
      within(caption as HTMLElement).getByText(
        /円盤配置を描画できません/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/推測で補わず/)).toBeInTheDocument();
  });
});
