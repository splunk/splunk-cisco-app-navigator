#!/usr/bin/env python3
"""Stamp a packaged catalog copy; never stamp the tracked source catalog."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import sys

DEFAULT_CATALOG = Path(__file__).resolve().parent.parent / "src/main/resources/splunk/default/products.conf"
HEADER = re.compile(r"^#\s*version\s*=\s*(__CATALOG_VERSION__|\d{4}_\d{2}_\d{2}_\d{4})\s*$")


def stamp(path, now):
    if path.resolve() == DEFAULT_CATALOG.resolve():
        raise ValueError("Refusing to stamp the tracked source catalog; supply a package copy")
    content = path.read_bytes()
    first, separator, rest = content.partition(b"\n")
    line = first.rstrip(b"\r").decode("utf-8")
    match = HEADER.fullmatch(line)
    if not match:
        raise ValueError("Catalog must start with a version in YYYY_MM_DD_HHMM format")
    current = now.strftime("%Y_%m_%d_%H%M")
    if match.group(1) != '__CATALOG_VERSION__':
        previous = datetime.strptime(match.group(1), "%Y_%m_%d_%H%M").replace(tzinfo=timezone.utc)
        if current <= previous.strftime("%Y_%m_%d_%H%M"):
            raise ValueError("Current UTC minute is not later than the catalog version; wait or check the clock")
    ending = b"\r" if first.endswith(b"\r") else b""
    path.write_bytes(f"# version = {current}".encode() + ending + separator + rest)
    return current


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", type=Path)
    args = parser.parse_args()
    try:
        version = stamp(args.catalog, datetime.now(timezone.utc))
    except (OSError, UnicodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Catalog stamped {version}. Verify it is newer than the published S3 catalog before upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
