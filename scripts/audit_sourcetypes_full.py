#!/usr/bin/env python3
"""
Comprehensive sourcetype audit: scan props.conf, eventtypes.conf, dashboards,
and savedsearches.conf from installed apps in /opt/splunk/etc/apps and
/opt/splunk/etc/cisco-apps. Compare with products.conf and cisco_apps.csv.
"""
import os
import re
import csv
import glob

APPS_DIRS = ["/opt/splunk/etc/apps", "/opt/splunk/etc/cisco-apps"]
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv")
CONF_PATH = os.path.join(BASE, "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")


def _is_sourcetype_stanza(st):
    """Check if a props.conf stanza name looks like a sourcetype."""
    if '::' in st:
        return False
    return not re.match(
        r'^(default|source|host|eventtype|delayedrule|rule|'
        r'transforms|report_|lookup:|access_combined|stash|'
        r'mongod|searches-|json_|python-|ms:|http_event|'
        r'search_telemetry|scheduler|metrics|too_small|'
        r'kvstore|WinEventLog|XmlWinEventLog|windows|'
        r'perfmon|admon|spool|_json|_raw|fs_notification|'
        r'otel_|lsof|Script|ModularInput)$',
        st, re.IGNORECASE
    )


def scan_props_conf(filepath):
    """Extract sourcetype stanza names from props.conf.

    Rename-aware: if a stanza has ``rename = <target>``, the stanza name
    is NOT a real sourcetype — only the rename target is.  Case-only
    renames (old.lower() == new.lower()) still count as real sourcetypes.
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
            if not _is_sourcetype_stanza(st):
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


def scan_eventtypes_conf(filepath):
    """Extract sourcetype references from eventtypes.conf search= lines."""
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if line.startswith('search') and '=' in line:
                    _, _, val = line.partition('=')
                    # Find sourcetype=xxx or sourcetype="xxx" patterns
                    for m in re.finditer(r'sourcetype\s*=\s*"?([^"\s\)]+)"?', val):
                        st = m.group(1).strip().strip('"')
                        if st and st != '*':
                            sts.add(st)
    except Exception:
        pass
    return sts


def scan_savedsearches_conf(filepath):
    """Extract sourcetype references from savedsearches.conf search= lines."""
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if 'sourcetype' in line.lower() and '=' in line:
                    for m in re.finditer(r'sourcetype\s*=\s*"?([^"\s\)]+)"?', line):
                        st = m.group(1).strip().strip('"')
                        if st and st != '*' and not st.startswith('$'):
                            sts.add(st)
    except Exception:
        pass
    return sts


def scan_inputs_conf(filepath):
    """Extract sourcetype= values from inputs.conf."""
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if line.lower().startswith('sourcetype'):
                    m = re.match(r'sourcetype\s*=\s*"?([^"\s]+)"?', line, re.IGNORECASE)
                    if m:
                        st = m.group(1).strip().strip('"')
                        if st and st != '*' and not st.startswith('$'):
                            sts.add(st)
    except Exception:
        pass
    return sts


def scan_transforms_conf(filepath):
    """Extract FORMAT/DEST_KEY sourcetype refs and stanza-level sourcetype info from transforms.conf."""
    sts = set()
    try:
        with open(filepath, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                # FORMAT = sourcetype::xxx
                m = re.search(r'sourcetype::([^\s,\)]+)', line)
                if m:
                    st = m.group(1).strip().strip('"')
                    if st and st != '*' and not st.startswith('$'):
                        sts.add(st)
                # Also catch sourcetype= in FORMAT lines
                if 'sourcetype' in line.lower() and '=' in line:
                    for m2 in re.finditer(r'sourcetype\s*=\s*"?([^"\s\),]+)"?', line):
                        st = m2.group(1).strip().strip('"')
                        if st and st != '*' and not st.startswith('$'):
                            sts.add(st)
    except Exception:
        pass
    return sts


def scan_dashboards(app_path):
    """Extract sourcetype references from XML dashboard files."""
    sts = set()
    xml_dirs = [
        os.path.join(app_path, 'default', 'data', 'ui', 'views'),
        os.path.join(app_path, 'default', 'data', 'ui', 'panels'),
        os.path.join(app_path, 'local', 'data', 'ui', 'views'),
    ]
    for xml_dir in xml_dirs:
        if not os.path.isdir(xml_dir):
            continue
        for xml_file in glob.glob(os.path.join(xml_dir, '*.xml')):
            try:
                with open(xml_file, encoding='utf-8', errors='replace') as f:
                    content = f.read()
                    for m in re.finditer(r'sourcetype\s*=\s*"?([^"\s\)<>]+)"?', content):
                        st = m.group(1).strip().strip('"')
                        if st and st != '*' and not st.startswith('$'):
                            sts.add(st)
            except Exception:
                pass
    return sts


def scan_datamodels(app_path):
    """Extract sourcetype references from datamodel JSON definition files.

    Datamodel definitions live in default/data/models/*.json (and local/).
    Each JSON has an 'objects' array where datasets may have 'baseSearch'
    or 'search' fields containing sourcetype=... references.
    """
    import json
    sts = set()
    model_dirs = [
        os.path.join(app_path, 'default', 'data', 'models'),
        os.path.join(app_path, 'local', 'data', 'models'),
    ]
    for model_dir in model_dirs:
        if not os.path.isdir(model_dir):
            continue
        for jf in glob.glob(os.path.join(model_dir, '*.json')):
            try:
                with open(jf, encoding='utf-8', errors='replace') as f:
                    dm = json.load(f)
                for obj in dm.get('objects', []):
                    for field in ['baseSearch', 'search']:
                        val = obj.get(field, '')
                        if not val:
                            continue
                        # sourcetype="value"
                        for m in re.findall(r'sourcetype\s*=\s*"([^"]+)"', val):
                            if '*' not in m and not m.startswith('$'):
                                sts.add(m)
                        # sourcetype=value (unquoted)
                        for m in re.findall(r'sourcetype\s*=\s*([^\s"(),|]+)', val):
                            if '*' not in m and not m.startswith('$'):
                                sts.add(m)
                        # sourcetype IN ("a","b",...)
                        for block in re.findall(r'sourcetype\s+IN\s*\(([^)]+)\)', val):
                            for m in re.findall(r'"([^"]+)"', block):
                                if '*' not in m and not m.startswith('$'):
                                    sts.add(m)
            except Exception:
                pass
    return sts


def scan_all_apps():
    """Scan all apps and return dict: folder -> {source: set(sts)} for each source type."""
    result = {}
    for apps_dir in APPS_DIRS:
        if not os.path.isdir(apps_dir):
            continue
        for folder in sorted(os.listdir(apps_dir)):
            app_path = os.path.join(apps_dir, folder)
            if not os.path.isdir(app_path):
                continue

            data = {'props': set(), 'eventtypes': set(), 'savedsearches': set(),
                    'dashboards': set(), 'inputs': set(), 'transforms': set(),
                    'datamodels': set()}

            for subdir in ['default', 'local']:
                props = os.path.join(app_path, subdir, 'props.conf')
                if os.path.isfile(props):
                    data['props'] |= scan_props_conf(props)

                et = os.path.join(app_path, subdir, 'eventtypes.conf')
                if os.path.isfile(et):
                    data['eventtypes'] |= scan_eventtypes_conf(et)

                ss = os.path.join(app_path, subdir, 'savedsearches.conf')
                if os.path.isfile(ss):
                    data['savedsearches'] |= scan_savedsearches_conf(ss)

                inp = os.path.join(app_path, subdir, 'inputs.conf')
                if os.path.isfile(inp):
                    data['inputs'] |= scan_inputs_conf(inp)

                tr = os.path.join(app_path, subdir, 'transforms.conf')
                if os.path.isfile(tr):
                    data['transforms'] |= scan_transforms_conf(tr)

            data['dashboards'] = scan_dashboards(app_path)
            data['datamodels'] = scan_datamodels(app_path)

            if folder in result:
                for k in data:
                    result[folder][k] |= data[k]
            else:
                result[folder] = data

    return result


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


def parse_products_conf():
    products = []
    current = None
    with open(CONF_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            m = re.match(r'^\[([^\]]+)\]$', line)
            if m:
                if current:
                    products.append(current)
                current = {
                    'stanza': m.group(1), 'addon': '', 'legacy_apps': '',
                    'community_apps': '', 'sourcetypes': '', 'display_name': '',
                    'status': '',
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
    csv_data = parse_csv()
    products = parse_products_conf()

    print("=" * 100)
    print("COMPREHENSIVE SOURCETYPE AUDIT")
    print("Sources: props.conf + eventtypes.conf + savedsearches.conf + inputs.conf + transforms.conf + dashboards (XML) + datamodels (JSON)")
    print("Scanned: /opt/splunk/etc/apps + /opt/splunk/etc/cisco-apps")
    print("=" * 100)

    # Summary of what we found per source
    total_props = sum(len(v['props']) for v in installed.values())
    total_et = sum(len(v['eventtypes']) for v in installed.values())
    total_ss = sum(len(v['savedsearches']) for v in installed.values())
    total_inp = sum(len(v['inputs']) for v in installed.values())
    total_tr = sum(len(v['transforms']) for v in installed.values())
    total_db = sum(len(v['dashboards']) for v in installed.values())
    total_dm = sum(len(v['datamodels']) for v in installed.values())
    print(f"\nInstalled apps scanned: {len(installed)}")
    print(f"  props.conf stanzas:       {total_props}")
    print(f"  eventtypes.conf refs:     {total_et}")
    print(f"  savedsearches.conf refs:  {total_ss}")
    print(f"  inputs.conf refs:         {total_inp}")
    print(f"  transforms.conf refs:     {total_tr}")
    print(f"  dashboard XML refs:       {total_db}")
    print(f"  datamodel JSON refs:      {total_dm}")

    # Show eventtypes and dashboard findings per cisco app
    cisco_kw = ['cisco', 'meraki', 'duo', 'appdynamics', 'stealthwatch',
                  'estreamer', 'umbrella', 'opendns', 'cucm', 'cube',
                  'thousandeyes', 'ise', 'nvm', 'webex', 'spark', 'anyconnect']

    for src_label, src_key in [('EVENTTYPES.CONF', 'eventtypes'),
                                ('INPUTS.CONF', 'inputs'),
                                ('TRANSFORMS.CONF', 'transforms'),
                                ('DASHBOARD XML', 'dashboards'),
                                ('DATAMODEL JSON', 'datamodels')]:
        print(f"\n{'─' * 100}")
        print(f"{src_label} sourcetype references by app:")
        print(f"{'─' * 100}")
        for folder in sorted(installed.keys()):
            data = installed[folder][src_key]
            if data and any(kw in s.lower() for s in data for kw in cisco_kw):
                print(f"\n  {folder}:")
                for st in sorted(data):
                    print(f"    {st}")

    # Per-product comparison
    print(f"\n{'=' * 100}")
    print("PER-PRODUCT DISCREPANCY ANALYSIS")
    print("=" * 100)

    issue_num = 0
    for prod in products:
        stanza = prod['stanza']
        display = prod['display_name'] or stanza
        addon = prod['addon'].strip()
        legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
        community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]
        all_folders = ([addon] if addon else []) + legacy + community

        conf_raw = prod['sourcetypes']
        conf_sts = {s.strip() for s in conf_raw.split(',') if s.strip()} if conf_raw else set()

        # Collect all sourcetypes from all sources for this product's apps
        all_sts = {'csv': set(), 'props': set(), 'eventtypes': set(),
                   'savedsearches': set(), 'dashboards': set(),
                   'inputs': set(), 'transforms': set(), 'datamodels': set()}

        for f in all_folders:
            if f in csv_data:
                all_sts['csv'] |= csv_data[f]
            if f in installed:
                for src in ['props', 'eventtypes', 'savedsearches', 'dashboards', 'inputs', 'transforms', 'datamodels']:
                    all_sts[src] |= installed[f][src]

        combined = set()
        for v in all_sts.values():
            combined |= v

        # Sources beyond props/csv that might have NEW sourcetypes
        extra_sources = {
            'eventtypes': ('📋', 'eventtypes.conf'),
            'inputs': ('📥', 'inputs.conf'),
            'transforms': ('🔄', 'transforms.conf'),
            'dashboards': ('📊', 'dashboards'),
            'savedsearches': ('🔍', 'savedsearches.conf'),
            'datamodels': ('🧩', 'datamodels'),
        }

        new_items = {}
        for src_key, (icon, label) in extra_sources.items():
            only = all_sts[src_key] - all_sts['props'] - all_sts['csv']
            missing = all_sts[src_key] - conf_sts
            new = missing & only
            if new:
                new_items[src_key] = (icon, label, new)

        if new_items:
            issue_num += 1
            print(f"\n{'─' * 90}")
            print(f"[{issue_num}] {display}  ({stanza})")
            print(f"    addon: {addon}, legacy: {legacy}")
            for src_key, (icon, label, new) in new_items.items():
                print(f"\n    {icon} From {label} ONLY (not in props/CSV), missing from products.conf [{len(new)}]:")
                for st in sorted(new):
                    print(f"      + {st}")

    if issue_num == 0:
        print("\n  ✅ No NEW sourcetypes found in eventtypes/dashboards/savedsearches beyond what's in props.conf + CSV")

    # Now show the FULL combined comparison
    print(f"\n{'=' * 100}")
    print("FULL COMPARISON: ALL sources combined vs products.conf")
    print("(props.conf + eventtypes.conf + savedsearches.conf + inputs.conf + transforms.conf + dashboards + datamodels + CSV)")
    print("=" * 100)

    full_issue_num = 0
    for prod in products:
        stanza = prod['stanza']
        display = prod['display_name'] or stanza
        addon = prod['addon'].strip()
        legacy = [s.strip() for s in prod['legacy_apps'].split(',') if s.strip()]
        community = [s.strip() for s in prod['community_apps'].split(',') if s.strip()]
        all_folders = ([addon] if addon else []) + legacy + community

        conf_raw = prod['sourcetypes']
        conf_sts = {s.strip() for s in conf_raw.split(',') if s.strip()} if conf_raw else set()

        # Product-specific (legacy + community, NOT shared addon) from CSV
        product_csv = set()
        for f in legacy + community:
            if f in csv_data:
                product_csv |= csv_data[f]

        # Product-specific from installed (legacy + community only)
        product_installed = set()
        for f in legacy + community:
            if f in installed:
                for src in ['props', 'eventtypes', 'savedsearches', 'dashboards', 'inputs', 'transforms', 'datamodels']:
                    product_installed |= installed[f][src]

        # Addon-level for reference
        addon_all = set()
        if addon and addon in csv_data:
            addon_all |= csv_data[addon]
        if addon and addon in installed:
            for src in ['props', 'eventtypes', 'savedsearches', 'dashboards', 'inputs', 'transforms', 'datamodels']:
                addon_all |= installed[addon][src]

        all_known = product_csv | product_installed | addon_all

        # Unknown in conf (not in any source)
        unknown = conf_sts - all_known
        # Missing from conf (in product CSV/installed but not in conf)
        missing = (product_csv | product_installed) - conf_sts

        if unknown or missing:
            full_issue_num += 1
            print(f"\n{'─' * 90}")
            print(f"[{full_issue_num}] {display}  ({stanza}, {prod['status']})")
            print(f"    conf: {len(conf_sts)} sts | addon: {addon} | legacy: {len(legacy)} | community: {len(community)}")

            if missing:
                print(f"\n    ❌ MISSING from products.conf (in legacy/community CSV+installed) [{len(missing)}]:")
                for st in sorted(missing):
                    sources = []
                    for f in legacy + community:
                        if f in csv_data and st in csv_data[f]:
                            sources.append(f"csv:{f}")
                        if f in installed:
                            for src in ['props', 'eventtypes', 'dashboards', 'savedsearches', 'inputs', 'transforms', 'datamodels']:
                                if st in installed[f][src]:
                                    sources.append(f"{src}:{f}")
                    print(f"      + {st}  ({', '.join(sources)})")

            if unknown:
                print(f"\n    ⚠️  In products.conf but NOT in any source [{len(unknown)}]:")
                for st in sorted(unknown):
                    print(f"      ? {st}")

    print(f"\n{'=' * 100}")
    print(f"TOTAL: {full_issue_num} products with discrepancies")
    print("=" * 100)


if __name__ == "__main__":
    main()
