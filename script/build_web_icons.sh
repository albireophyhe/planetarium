#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/apps/web/public/favicon.svg"
PUBLIC_DIR="$ROOT_DIR/apps/web/public"
EXPECTED_SOURCE_SHA256="e3ed378c79aeb36a9e59f681c56206db498c6460fd2ddd5393a64ce26ac8b056"
EXPECTED_TOUCH_SHA256="4b3f95779de8f31d4c05b17313384bd30b771bd1d80805d531ed7fa8a85ac2ff"
EXPECTED_192_SHA256="757c6ce2c276b0e348a2d51fc103e889ff52b18194abf9f1e2741251fef66573"
EXPECTED_512_SHA256="6cda6749d5ad3b1bbe78f387bd6b1ff73d66617893d01f41a6a32b248ee139c9"
EXPECTED_RSVG_VERSION="rsvg-convert version 2.62.3"

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  echo "shasum or sha256sum is required" >&2
  return 1
}

verify_hashes() {
  [[ "$(sha256 "$SOURCE_ICON")" == "$EXPECTED_SOURCE_SHA256" ]]
  [[ "$(sha256 "$PUBLIC_DIR/apple-touch-icon.png")" == "$EXPECTED_TOUCH_SHA256" ]]
  [[ "$(sha256 "$PUBLIC_DIR/icon-192.png")" == "$EXPECTED_192_SHA256" ]]
  [[ "$(sha256 "$PUBLIC_DIR/icon-512.png")" == "$EXPECTED_512_SHA256" ]]
}

render_icon() {
  local output="$1"
  local size="$2"
  local rsvg_convert="$3"

  "$rsvg_convert" \
    --background-color '#030914' \
    --width "$size" \
    --height "$size" \
    --output "$output" \
    "$SOURCE_ICON"
}

reproduce_icons() (
  local rsvg_convert
  local work_dir

  rsvg_convert="$(command -v rsvg-convert || true)"
  if [[ -z "$rsvg_convert" ]]; then
    echo "rsvg-convert is required for --reproduce" >&2
    exit 1
  fi
  [[ "$("$rsvg_convert" --version | head -1)" == "$EXPECTED_RSVG_VERSION" ]]

  work_dir="$(mktemp -d)"
  trap 'rm -rf -- "$work_dir"' EXIT
  render_icon "$work_dir/apple-touch-icon.png" 180 "$rsvg_convert"
  render_icon "$work_dir/icon-192.png" 192 "$rsvg_convert"
  render_icon "$work_dir/icon-512.png" 512 "$rsvg_convert"

  cmp -s "$work_dir/apple-touch-icon.png" "$PUBLIC_DIR/apple-touch-icon.png"
  cmp -s "$work_dir/icon-192.png" "$PUBLIC_DIR/icon-192.png"
  cmp -s "$work_dir/icon-512.png" "$PUBLIC_DIR/icon-512.png"
)

case "${1:---check}" in
  --check)
    verify_hashes
    echo "Web app icons OK: source and 180/192/512 PNG hashes verified"
    ;;
  --reproduce)
    verify_hashes
    reproduce_icons
    echo "Web app icon reproducibility OK: librsvg 2.62.3 byte match"
    ;;
  *)
    echo "usage: $0 [--check|--reproduce]" >&2
    exit 2
    ;;
esac
