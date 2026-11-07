#!/usr/bin/env bash
# Publish a catalog from an explicitly selected package, using the validated helper.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat <<'HELP'
Usage: ./publish-catalog.sh PACKAGE [--publish] [--profile NAME]

Check or publish products.conf from a built App Navigator package.
Default: validate only; no upload. Run from any directory using this script's path.

Options:
  --publish        Replace s3://is4s/scan/products.conf and verify its contents.
                   No backup is created.
  --profile NAME   AWS CLI profile (default: catalog-publisher).
  -h, --help       Show this help without contacting AWS.

Examples (replace BUILD with your package's build number):
  ./publish-catalog.sh dist/splunk-cisco-app-navigator-1.0.33-BUILD.tar.gz
  ./publish-catalog.sh dist/splunk-cisco-app-navigator-1.0.33-BUILD.tar.gz --publish
  ./publish-catalog.sh /path/to/package.tar.gz --profile catalog-publisher --publish

Authentication:
  First-time setup: aws configure sso --profile catalog-publisher
  Login/renewal:    aws sso login --profile catalog-publisher
  Verify account:  aws sts get-caller-identity --profile catalog-publisher
  Expected account: 424205266756. SSO region: us-west-2. Bucket region: us-east-1.
  For a different --profile, use that name in the login commands too.

Requires Python 3 and AWS CLI v2. Package paths are relative to your current
working directory. Build first with ./build.sh; choose the exact archive to
publish. The repository template must not be uploaded. Checks reject stale
catalog timestamps and incompatible metadata. Concurrent S3 changes abort the
upload. If login works but access is denied, check your role's S3 permissions.
HELP
}

if [[ $# -eq 0 ]]; then
    usage
    exit 2
fi
for arg in "$@"; do
    case "$arg" in
        -h|--help) usage; exit 0 ;;
    esac
done
if ! command -v python3 >/dev/null 2>&1; then
    echo 'ERROR: Python 3 is required to validate and publish the packaged catalog.' >&2
    exit 1
fi
exec python3 "${ROOT_DIR}/tools/publish_catalog.py" "$@"
