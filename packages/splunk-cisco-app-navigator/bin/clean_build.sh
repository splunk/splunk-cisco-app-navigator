#!/usr/bin/env bash
# Remove stage directory entirely for a clean build.
# Use --keep-local to preserve local/ (Splunk runtime conf overrides like custom_dashboard).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_DIR="${SCRIPT_DIR}/../stage"

if [[ -d "$STAGE_DIR" ]]; then
  if [[ "$1" == "--keep-local" && -d "$STAGE_DIR/local" ]]; then
    mv "$STAGE_DIR/local" /tmp/_scan_local_backup
  fi

  rm -rf "$STAGE_DIR"
  echo "Removed $STAGE_DIR"

  if [[ -d /tmp/_scan_local_backup ]]; then
    mkdir -p "$STAGE_DIR"
    mv /tmp/_scan_local_backup "$STAGE_DIR/local"
    echo "Restored $STAGE_DIR/local"
  fi
fi
