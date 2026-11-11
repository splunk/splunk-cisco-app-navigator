#!/usr/bin/env bash
# Create a .tar.gz package from stage/. Run from package root (e.g. yarn run package:app).
# Ensures stage exists (runs clean:build if not), then creates a tar.gz with the
# correct top-level directory name for Splunk installation.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="${SCRIPT_DIR}/.."
STAGE_DIR="${PKG_ROOT}/stage"
APP_NAME="splunk-cisco-app-navigator"
FROM_STAGE=0
MINIFY=0
ROOT_DIR="${PKG_ROOT}/../.."
VERSION_FILE="${ROOT_DIR}/VERSION"

usage() {
  cat <<EOF
Usage: bin/package_app.sh [--from-stage] [--minify]

Default behavior: clean stage/, run production webpack, then package stage/.

Options:
  --from-stage, --stage   Package the current stage/ directory without running
                          clean_build.sh or webpack. Useful when webpack --watch
                          is already maintaining stage/ and you still want to
                          create a tarball for splunkd install.
  --minify                Enable JavaScript minification for a smaller release
                          package. Not valid with --from-stage.
  -h, --help              Show this help.

Shared numbering outages prompt on the terminal for a coordinated manual number.
For unattended use, set NAVIGATOR_BUILD_NUMBER to an integer above known builds.
Manual numbers must be coordinated across developers; offline uniqueness is unverified.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-stage|--stage)
      FROM_STAGE=1
      shift
      ;;
    --minify)
      MINIFY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$FROM_STAGE" -eq 1 && "$MINIFY" -eq 1 ]]; then
  echo "ERROR: --minify and --from-stage are mutually exclusive." >&2
  exit 2
fi

# Read version from repo-root VERSION (source of truth)
if [[ ! -f "$VERSION_FILE" ]]; then
  echo "ERROR: VERSION file not found: ${VERSION_FILE}" >&2
  exit 1
fi
VERSION=$(tr -d '[:space:]' < "$VERSION_FILE")
if [[ -z "$VERSION" ]]; then
  echo "ERROR: VERSION file is empty: ${VERSION_FILE}" >&2
  exit 1
fi

DIST_DIR="${PKG_ROOT}/../../dist"
mkdir -p "$DIST_DIR"
# Guard the entire stage/build/package pipeline, not only tar creation.
LOCK_DIR=""
TMP_DIR=""
trap 'if [[ -n "$TMP_DIR" ]]; then rm -rf "$TMP_DIR"; fi; if [[ -n "$LOCK_DIR" ]]; then rmdir "$LOCK_DIR" 2>/dev/null || true; fi' EXIT
LOCK_DIR="${DIST_DIR}/.${APP_NAME}-build.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "ERROR: another package operation may be running; inspect ${LOCK_DIR}." >&2
  LOCK_DIR=""
  exit 1
fi

if [[ "$FROM_STAGE" -eq 1 ]]; then
  if [[ ! -d "$STAGE_DIR" ]]; then
    echo "ERROR: --from-stage requested but stage/ does not exist." >&2
    echo "       Run 'yarn run package:app' once, or keep 'yarn start' running until webpack has compiled." >&2
    exit 1
  fi
  echo "[package] using existing stage/ (--from-stage); skipping clean build and webpack"
else
  if [[ ! -d "$STAGE_DIR" ]]; then
    echo "stage/ not found; running clean:build first..."
  fi

  # Always run clean build (preserving local) to ensure package is fresh
  bash "${SCRIPT_DIR}/clean_build.sh"
  build_args=(build)
  if [[ "$MINIFY" -eq 1 ]]; then
    build_args+=(--minify)
  fi
  node "${PKG_ROOT}/bin/build.js" "${build_args[@]}"
fi

bash "${SCRIPT_DIR}/stamp_version.sh" "$STAGE_DIR"

# Stage into a temp directory with the correct app directory name
TMP_DIR="$(mktemp -d)"
cp -R "$STAGE_DIR" "${TMP_DIR}/${APP_NAME}"
# Stamp only the archive copy, including when reusing a watch-maintained stage.
python3 "${SCRIPT_DIR}/stamp_catalog.py" "${TMP_DIR}/${APP_NAME}/default/products.conf"
find "${TMP_DIR}" -name ".DS_Store" -delete
# Remove Splunk-generated runtime artifacts — they should never ship in the package.
# Because /opt/splunk/etc/apps/splunk-cisco-app-navigator symlinks to stage/,
# Splunk creates local.meta and local/ at runtime inside our build output.
rm -rf "${TMP_DIR}/${APP_NAME}/local"
rm -f  "${TMP_DIR}/${APP_NAME}/metadata/local.meta"

# Revert export = system → export = none for Splunkbase packaging
# (We use export = system in dev for REST conf-products refresh, but apps
#  should never export system-wide on customer instances)
META_FILE="${TMP_DIR}/${APP_NAME}/metadata/default.meta"
if [[ -f "$META_FILE" ]]; then
  sed -i '' 's/^export = system$/export = none/' "$META_FILE"
  echo "[package] default.meta: reverted export to 'none' for Splunkbase"
fi

# Reserve a shared or explicitly coordinated number for every new package.
# Failed attempts spend it; archives and installed metadata provide recovery floors.
PKG_APP_CONF="${TMP_DIR}/${APP_NAME}/default/app.conf"
new_build="$(python3 "${ROOT_DIR}/tools/reserve_package_build.py" \
  --receipts "${DIST_DIR}/build-reservations" \
  --app-conf "$PKG_APP_CONF" --floor-file "${ROOT_DIR}/BUILD_NUMBER_FLOOR" \
  --dist "$DIST_DIR" \
  --target-app-conf "${SPLUNK_HOME:-/opt/splunk}/etc/apps/${APP_NAME}/default/app.conf")"
python3 "${ROOT_DIR}/tools/reserve_package_build.py" --receipts "${DIST_DIR}/build-reservations" --claim "$new_build"
PKG_PATH="${DIST_DIR}/${APP_NAME}-${VERSION}-${new_build}.tar.gz"
if [[ -e "$PKG_PATH" ]]; then
  echo "ERROR: package already exists: ${PKG_PATH}" >&2
  exit 1
fi
# sed -i has different syntax on macOS (BSD) vs Linux (GNU). Detect once
# so this script keeps working in CI containers as well as on developer macs.
if sed --version >/dev/null 2>&1; then
  sed_i=( sed -i )
else
  sed_i=( sed -i '' )
fi
if [[ -f "$PKG_APP_CONF" ]] && grep -Eq '^\s*build\s*=' "$PKG_APP_CONF"; then
  "${sed_i[@]}" -E "s/^([[:space:]]*build[[:space:]]*=[[:space:]]*)[^[:space:]]+/\\1${new_build}/" "$PKG_APP_CONF"
  echo "[package] app.conf: stamped shared build ${new_build} (package only, source unchanged)"
else
  echo "ERROR: could not find build line in packaged app.conf" >&2
  exit 1
fi

# Provenance comment block above [install]. Helps debug "which commit
# produced this tarball" without untarring + diffing the whole tree.
# Git lookups are best-effort so the build still works in a tarball
# extracted outside a git checkout. Matches the convention used by
# ta_cisco_common/build.sh and field-solutions-demo-data-gen/package_app.sh.
BUILD_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
GIT_SHA=$(cd "$PKG_ROOT" && git rev-parse --short=12 HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(cd "$PKG_ROOT" && git diff --quiet 2>/dev/null && echo "" || echo "-dirty")
GIT_BRANCH=$(cd "$PKG_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_USER="${USER:-unknown}@$(hostname -s 2>/dev/null || echo unknown)"
PROVENANCE="# Built: ${BUILD_TS} commit ${GIT_SHA}${GIT_DIRTY} branch ${GIT_BRANCH} by ${BUILD_USER}"
# Insert the provenance line immediately before the first occurrence of
# [install]. awk is portable across BSD/GNU and avoids sed escaping headaches.
if [[ -f "$PKG_APP_CONF" ]]; then
  awk -v line="$PROVENANCE" '
    !inserted && /^\[install\]/ { print line; inserted=1 }
    { print }
  ' "$PKG_APP_CONF" > "${PKG_APP_CONF}.tmp" && mv "${PKG_APP_CONF}.tmp" "$PKG_APP_CONF"
fi

# Strip macOS extended attributes to keep archive clean
xattr -cr "${TMP_DIR}/${APP_NAME}" 2>/dev/null || true

cd "$TMP_DIR"
# COPYFILE_DISABLE prevents macOS tar from embedding AppleDouble resource forks
COPYFILE_DISABLE=1 tar czf "$PKG_PATH" "$APP_NAME"
SIZE=$(du -h "$PKG_PATH" | cut -f1 | xargs)
echo "Created ${PKG_PATH} (${SIZE})"
if [[ -n "${PACKAGE_PATH_FILE:-}" ]]; then
  printf '%s\n' "$PKG_PATH" > "$PACKAGE_PATH_FILE"
fi
