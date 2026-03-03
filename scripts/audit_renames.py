#!/usr/bin/env python3
"""
Rename-aware sourcetype audit.

When props.conf has:
    [cisco_ips_syslog]
    rename = cisco:ips:syslog

Then cisco_ips_syslog is NOT a real sourcetype — it always gets renamed.
Only the rename TARGET is the real sourcetype users will search for.

This script:
1. Scans all props.conf in installed apps, tracking rename= directives
2. Produces CORRECT sourcetype sets (excluding renamed-from, including renamed-to)
3. Compares with products.conf
4. Reports what needs to be removed/added
"""
import os
import re
import csv

APPS_DIRS = ["/opt/splunk/etc/apps", "/opt/splunk/etc/cisco-apps"]
BASE = "/Users/akhamis/repo/cisco_control_center_app"
CONF_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")
CSV_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv")


def is_sourcetype_stanza(stanza):
    """Check if a props.conf stanza looks like a sourcetype (not source/host/etc)."""
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
        r'^otel_', r'^lsof', r'^Script', r'^ModularInput',
        r'^source:',
    ]
    for pat in skip:
        if re.match(pat, stanza, re.IGNORECASE):
            return False
    return True


def scan_props_conf_rename_aware(filepath):
    """
    Extract sourcetypes from props.conf, handling rename= correctly.
    
    Returns:
        real_sourcetypes: set of actual sourcetypes (stanzas WITHOUT rename=)
        renames: dict of {old_name: new_name} for stanzas WITH rename=
        rename_targets: set of rename targets (the real names things get renamed TO)
    """
    real_sourcetypes = set()
    renames = {}
    
    stanza = None
    stanza_lines = {}  # stanza -> list of (key, value) pairs
    
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return set(), {}, set()
    
    current_stanza = None
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = re.match(r'^\[([^\]]+)\]', line)
        if m:
            current_stanza = m.group(1).strip()
            if current_stanza not in stanza_lines:
                stanza_lines[current_stanza] = []
            continue
        if current_stanza and '=' in line:
            key, _, val = line.partition('=')
            stanza_lines[current_stanza].append((key.strip().lower(), val.strip()))
    
    for st, kvs in stanza_lines.items():
        if not is_sourcetype_stanza(st):
            continue
        rename_val = None
        for k, v in kvs:
            if k == 'rename':
                rename_val = v
                break
        if rename_val:
            renames[st] = rename_val
        else:
            real_sourcetypes.add(st)
    
    rename_targets = set(renames.values())
    return real_sourcetypes, renames, rename_targets


def scan_all_apps():
    """Scan all apps. Returns dict: folder -> {real_sts, renames, rename_targets}."""
    result = {}
    for apps_dir in APPS_DIRS:
        if not os.path.isdir(apps_dir):
            continue
        for folder in sorted(os.listdir(apps_dir)):
            app_path = os.path.join(apps_dir, folder)
            if not os.path.isdir(app_path):
                continue
            all_real = set()
            all_renames = {}
            all_targets = set()
            for subdir in ['default', 'local']:
                props = os.path.join(app_path, subdir, 'props.conf')
                if os.path.isfile(props):
                    real, renames, targets = scan_props_conf_rename_aware(props)
                    all_real |= real
                    all_renames.update(renames)
                    all_targets |= targets
            if folder in result:
                result[folder]['real'] |= all_real
                result[folder]['renames'].update(all_renames)
                result[folder]['targets'] |= all_targets
            else:
                result[folder] = {'real': all_real, 'renames': all_renames, 'targets': all_targets}
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
    installed = scan_all_apps()
    products = parse_products_conf()

    print("=" * 100)
    print("RENAME-AWARE SOURCETYPE AUDIT")
    print("=" * 100)

    # First, show ALL rename directives found
    print("\n--- All rename= directives found across installed apps ---\n")
    total_renames = 0
    for folder in sorted(installed.keys()):
        renames = installed[folder]['renames']
        if renames:
            print(f"  {folder}:")
            for old, new in sorted(renames.items()):
                print(f"    [{old}] rename = {new}")
                total_renames += 1
    print(f"\n  Total rename directives: {total_renames}")

    # Build a global map of "renamed-from" names across all apps
    # These are NOT real sourcetypes
    global_renamed_from = {}  # old_name -> (new_name, app_folder)
    for folder, data in installed.items():
        for old, new in data['renames'].items():
            global_renamed_from[old.lower()] = (new, folder)

    # Now check each product in products.conf
    print(f"\n{'=' * 100}")
    print("PER-PRODUCT ANALYSIS: sourcetypes that should be REMOVED (they have rename=)")
    print("=" * 100)

    issues = []
    for prod in products:
        stanza = prod['stanza']
        display = prod['display_name'] or stanza
        conf_raw = prod['sourcetypes']
        conf_sts = [s.strip() for s in conf_raw.split(',') if s.strip()] if conf_raw else []
        
        addon = prod['addon'].strip()
        legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
        community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]
        all_folders = ([addon] if addon else []) + legacy + community

        # Check which of this product's sourcetypes are actually "renamed-from" stanzas
        to_remove = []
        for st in conf_sts:
            st_lower = st.lower()
            # Check if this sourcetype is a renamed-from stanza in ANY of this product's apps
            for f in all_folders:
                if f in installed:
                    for old, new in installed[f]['renames'].items():
                        if old.lower() == st_lower:
                            to_remove.append((st, new, f))
                            break
            # Also check global renames (might be in a non-listed app)
            if st_lower in global_renamed_from and not any(st == r[0] for r in to_remove):
                new, app = global_renamed_from[st_lower]
                to_remove.append((st, new, app))

        # Also check: are the rename targets already present?
        conf_set_lower = {s.lower() for s in conf_sts}
        
        if to_remove:
            issue = {
                'stanza': stanza,
                'display': display,
                'status': prod['status'],
                'line': prod['line'],
                'to_remove': [],
            }
            for old, new, app in to_remove:
                target_present = new.lower() in conf_set_lower
                issue['to_remove'].append({
                    'fake_st': old,
                    'real_st': new,
                    'app': app,
                    'target_present': target_present,
                })
            issues.append(issue)

    if issues:
        for iss in issues:
            print(f"\n{'─' * 90}")
            print(f"[{iss['display']}]  ({iss['stanza']}, line {iss['line']}, status={iss['status']})")
            for r in iss['to_remove']:
                marker = "✅ target already present" if r['target_present'] else "⚠️  target NOT in products.conf — may need to ADD it"
                print(f"  REMOVE: {r['fake_st']}")
                print(f"    rename = {r['real_st']}  (from {r['app']})")
                print(f"    {marker}")
        
        # Summary
        total_removals = sum(len(i['to_remove']) for i in issues)
        print(f"\n{'=' * 100}")
        print(f"SUMMARY: {total_removals} fake sourcetypes to remove across {len(issues)} products")
        print("=" * 100)
        
        for iss in issues:
            for r in iss['to_remove']:
                action = "REMOVE" if r['target_present'] else "REMOVE + ADD target"
                print(f"  {iss['stanza']}: {action} '{r['fake_st']}' (renamed to '{r['real_st']}')")
    else:
        print("\n  ✅ No fake (renamed-from) sourcetypes found in products.conf")


if __name__ == "__main__":
    main()
