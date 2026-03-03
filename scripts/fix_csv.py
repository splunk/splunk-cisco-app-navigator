#!/usr/bin/env python3
"""Fix cisco_apps.csv data quality issues based on products.conf audit."""

import csv
import os
import shutil
from datetime import datetime

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                        'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')
CSV_PATH = os.path.abspath(CSV_PATH)

def main():
    # Read CSV
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"Read {len(rows)} rows from cisco_apps.csv")
    changes = []

    for row in rows:
        uid = row['uid']

        # ── Fix 1: Product name "Cisco Threat Grid" → "Cisco Secure Malware Analytics (SMA)" ──
        if uid == '4251':
            old = row['Supported_Cisco_Products_Zipped']
            if 'Cisco Threat Grid' in old:
                row['Supported_Cisco_Products_Zipped'] = old.replace(
                    'Cisco Threat Grid', 'Cisco Secure Malware Analytics (SMA)')
                changes.append(f"uid={uid}: Renamed 'Cisco Threat Grid' → 'Cisco Secure Malware Analytics (SMA)' in Supported_Cisco_Products_Zipped")

        # ── Fix 2: Product name "Cisco Bug Search Tool (BST)" → "Cisco Bug Search Tool" ──
        if uid == '4817':
            old = row['Supported_Cisco_Products_Zipped']
            if 'Cisco Bug Search Tool (BST)' in old:
                row['Supported_Cisco_Products_Zipped'] = old.replace(
                    'Cisco Bug Search Tool (BST)', 'Cisco Bug Search Tool')
                changes.append(f"uid={uid}: Renamed 'Cisco Bug Search Tool (BST)' → 'Cisco Bug Search Tool' in Supported_Cisco_Products_Zipped")

        # ── Fix 3: Missing replacement UID for deprecated Cisco IPS add-on ──
        if uid == '1903':
            if row['Deprecated'] == 'Yes' and not row['Replacement'].strip():
                row['Replacement'] = '7404'
                changes.append(f"uid={uid}: Set Replacement=7404 (Cisco Security Cloud) for deprecated IPS add-on")

        # ── Fix 4: Clear Cisco_App_Class for deprecated SD-WAN app ──
        if uid == '6657':
            if row['Deprecated'] == 'Yes' and row['Cisco_App_Class'] == 'Main Apps':
                row['Cisco_App_Class'] = ''
                changes.append(f"uid={uid}: Cleared Cisco_App_Class (was 'Main Apps' on deprecated app)")

        # ── Fix 5: Product mapping for empty Supported_Cisco_Products_Zipped ──
        product_mappings = {
            '1711': 'Cisco Meraki (Meraki)',                         # meraki_ta - Meraki Presence
            '7390': 'Cisco Web Security Appliance (WSA)',            # Atlas ITSI CP for WSA
            '7581': 'Cisco Catalyst Center',                         # Atlas ITSI CP for DNA
        }
        if uid in product_mappings:
            if not row['Supported_Cisco_Products_Zipped'].strip():
                row['Supported_Cisco_Products_Zipped'] = product_mappings[uid]
                changes.append(f"uid={uid}: Set Supported_Cisco_Products_Zipped='{product_mappings[uid]}'")

        # ── Fix 6: Add Umbrella Investigate product name to its apps ──
        # opendns_investigate (3324) should reference Umbrella AND Umbrella Investigate
        if uid == '3324':
            old = row['Supported_Cisco_Products_Zipped']
            if 'Umbrella Investigate' not in old:
                new_val = old + ', Cisco Umbrella Investigate' if old.strip() else 'Cisco Umbrella Investigate'
                row['Supported_Cisco_Products_Zipped'] = new_val
                changes.append(f"uid={uid}: Added 'Cisco Umbrella Investigate' to Supported_Cisco_Products_Zipped")

        # Umbrella Investigate SOAR connector (5780)
        if uid == '5780':
            old = row['Supported_Cisco_Products_Zipped']
            if 'Umbrella Investigate' not in old:
                new_val = old + ', Cisco Umbrella Investigate' if old.strip() else 'Cisco Umbrella Investigate'
                row['Supported_Cisco_Products_Zipped'] = new_val
                changes.append(f"uid={uid}: Added 'Cisco Umbrella Investigate' to Supported_Cisco_Products_Zipped")

        # ── Fix 7: Normalize empty Deprecated fields to "No" ──
        if not row['Deprecated'].strip():
            row['Deprecated'] = 'No'
            changes.append(f"uid={uid}: Set empty Deprecated field to 'No'")

        # ── Fix 8: Mark archived apps that should be deprecated ──
        archived_should_deprecate = {
            '1297': '3471',   # AppDynamics (archived) → Splunk Add-on for AppDynamics
            '3472': '3471',   # Splunk App for AppDynamics (archived) → Splunk Add-on for AppDynamics
            '1629': '3662',   # eStreamer v1 (archived) → eStreamer eNcore
            '1808': '3662',   # Splunk Add-on for Cisco FireSIGHT (archived) → eStreamer eNcore
            '3504': '7404',   # Duo Splunk Connector (archived) → Cisco Security Cloud
            '3194': '7404',   # DUO Log Add-on (archived) → Cisco Security Cloud
        }
        if uid in archived_should_deprecate:
            if row['is_archived'] == 'true' and row['Deprecated'] != 'Yes':
                row['Deprecated'] = 'Yes'
                if not row['Replacement'].strip():
                    row['Replacement'] = archived_should_deprecate[uid]
                changes.append(f"uid={uid}: Marked as Deprecated=Yes (was archived), Replacement={archived_should_deprecate[uid]}")

        # ── Fix 9: SA_cisco_meeting_server → add Meeting Management reference ──
        if uid == '8413':
            old = row['Supported_Cisco_Products_Zipped']
            if 'Meeting Management' not in old:
                new_val = old + ', Cisco Meeting Management' if old.strip() else 'Cisco Meeting Management'
                row['Supported_Cisco_Products_Zipped'] = new_val
                changes.append(f"uid={uid}: Added 'Cisco Meeting Management' to Supported_Cisco_Products_Zipped")

    # ── Backup and write ──
    backup_path = CSV_PATH + f'.{datetime.now().strftime("%Y%m%d_%H%M%S")}.bak'
    shutil.copy2(CSV_PATH, backup_path)
    print(f"Backup created: {os.path.basename(backup_path)}")

    with open(CSV_PATH, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{len(changes)} changes applied:")
    for c in changes:
        print(f"  ✓ {c}")

if __name__ == '__main__':
    main()
