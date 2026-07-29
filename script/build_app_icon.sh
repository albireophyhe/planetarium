#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/apps/web/public/favicon.svg"
COMMITTED_ICON="$ROOT_DIR/apps/macos/Resources/Planetarium.icns"
EXPECTED_SOURCE_SHA256="e3ed378c79aeb36a9e59f681c56206db498c6460fd2ddd5393a64ce26ac8b056"
EXPECTED_ICON_SHA256="cf2374a1592f2de7129dc78cf1e67abb5ad7e299ac032859701d6725a2fe4457"
EXPECTED_RSVG_VERSION="rsvg-convert version 2.62.3"

sha256() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

verify_hashes() {
  [[ "$(sha256 "$SOURCE_ICON")" == "$EXPECTED_SOURCE_SHA256" ]]
  [[ "$(sha256 "$COMMITTED_ICON")" == "$EXPECTED_ICON_SHA256" ]]
}

verify_representations() (
  local representation_count
  local verification_dir

  verification_dir="$(mktemp -d)"
  trap '/bin/rm -rf -- "$verification_dir"' EXIT
  /usr/bin/iconutil \
    --convert iconset \
    --output "$verification_dir/Planetarium.iconset" \
    "$COMMITTED_ICON"
  representation_count="$(
    find "$verification_dir/Planetarium.iconset" \
      -maxdepth 1 \
      -type f \
      -name '*.png' \
      | /usr/bin/wc -l \
      | /usr/bin/tr -d ' '
  )"
  [[ "$representation_count" == "10" ]]
)

reproduce_icon() (
  local doubled
  local generated_icon
  local iconset_dir
  local rsvg_convert
  local size
  local work_dir

  rsvg_convert="$(command -v rsvg-convert || true)"
  if [[ -z "$rsvg_convert" ]]; then
    echo "rsvg-convert is required for --reproduce" >&2
    exit 1
  fi
  [[ "$("$rsvg_convert" --version | /usr/bin/head -1)" == "$EXPECTED_RSVG_VERSION" ]]

  work_dir="$(mktemp -d)"
  trap '/bin/rm -rf -- "$work_dir"' EXIT
  iconset_dir="$work_dir/Planetarium.iconset"
  generated_icon="$work_dir/Planetarium.icns"
  mkdir -p "$iconset_dir"

  for size in 16 32 128 256 512; do
    "$rsvg_convert" \
      --width "$size" \
      --height "$size" \
      --output "$iconset_dir/icon_${size}x${size}.png" \
      "$SOURCE_ICON"
    doubled=$((size * 2))
    "$rsvg_convert" \
      --width "$doubled" \
      --height "$doubled" \
      --output "$iconset_dir/icon_${size}x${size}@2x.png" \
      "$SOURCE_ICON"
  done

  /usr/bin/iconutil \
    --convert icns \
    --output "$generated_icon" \
    "$iconset_dir"
  /usr/bin/cmp -s "$generated_icon" "$COMMITTED_ICON"
)

case "${1:---check}" in
  --check)
    verify_hashes
    verify_representations
    echo "macOS app icon OK: source and 10 ICNS representations verified"
    ;;
  --reproduce)
    verify_hashes
    reproduce_icon
    echo "macOS app icon reproducibility OK: librsvg 2.62.3 byte match"
    ;;
  *)
    echo "usage: $0 [--check|--reproduce]" >&2
    exit 2
    ;;
esac
