#!/usr/bin/env python3
"""Cross-reference products.conf support_level with cisco_apps.csv support field."""
import csv
import re
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator')
CSV_PATH = os.path.join(BASE, 'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')
CONF_PATH = os.path.join(BASE, 'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

# Parse CSV - build lookup: appid (folder_name) -> support value
csv_support = {}
with open(CSV_PATH, 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        folder = row.get('appid', '').strip()
        support = row.get('support', '').strip()
        if folder and support:
            csv_support[folder] = support

# Parse products.conf
with open(CONF_PATH, 'r') as f:
    content = f.read()

stanzas = {}
current = None
for line in content.split('\n'):
    ls = line.strip()
    if ls.startswith('#'):
        continue
    m = re.match(r'^\[(.+)\]', ls)
    if m:
        current = m.group(1)
        stanzas[current] = {}
    elif current and '=' in ls:
        key, val = ls.split('=', 1)
        stanzas[current][key.strip()] = val.strip()

sl_map = {
    'splunk': 'splunk_supported',
    'cisco': 'cisco_supported',
    'developer': 'developer_supported',
    'not_supported': 'not_supported',
}

print(f"{'Product':<35} {'Current SL':<22} {'Addon/Viz':<45} {'CSV Support':<15} {'Suggested SL'}")
print("=" * 150)

mismatches = []
for pid, fields in sorted(stanzas.items()):
    current_sl = fields.get('support_level', '(none)')
    addon = fields.get('addon', '')
    app_viz = fields.get('app_viz', '')

    addon_support = csv_support.get(addon, '')
    viz_support = csv_support.get(app_viz, '')
    csv_val = addon_support or viz_support
    ref = addon if addon_support else app_viz

    suggested = sl_map.get(csv_val, '???')

    if suggested != '???' and suggested != current_sl:
        flag = ' <<<< MISMATCH'
        mismatches.append((pid, current_sl, suggested, ref, csv_val))
        print(f"{pid:<35} {current_sl:<22} {ref:<45} {csv_val:<15} {suggested}{flag}")
    elif current_sl == '(none)':
        print(f"{pid:<35} {'(none)':<22} {ref or '(no addon/viz)':<45} {csv_val or '(no match)':<15} {suggested}")

print(f"\n--- {len(mismatches)} mismatches found ---")
for pid, cur, sug, ref, csv_val in mismatches:
    print(f"  {pid}: {cur} -> {sug}  (based on {ref} = {csv_val} in CSV)")
