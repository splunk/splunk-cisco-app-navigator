#!/usr/bin/env python3
"""
Scan /opt/splunk/etc/apps and /opt/splunk/etc/cisco-apps for sourcetypes
defined in props.conf [stanza] headers, then compare with products.conf.

Goal: Each product in products.conf should list ONLY the sourcetypes
specific to that product — not the entire addon's sourcetypes when the
addon is shared across multiple products.

Strategy:
  1. Scan installed apps' props.conf for actual sourcetype definitions
  2. Compare with cisco_apps.csv Sourcetypes column
  3. Compare with products.conf sourcetypes field
  4. Report discrepancies per-product
"""
import os
import re
import csv
import sys

APPS_DIRS = ["/opt/splunk/etc/apps", "/opt/splunk/etc/cisco-apps"]
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv")
CONF_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")


def is_sourcetype_stanza(stanza):
    """Check if a props.conf stanza looks like a sourcetype."""
    if '::' in stanza:
        return False
    skip = [
        r'^default$', r'^eventtype', r'^delayedrule', r'^rule::',
        r'^transforms', r'^report_', r'^lookup:', r'^access_combined',
        r'^stash', r'^mongod', r'^searches-', r'^json_', r'^python-',
        r'^ms:', r'^http_event', r'^search_telemetry', r'^scheduler',
        r'^metrics', r'^too_small', r'^kvstore', r'^WinEventLog',
        r'^XmlWinEventLog', r'^windows', r'^perfmon', r'^admon',
        r'^spool', r'^_json', r'^_raw', r'^fs_notification',
        r'^otel_', r'^lsof',
    ]
    for pat in skip:
        if re.match(pat, stanza, re.IGNORECASE):
            return False
    return True


def scan_props_conf(filepath):
    """Extract sourcetype stanza names from a props.conf file.

    Rename-aware: if a stanza has ``rename = <target>``, the stanza name
    is NOT a real sourcetype — only the rename target is.  Case-only
    renames (old.lower() == new.lower()) still count as real sourcetypes.
    """
    sourcetypes = set()
    try:
        # Two-pass: first collect stanzas and their key/value pairs
        stanza_kvs = {}  # stanza_name -> list of (key, value)
        current = None
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                m = re.match(r'^\[([^\]]+)\]', line)
                if m:
                    current = m.group(1).strip()
                    if current not in stanza_kvs:
                        stanza_kvs[current] = []
                    continue
                if current and '=' in line:
                    key, _, val = line.partition('=')
                    stanza_kvs[current].append((key.strip().lower(), val.strip()))

        for st, kvs in stanza_kvs.items():
            if not is_sourcetype_stanza(st):
                continue
            rename_val = None
            for k, v in kvs:
                if k == 'rename':
                    rename_val = v
                    break
            if rename_val:
                # Stanza is renamed — only include the target if it
                # differs from the stanza name (case-insensitive).
                # If same after lowering it's just a case normalisation
                # and the lowered form IS the real sourcetype.
                if rename_val.lower() != st.lower():
                    sourcetypes.add(rename_val)
                else:
                    sourcetypes.add(st)
            else:
                sourcetypes.add(st)
    except Exception:
        pass
    return sourcetypes


def scan_apps():
    """Scan all apps dirs and return dict: folder_name -> set(sourcetypes)."""
    result = {}
    for apps_dir in APPS_DIRS:
        if not os.path.isdir(apps_dir):
            continue
        for app_folder in sorted(os.listdir(apps_dir)):
            app_path = os.path.join(apps_dir, app_folder)
            if not os.path.isdir(app_path):
                continue
            sts = set()
            for subdir in ['default', 'local']:
                props = os.path.join(app_path, subdir, 'props.conf')
                if os.path.isfile(props):
                    sts |= scan_props_conf(props)
            if app_folder in result:
                result[app_folder] |= sts
            else:
                result[app_folder] = sts
    return result


def parse_csv():
    """Return dict: folder_name -> set of CSV sourcetypes."""
    result = {}
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            folder = row.get('Folder_Name', '').strip()
            raw = row.get('Sourcetypes', '').strip()
            if folder:
                sts = {s.strip() for s in raw.split('|') if s.strip()} if raw else set()
                result[folder] = sts
    return result


def parse_products_conf():
    """Return list of product dicts."""
    products = []
    current = None
    with open(CONF_PATH, encoding='utf-8') as f:
        for line_no, raw_line in enumerate(f, 1):
            line = raw_line.strip()
            m = re.match(r'^\[([^\]]+)\]$', line)
            if m:
                if current:
                    products.append(current)
                current = {
                    'stanza': m.group(1), 'line': line_no,
                    'addon': '', 'legacy_apps': '', 'community_apps': '',
                    'sourcetypes': '', 'display_name': '', 'status': '',
                }
                continue
            if current and '=' in line:
                key, _, val = line.partition('=')
                key, val = key.strip(), val.strip()
                if key in current:
                    current[key] = val
    if current:
        products.append(current)
    return products


def main():
    installed = scan_apps()
    csv_data = parse_csv()
    products = parse_products_conf()

    print("=" * 100)
    print("SOURCETYPE AUDIT: installed props.conf + cisco_apps.csv vs products.conf")
    print("=" * 100)

    # For each product, compare its ADDON-ONLY sourcetypes (not the big multi-product addon)
    # The key insight: products that share an addon (e.g. CiscoSecurityCloud, TA_cisco_catalyst)
    # should only list their OWN product-specific sourcetypes, not the entire addon's list.
    
    issues = []
    for prod in products:
        stanza = prod['stanza']
        display = prod['display_name'] or stanza

        # Gather related folder names
        addon = prod['addon'].strip()
        legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
        community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]
        all_folders = ([addon] if addon else []) + legacy + community

        # Current products.conf sourcetypes
        conf_raw = prod['sourcetypes']
        conf_sts = {s.strip() for s in conf_raw.split(',') if s.strip()} if conf_raw else set()

        # CSV sourcetypes for ONLY the product-specific apps (legacy + community, NOT shared addon)
        # For legacy/community apps listed in CSV, collect their sourcetypes
        product_csv_sts = set()
        for f in legacy + community:
            if f in csv_data:
                product_csv_sts |= csv_data[f]

        # Also get addon CSV sourcetypes for reference
        addon_csv_sts = csv_data.get(addon, set()) if addon else set()

        # Installed sourcetypes for legacy/community
        product_installed_sts = set()
        for f in legacy + community:
            if f in installed:
                product_installed_sts |= installed[f]
        addon_installed_sts = installed.get(addon, set()) if addon else set()

        # The full universe of known sourcetypes for this product
        all_known = product_csv_sts | product_installed_sts | addon_csv_sts | addon_installed_sts

        # Things in conf but not anywhere in known sources
        unknown_in_conf = conf_sts - all_known
        
        # Things in product's specific CSV/installed but not in conf
        product_missing = product_csv_sts - conf_sts

        if unknown_in_conf or product_missing:
            issues.append({
                'stanza': stanza,
                'display': display,
                'status': prod['status'],
                'addon': addon,
                'legacy': legacy,
                'community': community,
                'conf_sts': sorted(conf_sts),
                'conf_count': len(conf_sts),
                'product_csv_sts': sorted(product_csv_sts),
                'addon_csv_sts': sorted(addon_csv_sts),
                'product_installed_sts': sorted(product_installed_sts),
                'addon_installed_sts': sorted(addon_installed_sts),
                'unknown_in_conf': sorted(unknown_in_conf),
                'product_missing': sorted(product_missing),
            })

    # Also print a summary of per-product counts
    print(f"\n{'─' * 60}")
    print(f"{'Product':<40} {'Conf#':>6} {'CSV+Inst#':>10} {'Status'}")
    print(f"{'─' * 60}")
    for prod in products:
        stanza = prod['stanza']
        display = prod['display_name'] or stanza
        conf_raw = prod['sourcetypes']
        conf_count = len({s.strip() for s in conf_raw.split(',') if s.strip()}) if conf_raw else 0
        
        addon = prod['addon'].strip()
        legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
        community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]
        
        ext_sts = set()
        for f in ([addon] if addon else []) + legacy + community:
            if f in csv_data:
                ext_sts |= csv_data[f]
            if f in installed:
                ext_sts |= installed[f]
        ext_count = len(ext_sts)
        
        flag = ""
        if conf_count == 0 and ext_count > 0:
            flag = " ← EMPTY"
        elif conf_count > 0 and ext_count > 0 and abs(conf_count - ext_count) > ext_count * 0.5:
            flag = f" ← DIFF ({ext_count} expected)"

        if flag:
            print(f"  {display[:38]:<40} {conf_count:>6} {ext_count:>10} {prod['status']}{flag}")

    print(f"\n{'=' * 100}")
    print(f"DETAILED DISCREPANCY REPORT: {len(issues)} products with issues")
    print(f"{'=' * 100}")

    for i, iss in enumerate(issues, 1):
        print(f"\n{'─' * 90}")
        print(f"[{i}] {iss['display']}  ({iss['stanza']}, status={iss['status']})")
        print(f"    addon: {iss['addon']}")
        print(f"    legacy: {iss['legacy']}")
        print(f"    community: {iss['community']}")
        print(f"    conf has {iss['conf_count']} sourcetypes")

        if iss['unknown_in_conf']:
            print(f"\n    ⚠️  In products.conf but NOT found in any CSV or installed app [{len(iss['unknown_in_conf'])}]:")
            for st in iss['unknown_in_conf']:
                print(f"      ? {st}")

        if iss['product_missing']:
            print(f"\n    ❌ In CSV (legacy/community) but MISSING from products.conf [{len(iss['product_missing'])}]:")
            for st in iss['product_missing']:
                print(f"      + {st}")


if __name__ == "__main__":
    main()
