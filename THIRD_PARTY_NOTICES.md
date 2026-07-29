# Third-party notices

Planetarium includes or bundles the following third-party software and data.
The entries below are notices, not replacements for the full license texts
shipped by the respective packages.

## IBM Plex Sans JP

- Project: <https://github.com/IBM/plex>
- Package: `@ibm/plex-sans-jp`
- Upstream copyright notice: Copyright © 2017 IBM Corp.
- License: SIL Open Font License 1.1
- Reserved font name: Plex
- Use in Planetarium: self-hosted Japanese interface typeface. The app-specific
  subset is a Modified Version renamed to "Planetarium Sans JP" in accordance
  with the Reserved Font Name condition. No font request is sent to an
  external service.
- Font metadata: the generated WOFF2 files retain the upstream copyright,
  license-description, license-URL, author, and trademark records. User-facing
  and technical family identifiers are renamed; the trademark record remains
  only as upstream legal metadata.
- Distributed license text:
  `apps/web/public/licenses/IBM-Plex-Sans-JP-OFL-1.1.txt`

## Three.js

- Project: <https://github.com/mrdoob/three.js>
- Package: `three`
- Copyright: © 2010–2026 three.js authors
- License: MIT
- Use in Planetarium: lazy-loaded WebGL celestial-sphere renderer.
- Distributed license text: `apps/web/public/licenses/three-MIT.txt`

## Bright Star Catalogue, 5th Revised Edition (Preliminary)

- Source and provenance: `shared/catalog/README.md`
- Upstream documentation:
  <https://heasarc.gsfc.nasa.gov/W3Browse/catalog/bsc5p.html>

## IERS Bulletin A Earth orientation data

- Product: `finals2000A.all`, normalized to the bundled DUT1 subset
- Producer: IERS Rapid Service/Prediction Center at the U.S. Naval
  Observatory
- Source, exact snapshot hashes, format, and update procedure:
  `shared/eop/README.md`
- Upstream distribution notice: “Distribution Statement A. Approved for
  public release: distribution unlimited.”
- Upstream distribution page:
  <https://maia.usno.navy.mil/products/daily>

## IAU SOFA

- Project: <https://www.iausofa.org/>
- Reference release: ANSI C 2023-10-11
- Copyright: © 2023 International Astronomical Union Standards of
  Fundamental Astronomy Board
- Use in Planetarium: selected TypeScript and Swift astronomy routines, plus
  the shared 100-term `epv00` coefficient artifact and its generator, are
  derived works based on SOFA computations. They are modified and do not
  constitute software provided by or endorsed by SOFA.
- Required derived-work description and complete license terms:
  `shared/licenses/IAU-SOFA-derived-work-notice.md`
- Platform-specific source notices:
  `apps/web/src/domain/precision/SOFA-NOTICE.md` and
  `apps/macos/Sources/PlanetariumCore/Astronomy/Precision/SOFA-NOTICE.md`
