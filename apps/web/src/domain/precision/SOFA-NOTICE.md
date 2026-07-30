# IAU SOFA derived-work notice (TypeScript)

The TypeScript routines in this directory use computations derived from the
IAU SOFA ANSI C release 2023-10-11. Planetarium is not software provided by
or endorsed by SOFA.

`earthEphemeris.ts` evaluates a project-specific truncation of SOFA `epv00`.
The canonical coefficient artifact is
`shared/ephemeris/truncated-earth-heliocentric.v1.json`; it retains 200 of
1,323 Sun-to-Earth position terms, selected by the documented century-wide
contribution bound. `script/build_earth_ephemeris.mjs` regenerates that
artifact only from the pinned official `epv00.c` whose SHA-256 is
`939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a`.
The TypeScript implementation evaluates the retained position series and its
analytic derivative, uses TT as a TDB proxy, and omits the SSB-to-Sun position
and velocity and the Earth-center-to-observing-site displacement. It is not
the unmodified SOFA routine or a complete BCRS observer ephemeris.

`diurnalAberration.ts` separately adapts the WGS84 geodetic-to-ITRS site
position and observer-rotation computations in `gd2gc`/`pvtob`, plus the
split-at-CIRS direction update in `apio`/`atioq`. The solar horizontal path
subtracts this terrestrial site vector only after the surrounding pipeline
has rotated the geocentric solar direction into ITRS; it does not turn the
truncated heliocentric Earth state into a complete BCRS observer ephemeris.

The TypeScript-specific differences are documented with each derived routine
and in the complete project-wide derived-work notice:

`shared/licenses/IAU-SOFA-derived-work-notice.md`

That canonical notice reproduces the complete SOFA Software License, including
all six terms and the correspondence address. The same file is copied into
the Web distribution at:

`licenses/IAU-SOFA-derived-work-notice.md`

Official release and license:

- https://www.iausofa.org/2023-10-11c
- https://www.iausofa.org/terms-and-conditions
