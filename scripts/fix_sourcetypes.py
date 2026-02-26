#!/usr/bin/env python3
"""
Fix sourcetype discrepancies in products.conf based on the comprehensive audit.
- Remove invented sourcetypes (not found in any source: CSV, props, inputs, eventtypes, transforms, dashboards)
- Add missing sourcetypes (from legacy/community apps' CSV + props + inputs)
- Filter out noise (wildcards, generics, artifacts, TA internal logs)
"""
import os
import re
import csv

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv")
CONF_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")
APPS_DIRS = ["/opt/splunk/etc/apps", "/opt/splunk/etc/cisco-apps"]

# ─── noise filters ───────────────────────────────────────────────────────────
WILDCARD_RE = re.compile(r'[\*\$\[\]\(\)\{\}\\]')
GENERIC_SOURCETYPES = {
    'syslog', 'default', 'access_combined', 'splunkd', 'stash',
    '_json', 'client_check', 'too_small', 'your_sourcetype',
}
TA_LOG_RE = re.compile(r'^(ta|splunkta)[a-z]*:log$', re.IGNORECASE)
INTERNAL_LOG_SUFFIXES = [':log']  # used for CSV-only *:log entries

def is_noise(st):
    """Return True if the sourcetype should be excluded as noise."""
    s = st.strip()
    if not s:
        return True
    if len(s) < 3:
        return True
    if WILDCARD_RE.search(s):
        return True
    if s.lower() in GENERIC_SOURCETYPES:
        return True
    if s.startswith('%') or s.startswith('&'):
        return True
    # URL-encoded strings
    if '%22' in s or '%20' in s:
        return True
    # VMware sourcetypes (not Cisco)
    if s.startswith('vmware:'):
        return True
    return False

def is_ta_internal_log(st):
    """Return True if this is a TA internal log sourcetype (e.g. tacisconi:log)."""
    return bool(TA_LOG_RE.match(st)) or st.endswith(':log') and ':' not in st.replace(':log', '')


# ─── scan installed apps ─────────────────────────────────────────────────────
def scan_props(filepath):
    """Scan props.conf for sourcetype stanzas, handling rename= correctly.

    If a stanza has ``rename = <target>``, the stanza name is NOT a real
    sourcetype — only the rename target is.  Case-only renames
    (old.lower() == new.lower()) still count as real sourcetypes.
    """
    sts = set()
    try:
        stanza_kvs = {}  # stanza -> [(key, val), ...]
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
            if '::' in st:
                continue
            rename_val = None
            for k, v in kvs:
                if k == 'rename':
                    rename_val = v
                    break
            if rename_val:
                if rename_val.lower() != st.lower():
                    sts.add(rename_val)
                else:
                    sts.add(st)
            else:
                sts.add(st)
    except Exception:
        pass
    return sts

def scan_kv(filepath, key='sourcetype'):
    """Scan a conf file for key = value lines."""
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if line.lower().startswith(key):
                    m = re.match(rf'{key}\s*=\s*"?([^"\s]+)"?', line, re.IGNORECASE)
                    if m:
                        sts.add(m.group(1).strip().strip('"'))
    except Exception:
        pass
    return sts

def scan_eventtypes(filepath):
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if line.startswith('search') and '=' in line:
                    _, _, val = line.partition('=')
                    for m in re.finditer(r'sourcetype\s*=\s*"?([^"\s\)]+)"?', val):
                        sts.add(m.group(1).strip().strip('"'))
    except Exception:
        pass
    return sts

def scan_transforms(filepath):
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                m = re.search(r'sourcetype::([^\s,\)]+)', line)
                if m:
                    sts.add(m.group(1).strip().strip('"'))
    except Exception:
        pass
    return sts

def get_installed_sourcetypes():
    """Return dict: folder -> set(sourcetypes) from all conf files."""
    result = {}
    for apps_dir in APPS_DIRS:
        if not os.path.isdir(apps_dir):
            continue
        for folder in os.listdir(apps_dir):
            app_path = os.path.join(apps_dir, folder)
            if not os.path.isdir(app_path):
                continue
            sts = set()
            for subdir in ['default', 'local']:
                p = os.path.join(app_path, subdir, 'props.conf')
                if os.path.isfile(p):
                    sts |= scan_props(p)
                p = os.path.join(app_path, subdir, 'inputs.conf')
                if os.path.isfile(p):
                    sts |= scan_kv(p, 'sourcetype')
                p = os.path.join(app_path, subdir, 'eventtypes.conf')
                if os.path.isfile(p):
                    sts |= scan_eventtypes(p)
                p = os.path.join(app_path, subdir, 'transforms.conf')
                if os.path.isfile(p):
                    sts |= scan_transforms(p)
            if folder in result:
                result[folder] |= sts
            else:
                result[folder] = sts
    return result


# ─── parse CSV ────────────────────────────────────────────────────────────────
def parse_csv():
    result = {}
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            folder = row.get('Folder_Name', '').strip()
            raw = row.get('Sourcetypes', '').strip()
            if folder:
                sts = {s.strip() for s in raw.split('|') if s.strip()} if raw else set()
                result[folder] = sts
    return result


# ─── parse products.conf ─────────────────────────────────────────────────────
def parse_products_conf():
    """Return list of product dicts preserving exact line positions."""
    products = []
    current = None
    with open(CONF_PATH, encoding='utf-8') as f:
        lines = f.readlines()

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        m = re.match(r'^\[([^\]]+)\]$', line)
        if m:
            if current:
                products.append(current)
            current = {
                'stanza': m.group(1), 'addon': '', 'legacy_apps': '',
                'community_apps': '', 'sourcetypes': '', 'display_name': '',
                'sourcetypes_line': -1,
            }
            continue
        if current and '=' in line and not line.startswith('#'):
            key, _, val = line.partition('=')
            key, val = key.strip(), val.strip()
            if key == 'sourcetypes':
                current['sourcetypes'] = val
                current['sourcetypes_line'] = i
            elif key in current:
                current[key] = val
    if current:
        products.append(current)
    return products, lines


# ─── build the correct sourcetypes for each product ──────────────────────────
def build_correct_sourcetypes(prod, csv_data, installed):
    """Determine the correct sourcetypes for a product."""
    addon = prod['addon'].strip()
    legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
    community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]

    # Collect from CSV + installed for legacy/community apps (product-specific)
    product_sts = set()
    for folder in legacy + community:
        if folder in csv_data:
            product_sts |= csv_data[folder]
        if folder in installed:
            product_sts |= installed[folder]

    # Also include addon's CSV sourcetypes (these are legitimate)
    if addon and addon in csv_data:
        # For shared addons (CiscoSecurityCloud, TA_cisco_catalyst, etc.)
        # DON'T include all addon sourcetypes — only the ones that the addon CSV lists
        # But we need to be selective: only include if the product had them before
        # or if the CSV specifically lists them for the addon
        pass  # We'll handle addon sourcetypes below

# Filter out noise
    clean = set()
    for st in product_sts:
        if not is_noise(st):
            clean.add(st)

    return clean


def main():
    csv_data = parse_csv()
    installed = get_installed_sourcetypes()
    products, lines = parse_products_conf()

    # Build a complete set of all "real" sourcetypes from ALL sources for validation
    all_known = set()
    for sts in csv_data.values():
        all_known |= sts
    for sts in installed.values():
        all_known |= sts

    # Shared addons: products sharing these should NOT inherit all addon sourcetypes
    SHARED_ADDONS = {
        'CiscoSecurityCloud', 'TA_cisco_catalyst', 'cisco_dc_networking_app_for_splunk',
        'TA-cisco-cloud-security-addon', 'TA_cisco_cdr',
    }

    changes = []
    for prod in products:
        stanza = prod['stanza']
        if prod['sourcetypes_line'] < 0:
            continue

        current_raw = prod['sourcetypes']
        current_sts = {s.strip() for s in current_raw.split(',') if s.strip()} if current_raw else set()

        addon = prod['addon'].strip()
        legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
        community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]
        all_folders = ([addon] if addon else []) + legacy + community
        is_shared = addon in SHARED_ADDONS

        # Build union of all known sourcetypes for this product's folders
        product_known = set()
        for folder in all_folders:
            if folder in csv_data:
                product_known |= csv_data[folder]
            if folder in installed:
                product_known |= installed[folder]

        # product-specific (legacy + community only) — NOT including shared addon
        product_specific = set()
        for folder in legacy + community:
            if folder in csv_data:
                product_specific |= csv_data[folder]
            if folder in installed:
                product_specific |= installed[folder]

        # addon sourcetypes
        addon_sts = set()
        if addon:
            if addon in csv_data:
                addon_sts |= csv_data[addon]
            if addon in installed:
                addon_sts |= installed[addon]

        # ─── Step 1: identify invented sourcetypes to REMOVE ─────────────
        to_remove = set()
        for st in current_sts:
            if is_noise(st):
                continue
            if st not in product_known:
                to_remove.add(st)

        # ─── Step 2: identify missing sourcetypes to ADD ─────────────────
        to_add = set()

        # Always add product-specific sourcetypes (from legacy/community)
        for st in product_specific:
            if not is_noise(st) and st not in current_sts:
                to_add.add(st)

        # For NON-shared addons, always include addon sourcetypes
        # (these are standalone addons dedicated to this product)
        if not is_shared:
            for st in addon_sts:
                if not is_noise(st) and st not in current_sts:
                    to_add.add(st)

        # For shared addons with no legacy/community:
        # DON'T add anything — the current conf is the source of truth
        # Only remove invented ones (handled above)

        # ─── Step 3: filter out TA internal logs from additions ──────────
        # Keep ta:log entries that are in CSV (they're documented)
        # but remove ones that are purely internal TA logging
        filtered_add = set()
        for st in to_add:
            # Skip TA internal log types (tacisco*:log patterns)
            if re.match(r'^ta[a-z]*:log$', st, re.IGNORECASE):
                continue
            if re.match(r'^splunkta[a-z]*:log$', st, re.IGNORECASE):
                continue
            # Skip generic non-cisco sourcetypes from legacy apps
            if st in {'syslog', 'default', 'access_combined', '_json',
                      'client_check', 'splunkd', 'stash', 'too_small'}:
                continue
            filtered_add.add(st)
        to_add = filtered_add

        if not to_remove and not to_add:
            continue

        # Build new sourcetype set
        new_sts = (current_sts - to_remove) | to_add
        new_sorted = sorted(new_sts, key=str.lower)
        new_val = ','.join(new_sorted)

        changes.append({
            'stanza': stanza,
            'display': prod['display_name'] or stanza,
            'line': prod['sourcetypes_line'],
            'old': current_raw,
            'new': new_val,
            'removed': sorted(to_remove),
            'added': sorted(to_add),
        })

    # ─── Report ───────────────────────────────────────────────────────────
    print("=" * 100)
    print("SOURCETYPE FIX PLAN")
    print("=" * 100)

    total_added = 0
    total_removed = 0
    for c in changes:
        print(f"\n{'─' * 90}")
        print(f"  {c['display']}  [{c['stanza']}]")
        if c['removed']:
            print(f"    REMOVE ({len(c['removed'])}):")
            for st in c['removed']:
                print(f"      - {st}")
            total_removed += len(c['removed'])
        if c['added']:
            print(f"    ADD ({len(c['added'])}):")
            for st in c['added']:
                print(f"      + {st}")
            total_added += len(c['added'])
        print(f"    RESULT: {c['new'][:120]}{'...' if len(c['new']) > 120 else ''}")

    print(f"\n{'=' * 100}")
    print(f"SUMMARY: {len(changes)} products | +{total_added} added | -{total_removed} removed")
    print("=" * 100)

    # ─── Apply changes ───────────────────────────────────────────────────
    confirm = input("\nApply changes? [y/N]: ").strip().lower()
    if confirm != 'y':
        print("Aborted.")
        return

    for c in changes:
        line_idx = c['line']
        old_line = lines[line_idx]
        # Preserve indentation
        indent = ''
        m = re.match(r'^(\s*)', old_line)
        if m:
            indent = m.group(1)
        lines[line_idx] = f"{indent}sourcetypes = {c['new']}\n"

    with open(CONF_PATH, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    print(f"\n✅ Updated {len(changes)} products in products.conf")


if __name__ == "__main__":
    main()
