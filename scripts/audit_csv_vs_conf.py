#!/usr/bin/env python3
"""Audit cisco_apps.csv vs products.conf — research only, no changes."""

import csv
import re
from collections import defaultdict

CSV_PATH = 'packages/splunk-cisco-app-navigator/src/main/resources/splunk/lookups/cisco_apps.csv'
CONF_PATH = 'packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf'

# ── Read CSV ────────────────────────────────────────────────────────────────
with open(CSV_PATH, 'r') as f:
    reader = csv.DictReader(f)
    csv_rows = list(reader)

# ── Parse products.conf ─────────────────────────────────────────────────────
with open(CONF_PATH, 'r') as f:
    conf_text = f.read()

stanzas = {}
current_stanza = None
for line in conf_text.splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    m = re.match(r'^\[(.+)\]$', s)
    if m:
        current_stanza = m.group(1)
        stanzas[current_stanza] = {}
        continue
    if current_stanza and '=' in s:
        key, val = s.split('=', 1)
        stanzas[current_stanza][key.strip()] = val.strip()

print(f"CSV rows: {len(csv_rows)}")
print(f"products.conf stanzas: {len(stanzas)}")
print()

# ── Collect data ────────────────────────────────────────────────────────────
csv_uids = {}          # uid -> row
csv_appids = {}        # appid -> row
csv_product_names = set()
csv_rows_with_empty_products = []
csv_deprecated_rows = []

for i, row in enumerate(csv_rows, start=2):  # line 2 = first data row
    uid = row.get('uid', '').strip()
    appid = row.get('appid', '').strip()
    csv_uids[uid] = (i, row)
    csv_appids[appid] = (i, row)

    products_str = row.get('Supported_Cisco_Products_Zipped', '').strip()
    if products_str:
        for p in products_str.split(','):
            p = p.strip()
            if p:
                csv_product_names.add(p)
    else:
        csv_rows_with_empty_products.append((i, row))

    dep = row.get('Deprecated', '').strip()
    if dep.lower() == 'yes':
        csv_deprecated_rows.append((i, row))

# products.conf display names and UIDs
conf_display_names = {}
conf_all_uids = defaultdict(list)  # uid -> list of (stanza, field_name)

uid_fields = [
    'legacy_uids', 'prereq_uids', 'community_uids',
    'soar_connector_uid', 'soar_connector_2_uid', 'soar_connector_3_uid',
    'alert_action_uid', 'alert_action_2_uid',
]

for stanza, fields in stanzas.items():
    dn = fields.get('display_name', '')
    if dn:
        conf_display_names[stanza] = dn

    for uf in uid_fields:
        val = fields.get(uf, '')
        if val:
            for u in val.split(','):
                u = u.strip()
                if u:
                    conf_all_uids[u].append((stanza, uf))

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: Product Name Comparison
# ═══════════════════════════════════════════════════════════════════════════
print("=" * 80)
print("SECTION 1: PRODUCT NAME COMPARISON (CSV vs products.conf display_name)")
print("=" * 80)
conf_dn_set = set(conf_display_names.values())

csv_only = sorted(csv_product_names - conf_dn_set)
print(f"\nProduct names in CSV NOT matching any display_name ({len(csv_only)}):")
for n in csv_only:
    # Try to find close matches
    print(f'  - "{n}"')

conf_only = sorted(conf_dn_set - csv_product_names)
print(f"\nDisplay names in products.conf NOT referenced in CSV ({len(conf_only)}):")
for n in conf_only:
    stanza_id = [k for k, v in conf_display_names.items() if v == n][0]
    status = stanzas[stanza_id].get('status', '')
    coverage = stanzas[stanza_id].get('coverage_gap', '')
    print(f'  - "{n}" (stanza={stanza_id}, status={status}, coverage_gap={coverage})')

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: Deprecated Apps Check
# ═══════════════════════════════════════════════════════════════════════════
print()
print("=" * 80)
print("SECTION 2: DEPRECATED APPS CHECK")
print("=" * 80)
print(f"\nTotal apps marked Deprecated=Yes: {len(csv_deprecated_rows)}")
deprecated_issues = []
for lineno, row in csv_deprecated_rows:
    uid = row.get('uid', '').strip()
    title = row.get('title', '').strip()
    replacement = row.get('Replacement', '').strip()
    if not replacement:
        deprecated_issues.append((lineno, uid, title, "MISSING replacement UID"))
    elif replacement not in csv_uids:
        deprecated_issues.append((lineno, uid, title, f"Replacement UID {replacement} NOT in CSV"))

if deprecated_issues:
    print(f"\nIssues found ({len(deprecated_issues)}):")
    for lineno, uid, title, issue in deprecated_issues:
        print(f"  Line {lineno}: uid={uid}, title=\"{title}\" -> {issue}")
else:
    print("\nAll deprecated apps have valid replacement UIDs.")

# List all deprecated apps for reference
print(f"\nAll deprecated apps:")
for lineno, row in csv_deprecated_rows:
    uid = row.get('uid', '').strip()
    title = row.get('title', '').strip()
    replacement = row.get('Replacement', '').strip()
    repl_title = ""
    if replacement and replacement in csv_uids:
        repl_title = csv_uids[replacement][1].get('title', '')
    print(f"  Line {lineno}: uid={uid} \"{title}\" -> replacement={replacement} \"{repl_title}\"")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: Category / SubCategory Check
# ═══════════════════════════════════════════════════════════════════════════
print()
print("=" * 80)
print("SECTION 3: CATEGORY / SUBCATEGORY CHECK")
print("=" * 80)
cat_issues = []
for i, row in enumerate(csv_rows, start=2):
    uid = row.get('uid', '').strip()
    title = row.get('title', '').strip()
    cat = row.get('Cisco_Category', '').strip()
    subcat = row.get('Cisco_Sub_Category', '').strip()

    issues = []
    if not cat:
        issues.append("Cisco_Category is EMPTY")
    elif cat in (',', ',,', ' '):
        issues.append(f"Cisco_Category is just commas/whitespace: '{cat}'")

    if not subcat:
        issues.append("Cisco_Sub_Category is EMPTY")
    elif subcat in (',', ',,', ' '):
        issues.append(f"Cisco_Sub_Category is just commas/whitespace: '{subcat}'")

    if issues:
        cat_issues.append((i, uid, title, issues))

if cat_issues:
    print(f"\nIssues found ({len(cat_issues)}):")
    for lineno, uid, title, issues in cat_issues:
        for iss in issues:
            print(f"  Line {lineno}: uid={uid} \"{title}\" -> {iss}")
else:
    print("\nNo category/subcategory issues found.")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: UIDs in products.conf NOT in CSV
# ═══════════════════════════════════════════════════════════════════════════
print()
print("=" * 80)
print("SECTION 4: UIDs REFERENCED IN products.conf BUT MISSING FROM CSV")
print("=" * 80)
missing_uids = []
for uid, refs in sorted(conf_all_uids.items()):
    if uid not in csv_uids:
        missing_uids.append((uid, refs))

if missing_uids:
    print(f"\nMissing UIDs ({len(missing_uids)}):")
    for uid, refs in missing_uids:
        for stanza, field in refs:
            dn = conf_display_names.get(stanza, stanza)
            print(f"  UID {uid} referenced in [{stanza}].{field} (product: \"{dn}\") -> NOT in CSV")
else:
    print("\nAll UIDs referenced in products.conf are present in CSV.")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: Apps with empty Supported_Cisco_Products_Zipped
# ═══════════════════════════════════════════════════════════════════════════
print()
print("=" * 80)
print("SECTION 5: CSV ROWS WITH EMPTY Supported_Cisco_Products_Zipped")
print("=" * 80)
if csv_rows_with_empty_products:
    print(f"\nRows with empty product mapping ({len(csv_rows_with_empty_products)}):")
    for lineno, row in csv_rows_with_empty_products:
        uid = row.get('uid', '').strip()
        title = row.get('title', '').strip()
        appid = row.get('appid', '').strip()
        dep = row.get('Deprecated', '').strip()
        app_class = row.get('Cisco_App_Class', '').strip()
        print(f"  Line {lineno}: uid={uid} appid={appid} \"{title}\" Deprecated={dep} Class={app_class}")
else:
    print("\nAll CSV rows have product mappings.")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6: Other Data Quality Issues
# ═══════════════════════════════════════════════════════════════════════════
print()
print("=" * 80)
print("SECTION 6: OTHER DATA QUALITY ISSUES")
print("=" * 80)

# Check for duplicate UIDs
uid_counts = defaultdict(list)
for i, row in enumerate(csv_rows, start=2):
    uid = row.get('uid', '').strip()
    uid_counts[uid].append(i)

dup_uids = {u: lines for u, lines in uid_counts.items() if len(lines) > 1}
if dup_uids:
    print(f"\nDuplicate UIDs ({len(dup_uids)}):")
    for uid, lines in dup_uids.items():
        print(f"  UID {uid} appears on lines: {lines}")
else:
    print("\nNo duplicate UIDs found.")

# Check for duplicate appids
appid_counts = defaultdict(list)
for i, row in enumerate(csv_rows, start=2):
    appid = row.get('appid', '').strip()
    appid_counts[appid].append(i)

dup_appids = {a: lines for a, lines in appid_counts.items() if len(lines) > 1}
if dup_appids:
    print(f"\nDuplicate appids ({len(dup_appids)}):")
    for appid, lines in dup_appids.items():
        print(f"  appid '{appid}' appears on lines: {lines}")
else:
    print("\nNo duplicate appids found.")

# Check Cisco_App_Class values
app_classes = defaultdict(int)
for row in csv_rows:
    ac = row.get('Cisco_App_Class', '').strip()
    app_classes[ac] += 1
print(f"\nCisco_App_Class distribution:")
for cls, cnt in sorted(app_classes.items()):
    print(f"  '{cls}': {cnt}")

# Check for apps where Deprecated=Yes but Cisco_App_Class is not empty
print(f"\nApps marked Deprecated=Yes with non-empty Cisco_App_Class:")
for lineno, row in csv_deprecated_rows:
    app_class = row.get('Cisco_App_Class', '').strip()
    if app_class:
        uid = row.get('uid', '').strip()
        title = row.get('title', '').strip()
        print(f"  Line {lineno}: uid={uid} \"{title}\" Class={app_class}")

# Cross-check: addon UIDs from products.conf that should be in CSV
print()
print("=" * 80)
print("SECTION 7: ADDON/APP_VIZ APPIDS IN products.conf vs CSV")
print("=" * 80)
addon_appids_not_in_csv = []
for stanza, fields in stanzas.items():
    dn = fields.get('display_name', stanza)
    for field_name in ['addon', 'app_viz', 'app_viz_2']:
        appid = fields.get(field_name, '').strip()
        if appid and appid not in csv_appids:
            addon_appids_not_in_csv.append((stanza, dn, field_name, appid))

if addon_appids_not_in_csv:
    print(f"\nAppIDs referenced in products.conf but NOT in CSV ({len(addon_appids_not_in_csv)}):")
    for stanza, dn, field, appid in addon_appids_not_in_csv:
        print(f"  [{stanza}].{field} = '{appid}' (product: \"{dn}\") -> NOT in CSV")
else:
    print("\nAll addon/app_viz appids from products.conf are in CSV.")

# Also check addon Splunkbase URLs for UIDs
print()
print("=" * 80)
print("SECTION 8: ADDON SPLUNKBASE UIDs FROM URLs vs CSV")
print("=" * 80)
url_fields = ['addon_splunkbase_url', 'app_viz_splunkbase_url', 'app_viz_2_splunkbase_url']
url_uids_missing = []
for stanza, fields in stanzas.items():
    dn = fields.get('display_name', stanza)
    for uf in url_fields:
        url = fields.get(uf, '')
        if url:
            m = re.search(r'/app/(\d+)', url)
            if m:
                uid_from_url = m.group(1)
                if uid_from_url not in csv_uids:
                    url_uids_missing.append((stanza, dn, uf, uid_from_url, url))

if url_uids_missing:
    print(f"\nSplunkbase UIDs from URLs missing from CSV ({len(url_uids_missing)}):")
    for stanza, dn, field, uid, url in url_uids_missing:
        print(f"  [{stanza}].{field} -> UID {uid} NOT in CSV")
        print(f"    URL: {url}")
        print(f"    Product: \"{dn}\"")
else:
    print("\nAll Splunkbase UIDs from addon/app_viz URLs are in CSV.")
