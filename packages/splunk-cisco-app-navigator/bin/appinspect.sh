#!/usr/bin/env bash
# Run Splunk AppInspect on the packaged app.
# Usage:  yarn run appinspect          (package + inspect)
#         bash bin/appinspect.sh       (same)
#         bash bin/appinspect.sh --quick   (skip packaging, use existing tar.gz)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="${SCRIPT_DIR}/.."
DIST_DIR="${PKG_ROOT}/../../dist"
APP_NAME="splunk-cisco-app-navigator"

# Read version from app.conf
APP_CONF="${PKG_ROOT}/src/main/resources/splunk/default/app.conf"
VERSION=$(grep -E '^\s*version\s*=' "$APP_CONF" | head -1 | sed 's/.*=\s*//' | xargs)
PKG_PATH="${DIST_DIR}/${APP_NAME}-${VERSION}.tar.gz"

# ── Pre-flight: validate products.conf for duplicate keys ──
echo "── Pre-flight: checking products.conf for duplicate keys..."
python3 -c "
import configparser, sys
p = configparser.ConfigParser(strict=True, interpolation=None)
try:
    p.read('${PKG_ROOT}/src/main/resources/splunk/default/products.conf')
    print('  ✓ No duplicate keys')
except configparser.DuplicateOptionError as e:
    print(f'  ✗ DUPLICATE KEY: {e}', file=sys.stderr)
    sys.exit(1)
except configparser.DuplicateSectionError as e:
    print(f'  ✗ DUPLICATE SECTION: {e}', file=sys.stderr)
    sys.exit(1)
"

# ── Package the app (unless --quick) ──
if [[ "$1" != "--quick" ]]; then
  echo "── Packaging app..."
  bash "${SCRIPT_DIR}/package_app.sh"
fi

if [[ ! -f "$PKG_PATH" ]]; then
  echo "ERROR: Package not found at ${PKG_PATH}" >&2
  exit 1
fi

# ── Verify no local.meta in package ──
echo "── Checking package for local.meta..."
if tar tzf "$PKG_PATH" | grep -q 'metadata/local.meta'; then
  echo "  ✗ FAIL: metadata/local.meta found in package!" >&2
  exit 1
else
  echo "  ✓ No local.meta in package"
fi

# ── Run AppInspect ──
echo "── Running splunk-appinspect on ${PKG_PATH}..."
if ! command -v splunk-appinspect &>/dev/null; then
  echo "ERROR: splunk-appinspect not installed. Run: pip3 install splunk-appinspect" >&2
  exit 1
fi

JSON_REPORT="${DIST_DIR}/${APP_NAME}-${VERSION}-appinspect.json"
HTML_REPORT="${DIST_DIR}/${APP_NAME}-${VERSION}-appinspect.html"

set +e
splunk-appinspect inspect "$PKG_PATH" \
  --mode precert \
  --included-tags cloud \
  --output-file "$JSON_REPORT" \
  2>&1
EXIT_CODE=$?
set -e

# ── Generate HTML report from JSON ──
if [[ -f "$JSON_REPORT" ]]; then
  echo "── Generating HTML report..."
  python3 "${SCRIPT_DIR}/appinspect_html_report.py" "$JSON_REPORT" "$HTML_REPORT"
  echo "  HTML: ${HTML_REPORT}"
fi

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ AppInspect passed"
else
  echo "✗ AppInspect found issues (exit code ${EXIT_CODE})"
fi
echo "  JSON: ${JSON_REPORT}"
echo "  HTML: ${HTML_REPORT}"
exit $EXIT_CODE
