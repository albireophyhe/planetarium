#!/bin/sh
set -eu

repository_root=$(
  CDPATH= cd -- "$(dirname -- "$0")/.." && pwd
)
cd "$repository_root"

if command -v asdf >/dev/null 2>&1; then
  web_node=$(
    ASDF_NODEJS_VERSION=24.18.0 asdf which node
  )
else
  web_node=$(command -v node)
fi
web_node_version=$("$web_node" --version)
if [ "$web_node_version" != "v24.18.0" ]; then
  echo "Web benchmark requires Node.js v24.18.0; found $web_node_version" >&2
  exit 2
fi

if [ "$#" -eq 0 ]; then
  set -- 2026 1932
fi

for benchmark_year in "$@"; do
  case "$benchmark_year" in
    *[!0-9]* | "")
      echo "Benchmark year must be an integer: $benchmark_year" >&2
      exit 2
      ;;
  esac
  if [ "$benchmark_year" -lt 1900 ] ||
    [ "$benchmark_year" -gt 2100 ]; then
    echo "Benchmark year must be from 1900 through 2100: $benchmark_year" >&2
    exit 2
  fi

  echo "Web annual event benchmark: $benchmark_year"
  (
    cd apps/web
    PLANETARIUM_EVENT_BENCHMARK_YEAR="$benchmark_year" \
      "$web_node" --expose-gc \
        ../../node_modules/vitest/vitest.mjs bench --run \
        src/domain/events/eventForecastYear.bench.ts \
        --pool=threads --maxWorkers=1
  )

  echo "macOS annual event benchmark: $benchmark_year"
  PLANETARIUM_EVENT_BENCHMARK_YEAR="$benchmark_year" \
    swift test -c release \
      --filter EventForecastPerformanceTests
done
