#!/usr/bin/env python3
"""Audit sourcetypes in products.conf for uppercase and case-insensitive duplicates."""
import re
import collections
import sys

conf = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
with open(conf) as f:
    lines = f.readlines()

stanza = None
issues = []
stanza_details = {}  # stanza -> (line_number, raw_value, sourcetypes_list)

for i, line in enumerate(lines, 1):
    m = re.match(r'^\[(.+)\]', line)
    if m:
        stanza = m.group(1)
        continue
    m = re.match(r'^sourcetypes\s*=\s*(.*)', line)
    if m and stanza:
        raw = m.group(1).strip()
        if not raw:
            continue
        stypes = [s.strip() for s in raw.split(',') if s.strip()]
        stanza_details[stanza] = (i, raw, stypes)

        # Check for uppercase
        upper_ones = [s for s in stypes if s != s.lower()]
        if upper_ones:
            issues.append((stanza, 'UPPERCASE', upper_ones, i))

        # Check for case-insensitive duplicates
        seen = collections.Counter(s.lower() for s in stypes)
        dupes = {k: v for k, v in seen.items() if v > 1}
        if dupes:
            issues.append((stanza, 'CASE-INSENSITIVE DUPE', list(dupes.keys()), i))

        # Also check exact duplicates
        exact_seen = collections.Counter(stypes)
        exact_dupes = {k: v for k, v in exact_seen.items() if v > 1}
        if exact_dupes:
            issues.append((stanza, 'EXACT DUPE', list(exact_dupes.keys()), i))

if issues:
    print(f"Found {len(issues)} issues:\n")
    for stanza, kind, items, lineno in issues:
        print(f"  [{stanza}] (line {lineno}) {kind}:")
        for item in items:
            print(f"    - {item}")
    
    # Show affected stanzas with full sourcetype lists for context
    affected = set(s for s, _, _, _ in issues)
    print(f"\n--- Full sourcetype lists for affected stanzas ---\n")
    for st in sorted(affected):
        lineno, raw, stypes = stanza_details[st]
        print(f"[{st}] (line {lineno}, {len(stypes)} sourcetypes):")
        for s in stypes:
            marker = ""
            if s != s.lower():
                marker = " <-- HAS UPPERCASE"
            # check if it's a dupe
            lower_counts = collections.Counter(x.lower() for x in stypes)
            if lower_counts[s.lower()] > 1:
                marker += " <-- DUPLICATE"
            print(f"    {s}{marker}")
        print()
else:
    print("No issues found. All sourcetypes are lowercase and unique.")
