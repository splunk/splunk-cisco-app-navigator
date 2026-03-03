#!/usr/bin/env python3
"""Analyze which products.conf stanzas are visible in the UI and why."""
import re, os

conf_path = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                         'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

with open(conf_path) as f:
    text = f.read()

# Parse stanzas
current = None
data = {}
for line in text.split('\n'):
    m = re.match(r'^\[(\w+)\]', line)
    if m:
        current = m.group(1)
        data[current] = {}
        continue
    if current and '=' in line and not line.strip().startswith('#'):
        key, val = line.split('=', 1)
        data[current][key.strip()] = val.strip()

CATEGORY_IDS = {'security', 'observability', 'networking', 'collaboration', 'deprecated'}
SUPPORTED_LEVELS = {'cisco_supported', 'splunk_supported'}

print(f'Total stanzas: {len(data)}')

# Filter like CATEGORY_IDS
in_category = {pid: f for pid, f in data.items() if f.get('category', '') in CATEGORY_IDS}
print(f'After CATEGORY_IDS filter: {len(in_category)}')

excluded_by_category = {pid: f for pid, f in data.items() if f.get('category', '') not in CATEGORY_IDS}
if excluded_by_category:
    print(f'\nExcluded by category ({len(excluded_by_category)}):')
    for pid, f in excluded_by_category.items():
        print(f'  {pid}: category={f.get("category","(none)")}')

# Support level breakdown
print('\nBy support_level:')
sl_counts = {}
for pid, f in in_category.items():
    sl = f.get('support_level', '(none)')
    sl_counts[sl] = sl_counts.get(sl, 0) + 1
for k, v in sorted(sl_counts.items(), key=lambda x: -x[1]):
    print(f'  {k}: {v}')

# Supported only (default view)
supported = {pid: f for pid, f in in_category.items() if f.get('support_level', '') in SUPPORTED_LEVELS}
print(f'\nSupported only (default view): {len(supported)}')

# Not supported (hidden unless Full Portfolio ON)
not_supported_products = {pid: f for pid, f in in_category.items() if f.get('support_level', '') not in SUPPORTED_LEVELS}
print(f'Not supported (hidden unless Full Portfolio ON): {len(not_supported_products)}')
for pid, f in not_supported_products.items():
    print(f'  {pid}: support_level={f.get("support_level","(none)")}, status={f.get("status","")}, category={f.get("category","")}')

# Status breakdown
print('\nBy status:')
st_counts = {}
for pid, f in in_category.items():
    st = f.get('status', '(none)')
    st_counts[st] = st_counts.get(st, 0) + 1
for k, v in sorted(st_counts.items(), key=lambda x: -x[1]):
    print(f'  {k}: {v}')

# Under development
udev = [pid for pid, f in in_category.items() if f.get('status') == 'under_development']
print(f'\nUnder development ({len(udev)}): {udev}')

# Summary: What user sees with "Full Portfolio" ON
active_supported = {pid for pid, f in in_category.items() if f.get('support_level', '') in SUPPORTED_LEVELS and f.get('status') != 'under_development'}
active_not_supported = {pid for pid, f in in_category.items() if f.get('support_level', '') not in SUPPORTED_LEVELS and f.get('status') != 'under_development'}
deprecated = {pid for pid, f in in_category.items() if f.get('status') == 'deprecated'}
coming_soon = set(udev)

print(f'\n=== UI Sections (Full Portfolio ON) ===')
print(f'Available (supported, not configured): up to {len(active_supported) - len(deprecated)} cards')
print(f'Unsupported section: {len(active_not_supported - deprecated)} cards')
print(f'Coming Soon: {len(coming_soon)} cards')
print(f'Deprecated: {len(deprecated)} cards')
print(f'TOTAL visible: {len(active_supported - deprecated) + len(active_not_supported - deprecated) + len(coming_soon) + len(deprecated)}')

print(f'\n=== UI Sections (Supported Only - default) ===')
supported_active = {pid for pid in active_supported if pid not in deprecated}
print(f'Available (supported, not configured): up to {len(supported_active)} cards')
print(f'Deprecated (supported only): {len({pid for pid in deprecated if data[pid].get("support_level","") in SUPPORTED_LEVELS})} cards')
print(f'Coming Soon: {len(coming_soon)} cards')
total_default = len(supported_active) + len({pid for pid in deprecated if data[pid].get("support_level","") in SUPPORTED_LEVELS}) + len(coming_soon)
print(f'TOTAL visible: {total_default}')
