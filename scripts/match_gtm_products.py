#!/usr/bin/env python3
"""Parse Secure Networking GTM CSV and map to products.conf stanza IDs."""
import csv, re

CSV_PATH = 'docs/Secure_Networking_gtm.csv'
CONF_PATH = 'packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'

# Read CSV
with open(CSV_PATH, encoding='utf-8-sig') as f:
    text = f.read().replace('\r\n', '\n').replace('\r', '\n')

reader = csv.DictReader(text.strip().splitlines())
gtm_names = set()
for row in reader:
    gtm = row.get('Part of Secure Networking GTM Strategy?', '').strip()
    name = row.get('Cisco Product Name', '').strip()
    if gtm.lower() == 'yes':
        gtm_names.add(name)

print(f'CSV: {len(gtm_names)} products marked YES for Secure Networking GTM:')
for n in sorted(gtm_names):
    print(f'  {n}')

# Read products.conf to match display_name → stanza_id
with open(CONF_PATH) as f:
    conf_text = f.read()

stanzas = re.findall(r'^\[([^\]]+)\]', conf_text, re.MULTILINE)
name_to_id = {}
for s in stanzas:
    block = re.search(rf'^\[{re.escape(s)}\].*?(?=^\[|\Z)', conf_text, re.MULTILINE | re.DOTALL)
    if block:
        dm = re.search(r'^display_name\s*=\s*(.+)', block.group(), re.MULTILINE)
        if dm:
            name_to_id[dm.group(1).strip()] = s

# Match CSV names to stanza IDs
print(f'\nMatching to products.conf stanza IDs:')
matched = []
unmatched = []
for csv_name in sorted(gtm_names):
    # Try exact match first
    found = None
    for conf_name, stanza_id in name_to_id.items():
        # Normalize: remove parentheticals for comparison
        cn = conf_name.lower()
        csvn = csv_name.lower()
        if csvn in cn or cn in csvn:
            found = stanza_id
            break
        # Also try matching the first word cluster
        csv_first = csvn.split('(')[0].strip()
        conf_first = cn.split('(')[0].strip()
        if csv_first == conf_first:
            found = stanza_id
            break
    if found:
        matched.append((csv_name, found))
        print(f'  ✓ {csv_name:50s} → {found}')
    else:
        unmatched.append(csv_name)
        print(f'  ✗ {csv_name:50s} → NO MATCH')

print(f'\nMatched: {len(matched)}, Unmatched: {len(unmatched)}')
if unmatched:
    print('Unmatched CSV names:')
    for n in unmatched:
        print(f'  - {n}')
    print('\nAvailable conf display_names:')
    for n in sorted(name_to_id.keys()):
        print(f'  {n}')
