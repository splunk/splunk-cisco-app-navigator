#!/usr/bin/env python3
"""Analyze products.conf for archived add-ons/apps cross-referenced with CSV."""

import re
import csv
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS_CONF = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")
CSV_FILE = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv")

# Parse products.conf
stanzas = {}
current = None
with open(PRODUCTS_CONF) as f:
    for line in f:
        line = line.rstrip("\n")
        m = re.match(r"^\[(.+)\]", line)
        if m:
            current = m.group(1)
            stanzas[current] = {}
        elif current and "=" in line and not line.strip().startswith("#"):
            key, _, val = line.partition("=")
            stanzas[current][key.strip()] = val.strip()

# Parse CSV
csv_data = {}
with open(CSV_FILE) as f:
    reader = csv.DictReader(f)
    for row in reader:
        folder = row["Folder_Name"]
        csv_data[folder] = {
            "Archived": row.get("Archived", ""),
            "Archive_Status": row.get("Archive_Status", ""),
            "App_Name": row.get("App_Name", ""),
            "Splunkbase_ID": row.get("Splunkbase_ID", ""),
        }

# Check for archive-related fields in products.conf
all_keys = set()
for s in stanzas.values():
    all_keys.update(s.keys())

archive_keys = [k for k in sorted(all_keys) if "archiv" in k.lower() or "deprecat" in k.lower() or "status" in k.lower()]
print("=== Fields in products.conf related to archive/deprecation/status ===")
if archive_keys:
    for k in archive_keys:
        print(f"  {k}")
else:
    print("  (none found)")
print()

# List all products with /manager/ in any install URL
print("=" * 100)
print("=== ALL products with /manager/ install URLs (with archive cross-reference) ===")
print("=" * 100)

archived_products = []
live_products = []

for stanza in sorted(stanzas.keys()):
    fields = stanzas[stanza]
    addon_url = fields.get("addon_install_url", "")
    viz_url = fields.get("app_viz_install_url", "")
    viz2_url = fields.get("app_viz_2_install_url", "")

    has_manager = "/manager/" in addon_url or "/manager/" in viz_url or "/manager/" in viz2_url
    if not has_manager:
        continue

    addon = fields.get("addon", "")
    addon_sb = fields.get("addon_splunkbase_url", "")
    app_viz = fields.get("app_viz", "")
    app_viz_sb = fields.get("app_viz_splunkbase_url", "")
    app_viz_2 = fields.get("app_viz_2", "")
    app_viz_2_sb = fields.get("app_viz_2_splunkbase_url", "")

    addon_csv = csv_data.get(addon, {})
    viz_csv = csv_data.get(app_viz, {}) if app_viz else {}
    viz2_csv = csv_data.get(app_viz_2, {}) if app_viz_2 else {}

    any_archived = False
    
    entry = {
        "stanza": stanza,
        "addon": addon,
        "addon_install_url": addon_url,
        "addon_splunkbase_url": addon_sb,
        "addon_csv": addon_csv,
        "app_viz": app_viz,
        "app_viz_install_url": viz_url,
        "app_viz_splunkbase_url": app_viz_sb,
        "app_viz_csv": viz_csv,
        "app_viz_2": app_viz_2,
        "app_viz_2_install_url": viz2_url,
        "app_viz_2_splunkbase_url": app_viz_2_sb,
        "app_viz_2_csv": viz2_csv,
    }

    if addon_csv.get("Archived") == "true" or addon_csv.get("Archive_Status") in ("archived", "archived_manually"):
        any_archived = True
    if viz_csv.get("Archived") == "true" or viz_csv.get("Archive_Status") in ("archived", "archived_manually"):
        any_archived = True
    if viz2_csv.get("Archived") == "true" or viz2_csv.get("Archive_Status") in ("archived", "archived_manually"):
        any_archived = True

    if any_archived:
        archived_products.append(entry)
    else:
        live_products.append(entry)

def print_entry(e):
    print(f"  [{e['stanza']}]")
    addon_status = "N/A"
    if e["addon_csv"]:
        addon_status = f"Archived={e['addon_csv']['Archived']}, Archive_Status={e['addon_csv']['Archive_Status']}"
    print(f"    addon              = {e['addon']}")
    print(f"    addon_install_url  = {e['addon_install_url']}")
    print(f"    addon_splunkbase   = {e['addon_splunkbase_url']}")
    print(f"    addon CSV status   = {addon_status}")
    if e["addon_csv"]:
        print(f"    addon CSV name     = {e['addon_csv'].get('App_Name','')}")

    if "/manager/" in e["app_viz_install_url"]:
        viz_status = "N/A"
        if e["app_viz_csv"]:
            viz_status = f"Archived={e['app_viz_csv']['Archived']}, Archive_Status={e['app_viz_csv']['Archive_Status']}"
        print(f"    app_viz            = {e['app_viz']}")
        print(f"    app_viz_install_url = {e['app_viz_install_url']}")
        print(f"    app_viz_splunkbase = {e['app_viz_splunkbase_url']}")
        print(f"    app_viz CSV status = {viz_status}")
        if e["app_viz_csv"]:
            print(f"    app_viz CSV name   = {e['app_viz_csv'].get('App_Name','')}")

    if "/manager/" in e["app_viz_2_install_url"]:
        viz2_status = "N/A"
        if e["app_viz_2_csv"]:
            viz2_status = f"Archived={e['app_viz_2_csv']['Archived']}, Archive_Status={e['app_viz_2_csv']['Archive_Status']}"
        print(f"    app_viz_2          = {e['app_viz_2']}")
        print(f"    app_viz_2_install  = {e['app_viz_2_install_url']}")
        print(f"    app_viz_2_splunkbase = {e['app_viz_2_splunkbase_url']}")
        print(f"    app_viz_2 CSV stat = {viz2_status}")
    print()

print()
print(f"*** ARCHIVED add-ons/apps ({len(archived_products)} products) ***")
print("-" * 100)
for e in archived_products:
    print_entry(e)

print()
print(f"*** LIVE/NOT-ARCHIVED add-ons/apps ({len(live_products)} products) ***")
print("-" * 100)
for e in live_products:
    print_entry(e)

# Summary
print()
print("=" * 100)
print("=== SUMMARY: Products with ARCHIVED add-ons/apps in /manager/ URLs ===")
print("=" * 100)
for e in archived_products:
    parts = []
    if e["addon_csv"].get("Archived") == "true" or e["addon_csv"].get("Archive_Status") in ("archived", "archived_manually"):
        parts.append(f"addon={e['addon']} (ARCHIVED)")
    if e["app_viz_csv"].get("Archived") == "true" or e["app_viz_csv"].get("Archive_Status") in ("archived", "archived_manually"):
        parts.append(f"app_viz={e['app_viz']} (ARCHIVED)")
    if e["app_viz_2_csv"].get("Archived") == "true" or e["app_viz_2_csv"].get("Archive_Status") in ("archived", "archived_manually"):
        parts.append(f"app_viz_2={e['app_viz_2']} (ARCHIVED)")
    print(f"  [{e['stanza']}] -> {', '.join(parts)}")
