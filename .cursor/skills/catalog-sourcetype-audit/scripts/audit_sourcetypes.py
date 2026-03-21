#!/usr/bin/env python3
"""
Catalog Sourcetype Audit

Compares sourcetypes declared in products.conf against what is actually
installed on-disk in each Splunk TA's default/ directory.

Usage:
    python3 .cursor/skills/catalog-sourcetype-audit/scripts/audit_sourcetypes.py

Outputs a categorised report to stdout.
"""

import configparser
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

PRODUCTS_CONF = os.path.join(
    os.path.dirname(__file__),
    "..", "..", "..", "..",
    "packages", "splunk-cisco-app-navigator",
    "src", "main", "resources", "splunk", "default", "products.conf",
)
PRODUCTS_CONF = os.path.normpath(PRODUCTS_CONF)

SPLUNK_APPS_DIR = "/opt/splunk/etc/apps"

SKIP_SOURCETYPES = {
    "syslog", "too_small", "default", "stash",
}

SKIP_PATTERNS = [
    re.compile(r"^splunktacisco"),
    re.compile(r"^ciscothousandeyes:"),
    re.compile(r"^cisco:sbg:"),         # internal Security Cloud telemetry
    re.compile(r"\*"),                   # wildcard patterns
    re.compile(r"\$\d"),                 # transform capture group refs ($1, $2)
    re.compile(r"^source::"),
    re.compile(r"^host::"),
    re.compile(r"^set_sourcetype_"),
    re.compile(r"^rule::"),
    re.compile(r"^lookup::"),
    re.compile(r"^delayedrule::"),
    re.compile(r"^ta[-_]"),             # TA-internal stanzas
    re.compile(r"^rfc\d+"),             # rfc5424_syslog etc.
]


def should_skip(sourcetype: str) -> bool:
    st_lower = sourcetype.lower().strip()
    if st_lower in SKIP_SOURCETYPES:
        return True
    for pat in SKIP_PATTERNS:
        if pat.search(st_lower):
            return True
    return False


def parse_products_conf(path: str):
    """Parse products.conf and return {product_id: {addon, sourcetypes set}}."""
    products = {}
    current = None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";") or line.startswith("#"):
                continue
            m = re.match(r"^\[(.+)\]$", line)
            if m:
                current = m.group(1)
                products[current] = {"addon": None, "sourcetypes": set()}
                continue
            if current and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip()
                if key == "addon":
                    products[current]["addon"] = val
                elif key == "sourcetypes":
                    products[current]["sourcetypes"] = {
                        s.strip() for s in val.split(",") if s.strip()
                    }
    return products


def extract_sourcetypes_from_dir(ta_dir: str) -> set:
    """Extract all sourcetypes from props.conf, inputs.conf, transforms.conf."""
    sourcetypes = set()
    default_dir = os.path.join(ta_dir, "default")
    if not os.path.isdir(default_dir):
        return sourcetypes

    # props.conf — stanza names are sourcetypes
    props_path = os.path.join(default_dir, "props.conf")
    if os.path.isfile(props_path):
        with open(props_path) as f:
            for line in f:
                m = re.match(r"^\[([^\]]+)\]", line.strip())
                if m:
                    sourcetypes.add(m.group(1))

    # inputs.conf — sourcetype = X
    inputs_path = os.path.join(default_dir, "inputs.conf")
    if os.path.isfile(inputs_path):
        with open(inputs_path) as f:
            for line in f:
                m = re.match(r"^\s*sourcetype\s*=\s*(.+)", line.strip())
                if m:
                    sourcetypes.add(m.group(1).strip())

    # transforms.conf — FORMAT = sourcetype::X
    transforms_path = os.path.join(default_dir, "transforms.conf")
    if os.path.isfile(transforms_path):
        with open(transforms_path) as f:
            for line in f:
                m = re.search(r"sourcetype::(\S+)", line)
                if m:
                    sourcetypes.add(m.group(1))

    return sourcetypes


def main():
    if not os.path.isfile(PRODUCTS_CONF):
        print(f"ERROR: products.conf not found at {PRODUCTS_CONF}", file=sys.stderr)
        sys.exit(1)

    products = parse_products_conf(PRODUCTS_CONF)

    # Group products by addon
    addon_groups = defaultdict(list)
    for pid, info in products.items():
        if info["addon"]:
            addon_groups[info["addon"]].append(pid)

    total_new = 0
    total_missing = 0
    total_case = 0

    for addon, pids in sorted(addon_groups.items()):
        ta_dir = os.path.join(SPLUNK_APPS_DIR, addon)
        if not os.path.isdir(ta_dir):
            print(f"\n=== ADDON: {addon} ({len(pids)} products) ===")
            print(f"  WARNING: TA directory not found at {ta_dir}")
            continue

        disk_sourcetypes = extract_sourcetypes_from_dir(ta_dir)
        disk_filtered = {st for st in disk_sourcetypes if not should_skip(st)}

        claimed_all = set()
        for pid in pids:
            claimed_all |= products[pid]["sourcetypes"]

        # Exact match comparison
        new_on_disk = disk_filtered - claimed_all
        missing_on_disk = claimed_all - disk_filtered

        # Case variant detection
        disk_lower = {st.lower(): st for st in disk_filtered}
        claimed_lower = {st.lower(): st for st in claimed_all}
        case_variants = []
        still_new = set()
        still_missing = set()

        for st in new_on_disk:
            if st.lower() in claimed_lower:
                case_variants.append(
                    (st, claimed_lower[st.lower()])
                )
            else:
                still_new.add(st)

        for st in missing_on_disk:
            if st.lower() in disk_lower:
                pass  # already captured as case variant
            else:
                still_missing.add(st)

        if not still_new and not still_missing and not case_variants:
            continue

        print(f"\n{'='*60}")
        print(f"ADDON: {addon} ({len(pids)} products)")
        print(f"Products: {', '.join(sorted(pids))}")
        print(f"{'='*60}")

        if still_new:
            total_new += len(still_new)
            print(f"\n  NEW on disk (not claimed by any product): [{len(still_new)}]")
            for st in sorted(still_new):
                best_match = None
                for pid in pids:
                    prefix = st.rsplit(":", 1)[0] if ":" in st else st
                    for claimed_st in products[pid]["sourcetypes"]:
                        if claimed_st.startswith(prefix):
                            best_match = pid
                            break
                    if best_match:
                        break
                suggestion = f"  →  Recommend adding to [{best_match}]" if best_match else ""
                print(f"    {st}{suggestion}")

        if still_missing:
            total_missing += len(still_missing)
            print(f"\n  MISSING on disk (claimed but not in TA): [{len(still_missing)}]")
            for st in sorted(still_missing):
                owner = [p for p in pids if st in products[p]["sourcetypes"]]
                print(f"    {st}  (claimed by: {', '.join(owner)})")

        if case_variants:
            total_case += len(case_variants)
            print(f"\n  CASE VARIANTS (informational): [{len(case_variants)}]")
            for disk_st, conf_st in sorted(case_variants):
                print(f"    disk: {disk_st}  vs  products.conf: {conf_st}")

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"  New on disk (action needed):    {total_new}")
    print(f"  Missing on disk (investigate):  {total_missing}")
    print(f"  Case variants (informational):  {total_case}")


if __name__ == "__main__":
    main()
