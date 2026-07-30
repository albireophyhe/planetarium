import type {
  EquatorialCoordinates,
  HorizontalCoordinates,
  ProjectedPoint,
  Star,
} from "../types";
import type { Matrix3, Vector3 } from "./vector";

export interface PrecisionStar extends Star {
  /**
   * Projected J2000 FK5 proper motion, cos(dec) × d(RA)/dt, in arcsec/year.
   */
  readonly pmRaCosDecArcsecPerYear: number | null;
  /** J2000 FK5 declination proper motion in arcsec/year. */
  readonly pmDecArcsecPerYear: number | null;
  readonly parallaxArcsec: number | null;
  readonly radialVelocityKmPerSecond: number | null;
}

export interface EarthOrientationOptions {
  /**
   * UT1−UTC in seconds. Values through ±3600 seconds are supported so future
   * continuous-UTC scenarios can remain distinct from Earth rotation. When
   * omitted, zero is used and reported as an approximation.
   */
  readonly dut1Seconds?: number;
  /**
   * Provenance attached to an explicitly supplied DUT1 value. Defaults to
   * `caller`; it cannot be supplied without `dut1Seconds`.
   */
  readonly dut1Source?: Exclude<DUT1Source, "assumed-zero">;
  /**
   * Uncertainty or reported error of the supplied DUT1 value in seconds,
   * when known. Its statistical interpretation comes from the caller or
   * source product; values through 3600 seconds are supported and it cannot
   * be supplied without `dut1Seconds`.
   */
  readonly dut1UncertaintySeconds?: number;
  /**
   * Coordinates of the Celestial Intermediate Pole in the ITRS. xp and yp
   * are a required pair in radians; the deterministic TIO locator s′ is
   * derived from TT by the precision model.
   */
  readonly polarMotion?: PolarMotionOptions;
  /**
   * TAI−UTC in seconds. When omitted, the bundled IERS leap-second history is
   * used where defined.
   */
  readonly taiMinusUtcSeconds?: number;
}

export type PolarMotionSource =
  "caller" | "iers-observed" | "iers-predicted" | "assumed-zero";

export interface PolarMotionOptions {
  readonly xpRadians: number;
  readonly ypRadians: number;
  readonly source?: PolarMotionSource;
  /**
   * Source-reported errors. Their statistical interpretation comes from the
   * source product; either both axes or neither axis must be supplied.
   */
  readonly xpReportedErrorRadians?: number;
  readonly ypReportedErrorRadians?: number;
}

export interface ResolvedTimeScales {
  readonly utcJulianDate: number;
  readonly ut1JulianDate: number;
  readonly ttJulianDate: number;
  readonly dut1Seconds: number;
  readonly dut1UncertaintySeconds: number | null;
  readonly taiMinusUtcSeconds: number;
  readonly dut1Source: DUT1Source;
  readonly taiMinusUtcSource:
    "caller" | "iers-history" | "pre-1972-approximation";
  readonly warnings: readonly PrecisionWarningCode[];
}

export type DUT1Source =
  "caller" | "iers-observed" | "iers-predicted" | "assumed-zero";

export interface Atmosphere {
  readonly pressureHpa: number;
  readonly temperatureCelsius: number;
  readonly relativeHumidity: number;
  /** Visual/optical wavelength in micrometers. */
  readonly wavelengthMicrometers: number;
  /**
   * Below this geometric altitude the fast tan-polynomial is not applied.
   * Defaults to 5 degrees and must remain between 5 and 30 degrees. Below
   * this explicit validity boundary the geometric altitude is returned.
   */
  readonly minimumGeometricAltitudeDegrees?: number;
}

export interface CustomAberration {
  /** Observer barycentric velocity in units of the speed of light. */
  readonly observerBarycentricVelocityC: Vector3;
  readonly sunObserverDistanceAu: number;
}

export interface CustomAnnualParallax {
  /**
   * SSB-to-actual-observing-site position in AU, expressed in
   * BCRS/Hipparcos-aligned axes. The caller is responsible for including the
   * site's displacement from the Earth center; otherwise metadata would
   * under-report diurnal parallax.
   */
  readonly observerPositionAu: Vector3;
}

export interface CustomSolarLightDeflection {
  /**
   * Unit vector from the Sun to the observer in the same
   * BCRS/Hipparcos-aligned axes as the natural source direction.
   */
  readonly sunToObserverUnitDirection: Vector3;
  /** Sun-to-observer distance in AU. */
  readonly sunObserverDistanceAu: number;
}

export interface DiurnalAberrationOptions {
  /**
   * WGS84 ellipsoid height in metres. When omitted, zero metres is used and
   * reported as an explicit approximation.
   */
  readonly heightMeters?: number;
}

export interface ApparentPositionOptionsV2 {
  readonly earthOrientation?: EarthOrientationOptions;
  /**
   * Defaults to the 200-term VSOP2000 heliocentric Earth approximation. Use
   * false for no annual parallax, or provide an external observer position
   * in AU.
   */
  readonly annualParallax?: false | CustomAnnualParallax;
  /**
   * Defaults to solar geometry from the 200-term VSOP2000 heliocentric Earth
   * approximation. Use false for no solar deflection, or provide an external
   * Sun-to-observer unit direction and distance.
   */
  readonly solarLightDeflection?: false | CustomSolarLightDeflection;
  /**
   * Defaults to the analytic velocity of the 200-term VSOP2000 heliocentric
   * Earth approximation. Use false for no annual aberration, or provide an
   * external ephemeris vector.
   */
  readonly aberration?: false | CustomAberration;
  /**
   * Conventional SOFA split-at-CIRS first-order diurnal aberration. It is on
   * by default with WGS84 ellipsoid height zero, can accept a caller height,
   * and can be disabled explicitly for diagnostics.
   */
  readonly diurnalAberration?: false | DiurnalAberrationOptions;
  /** Atmospheric refraction is opt-in. */
  readonly refraction?: false | Atmosphere;
}

export interface PreparedAberrationContextV2 {
  readonly mode: Exclude<AberrationMode, "disabled">;
  readonly observerBarycentricVelocityC: Vector3;
  readonly reciprocalLorentzFactor: number;
  readonly solarPotentialWeight: number;
}

export type AberrationContextV2 =
  | {
      readonly mode: "disabled";
    }
  | PreparedAberrationContextV2;

export interface PreparedAnnualParallaxContextV2 {
  readonly mode: Exclude<AnnualParallaxMode, "disabled" | "unavailable">;
  readonly observerPositionAu: Vector3;
}

export type AnnualParallaxContextV2 =
  | {
      readonly mode: "disabled";
    }
  | PreparedAnnualParallaxContextV2;

export interface PreparedSolarLightDeflectionContextV2 {
  readonly mode: Exclude<SolarLightDeflectionMode, "disabled">;
  readonly sunToObserverUnitDirection: Vector3;
  readonly sunObserverDistanceAu: number;
  /** SOFA ldsun angular-separation limiter denominator. */
  readonly deflectionLimiter: number;
  /** Solar Schwarzschild radius divided by observer distance. */
  readonly gravitationalScale: number;
}

export type SolarLightDeflectionContextV2 =
  | {
      readonly mode: "disabled";
    }
  | PreparedSolarLightDeflectionContextV2;

export type RefractionContextV2 =
  | {
      readonly mode: "disabled";
    }
  | {
      readonly mode: "configured";
      readonly tangentCoefficient: number;
      readonly tangentCubedCoefficient: number;
      readonly minimumGeometricAltitudeDegrees: number;
    };

export type DiurnalAberrationMode = "disabled" | "wgs84-observer";

export type DiurnalAberrationContextV2 =
  | {
      readonly mode: "disabled";
    }
  | {
      readonly mode: "wgs84-observer";
      readonly heightMeters: number;
      readonly magnitude: number;
    };

export type PolarMotionMode = "disabled" | PolarMotionSource;

export interface PolarMotionContextV2 {
  readonly mode: PolarMotionMode;
  readonly xpRadians: number;
  readonly ypRadians: number;
  readonly xpReportedErrorRadians: number | null;
  readonly ypReportedErrorRadians: number | null;
  readonly tioLocatorRadians: number;
  readonly matrix: Matrix3;
}

export type SpaceMotionMode =
  "none" | "angular-proper-motion" | "three-dimensional";

export type ApproximateEarthEphemerisMode =
  | "truncated-vsop2000-heliocentric-earth"
  /** @deprecated Retained only for result compatibility with v2.0 callers. */
  | "jpl-approximate-earth-moon-barycenter";

export type AberrationMode =
  "disabled" | ApproximateEarthEphemerisMode | "caller-barycentric-velocity";

export type AnnualParallaxMode =
  | "disabled"
  | "unavailable"
  | ApproximateEarthEphemerisMode
  | "caller-observer-position";

export type SolarLightDeflectionMode =
  "disabled" | ApproximateEarthEphemerisMode | "caller-sun-observer-geometry";

export type RefractionMode = "disabled" | "applied" | "below-model-altitude";

export type PrecisionWarningCode =
  | "dut1-assumed-zero"
  | "pre-1972-utc-tt-approximation"
  | "future-leap-seconds-unknown"
  | "catalog-fk5-precision-limited"
  | "proper-motion-missing"
  | "radial-velocity-missing-assumed-zero"
  | "annual-parallax-disabled"
  | "annual-parallax-unavailable"
  | "annual-parallax-approximate-ephemeris"
  | "solar-light-deflection-disabled"
  | "solar-light-deflection-approximate-ephemeris"
  | "aberration-disabled"
  | "aberration-approximate-ephemeris"
  | "diurnal-aberration-disabled"
  | "observer-height-assumed-zero"
  | "polar-motion-assumed-zero"
  | "refraction-disabled"
  | "refraction-below-model-altitude";

/**
 * Immutable, reusable per-frame state. Create this once for an observation
 * date, location, and option set, then reuse it for every catalog star.
 */
export interface ApparentPositionContextV2 {
  readonly modelVersion: 2;
  readonly location: Readonly<{
    readonly latitude: number;
    readonly longitude: number;
    readonly timeZone: string;
    readonly name?: string;
  }>;
  readonly latitudeRadians: number;
  readonly longitudeRadians: number;
  readonly longitudeSine: number;
  readonly longitudeCosine: number;
  readonly latitudeSine: number;
  readonly latitudeCosine: number;
  readonly timeScales: ResolvedTimeScales;
  readonly precessionNutationMatrix: Matrix3;
  readonly greenwichApparentSiderealTime: number;
  readonly annualParallax: AnnualParallaxContextV2;
  readonly solarLightDeflection: SolarLightDeflectionContextV2;
  readonly aberration: AberrationContextV2;
  readonly diurnalAberration: DiurnalAberrationContextV2;
  readonly polarMotion: PolarMotionContextV2;
  readonly refraction: RefractionContextV2;
  readonly baseWarnings: readonly PrecisionWarningCode[];
}

export interface ApparentPositionMetadataV2 {
  readonly modelVersion: 2;
  readonly catalogFrame: "BSC5P J2000.0 FK5";
  readonly frameConnectionModel: "SOFA FK5-to-Hipparcos J2000 rotation and spin";
  readonly precessionModel: "IAU 2006 Fukushima-Williams";
  readonly nutationModel: "IAU 2000B 77-term";
  readonly siderealTimeModel: "IAU 2006 GMST + IAU 2000B leading equation of equinoxes";
  readonly spaceMotionMode: SpaceMotionMode;
  readonly annualParallaxMode: AnnualParallaxMode;
  readonly solarLightDeflectionMode: SolarLightDeflectionMode;
  readonly aberrationMode: AberrationMode;
  readonly diurnalAberrationMode: DiurnalAberrationMode;
  readonly polarMotionMode: PolarMotionMode;
  readonly refractionMode: RefractionMode;
  readonly omittedCorrections: readonly OmittedCorrection[];
  readonly timeScales: ResolvedTimeScales;
  readonly warnings: readonly PrecisionWarningCode[];
}

export interface LightweightApparentStarPositionV2 {
  readonly starHR: number;
  /** True equator/equinox-of-date apparent coordinates. */
  readonly apparentEquatorial: EquatorialCoordinates;
  /** Vacuum position relative to the observer's mathematical horizon. */
  readonly geometricHorizontal: HorizontalCoordinates;
  /** Equals geometricHorizontal unless optical refraction was applied. */
  readonly observedHorizontal: HorizontalCoordinates;
  readonly projection: ProjectedPoint;
  readonly spaceMotionMode: SpaceMotionMode;
  readonly radialVelocityAssumedZero: boolean;
  readonly annualParallaxMode: AnnualParallaxMode;
  readonly solarLightDeflectionMode: SolarLightDeflectionMode;
  readonly diurnalAberrationMode: DiurnalAberrationMode;
  readonly polarMotionMode: PolarMotionMode;
  readonly refractionMode: RefractionMode;
}

export interface ApparentSunPositionV2 {
  /**
   * Apparent geocentric direction on the true equator/equinox of date.
   * The default ephemeris is a documented 200-term VSOP2000 truncation.
   */
  readonly apparentEquatorial: EquatorialCoordinates;
  /**
   * Topocentric vacuum altitude/azimuth of the Sun's center, including the
   * WGS84 observing-site displacement and, when enabled, diurnal aberration.
   */
  readonly geometricHorizontal: HorizontalCoordinates;
  readonly projection: ProjectedPoint;
  readonly ephemerisMode: "truncated-vsop2000-heliocentric-earth";
  readonly aberrationMode: AberrationMode;
  readonly diurnalAberrationMode: DiurnalAberrationMode;
  readonly polarMotionMode: PolarMotionMode;
}

export type OmittedCorrection =
  | "annual-parallax"
  | "diurnal-parallax"
  | "solar-light-deflection"
  /** @deprecated Use the separate solar and planetary tokens. */
  | "solar-system-light-deflection"
  | "planetary-light-deflection"
  | "diurnal-aberration"
  | "polar-motion"
  | "subdaily-polar-motion-tides";

export interface ApparentStarPositionV2 extends LightweightApparentStarPositionV2 {
  /**
   * Hipparcos/ICRS-aligned barycentric astrometric direction after
   * propagation from the J2000 epoch, before annual parallax and aberration.
   */
  readonly astrometricJ2000: EquatorialCoordinates;
  readonly metadata: ApparentPositionMetadataV2;
}

export interface RefractionResult {
  readonly altitude: number;
  readonly mode: Exclude<RefractionMode, "disabled">;
}
