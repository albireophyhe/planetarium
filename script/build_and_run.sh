#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="Planetarium"
BUNDLE_ID="com.yjhe.Planetarium"
MIN_SYSTEM_VERSION="14.0"
SWIFT_CONFIGURATION="release"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"
INFO_PLIST_TEMPLATE="$ROOT_DIR/apps/macos/Resources/Info.plist"
APP_ICON="$APP_RESOURCES/Planetarium.icns"
APP_ICON_SOURCE="$ROOT_DIR/apps/macos/Resources/Planetarium.icns"
MACOS_BUDGETS="$ROOT_DIR/config/macos-budgets.json"
PACKAGED_RESOURCE_BUNDLE_NAME="Planetarium_PlanetariumShared.bundle"
PACKAGED_RESOURCE_BUNDLE="$APP_RESOURCES/$PACKAGED_RESOURCE_BUNDLE_NAME"

cd "$ROOT_DIR"

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

swift build -c "$SWIFT_CONFIGURATION" --product "$APP_NAME"
BUILD_DIR="$(swift build -c "$SWIFT_CONFIGURATION" --show-bin-path)"
BUILD_BINARY="$BUILD_DIR/$APP_NAME"
RESOURCE_BUNDLE="$BUILD_DIR/Planetarium_PlanetariumShared.bundle"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS" "$APP_RESOURCES"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"

# SwiftPM release products retain local symbols that are useful to LLDB but
# are not needed in a staged application. Strip them before signing so the
# distribution-size gate measures the same kind of binary users receive.
if [[ "$MODE" != "--debug" && "$MODE" != "debug" ]]; then
  /usr/bin/strip -x "$APP_BINARY"
fi

cp "$INFO_PLIST_TEMPLATE" "$INFO_PLIST"
cp "$APP_ICON_SOURCE" "$APP_ICON"

if [[ ! -d "$RESOURCE_BUNDLE" ]]; then
  echo "missing SwiftPM resource bundle: $RESOURCE_BUNDLE" >&2
  exit 1
fi
cp -R "$RESOURCE_BUNDLE" "$APP_RESOURCES/"

# SwiftPM can leave removed resources in an incremental build directory.
# Keep repository-only compatibility data and verification fixtures out of
# the staged application even when that cache predates Package.swift.
for resource_name in \
  astro-test-vectors.v1.json \
  astro-test-vectors.v2.json \
  bright-stars.v1.json \
  de442s-ephemeris.v1.json \
  eclipse-contact-position-angles.v1.json \
  event-candidates.v1.json \
  event-earth-rotation-model.v1.json \
  event-forecast-year-coverage.v1.json \
  nasa-lunar-eclipses-2021-2030.v1.json \
  nasa-solar-eclipses-2021-2030.v1.json \
  sofa-diurnal-aberration.v1.json \
  sofa-solar-light-deflection.v1.json \
  sofa-solar-position.v1.json
do
  /bin/rm -f -- "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
done

/usr/bin/codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

verify_staged_bundle() (
  local actual_resources_file
  local actual_bundle_size
  local actual_sha256
  local actual_size
  local excluded_path
  local expected_sha256
  local expected_size
  local expected_resources_file
  local inventory_dir
  local resource_path
  local resource_name
  local bundle_identifier
  local bundle_icon_file
  local minimum_system_version
  local maximum_bundle_size

  inventory_dir="$(mktemp -d)"
  trap '/bin/rm -rf -- "$inventory_dir"' EXIT
  actual_resources_file="$inventory_dir/actual-resources.txt"
  expected_resources_file="$inventory_dir/expected-resources.txt"

  test -x "$APP_BINARY"
  /usr/bin/plutil -lint "$INFO_PLIST" >/dev/null

  bundle_identifier="$(
    /usr/bin/plutil -extract CFBundleIdentifier raw -o - "$INFO_PLIST"
  )"
  bundle_icon_file="$(
    /usr/bin/plutil -extract CFBundleIconFile raw -o - "$INFO_PLIST"
  )"
  minimum_system_version="$(
    /usr/bin/plutil -extract LSMinimumSystemVersion raw -o - "$INFO_PLIST"
  )"
  [[ "$bundle_identifier" == "$BUNDLE_ID" ]]
  [[ "$bundle_icon_file" == "Planetarium.icns" ]]
  [[ "$minimum_system_version" == "$MIN_SYSTEM_VERSION" ]]
  test -s "$APP_ICON"
  /usr/bin/cmp -s "$APP_ICON_SOURCE" "$APP_ICON"
  "$ROOT_DIR/script/build_app_icon.sh" --check

  /usr/bin/codesign --verify --deep --strict "$APP_BUNDLE"

  for resource_name in \
    cities.v1.json \
    constellations.v1.json \
    star-names.v1.json
  do
    test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
    /usr/bin/jq -e \
      '.schemaVersion == 1' \
      "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null
  done

  resource_name="de442s-manifest.v1.json"
  test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
  /usr/bin/jq -e \
    '.schemaVersion == 1
      and .model == "jpl-de442s-type2-float32"
      and .source.sha256 == "54d97562a5b094d298b1b8eafa5a2e17e3e010ce85e1a366d07f003ad159323c"
      and .coverage.startJulianDateTdb == 2415020.5
      and .coverage.endJulianDateTdb == 2488434.5
      and (.chunks | length) == 41
      and ([.chunks[].byteLength] | add)
        == .statistics.totalChunkBytes' \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null

  while IFS=$'\t' read -r resource_name expected_size expected_sha256; do
    resource_path="$PACKAGED_RESOURCE_BUNDLE/chunks/$resource_name"
    test -s "$resource_path"
    actual_size="$(/usr/bin/stat -f '%z' "$resource_path")"
    [[ "$actual_size" == "$expected_size" ]]
    actual_sha256="$(
      /usr/bin/shasum -a 256 "$resource_path" |
        /usr/bin/awk '{ print $1 }'
    )"
    [[ "$actual_sha256" == "$expected_sha256" ]]
  done < <(
    /usr/bin/jq -r \
      '.chunks[]
        | [(.file | split("/")[-1]), .byteLength, .sha256]
        | @tsv' \
      "$PACKAGED_RESOURCE_BUNDLE/de442s-manifest.v1.json"
  )

  resource_path="$PACKAGED_RESOURCE_BUNDLE/events/event-candidates-manifest.v1.json"
  test -s "$resource_path"
  /usr/bin/jq -e \
    '.schemaVersion == 1
      and .model == "de442s-mean-sphere-eclipse-candidates-v1"
      and .source.kernelSha256
        == "54d97562a5b094d298b1b8eafa5a2e17e3e010ce85e1a366d07f003ad159323c"
      and .coverage.startYear == 1900
      and .coverage.endYear == 2101
      and .coverage.endIsExclusive == true
      and .statistics.chunkCount == 41
      and (.chunks | length) == .statistics.chunkCount
      and ([.chunks[].eventCount] | add)
        == .statistics.eventCount
      and ([.chunks[].solarEclipseCount] | add)
        == .statistics.solarEclipseCount
      and ([.chunks[].lunarEclipseCount] | add)
        == .statistics.lunarEclipseCount
      and ([.chunks[].lunarOccultationCount] | add)
        == .statistics.lunarOccultationCount
      and ([.chunks[].byteLength] | add)
        == .statistics.totalChunkBytes' \
    "$resource_path" >/dev/null

  expected_sha256="$(
    /usr/bin/jq -r \
      '.manifestSha256' \
      "$ROOT_DIR/shared/fixtures/event-candidates.v1.json"
  )"
  actual_sha256="$(
    /usr/bin/shasum -a 256 "$resource_path" |
      /usr/bin/awk '{ print $1 }'
  )"
  [[ "$actual_sha256" == "$expected_sha256" ]]

  while IFS=$'\t' read -r resource_name expected_size expected_sha256; do
    resource_path="$PACKAGED_RESOURCE_BUNDLE/events/chunks/$resource_name"
    test -s "$resource_path"
    actual_size="$(/usr/bin/stat -f '%z' "$resource_path")"
    [[ "$actual_size" == "$expected_size" ]]
    actual_sha256="$(
      /usr/bin/shasum -a 256 "$resource_path" |
        /usr/bin/awk '{ print $1 }'
    )"
    [[ "$actual_sha256" == "$expected_sha256" ]]
  done < <(
    /usr/bin/jq -r \
      '.chunks[]
        | [(.file | split("/")[-1]), .byteLength, .sha256]
        | @tsv' \
      "$PACKAGED_RESOURCE_BUNDLE/events/event-candidates-manifest.v1.json"
  )

  resource_name="bright-stars.v2.json"
  test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
  /usr/bin/jq -e \
    '.schemaVersion == 2' \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null

  resource_name="truncated-earth-heliocentric.v1.json"
  test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
  /usr/bin/jq -e \
    '.schemaVersion == 1
      and .model == "truncated-vsop2000-earth-heliocentric"
      and .source.release == "IAU SOFA ANSI C 2023-10-11"
      and .source.sourceRoutine == "epv00"
      and .source.sourceFileSha256 == "939d57fb2556dcd065370e090df962a7d459a89d972e7fe1b9b250306fe73c8a"
      and .source.archiveSha256 == "d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2"
      and .truncation.fullTermCount == 1323
      and .truncation.retainedTermCount == 200
      and ([
        .series.e0x, .series.e0y, .series.e0z,
        .series.e1x, .series.e1y, .series.e1z,
        .series.e2x, .series.e2y, .series.e2z
      ] | map(length)) == [90, 88, 6, 4, 4, 3, 2, 2, 1]
      and .bcrsOrientationMatrix == [
        [1, 2.11284e-7, -9.1603e-8],
        [-2.30286e-7, 0.917482137087, -0.397776982902],
        [0, 0.397776982902, 0.917482137087]
      ]
      and ([
        .series.e0x, .series.e0y, .series.e0z,
        .series.e1x, .series.e1y, .series.e1z,
        .series.e2x, .series.e2y, .series.e2z
      ] | map(length) | add) == 200' \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null

  resource_name="IAU-SOFA-derived-work-notice.md"
  test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
  /usr/bin/grep -F \
    "Planetarium is not software provided by or endorsed by" \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null
  /usr/bin/grep -Fx \
    "SOFA." \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null
  /usr/bin/grep -F \
    "6. The provision of any version of the SOFA software" \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null

  resource_name="iers-finals2000a-eop.v1.json"
  test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
  /usr/bin/jq -e \
    '.schemaVersion == 1
      and (.chunks | length) >= 1
      and (.chunks | length) <= 16
      and .coverage.recordCount >= 1
      and .coverage.lastSampleMjdUtc
        == (.coverage.firstSampleMjdUtc
          + .coverage.recordCount - 1)
      and ([.chunks[].recordCount] | add)
        == .coverage.recordCount
      and ([.chunks[].polarMotionIersCount] | add)
        == .coverage.polarMotion.iersCount
      and ([.chunks[].polarMotionPredictedCount] | add)
        == .coverage.polarMotion.predictedCount
      and ([.chunks[].dut1IersCount] | add)
        == .coverage.dut1.iersCount
      and ([.chunks[].dut1PredictedCount] | add)
        == .coverage.dut1.predictedCount' \
    "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null

  while IFS= read -r resource_name; do
    test -s "$PACKAGED_RESOURCE_BUNDLE/$resource_name"
    /usr/bin/jq -e \
      '.schemaVersion == 1
        and .recordCount >= 1
        and .recordCount <= 4096' \
      "$PACKAGED_RESOURCE_BUNDLE/$resource_name" >/dev/null
  done < <(
    /usr/bin/jq -r \
      '.chunks[].file | split("/")[-1]' \
      "$PACKAGED_RESOURCE_BUNDLE/iers-finals2000a-eop.v1.json"
  )

  excluded_path="$(
    find "$PACKAGED_RESOURCE_BUNDLE" \
      \( \
        -name 'iers-finals2000a-dut1.v1.json' \
        -o -name 'iers-finals2000a-dut1.lock.v1.json' \
        -o -name 'iers-finals2000a-eop.lock.v1.json' \
        -o -name 'finals2000A.all' \
        -o -name 'finals2000A.snapshot.v1.json' \
        -o -name 'readme.finals2000A' \
        -o -name 'checksums.sha512' \
        -o -name 'de442s.bsp' \
      \) \
      -print \
      -quit
  )"
  [[ -z "$excluded_path" ]]

  test -s "$PACKAGED_RESOURCE_BUNDLE/Info.plist"
  /usr/bin/plutil -lint \
    "$PACKAGED_RESOURCE_BUNDLE/Info.plist" >/dev/null

  {
    printf '%s\n' \
      "Planetarium.icns" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/Info.plist" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/IAU-SOFA-derived-work-notice.md" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/bright-stars.v2.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/cities.v1.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/constellations.v1.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/de442s-manifest.v1.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/events/event-candidates-manifest.v1.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/iers-finals2000a-eop.v1.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/star-names.v1.json" \
      "$PACKAGED_RESOURCE_BUNDLE_NAME/truncated-earth-heliocentric.v1.json"
    while IFS= read -r resource_name; do
      printf '%s\n' \
        "$PACKAGED_RESOURCE_BUNDLE_NAME/$resource_name"
    done < <(
      /usr/bin/jq -r \
        '.chunks[].file | split("/")[-1]' \
      "$PACKAGED_RESOURCE_BUNDLE/iers-finals2000a-eop.v1.json"
    )
    while IFS= read -r resource_name; do
      printf '%s\n' \
        "$PACKAGED_RESOURCE_BUNDLE_NAME/chunks/$resource_name"
    done < <(
      /usr/bin/jq -r \
        '.chunks[].file | split("/")[-1]' \
        "$PACKAGED_RESOURCE_BUNDLE/de442s-manifest.v1.json"
    )
    while IFS= read -r resource_name; do
      printf '%s\n' \
        "$PACKAGED_RESOURCE_BUNDLE_NAME/events/chunks/$resource_name"
    done < <(
      /usr/bin/jq -r \
        '.chunks[].file | split("/")[-1]' \
        "$PACKAGED_RESOURCE_BUNDLE/events/event-candidates-manifest.v1.json"
    )
  } | LC_ALL=C sort >"$expected_resources_file"

  while IFS= read -r resource_path; do
    printf '%s\n' \
      "${resource_path#"$APP_RESOURCES"/}"
  done < <(
    find "$APP_RESOURCES" \
      -mindepth 1 \
      ! -type d \
      -print
  ) | LC_ALL=C sort >"$actual_resources_file"

  if ! /usr/bin/cmp -s \
    "$expected_resources_file" \
    "$actual_resources_file"
  then
    echo \
      "unexpected or missing files in app Resources" \
      >&2
    /usr/bin/diff -u \
      "$expected_resources_file" \
      "$actual_resources_file" >&2 || true
    exit 1
  fi

  maximum_bundle_size="$(
    /usr/bin/jq -er \
      'select(
        .schemaVersion == 1
        and (.maximumLogicalAppBytes | type) == "number"
        and .maximumLogicalAppBytes > 0
        and .maximumLogicalAppBytes <= 9007199254740991
        and (.maximumLogicalAppBytes | floor)
          == .maximumLogicalAppBytes
      ) | .maximumLogicalAppBytes' \
      "$MACOS_BUDGETS"
  )"
  actual_bundle_size=0
  while IFS= read -r -d '' resource_path; do
    actual_size="$(/usr/bin/stat -f '%z' "$resource_path")"
    actual_bundle_size=$((actual_bundle_size + actual_size))
  done < <(find "$APP_BUNDLE" -type f -print0)

  if ((actual_bundle_size > maximum_bundle_size)); then
    echo \
      "app logical size ${actual_bundle_size} bytes exceeds budget ${maximum_bundle_size} bytes" \
      >&2
    exit 1
  fi
  echo \
    "app logical size: ${actual_bundle_size}/${maximum_bundle_size} bytes"
)

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    verify_staged_bundle
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    echo "verified $APP_BUNDLE"
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
