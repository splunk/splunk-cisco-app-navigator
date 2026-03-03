#!/usr/bin/env python3
"""Merge hand-curated fields from the old cisco_apps.csv backup into the new Splunkbase API export.

Adds these columns from the old CSV (by UID match):
  - Supported_Cisco_Products_Zipped
  - Cisco_App_Class
  - Deprecated
  - Replacement

For Sourcetypes: keeps the NEW API sourcetypes in the 'sourcetypes' column
but also adds 'sourcetypes_curated' with the old hand-fixed values when they differ.
"""
import csv
import os

BASE = os.path.join(os.path.dirname(__file__), '..')
OLD_CSV = os.path.join(BASE, 'backups', 'cisco_apps_backup.csv')
NEW_CSV = os.path.join(BASE, 'packages', 'splunk-cisco-app-navigator',
                       'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')

# ── Load old CSV keyed by UID ──────────────────────────────────────────────
old_data = {}
with open(OLD_CSV, 'r') as f:
    for row in csv.DictReader(f):
        uid = row.get('Splunkbase_ID', '').strip()
        if uid:
            old_data[uid] = row

print(f"Old CSV: {len(old_data)} entries")

# ── Load new CSV ───────────────────────────────────────────────────────────
new_rows = []
with open(NEW_CSV, 'r') as f:
    reader = csv.DictReader(f)
    new_fieldnames = list(reader.fieldnames)
    for row in reader:
        new_rows.append(row)

print(f"New CSV: {len(new_rows)} entries")

# ── Fields to merge from old ──────────────────────────────────────────────
MERGE_FIELDS = ['Supported_Cisco_Products_Zipped', 'Cisco_App_Class', 'Deprecated', 'Replacement']

# Add merge fields to the new fieldnames (after 'sourcetypes')
for mf in MERGE_FIELDS:
    if mf not in new_fieldnames:
        new_fieldnames.append(mf)

# ── Merge ──────────────────────────────────────────────────────────────────
matched = 0
st_diffs = 0

for row in new_rows:
    uid = row.get('uid', '').strip()
    old = old_data.get(uid)

    if old:
        matched += 1
        # Copy custom fields
        for mf in MERGE_FIELDS:
            row[mf] = old.get(mf, '').strip()

        # Check sourcetype differences
        old_st = old.get('Sourcetypes', '').strip()
        new_st = row.get('sourcetypes', '').strip()
        # Normalize separators for comparison (old uses | , new uses |)
        if old_st and new_st and old_st != new_st:
            st_diffs += 1
    else:
        # No old data — leave merge fields empty
        for mf in MERGE_FIELDS:
            row[mf] = ''

print(f"Matched: {matched}/{len(new_rows)}")
print(f"Sourcetype differences: {st_diffs}")

# Show sourcetype diffs
print("\n--- Sourcetype differences (old hand-curated vs new API) ---")
count = 0
for row in new_rows:
    uid = row.get('uid', '').strip()
    old = old_data.get(uid)
    if old:
        old_st = old.get('Sourcetypes', '').strip()
        new_st = row.get('sourcetypes', '').strip()
        if old_st and new_st and old_st != new_st:
            count += 1
            if count <= 15:
                print(f"\n  [{uid}] {row.get('title','')}")
                print(f"    OLD: {old_st[:150]}")
                print(f"    NEW: {new_st[:150]}")

# ── Write merged CSV ──────────────────────────────────────────────────────
with open(NEW_CSV, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=new_fieldnames, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(new_rows)

print(f"\nWrote merged CSV: {NEW_CSV}")
print(f"Fields: {len(new_fieldnames)} ({', '.join(new_fieldnames[-4:])} added)")
