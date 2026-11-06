#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
build_dir="$script_dir/build"

xattr -cr "$script_dir/vendor"

cmake -S "$script_dir" -B "$build_dir" -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
cmake --build "$build_dir" --config Release

xattr -cr "$build_dir"
find "$build_dir" -type f -name '*.dylib' -exec codesign --force --sign - {} \;
codesign --force --sign - "$build_dir/event-booth-sony-crsdk-bridge"

echo "Sony bridge ready: $build_dir/event-booth-sony-crsdk-bridge"
