#!/usr/bin/env python3
"""Deeper audit checks — mismatched names, categories, etc."""
import csv, re
from collections import defaultdict

CSV_PATH = 'packages/splunk-cisco-app-navigator/src/main/resources/splunk/lookups/cisco_apps.csv'
CONF_PATH = 'packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf'

with open(CSV_PATH, 'r') as f:
    csv_rows = list(csv.DictReader(f))

with open(CONF_PATH, 'r') as f:
    conf_text = f.read()

stanzas = {}
cur = None
for line in conf_text.splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    m = re.match(r'^\[(.+)\]$', s)
    if m:
        cur = m.group(1)
        stanzas[cur] = {}
        continue
    if cur and '=' in s:
        k, v = s.split('=', 1)
        stanzas[cur][k.strip()] = v.strip()

# 1. Which CSV rows reference "Cisco Bug Search Tool (BST)" and "Cisco Threat Grid"
print("=== Rows referencing mismatched product names ===")
for i, row in enumerate(csv_rows, start=2):
    products = row.get('Supported_Cisco_Products_Zipped', '')
    uid = row.get('uid', '')
    title = row.get('title', '')
    if 'Cisco Bug Search Tool (BST)' in products:
        print(f'  Line {i}: uid={uid} "{title}" -> "Cisco Bug Search Tool (BST)"')
    if 'Cisco Threat Grid' in products:
        print(f'  Line {i}: uid={uid} "{title}" -> "Cisco Threat Grid"')

# 2. Likely products.conf matches for mismatched names
print()
print("=== Likely products.conf matches for mismatched names ===")
for stanza, fields in stanzas.items():
    dn = fields.get('display_name', '')
    if 'bug' in dn.lower() or 'threat grid' in dn.lower() or 'secure malware' in dn.lower():
        print(f'  [{stanza}] display_name = "{dn}"')

# 3. Cisco_Category distribution
print()
print("=== Cisco_Category distribution ===")
cats = defaultdict(int)
for row in csv_rows:
    cat = row.get('Cisco_Category', '').strip()
    cats[cat] += 1
for c, n in sorted(cats.items(), key=lambda x: -x[1]):
    print(f'  "{c}": {n}')

# 4. Multi-category entries
print()
print("=== Multi-category entries (pipe in Cisco_Category) ===")
for i, row in enumerate(csv_rows, start=2):
    cat = row.get('Cisco_Category', '').strip()
    if '|' in cat:
        uid = row.get('uid', '')
        title = row.get('title', '')
        print(f'  Line {i}: uid={uid} "{title}" -> Cat="{cat}"')

# 5. Check if any CSV rows have Deprecated field with unexpected values
print()
print("=== Deprecated field distribution ===")
dep_vals = defaultdict(int)
for row in csv_rows:
    d = row.get('Deprecated', '').strip()
    dep_vals[d] += 1
for v, n in sorted(dep_vals.items()):
    print(f'  Deprecated="{v}": {n}')

# 6. Check empty Cisco_App_Class vs role in products.conf
print()
print("=== Cisco_App_Class field distribution ===")
cls_vals = defaultdict(int)
for row in csv_rows:
    c = row.get('Cisco_App_Class', '').strip()
    cls_vals[c] += 1
for v, n in sorted(cls_vals.items()):
    label = v if v else "(empty)"
    print(f'  Cisco_App_Class="{label}": {n}')

# 7. Check IPS deprecated row (uid=1903) - what products.conf says
print()
print("=== IPS deprecation details ===")
for stanza, fields in stanzas.items():
    dn = fields.get('display_name', '')
    if 'ips' in dn.lower() or 'intrusion prevention' in dn.lower():
        legacy = fields.get('legacy_uids', '')
        addon = fields.get('addon', '')
        print(f'  [{stanza}] display_name="{dn}" addon={addon} legacy_uids={legacy}')

# 8. Check rows with empty Supported_Cisco_Products_Zipped for more context
print()
print("=== Empty Supported_Cisco_Products_Zipped - extended details ===")
for i, row in enumerate(csv_rows, start=2):
    products = row.get('Supported_Cisco_Products_Zipped', '').strip()
    if not products:
        uid = row.get('uid', '')
        title = row.get('title', '')
        appid = row.get('appid', '')
        cat = row.get('Cisco_Category', '')
        subcat = row.get('Cisco_Sub_Category', '')
        dep = row.get('Deprecated', '')
        cls = row.get('Cisco_App_Class', '')
        desc = row.get('description', '')[:100]
        print(f'  Line {i}: uid={uid} appid={appid}')
        print(f'    title="{title}"')
        print(f'    Cat={cat} SubCat={subcat} Dep={dep} Class={cls}')
        print(f'    desc={desc}...')
        print()

# 9. Check if products.conf has legacy_uids that don't appear as deprecated in CSV
print("=== Legacy UIDs in products.conf vs Deprecated flag in CSV ===")
csv_uids = {}
for i, row in enumerate(csv_rows, start=2):
    csv_uids[row.get('uid', '').strip()] = (i, row)

legacy_not_deprecated = []
for stanza, fields in stanzas.items():
    dn = fields.get('display_name', stanza)
    legacy_str = fields.get('legacy_uids', '')
    if legacy_str:
        for uid in legacy_str.split(','):
            uid = uid.strip()
            if uid and uid in csv_uids:
                lineno, row = csv_uids[uid]
                dep = row.get('Deprecated', '').strip()
                title = row.get('title', '').strip()
                if dep.lower() != 'yes':
                    legacy_not_deprecated.append((uid, lineno, title, stanza, dn))

if legacy_not_deprecated:
    print(f"  Legacy apps in products.conf NOT marked Deprecated=Yes in CSV ({len(legacy_not_deprecated)}):")
    for uid, lineno, title, stanza, dn in legacy_not_deprecated:
        print(f'    UID {uid} (Line {lineno}): "{title}" is legacy for [{stanza}] "{dn}" but Deprecated!=Yes')
else:
    print("  All legacy UIDs are correctly marked Deprecated=Yes in CSV.")

# 10. Check replacement UID consistency - do deprecated CSV UIDs also appear as legacy
# in products.conf?
print()
print("=== Deprecated CSV apps that are NOT listed as legacy in any products.conf stanza ===")
conf_legacy_uids = set()
for stanza, fields in stanzas.items():
    for uid in fields.get('legacy_uids', '').split(','):
        uid = uid.strip()
        if uid:
            conf_legacy_uids.add(uid)

for i, row in enumerate(csv_rows, start=2):
    dep = row.get('Deprecated', '').strip()
    if dep.lower() == 'yes':
        uid = row.get('uid', '').strip()
        title = row.get('title', '').strip()
        if uid not in conf_legacy_uids:
            print(f'  Line {i}: uid={uid} "{title}" is Deprecated=Yes in CSV but NOT in any legacy_uids in products.conf')
