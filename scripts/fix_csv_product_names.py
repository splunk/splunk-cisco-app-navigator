#!/usr/bin/env python3
"""Fix duplicate product names in Supported_Cisco_Products_Zipped column of cisco_apps.csv.

Normalizes:
  "Cisco Meraki" -> "Cisco Meraki (Meraki)"
  "Cisco AppDynamics" -> "Cisco AppDynamics (AppD)"
  "Cisco Web Security Appliance" -> "Cisco Web Security Appliance (WSA)"
  "Cisco Webex" -> "Cisco Webex (Webex)"
"""
import csv
import os

CSV = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                   'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')

NORMALIZE_MAP = {
    'Cisco Meraki': 'Cisco Meraki (Meraki)',
    'Cisco AppDynamics': 'Cisco AppDynamics (AppD)',
    'Cisco Web Security Appliance': 'Cisco Web Security Appliance (WSA)',
    'Cisco Webex': 'Cisco Webex (Webex)',
}

rows = []
fieldnames = None
fixes = 0

with open(CSV, 'r') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        zipped = row.get('Supported_Cisco_Products_Zipped', '').strip()
        if zipped:
            parts = [p.strip() for p in zipped.split(', ')]
            new_parts = []
            changed = False
            for p in parts:
                if p in NORMALIZE_MAP:
                    new_parts.append(NORMALIZE_MAP[p])
                    changed = True
                else:
                    new_parts.append(p)
            if changed:
                fixes += 1
                old_val = row['Supported_Cisco_Products_Zipped']
                new_val = ', '.join(new_parts)
                row['Supported_Cisco_Products_Zipped'] = new_val
                print(f"  [{row['uid']}] {row['title']}")
                print(f"    OLD: {old_val}")
                print(f"    NEW: {new_val}")
                print()
        rows.append(row)

with open(CSV, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)

print(f"Fixed {fixes} rows in {CSV}")
