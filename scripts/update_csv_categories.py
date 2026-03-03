#!/usr/bin/env python3
"""
update_csv_categories.py
Fill in missing Cisco_Category and Cisco_Sub_Category in cisco_apps.csv
using knowledge from products.conf and manual mappings.
"""
import configparser
import csv
import os

PRODUCTS_CONF = os.path.join(
    os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
    'src', 'main', 'resources', 'splunk', 'default', 'products.conf'
)
CSV_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
    'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv'
)

# Map products.conf category -> Cisco_Category label
CAT_MAP = {
    'security': 'Security',
    'networking': 'Networking',
    'collaboration': 'Collaboration',
    'observability': 'Observability & Management',
    'deprecated': 'Security',  # most deprecated are security
}

# Map products.conf subcategory -> Cisco_Sub_Category label
SUBCAT_MAP = {
    'cloud_security': 'Cloud Security (SSE)',
    'network_security': 'Network Security / Firewall',
    'endpoint_security': 'Endpoint Security',
    'identity_access': 'Identity & Access Management',
    'email_security': 'Email Security',
    'threat_response': 'Security Incident Response and Vulnerability Management',
    'workload_security': 'Cloud & Workload Security',
    'cloud_managed_networking': 'Cloud-Managed Networking',
    'data_center': 'Data Center Switching',
    'catalyst': 'Network Management for Catalyst Devices',
    'sdwan': 'Software-Defined Networking (SDN)',
    'wireless': 'Wireless Access Points',
    'apm': 'Application Performance Monitoring',
    'network_analytics': 'Network Visibility and Analytics',
    'network_assurance': 'Network Assurance and Analytics',
    'unified_comms': 'Unified Communications and Meetings',
}

# Manual mappings for the 17 rows that have no category
MANUAL = {
    'meraki_ta': ('Networking', 'Cloud-Managed Networking'),
    'splunk_app_stream': ('Tools', 'Network Traffic Analysis'),
    'TA-cisco_acs': ('Security', 'Identity & Access Management'),
    'TA-ciscoaxl': ('Collaboration', 'Unified Communications and Meetings'),
    'TA-cisco-threat-grid': ('Security', 'Security Incident Response and Vulnerability Management'),
    'SA_cisco_cdr_axl': ('Collaboration', 'Unified Communications and Meetings'),
    'Cisco_Bug_Search_and_Analytics': ('Observability & Management', 'Product Lifecycle Intelligence'),
    'Splunk_TA_stream': ('Tools', 'Network Traffic Analysis'),
    'cisco_cdr': ('Collaboration', 'Unified Communications and Meetings'),
    'SA_oracle_sbc_cdr': ('Collaboration', 'Unified Communications and Meetings'),
    'SA_teams_json': ('Collaboration', 'Unified Communications and Meetings'),
    'DA-ITSI-CP-CUST-ATLAS-CISCO-WSA': ('Observability & Management', 'ITSI Content Pack'),
    'DA-ITSI-CP-CUST-ATLAS-CISCO-DNA': ('Observability & Management', 'ITSI Content Pack'),
    'TA-lcs-plug-in': ('Observability & Management', 'Location Services and Analytics'),
    'lcs_insights': ('Observability & Management', 'Location Services and Analytics'),
    'TA_oracle_sbc_cdr': ('Collaboration', 'Unified Communications and Meetings'),
    'canary': ('Tools', 'Development and Testing'),
}

def main():
    # Read products.conf
    p = configparser.RawConfigParser()
    p.optionxform = str
    p.read(PRODUCTS_CONF)

    # Build appid -> (category, subcategory) from products.conf
    app_map = {}
    for sec in p.sections():
        cat = p.get(sec, 'category') if p.has_option(sec, 'category') else ''
        subcat = p.get(sec, 'subcategory') if p.has_option(sec, 'subcategory') else ''
        cisco_cat = CAT_MAP.get(cat, cat.title())
        cisco_subcat = SUBCAT_MAP.get(subcat, subcat.replace('_', ' ').title() if subcat else '')

        # Map addon, app_viz, app_viz_2
        for field in ('addon', 'app_viz', 'app_viz_2'):
            if p.has_option(sec, field):
                appid = p.get(sec, field)
                if appid not in app_map:
                    app_map[appid] = (cisco_cat, cisco_subcat)

        # Map legacy_apps
        if p.has_option(sec, 'legacy_apps'):
            for la in p.get(sec, 'legacy_apps').split(','):
                la = la.strip()
                if la and la not in app_map:
                    app_map[la] = (cisco_cat, cisco_subcat)

    # Read CSV
    with open(CSV_PATH, newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # Update missing categories
    updated = 0
    for row in rows:
        appid = row['appid']
        cur_cat = row.get('Cisco_Category', '').strip()
        cur_sub = row.get('Cisco_Sub_Category', '').strip()

        if not cur_cat:
            # Try manual first, then products.conf mapping
            if appid in MANUAL:
                row['Cisco_Category'], row['Cisco_Sub_Category'] = MANUAL[appid]
                updated += 1
                print(f"  MANUAL  {appid:<50} -> {row['Cisco_Category']} / {row['Cisco_Sub_Category']}")
            elif appid in app_map:
                row['Cisco_Category'], row['Cisco_Sub_Category'] = app_map[appid]
                updated += 1
                print(f"  AUTO    {appid:<50} -> {row['Cisco_Category']} / {row['Cisco_Sub_Category']}")

    # Write back
    with open(CSV_PATH, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    total = len(rows)
    still_missing = sum(1 for r in rows if not r.get('Cisco_Category', '').strip())
    print(f"\nDone: {updated} rows updated, {still_missing} still missing out of {total} total")

if __name__ == '__main__':
    main()
