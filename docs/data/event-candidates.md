# Offline event candidate index

This directory contains small, deterministic search seeds for local event
solvers. It does not contain observer-specific circumstances and must not be
presented as a final prediction.

## Runtime contract

Load `event-candidates-manifest.v1.json`, choose the five-year chunk whose
half-open interval contains the requested year, then load that chunk only.
Every event provides:

- a stable `id`, event `kind`, classification hint, and TDB maximum seed;
- an intentionally broad ±18-hour refinement window;
- the physical inclusion limit and positive clearance at generation time;
- for lunar occultations, the bundled BSC5P HR target and display metadata.

The current index covers `1900-01-01` through `2101-01-01` (end exclusive)
and contains solar eclipses, lunar eclipses, and global candidates for lunar
occultations of bundled stars at visual magnitude 3.0 or brighter. Chunk
hashes and the pinned source hashes are in the manifest.

The application runtime performs no network request to JPL, NASA, or IOTA.
The checked-in files are sufficient for both Web and macOS builds.

## Reproduction and independent checks

Generate or reproduce the artifacts from the pinned JPL DE442s kernel:

```sh
node script/build_event_candidates.mjs --source /tmp/de442s.bsp
node script/build_event_candidates.mjs \
  --source /tmp/de442s.bsp \
  --check
```

The opt-in independent check downloads four official NASA catalog pages only
while the generator is running. It requires exact one-to-one event counts for
1901–2100 and compares every maximum seed:

```sh
node script/build_event_candidates.mjs \
  --source /tmp/de442s.bsp \
  --check \
  --verify-nasa
```

The reference catalogs are NASA's
[Five Millennium Catalog of Solar Eclipses](https://eclipse.gsfc.nasa.gov/SEcat5/SEcatalog.html)
and
[Five Millennium Catalog of Lunar Eclipses](https://eclipse.gsfc.nasa.gov/LEcat5/LEcatalog.html).
The fixture also checks the published
[2026 August 12 Besselian elements](https://eclipse.gsfc.nasa.gov/SEbeselm/SEbeselm2001/SE2026Aug12Tbeselm.html)
and the IOTA report of the
[2017 March 5 Aldebaran graze](https://occultations.org/publications/rasc/2025/nam25grz.htm).

## Accuracy boundary

Candidate seeds use direct Float64 evaluation of the pinned DE442s Type 2
SPK. Solar candidates use physical shadow cones and NASA's Besselian lunar
radius constants. Lunar candidates use the NASA/Danjon 1.01 shadow
enlargement. Occultation targets include BSC5P proper motion and the
SOFA-derived FK5-to-Hipparcos/ICRS frame connection.

The index deliberately uses mean lunar limbs, a broad spherical-Earth
inclusion test, and no atmosphere. Occultation candidates also use a
120-arcsecond margin because aberration, light time, catalog quantization,
perspective acceleration, topocentric geometry, and the lunar limb belong in
the runtime solver. Grazes therefore require explicit uncertainty and a
high-resolution limb profile before observational use.

The current NASA comparison has one classification-hint difference across
909 cataloged eclipses: the catalog's zero-duration annular eclipse of
1948-05-09 is tagged `hybrid` by the DE442s mean-limb path sampler. Its
predicted transition is below the documented 1.5 km boundary tolerance, so
the index preserves the uncertainty instead of forcing the historical label.
Event inclusion and maximum-seed matching are unaffected.
