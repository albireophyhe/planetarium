# IAU SOFA derived-work notice (Swift)

The Swift routines in this directory use computations derived from the IAU
SOFA ANSI C release 2023-10-11. This project is not software provided by or
endorsed by SOFA.

The Swift derived routines differ from the originals in language, API shape,
date representation, error handling, and composition:

- `PrecessionNutationV2.swift` adapts the computations in `nut00b`, `obl06`,
  `pfw06`, `fw2m`, `era00`, and `gmst06`. It combines IAU 2006
  bias/precession with abridged IAU 2000B nutation and uses only the leading
  equation-of-equinoxes term for apparent sidereal time.
- `EarthEphemerisV2.swift` evaluates the shared 100-term coefficient artifact
  derived from the Sun-to-Earth position series, orientation matrix, and
  analytic derivative in `epv00`. It uses TT as a TDB proxy and omits the
  SSB-to-Sun position and velocity and the Earth-center-to-observing-site
  displacement.
- `AberrationV2.swift` adapts the vector expression in `ab`; its default
  velocity is the analytic derivative of that truncated heliocentric series,
  not the complete barycentric Earth velocity used by unmodified SOFA.
- `SolarLightDeflectionV2.swift` adapts the distant-source solar vector
  expression and near-Sun limiter in `ld` and `ldsun`. It accepts prepared
  Sun-to-observer geometry, validates finite unit-vector inputs, and
  explicitly normalizes the result. Its default geometry comes from the same
  shared 100-term heliocentric `epv00` truncation; planetary-body deflection
  remains outside this routine.
- `RefractionV2.swift` adapts `refco`, limits the public API to visual
  wavelengths, rejects values outside application guardrails, and numerically
  inverts the coefficient model to obtain observed altitude.
- `DiurnalAberrationV2.swift` adapts the WGS84 geodetic-to-ITRS site position
  and observer-velocity computations in `gd2gc`, `pvtob`, `apio`, and `atioq`
  into explicit ITRS and local East-North-Up corrections. It leaves polar
  motion, the TIO locator, Earth rotation, and refraction to the surrounding
  pipeline and normalizes corrected directions explicitly.
- `PolarMotionV2.swift` adapts `sp00` and `pom00` into pure Swift functions
  for the approximate TIO locator and the terrestrial polar-motion matrix.
  Callers supply `xp` and `yp`; IERS data lookup, interpolation, fallback
  policy, and the GAST-to-local composition remain in separate project code.
- `FrameConnectionV2.swift` adapts the J2000 rotation and spin in `fk5hip`,
  the Cartesian phase-space connection in `fk52h`, and the `starpv`/`pvstar`
  catalogue conversions used for the official six-dimensional regression
  vector. Its app-facing Cartesian API preserves missing distance and radial
  velocity instead of substituting a synthetic parallax.
- `SpaceMotionV2.swift` combines that frame connection with independently
  written classical propagation rather than porting SOFA `starpm`.
  Consequently it intentionally omits the latter routine's light-time and
  relativistic adjustments; the shared spherical-direction tolerance covers
  the measured catalogue-wide difference while still detecting an omitted
  FK5-to-Hipparcos connection.
- `AnnualParallaxV2.swift` is an independently written Euclidean observer
  displacement, not a SOFA-derived routine. Its default observer position is
  the shared truncated heliocentric Sun-to-Earth position used to prepare
  aberration, while callers can supply an SSB-to-site BCRS position.

The project-wide model description is
`docs/astronomy-model-v2.md`. The full SOFA Software License, including all
six terms and correspondence address, is reproduced intact in
`shared/licenses/IAU-SOFA-derived-work-notice.md` and applies to these derived
routines. The canonical notice is packaged in the macOS resource bundle as
`IAU-SOFA-derived-work-notice.md`. Official release and license:

- https://www.iausofa.org/2023-10-11c
- https://www.iausofa.org/terms-and-conditions
