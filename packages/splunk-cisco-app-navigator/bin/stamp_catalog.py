#!/usr/bin/env python3
"""Stamp a catalog revision before publication; does not upload it."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import sys

DEFAULT_CATALOG = Path(__file__).resolve().parent.parent / "src/main/resources/splunk/default/products.conf"
HEADER = re.compile(r"^#\s*version\s*=\s*(\d{4}_\d{2}_\d{2}_\d{4})\s*$")


def stamp(path, now):
    content = path.read_bytes()
    first, separator, rest = content.partition(b"\n")
    line = first.rstrip(b"\r").decode("utf-8")
    match = HEADER.fullmatch(line)
    if not match:
        raise ValueError("Catalog must start with a version in YYYY_MM_DD_HHMM format")
    previous = datetime.strptime(match.group(1), "%Y_%m_%d_%H%M").replace(tzinfo=timezone.utc)
    current = now.strftime("%Y_%m_%d_%H%M")
    if current <= previous.strftime("%Y_%m_%d_%H%M"):
        raise ValueError("Current UTC minute is not later than the catalog version; wait or check the clock")
    ending = b"\r" if first.endswith(b"\r") else b""
    path.write_bytes(f"# version = {current}".encode() + ending + separator + rest)
    return current


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", nargs="?", type=Path, default=DEFAULT_CATALOG)
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
