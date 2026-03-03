#!/usr/bin/env python3
"""Audit Supported_Cisco_Products_Zipped in cisco_apps.csv for naming inconsistencies."""
import csv
import re
import os

CSV = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                   'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')

products = {}  # product_name -> list of (uid, title)
with open(CSV, 'r') as f:
    for row in csv.DictReader(f):
        zipped = row.get('Supported_Cisco_Products_Zipped', '').strip()
        if zipped:
            for p in zipped.split(', '):
                p = p.strip()
                if p:
                    products.setdefault(p, []).append((row['uid'], row['title']))

names = sorted(products.keys())
print(f"Total unique product names in Supported_Cisco_Products_Zipped: {len(names)}")
print()

# Group by base name (strip parenthetical abbreviations)
base_groups = {}
for n in names:
    base = re.sub(r'\s*\(.*\)$', '', n).strip()
    base_groups.setdefault(base, []).append(n)

print("=" * 80)
print("POTENTIAL DUPLICATES (same base name, different parenthetical)")
print("=" * 80)
dups_found = 0
for base, variants in sorted(base_groups.items()):
    if len(variants) > 1:
        dups_found += 1
        print(f"\n  Base: {base}")
        for v in variants:
            uids = [u for u, t in products[v]]
            print(f"    \"{v}\" — {len(uids)} app(s): UIDs {uids[:8]}")

if not dups_found:
    print("  None found.")

# Also check for near-duplicates using fuzzy matching
print()
print("=" * 80)
print("NEAR-DUPLICATES (case-insensitive or minor word-order differences)")
print("=" * 80)
lower_groups = {}
for n in names:
    key = re.sub(r'[^a-z0-9]', '', n.lower())
    lower_groups.setdefault(key, []).append(n)

near_found = 0
for key, variants in sorted(lower_groups.items()):
    if len(variants) > 1:
        near_found += 1
        print(f"\n  Normalized: {key}")
        for v in variants:
            print(f"    \"{v}\"")

if not near_found:
    print("  None found.")

# List all unique names for reference
print()
print("=" * 80)
print("ALL UNIQUE PRODUCT NAMES")
print("=" * 80)
for n in names:
    count = len(products[n])
    print(f"  {n:70s} ({count} app(s))")
