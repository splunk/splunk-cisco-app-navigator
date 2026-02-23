#!/usr/bin/env python3
"""Full analysis of the CORRECT cisco_apps.csv (125 rows, from the app lookups)."""
import csv
from collections import Counter

CSV = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/lookups/cisco_apps.csv'

with open(CSV, 'r') as f:
    rows = list(csv.DictReader(f))

n = len(rows)
print(f"Total rows: {n}")
print(f"Columns: {list(rows[0].keys())}")
print()

# Type breakdown
types = Counter(r.get('type','').strip() for r in rows)
print(f"Type values: {dict(types)}")

# Cisco_App_Class breakdown
classes = Counter(r.get('Cisco_App_Class','').strip() for r in rows)
print(f"Cisco_App_Class values: {dict(classes)}")

# Filter out connectors and prerequisites per user instruction
connectors = [r for r in rows if r.get('type','').strip().lower() == 'connector']
prereqs = [r for r in rows if r.get('Cisco_App_Class','').strip().lower() == 'prerequisites']
print(f"\nConnectors (type=connector): {len(connectors)}")
print(f"Prerequisites (Cisco_App_Class=Prerequisites): {len(prereqs)}")

# Build filtered set (exclude connectors and prerequisites)
excluded = set()
for r in rows:
    if r.get('type','').strip().lower() == 'connector':
        excluded.add(id(r))
    if r.get('Cisco_App_Class','').strip().lower() == 'prerequisites':
        excluded.add(id(r))
filtered = [r for r in rows if id(r) not in excluded]
fn = len(filtered)
print(f"\nAfter excluding connectors + prerequisites: {fn} apps & add-ons")

# Now do ALL analysis on the filtered set
rows = filtered
n = fn

print("\n" + "=" * 70)
print(f"CISCO SPLUNKBASE ECOSYSTEM AUDIT — {n} Apps & Add-ons")
print("=" * 70)

# Archive Status
archive_status = Counter(r.get('Archive_Status','').strip() for r in rows)
print(f"\n--- ARCHIVE STATUS ---")
for k, v in archive_status.most_common():
    print(f"  {k or '(empty)'}: {v} ({round(v*100/n)}%)")

live = [r for r in rows if r.get('Archive_Status','').strip() == 'live']
archived = [r for r in rows if r.get('Archived','').strip().lower() in ('true','yes')]
archived_status = [r for r in rows if r.get('Archive_Status','').strip() == 'archived']
manually_archived = [r for r in rows if r.get('Archive_Status','').strip() == 'archived_manually']
flagged = [r for r in rows if r.get('Archive_Status','').strip() == 'flagged']
deprecated = [r for r in rows if r.get('Deprecated','').strip().lower() in ('true','yes')]

print(f"\nLive: {len(live)}")
print(f"Archived (Archived field = true/Yes): {len(archived)}")
print(f"Archive_Status=archived: {len(archived_status)}")
print(f"Archive_Status=archived_manually: {len(manually_archived)}")
print(f"Flagged: {len(flagged)}")
print(f"Deprecated: {len(deprecated)}")

# Dead/dying union
dead_dying = [r for r in rows if (
    r.get('Archived','').strip().lower() in ('true','yes') or
    r.get('Deprecated','').strip().lower() in ('true','yes') or
    r.get('Archive_Status','').strip() == 'flagged'
)]
print(f"Dead/dying/flagged (union): {len(dead_dying)} ({round(len(dead_dying)*100/n)}%)")

# Support
print(f"\n--- SUPPORT STATUS ---")
support = Counter(r.get('Support','').strip() for r in rows)
for k, v in support.most_common():
    print(f"  {k or '(empty)'}: {v} ({round(v*100/n)}%)")

not_supp = [r for r in rows if r.get('Support','').strip() == 'not_supported']
dev_supp = [r for r in rows if r.get('Support','').strip() == 'developer']
cisco_supp = [r for r in rows if r.get('Support','').strip() == 'cisco']
splunk_supp = [r for r in rows if r.get('Support','').strip() == 'splunk']

print(f"\nNot supported: {len(not_supp)} ({round(len(not_supp)*100/n)}%)")
print(f"Developer-supported: {len(dev_supp)} ({round(len(dev_supp)*100/n)}%)")
print(f"Cisco-supported: {len(cisco_supp)} ({round(len(cisco_supp)*100/n)}%)")
print(f"Splunk-supported: {len(splunk_supp)} ({round(len(splunk_supp)*100/n)}%)")
print(f"Cisco + Splunk combined: {len(cisco_supp)+len(splunk_supp)} ({round((len(cisco_supp)+len(splunk_supp))*100/n)}%)")

# Developers
print(f"\n--- WHO BUILT THESE? ---")
devs = Counter(r.get('Developed_By','').strip() for r in rows)
for k, v in devs.most_common():
    print(f"  {k or '(empty)'}: {v}")

# Group developers
cisco_devs = [r for r in rows if 'cisco' in r.get('Developed_By','').strip().lower()]
splunk_devs = [r for r in rows if 'splunk' in r.get('Developed_By','').strip().lower()]
community = [r for r in rows if r not in cisco_devs and r not in splunk_devs]
unique_devs = set(r.get('Developed_By','').strip() for r in rows if r.get('Developed_By','').strip())

print(f"\nCisco-built: {len(cisco_devs)} ({round(len(cisco_devs)*100/n)}%)")
print(f"Splunk-built: {len(splunk_devs)} ({round(len(splunk_devs)*100/n)}%)")
print(f"Community/third-party: {len(community)} ({round(len(community)*100/n)}%)")
print(f"Unique developers/orgs: {len(unique_devs)}")

# Live apps breakdown
print(f"\n--- LIVE APPS SUPPORT BREAKDOWN (of {len(live)} live) ---")
live_not_supp = [r for r in live if r.get('Support','').strip() == 'not_supported']
live_dev_supp = [r for r in live if r.get('Support','').strip() == 'developer']
live_cisco = [r for r in live if r.get('Support','').strip() == 'cisco']
live_splunk = [r for r in live if r.get('Support','').strip() == 'splunk']
print(f"Live + Cisco supported: {len(live_cisco)}")
print(f"Live + Splunk supported: {len(live_splunk)}")
print(f"Live + Developer supported: {len(live_dev_supp)}")
print(f"Live + NOT supported: {len(live_not_supp)}")

# Replacements
print(f"\n--- REPLACEMENT & CONSOLIDATION ---")
has_replacement = [r for r in rows if r.get('Replacement','').strip()]
unique_replacements = set(r.get('Replacement','').strip() for r in rows if r.get('Replacement','').strip())
print(f"Apps with a listed replacement: {len(has_replacement)}")
print(f"Replaced by only: {len(unique_replacements)} unique apps")
for rep in sorted(unique_replacements):
    absorbs = [r for r in rows if r.get('Replacement','').strip() == rep]
    print(f"  Splunkbase ID {rep}: absorbs {len(absorbs)} apps")
    for a in absorbs:
        print(f"    - {a.get('App_Name','').strip()}")

# Non-functional union (archived OR deprecated OR flagged OR not_supported)
non_func = [r for r in rows if (
    r.get('Archived','').strip().lower() in ('true','yes') or
    r.get('Deprecated','').strip().lower() in ('true','yes') or
    r.get('Archive_Status','').strip() == 'flagged' or
    r.get('Support','').strip() == 'not_supported'
)]
print(f"\n--- NON-FUNCTIONAL / UNSUPPORTED (union) ---")
print(f"Count: {len(non_func)} ({round(len(non_func)*100/n)}%)")

# Deprecated but still live (zombie apps)
dep_live = [r for r in rows if r.get('Deprecated','').strip().lower() in ('true','yes') and r.get('Archive_Status','').strip() == 'live']
print(f"\n--- ZOMBIE APPS (deprecated but still live) ---")
print(f"Count: {len(dep_live)}")
for r in dep_live:
    print(f"  {r.get('App_Name','').strip()}")

# Live but unsupported (ticking time bombs)
print(f"\n--- TICKING TIME BOMBS (live + not_supported) ---")
print(f"Count: {len(live_not_supp)}")
for r in live_not_supp:
    print(f"  {r.get('App_Name','').strip()}")

# Types in filtered set
print(f"\n--- TYPES (filtered) ---")
types_f = Counter(r.get('type','').strip() for r in rows)
for k, v in types_f.most_common():
    print(f"  {k or '(empty)'}: {v}")

# Show connectors and prerequisites that were excluded
print(f"\n--- EXCLUDED: CONNECTORS ---")
for r in connectors:
    print(f"  {r.get('App_Name','').strip()} (type={r.get('type','').strip()}, class={r.get('Cisco_App_Class','').strip()})")
print(f"\n--- EXCLUDED: PREREQUISITES ---")
for r in prereqs:
    print(f"  {r.get('App_Name','').strip()} (type={r.get('type','').strip()}, class={r.get('Cisco_App_Class','').strip()})")
