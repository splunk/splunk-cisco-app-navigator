#!/usr/bin/env python3
"""Audit cisco_apps.csv for pre/post archive stats."""
import csv, os

CSV = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                   'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')

rows = list(csv.DictReader(open(CSV)))
print(f"Total rows in cisco_apps.csv: {len(rows)}")

# is_archived breakdown
archived = {}
for r in rows:
    a = r.get('is_archived', 'unknown')
    archived.setdefault(a, 0)
    archived[a] += 1
print("\nBy is_archived:")
for a, c in sorted(archived.items()):
    print(f"  {a}: {c}")

# Deprecated breakdown
dep = {}
for r in rows:
    d = r.get('Deprecated', '')
    dep.setdefault(d or '(empty)', 0)
    dep[d or '(empty)'] += 1
print("\nBy Deprecated:")
for d, c in sorted(dep.items()):
    print(f"  '{d}': {c}")

# Before archive: ALL rows excluding SOAR connectors
before_no_soar = [r for r in rows if r.get('type', '') != 'connector']
print(f"\n=== BEFORE ARCHIVE (all rows excl SOAR connectors) ===")
print(f"Total: {len(before_no_soar)}")
types_b = {}
for r in before_no_soar:
    t = r.get('type', 'unknown')
    types_b.setdefault(t, 0)
    types_b[t] += 1
for t, c in sorted(types_b.items()):
    print(f"  {t}: {c}")

supports_b = {}
for r in before_no_soar:
    s = r.get('support', 'unknown')
    supports_b.setdefault(s, 0)
    supports_b[s] += 1
print("Support:")
for s, c in sorted(supports_b.items()):
    print(f"  {s}: {c}")

# After archive: non-archived, excl SOAR
after_no_soar = [r for r in rows if r.get('type', '') != 'connector'
                 and r.get('is_archived', '').lower() not in ('true', '1', 'yes')]
print(f"\n=== AFTER ARCHIVE (non-archived excl SOAR) ===")
print(f"Total: {len(after_no_soar)}")
types_a = {}
for r in after_no_soar:
    t = r.get('type', 'unknown')
    types_a.setdefault(t, 0)
    types_a[t] += 1
for t, c in sorted(types_a.items()):
    print(f"  {t}: {c}")

supports_a = {}
for r in after_no_soar:
    s = r.get('support', 'unknown')
    supports_a.setdefault(s, 0)
    supports_a[s] += 1
print("Support:")
for s, c in sorted(supports_a.items()):
    print(f"  {s}: {c}")

# After deprecation & replacement
after_dep = [r for r in after_no_soar if r.get('Deprecated', '').lower() not in ('true', '1', 'yes', 'deprecated')]
print(f"\n=== AFTER DEPRECATION & REPLACEMENT (non-archived, non-deprecated, excl SOAR) ===")
print(f"Total: {len(after_dep)}")
types_d = {}
for r in after_dep:
    t = r.get('type', 'unknown')
    types_d.setdefault(t, 0)
    types_d[t] += 1
for t, c in sorted(types_d.items()):
    print(f"  {t}: {c}")

supports_d = {}
for r in after_dep:
    s = r.get('support', 'unknown')
    supports_d.setdefault(s, 0)
    supports_d[s] += 1
print("Support:")
for s, c in sorted(supports_d.items()):
    print(f"  {s}: {c}")

# Archived items
archived_rows = [r for r in rows if r.get('is_archived', '').lower() in ('true', '1', 'yes')]
print(f"\n=== ARCHIVED ITEMS ===")
print(f"Total archived: {len(archived_rows)}")
types_arch = {}
for r in archived_rows:
    t = r.get('type', 'unknown')
    types_arch.setdefault(t, 0)
    types_arch[t] += 1
for t, c in sorted(types_arch.items()):
    print(f"  {t}: {c}")

# SOAR connectors
soar = [r for r in rows if r.get('type', '') == 'connector']
print(f"\n=== SOAR CONNECTORS (separate) ===")
print(f"Total: {len(soar)}")

# Cisco products coverage
before_products = set()
for r in before_no_soar:
    zipped = r.get('Supported_Cisco_Products_Zipped', '')
    if zipped:
        for p in zipped.split(','):
            p = p.strip()
            if p:
                before_products.add(p)

after_products = set()
for r in after_no_soar:
    zipped = r.get('Supported_Cisco_Products_Zipped', '')
    if zipped:
        for p in zipped.split(','):
            p = p.strip()
            if p:
                after_products.add(p)

print(f"\nCisco products covered BEFORE archive: {len(before_products)}")
print(f"Cisco products covered AFTER archive: {len(after_products)}")
lost = before_products - after_products
if lost:
    print(f"Products lost coverage ({len(lost)}):")
    for p in sorted(lost):
        print(f"  {p}")
