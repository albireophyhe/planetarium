# IAU SOFA derived-work notice and software license

Selected TypeScript and Swift routines and a shared coefficient artifact and
generator in Planetarium use computations derived from the IAU SOFA ANSI C
release 2023-10-11. Planetarium is not software provided by or endorsed by
SOFA.

The derived routines differ from the originals in language, API shape, date
representation, error handling, and composition.

## TypeScript derived routines

- `precessionNutation.ts` adapts `nut00b`, `obl06`, `pfw06`, `fw2m`,
  `era00`, and `gmst06`. It combines IAU 2006 bias/precession with the
  abridged IAU 2000B nutation and uses only the leading equation-of-equinoxes
  term for apparent sidereal time.
- `earthEphemeris.ts`,
  `shared/ephemeris/truncated-earth-heliocentric.v1.json`, and
  `script/build_earth_ephemeris.mjs` adapt the Sun-to-Earth position series,
  orientation matrix, and analytic derivative in `epv00`. The artifact keeps
  100 of 1,323 heliocentric terms selected by the documented century-wide
  contribution bound. The generator accepts only the pinned official
  `epv00.c` with SHA-256
  `939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a`.
  The evaluator uses TT as a TDB proxy and omits the SSB-to-Sun position and
  velocity and the Earth-center-to-observing-site displacement.
- `aberration.ts` adapts the vector expression in `ab`; its default velocity
  is the analytic derivative of the truncated heliocentric `epv00` series,
  not the complete barycentric Earth velocity used by unmodified SOFA.
- `solarLightDeflection.ts` adapts the distant-source solar vector expression
  and near-Sun limiter in `ld` and `ldsun`. It accepts prepared Sun-to-observer
  geometry, adds strict finite and unit-vector validation, and explicitly
  normalizes the result. Its default geometry comes from Planetarium's
  100-term heliocentric `epv00` truncation; planetary-body deflection remains
  outside this routine.
- `refraction.ts` adapts `refco`, limits the public API to visual wavelengths,
  rejects values outside application guardrails, and numerically inverts the
  coefficient model to obtain observed altitude.
- `diurnalAberration.ts` derives the WGS84 observer rotation magnitude and
  geodetic-to-ITRS site position plus the conventional split-at-CIRS
  first-order direction update from `gd2gc`, `pvtob`, `apio`, and `atioq`.
  It accepts explicit ITRS and East-North-Up vectors, leaves Earth rotation,
  polar motion, and refraction to the surrounding pipeline, and normalizes
  the final direction instead of retaining `atioq`'s common first-order scale
  factor.
- `polarMotion.ts` adapts `sp00` and `pom00` into pure TypeScript functions
  for the approximate TIO locator and the terrestrial polar-motion matrix.
  Callers provide `xp` and `yp`; IERS lookup, interpolation, fallback policy,
  and the GAST-to-local composition remain in separate project code.
- `frameConnection.ts` adapts the J2000 rotation and spin in `fk5hip` and the
  Cartesian phase-space transformation in `fk52h`. It accepts already prepared
  Cartesian vectors so missing catalogue distance is never replaced by a
  synthetic parallax.
- `spaceMotion.ts` combines that frame connection with an independently
  written classical propagation rather than porting SOFA `starpv`, `starpm`,
  or `pvstar`. It deliberately omits their changing-light-time and
  special-relativistic catalogue/PV corrections; a 1900–2100 scan of 11,936
  positive-parallax/radial-velocity cases differed by at most 0.1465 mas in
  direction.

## Swift derived routines

- `PrecessionNutationV2.swift` adapts `nut00b`, `obl06`, `pfw06`, `fw2m`,
  `era00`, and `gmst06`. It combines IAU 2006 bias/precession with abridged
  IAU 2000B nutation and uses only the leading equation-of-equinoxes term for
  apparent sidereal time.
- `EarthEphemerisV2.swift` evaluates the same shared 100-term coefficient
  artifact derived from the Sun-to-Earth position series, orientation matrix,
  and analytic derivative in `epv00`. It uses TT as a TDB proxy and omits the
  SSB-to-Sun position and velocity and the Earth-center-to-observing-site
  displacement.
- `AberrationV2.swift` adapts the vector expression in `ab`; its default
  velocity is the analytic derivative of that truncated heliocentric series,
  not the complete barycentric Earth velocity used by unmodified SOFA.
- `SolarLightDeflectionV2.swift` adapts the distant-source solar vector
  expression and near-Sun limiter in `ld` and `ldsun`. It accepts prepared
  Sun-to-observer geometry, adds strict finite and unit-vector validation,
  and explicitly normalizes the result. Its default geometry comes from the
  shared 100-term heliocentric `epv00` truncation; planetary-body deflection
  remains outside this routine.
- `RefractionV2.swift` adapts `refco`, limits the public API to visual
  wavelengths, applies application guardrails, and numerically inverts the
  coefficient model to obtain observed altitude.
- `DiurnalAberrationV2.swift` derives the WGS84 observer rotation magnitude
  and geodetic-to-ITRS site position plus the conventional split-at-CIRS
  first-order direction update from `gd2gc`, `pvtob`, `apio`, and `atioq`.
  It accepts explicit ITRS and local East-North-Up vectors, leaves Earth
  rotation, polar motion, and refraction to the surrounding pipeline, and
  normalizes the final direction.
- `PolarMotionV2.swift` adapts `sp00` and `pom00` into pure Swift functions
  for the approximate TIO locator and the terrestrial polar-motion matrix.
  Callers provide `xp` and `yp`; IERS lookup, interpolation, fallback policy,
  and the GAST-to-local composition remain in separate project code.
- `FrameConnectionV2.swift` adapts the J2000 rotation and spin in `fk5hip`,
  the Cartesian phase-space connection in `fk52h`, and the `starpv`/`pvstar`
  catalogue conversions used for an official six-dimensional regression
  vector. Its app-facing Cartesian API preserves missing distance and radial
  velocity.
- `SpaceMotionV2.swift` combines that frame connection with independently
  written classical propagation rather than porting SOFA `starpm`. It omits
  the latter routine's changing-light-time and relativistic adjustments.
- `AnnualParallaxV2.swift` is an independently written Euclidean observer
  displacement and is not a SOFA-derived routine. Its default observer
  position is the shared truncated heliocentric Sun-to-Earth position, while
  callers can supply an SSB-to-site BCRS position.

Official release and license:

- https://www.iausofa.org/2023-10-11c
- https://www.iausofa.org/terms-and-conditions

## SOFA Software License

Copyright © 2023 International Astronomical Union Standards of Fundamental
Astronomy Board.

By using this software you accept the following six terms and conditions
which apply to its use.

1. The Software is owned by the IAU SOFA Board ("SOFA").

2. Permission is granted to anyone to use the SOFA software for any purpose,
   including commercial applications, free of charge and without payment of
   royalties, subject to the conditions and restrictions listed below.

3. You (the user) may copy and distribute SOFA source code to others, and use
   and adapt its code and algorithms in your own software, on a world-wide,
   royalty-free basis. That portion of your distribution that does not consist
   of intact and unchanged copies of SOFA source code files is a "derived
   work" that must comply with the following requirements:

   a. Your work shall be marked or carry a statement that it (i) uses routines
      and computations derived by you from software provided by SOFA under
      license to you; and (ii) does not itself constitute software provided by
      and/or endorsed by SOFA.

   b. The source code of your derived work must contain descriptions of how
      the derived work is based upon, contains and/or differs from the original
      SOFA software.

   c. The names of all routines in your derived work shall not include the
      prefix "iau" or "sofa" or trivial modifications thereof such as changes
      of case.

   d. The origin of the SOFA components of your derived work must not be
      misrepresented; you must not claim that you wrote the original software,
      nor file a patent application for SOFA software or algorithms embedded
      in the SOFA software.

   e. These requirements must be reproduced intact in any source distribution
      and shall apply to anyone to whom you have granted a further right to
      modify the source code of your derived work.

   Note that, as originally distributed, the SOFA software is intended to be a
   definitive implementation of the IAU standards, and consequently
   third-party modifications are discouraged. All variations, no matter how
   minor, must be explicitly marked as such, as explained above.

4. You shall not cause the SOFA software to be brought into disrepute, either
   by misuse, or use for inappropriate tasks, or by inappropriate modification.

5. The SOFA software is provided "as is" and SOFA makes no warranty as to its
   use or performance. SOFA does not and cannot warrant the performance or
   results which the user may obtain by using the SOFA software. SOFA makes no
   warranties, express or implied, as to non-infringement of third party
   rights, merchantability, or fitness for any particular purpose. In no event
   will SOFA be liable for any consequential, incidental, or special damages,
   including any lost profits or lost savings, even if a SOFA representative
   has been advised of such damages, or for any claim by any third party.

6. The provision of any version of the SOFA software under the terms and
   conditions specified herein does not imply that future versions will also
   be made available under the same terms and conditions.

Correspondence concerning SOFA software:

IAU SOFA Center
HM Nautical Almanac Office
UK Hydrographic Office
Admiralty Way, Taunton
Somerset TA1 2DN
United Kingdom
sofa@ukho.gov.uk
