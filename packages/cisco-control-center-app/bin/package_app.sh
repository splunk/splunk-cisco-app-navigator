#!/usr/bin/env bash
# Create a .tar.gz package from stage/. Run from package root (e.g. yarn run package:app).
# Ensures stage exists (runs clean:build if not), then creates a tar.gz with the
# correct top-level directory name for Splunk installation.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="${SCRIPT_DIR}/.."
STAGE_DIR="${PKG_ROOT}/stage"
APP_NAME="cisco-control-center-app"
PKG_PATH="${PKG_ROOT}/${APP_NAME}.tar.gz"

if [[ ! -d "$STAGE_DIR" ]]; then
  echo "stage/ not found; running clean:build first..."
  bash "${SCRIPT_DIR}/clean_build.sh"
  node "${PKG_ROOT}/bin/build.js" build
fi

# Stage into a temp directory with the correct app directory name
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
cp -R "$STAGE_DIR" "${TMP_DIR}/${APP_NAME}"
find "${TMP_DIR}" -name ".DS_Store" -delete
# Remove Splunk-generated local/ directory — it should never ship in the package
rm -rf "${TMP_DIR}/${APP_NAME}/local"
# Strip macOS extended attributes to keep archive clean
xattr -cr "${TMP_DIR}/${APP_NAME}" 2>/dev/null || true

cd "$TMP_DIR"
# COPYFILE_DISABLE prevents macOS tar from embedding AppleDouble resource forks
COPYFILE_DISABLE=1 tar czf "$PKG_PATH" "$APP_NAME"
SIZE=$(du -h "$PKG_PATH" | cut -f1 | xargs)
echo "Created ${PKG_PATH} (${SIZE})"
