#!/usr/bin/env python3
"""
Splunk Configuration Audit: cisco_apps.csv vs Installed Apps
Cross-references the master CSV against actual app directories on the search head.

Audit Steps:
1. Parse cisco_apps.csv (appid, title, Notes, Documentation, Description fields)
2. List directories in /opt/splunk/etc/apps and /opt/splunk/etc/cisco-apps
3. Match CSV appid values to installed directories
4. Scan Notes/Documentation/Description for folder name references
5. Discover installed Cisco apps not in the CSV
6. Produce a final report table
"""

import csv
import os
import re
import sys
from collections import defaultdict

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                        'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')
APPS_DIR = '/opt/splunk/etc/apps'
CISCO_APPS_DIR = '/opt/splunk/etc/cisco-apps'

# ---------------------------------------------------------------------------
# 1. Load CSV
# ---------------------------------------------------------------------------
def load_csv(path):
    rows = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

# ---------------------------------------------------------------------------
# 2. List directories
# ---------------------------------------------------------------------------
def list_dirs(base):
    if not os.path.isdir(base):
        return set()
    return {d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))}

# ---------------------------------------------------------------------------
# 3. Cisco-relevant heuristic
# ---------------------------------------------------------------------------
CISCO_KEYWORDS = re.compile(
    r'cisco|meraki|duo|umbrella|asa|ise|estreamer|firepower|ftd|amp4e|'
    r'webex|thousandeyes|stealthwatch|secure.?endpoint|secure.?network|'
    r'appdynamics|intersight|dnacenter|catalyst|sdwan|tetration|'
    r'cloudlock|opendns|nvm|cybervision|talos|viptela|acacia|'
    r'splunk_ta_ccx|CiscoSecurityCloud|cisco.?app|ciscosecuritysuite|'
    r'sourcefire|canary|firewall|nexus|candid|Cisco_Bug|Cisco_DP|'
    r'Cisco_CWS|Cisco_WSA|sa_cisco|ta.?cisco|splunk.?cisco|'
    r'threat.?grid|threat.?response|secure.?malware|cdr|csc|sna|'
    r'relay.?module|tr.?splunk|ti.?cisco|lcs|CMX|logd_input|'
    r'eStreamer|firegen|SA.?sideview.?webex|SA.?teams|webex_alert|'
    r'spark.?room|spark.?app|splunk_app_stream',
    re.IGNORECASE
)

def is_cisco_related(name):
    return bool(CISCO_KEYWORDS.search(name))

# ---------------------------------------------------------------------------
# 4. Extract app-ID-like tokens from free text
# ---------------------------------------------------------------------------
TOKEN_RE = re.compile(r'[A-Za-z][A-Za-z0-9_-]{3,}')

def extract_appid_tokens(text):
    """Return set of lower-cased tokens that look like folder/appid names."""
    if not text:
        return set()
    return {m.group(0).lower() for m in TOKEN_RE.finditer(text)}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    csv_rows = load_csv(CSV_PATH)
    apps_dirs = list_dirs(APPS_DIR)
    cisco_dirs = list_dirs(CISCO_APPS_DIR)
    all_dirs = apps_dirs | cisco_dirs
    all_dirs_lower = {d.lower(): d for d in all_dirs}

    # Build lookup structures
    csv_by_appid = {}  # lower(appid) -> row
    csv_appids_orig = {}  # lower(appid) -> original appid
    for row in csv_rows:
        aid = row.get('appid', '').strip()
        if aid:
            csv_by_appid[aid.lower()] = row
            csv_appids_orig[aid.lower()] = aid

    # -----------------------------------------------------------------------
    # SECTION A — CSV appid direct match to installed directories
    # -----------------------------------------------------------------------
    print("=" * 100)
    print("SECTION A: CSV appid → Installed Directory Match")
    print("=" * 100)
    csv_installed = []
    csv_not_installed = []
    for aid_lower, row in sorted(csv_by_appid.items()):
        title = row.get('title', '')
        orig = csv_appids_orig[aid_lower]
        locations = []
        if aid_lower in {d.lower() for d in apps_dirs}:
            locations.append('apps/')
        if aid_lower in {d.lower() for d in cisco_dirs}:
            locations.append('cisco-apps/')
        # also try case-insensitive
        if not locations:
            for d in all_dirs:
                if d.lower() == aid_lower:
                    if d in apps_dirs:
                        locations.append(f'apps/{d}')
                    if d in cisco_dirs:
                        locations.append(f'cisco-apps/{d}')
        if locations:
            csv_installed.append((orig, title, ', '.join(locations)))
        else:
            csv_not_installed.append((orig, title))

    print(f"\n  Installed ({len(csv_installed)} of {len(csv_by_appid)}):")
    for appid, title, loc in csv_installed:
        print(f"    ✅  {appid:<55} {loc}")

    print(f"\n  NOT Installed ({len(csv_not_installed)} of {len(csv_by_appid)}):")
    for appid, title in csv_not_installed:
        print(f"    ⬜  {appid:<55} [{title}]")

    # -----------------------------------------------------------------------
    # SECTION B — Scan Notes/Documentation/Description for folder references
    # -----------------------------------------------------------------------
    print("\n" + "=" * 100)
    print("SECTION B: Text Field Scanning — References in Notes / Documentation / Description")
    print("=" * 100)
    text_refs = []  # (csv_appid, field_name, referenced_dir, dir_location)
    for row in csv_rows:
        aid = row.get('appid', '').strip()
        title = row.get('title', '')
        for field in ['notes', 'documentation', 'description']:
            text = row.get(field, '') or ''
            if not text:
                continue
            tokens = extract_appid_tokens(text)
            for tok in tokens:
                if tok in all_dirs_lower and tok != aid.lower():
                    actual_dir = all_dirs_lower[tok]
                    loc = []
                    if actual_dir in apps_dirs:
                        loc.append('apps/')
                    if actual_dir in cisco_dirs:
                        loc.append('cisco-apps/')
                    text_refs.append((aid, field, actual_dir, ', '.join(loc)))

    if text_refs:
        print(f"\n  Found {len(text_refs)} cross-references in text fields:\n")
        seen = set()
        for aid, field, ref_dir, loc in sorted(set(text_refs)):
            key = (aid, ref_dir)
            if key not in seen:
                seen.add(key)
                print(f"    CSV appid: {aid:<50} references dir: {ref_dir:<45} (in {loc}) [field: {field}]")
    else:
        print("\n  No cross-references to installed directories found in text fields.")

    # -----------------------------------------------------------------------
    # SECTION C — Installed Cisco apps NOT in CSV (Discovery)
    # -----------------------------------------------------------------------
    print("\n" + "=" * 100)
    print("SECTION C: Discovery — Installed Cisco-Related Apps NOT in cisco_apps.csv")
    print("=" * 100)

    csv_appids_set = set(csv_by_appid.keys())
    missing_from_csv = []

    for d in sorted(all_dirs):
        if d.lower() not in csv_appids_set and is_cisco_related(d):
            loc = []
            if d in apps_dirs:
                loc.append('apps/')
            if d in cisco_dirs:
                loc.append('cisco-apps/')
            # Try to read app.conf for label
            label = ''
            for base in [APPS_DIR, CISCO_APPS_DIR]:
                conf = os.path.join(base, d, 'default', 'app.conf')
                if os.path.isfile(conf):
                    try:
                        with open(conf) as f:
                            for line in f:
                                m = re.match(r'^\s*label\s*=\s*(.+)', line)
                                if m:
                                    label = m.group(1).strip()
                                    break
                    except:
                        pass
            missing_from_csv.append((d, ', '.join(loc), label))

    print(f"\n  Found {len(missing_from_csv)} Cisco-related directories NOT in CSV:\n")
    for d, loc, label in missing_from_csv:
        lbl = f' — "{label}"' if label else ''
        print(f"    🔍  {d:<55} (in {loc}){lbl}")

    # Also list non-Cisco dirs NOT in CSV for awareness
    non_cisco_not_in_csv = []
    for d in sorted(all_dirs):
        if d.lower() not in csv_appids_set and not is_cisco_related(d):
            loc = []
            if d in apps_dirs:
                loc.append('apps/')
            if d in cisco_dirs:
                loc.append('cisco-apps/')
            non_cisco_not_in_csv.append((d, ', '.join(loc)))

    if non_cisco_not_in_csv:
        print(f"\n  Non-Cisco directories also NOT in CSV ({len(non_cisco_not_in_csv)}):")
        for d, loc in non_cisco_not_in_csv:
            print(f"    ⚪  {d:<55} (in {loc})")

    # -----------------------------------------------------------------------
    # SECTION D — Final Summary Table
    # -----------------------------------------------------------------------
    print("\n" + "=" * 100)
    print("SECTION D: FINAL AUDIT REPORT")
    print("=" * 100)

    # Combine all entries into one table
    # Columns: Product/Folder | CSV Status | Directory Status | Action Required
    report = []

    # 1. CSV entries that ARE installed
    for appid, title, loc in csv_installed:
        report.append({
            'name': f"{title} ({appid})" if title else appid,
            'csv': '✅ In CSV',
            'dir': f'✅ Installed ({loc})',
            'action': 'None — matched'
        })

    # 2. CSV entries NOT installed
    for appid, title in csv_not_installed:
        report.append({
            'name': f"{title} ({appid})" if title else appid,
            'csv': '✅ In CSV',
            'dir': '⬜ Not Installed',
            'action': 'Review — not deployed on this SH'
        })

    # 3. Installed Cisco apps NOT in CSV
    for d, loc, label in missing_from_csv:
        display = f"{label} ({d})" if label else d
        report.append({
            'name': display,
            'csv': '❌ Not in CSV',
            'dir': f'✅ Installed ({loc})',
            'action': '⚠️  ADD to CSV'
        })

    # Print table
    col_w = [60, 15, 35, 35]
    hdr = ['Product / Folder', 'CSV Status', 'Directory Status', 'Action Required']
    print(f"\n  {'─' * sum(col_w)}")
    print(f"  {hdr[0]:<{col_w[0]}} {hdr[1]:<{col_w[1]}} {hdr[2]:<{col_w[2]}} {hdr[3]:<{col_w[3]}}")
    print(f"  {'─' * sum(col_w)}")

    # Sort: action items first
    def sort_key(r):
        if 'ADD' in r['action']:
            return (0, r['name'])
        if 'Review' in r['action']:
            return (1, r['name'])
        return (2, r['name'])

    for r in sorted(report, key=sort_key):
        name = r['name'][:col_w[0]-2]
        print(f"  {name:<{col_w[0]}} {r['csv']:<{col_w[1]}} {r['dir']:<{col_w[2]}} {r['action']:<{col_w[3]}}")

    print(f"  {'─' * sum(col_w)}")

    # Summary counts
    n_matched = len(csv_installed)
    n_not_installed = len(csv_not_installed)
    n_add = len(missing_from_csv)
    print(f"\n  SUMMARY:")
    print(f"    CSV Entries:           {len(csv_by_appid)}")
    print(f"    Matched (installed):   {n_matched}")
    print(f"    Not deployed on SH:    {n_not_installed}")
    print(f"    Missing from CSV:      {n_add}  ← action items")
    print(f"    Total directories:     {len(all_dirs)}  (apps/: {len(apps_dirs)}, cisco-apps/: {len(cisco_dirs)})")
    print()

if __name__ == '__main__':
    main()
