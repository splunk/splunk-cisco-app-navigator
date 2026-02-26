#!/usr/bin/env python3
"""
Audit sourcetypes in products.conf against cisco_apps.csv.

For each product in products.conf, looks up the addon, legacy_apps, and
community_apps folder names in the CSV `Folder_Name` column and unions
all their Sourcetypes.  Then compares that union with the sourcetypes
actually listed in products.conf and reports discrepancies.
"""

import csv
import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH  = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv")
CONF_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")

# ── Parse CSV ────────────────────────────────────────────────────────
def parse_csv():
    """Return dict: folder_name -> set of sourcetypes."""
    result = {}
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            folder = row.get("Folder_Name", "").strip()
            raw = row.get("Sourcetypes", "").strip()
            if folder:
                sts = set()
                if raw:
                    sts = {s.strip() for s in raw.split("|") if s.strip()}
                result[folder] = sts
    return result

# ── Parse products.conf ──────────────────────────────────────────────
def parse_products_conf():
    """Return list of dicts with stanza info."""
    products = []
    current = None
    with open(CONF_PATH, encoding="utf-8") as f:
        for line_no, raw_line in enumerate(f, 1):
            line = raw_line.strip()
            # stanza header
            m = re.match(r"^\[([^\]]+)\]$", line)
            if m:
                if current:
                    products.append(current)
                current = {
                    "stanza": m.group(1),
                    "line": line_no,
                    "addon": "",
                    "legacy_apps": "",
                    "community_apps": "",
                    "sourcetypes": "",
                    "display_name": "",
                    "status": "",
                }
                continue
            if current and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip()
                if key in current:
                    current[key] = val
    if current:
        products.append(current)
    return products

def folder_list(field_val):
    """Split comma-separated folder name list."""
    if not field_val.strip():
        return []
    return [s.strip() for s in field_val.split(",") if s.strip()]

def main():
    csv_data = parse_csv()
    products = parse_products_conf()

    print("=" * 100)
    print("SOURCETYPE AUDIT: products.conf vs cisco_apps.csv")
    print("=" * 100)

    issues = []
    ok_count = 0

    for prod in products:
        stanza = prod["stanza"]
        display = prod["display_name"] or stanza

        # Collect all related folder names
        folders = []
        if prod["addon"]:
            folders.append(prod["addon"])
        folders.extend(folder_list(prod["legacy_apps"]))
        folders.extend(folder_list(prod["community_apps"]))

        # Union of CSV sourcetypes from all related apps
        csv_sourcetypes = set()
        missing_folders = []
        for folder in folders:
            if folder in csv_data:
                csv_sourcetypes |= csv_data[folder]
            else:
                missing_folders.append(folder)

        # Current products.conf sourcetypes
        conf_raw = prod["sourcetypes"]
        conf_sourcetypes = set()
        if conf_raw:
            conf_sourcetypes = {s.strip() for s in conf_raw.split(",") if s.strip()}

        # Compare
        in_csv_not_conf = csv_sourcetypes - conf_sourcetypes
        in_conf_not_csv = conf_sourcetypes - csv_sourcetypes

        if not in_csv_not_conf and not in_conf_not_csv:
            ok_count += 1
            continue

        issue = {
            "stanza": stanza,
            "display": display,
            "status": prod["status"],
            "addon": prod["addon"],
            "folders": folders,
            "missing_folders": missing_folders,
            "csv_sourcetypes": sorted(csv_sourcetypes),
            "conf_sourcetypes": sorted(conf_sourcetypes),
            "in_csv_not_conf": sorted(in_csv_not_conf),
            "in_conf_not_csv": sorted(in_conf_not_csv),
        }
        issues.append(issue)

    print(f"\n✅ {ok_count} products OK (sourcetypes match CSV)")
    print(f"❌ {len(issues)} products have discrepancies\n")

    for i, iss in enumerate(issues, 1):
        print(f"\n{'─' * 80}")
        print(f"[{i}] {iss['display']}  (stanza: {iss['stanza']}, status: {iss['status']})")
        print(f"    addon: {iss['addon']}")
        if iss["missing_folders"]:
            print(f"    ⚠️  folders NOT in CSV: {iss['missing_folders']}")

        if iss["in_csv_not_conf"]:
            print(f"\n    MISSING from products.conf (in CSV but not in conf) [{len(iss['in_csv_not_conf'])}]:")
            for st in iss["in_csv_not_conf"]:
                print(f"      + {st}")

        if iss["in_conf_not_csv"]:
            print(f"\n    EXTRA in products.conf (in conf but not in CSV) [{len(iss['in_conf_not_csv'])}]:")
            for st in iss["in_conf_not_csv"]:
                print(f"      - {st}")

        # Build what the correct value should be
        correct = sorted(iss["csv_sourcetypes"])
        if correct:
            print(f"\n    CORRECT value should be:")
            print(f"      sourcetypes = {','.join(correct)}")
        else:
            print(f"\n    CSV has no sourcetypes for this product (may be correct)")

    # Summary: generate the fix
    print(f"\n\n{'=' * 100}")
    print("FIX SUMMARY — copy-paste ready sourcetypes lines")
    print("=" * 100)
    for iss in issues:
        if iss["in_csv_not_conf"] or iss["in_conf_not_csv"]:
            correct = sorted(iss["csv_sourcetypes"])
            print(f"\n[{iss['stanza']}]")
            print(f"sourcetypes = {','.join(correct)}")

if __name__ == "__main__":
    main()
