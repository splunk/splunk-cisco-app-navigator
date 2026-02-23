#!/usr/bin/env bash
# Remove stage directory for a clean build, preserving local/ (Splunk runtime conf overrides).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_DIR="${SCRIPT_DIR}/../stage"
if [[ -d "$STAGE_DIR" ]]; then
  # Preserve local/ — it contains Splunk runtime overrides (e.g. custom_dashboard)
  if [[ -d "$STAGE_DIR/local" ]]; then
    mv "$STAGE_DIR/local" /tmp/_ccc_local_backup
  fi
  rm -rf "$STAGE_DIR"
  echo "Removed $STAGE_DIR"
  if [[ -d /tmp/_ccc_local_backup ]]; then
    mkdir -p "$STAGE_DIR"
    mv /tmp/_ccc_local_backup "$STAGE_DIR/local"
    echo "Restored $STAGE_DIR/local"
  fi
fi
