#!/usr/bin/env python3
"""Compare ALL fields between backup/products.conf and current products.conf to find missing values."""
import re
import os

os.chdir('/Users/akhamis/repo/cisco_control_center_app')

def parse_conf(text):
    stanzas = {}
    current = None
    for line in text.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = re.match(r'^\[(.+)\]$', line)
        if m:
            current = m.group(1)
            stanzas[current] = {}
            continue
        if current and '=' in line:
            k, v = line.split('=', 1)
            stanzas[current][k.strip()] = v.strip()
    return stanzas

with open('backup/products.conf') as f:
    backup = parse_conf(f.read())
with open('packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf') as f:
    current = parse_conf(f.read())

# Check ALL fields — find any field that has a value in backup but is empty in current
issues = []
for name in sorted(set(backup) & set(current)):
    for field in sorted(backup[name]):
        bval = backup[name].get(field, '')
        cval = current[name].get(field, '')
        if bval and not cval:
            issues.append((name, field, bval))

if issues:
    # Group by stanza
    from collections import defaultdict
    by_stanza = defaultdict(list)
    for name, field, val in issues:
        by_stanza[name].append((field, val))
    
    print(f"Found {len(issues)} missing field values across {len(by_stanza)} stanzas:\n")
    for name in sorted(by_stanza):
        print(f"  [{name}]")
        for field, val in by_stanza[name]:
            display = val[:80] + ('...' if len(val) > 80 else '')
            print(f"    {field} = {display}")
        print()
else:
    print("No missing field values found. Current matches backup for all populated fields.")
