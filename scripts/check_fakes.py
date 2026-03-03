#!/usr/bin/env python3
"""Check which fake sourcetypes are actually present in products.conf."""
import re

CONF = "/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf"

CHECKS = {
    "cisco_secure_firewall": ["cisco_asa", "sourcefire"],
    "cisco_esa": ["cisco:esa", "cisco_esa"],
    "cisco_wsa": ["cisco:wsa:squid:new"],
    "cisco_intersight": ["cisco:intersight:contract", "cisco:intersight:fabric",
                         "cisco:intersight:license", "cisco:intersight:network",
                         "cisco:intersight:target"],
    "cisco_ise": ["cisco:ise"],
    "cisco_catalyst_sdwan": ["cisco:sdwan:sgacl:logs"],
    "cisco_secure_ips": ["cisco_ips_syslog"],
}

with open(CONF) as f:
    lines = f.readlines()

stanza = None
for line in lines:
    line = line.strip()
    m = re.match(r'^\[([^\]]+)\]', line)
    if m:
        stanza = m.group(1)
        continue
    if stanza in CHECKS and line.startswith('sourcetypes'):
        _, _, raw = line.partition('=')
        stypes = [s.strip() for s in raw.strip().split(',') if s.strip()]
        stypes_lower = {s.lower() for s in stypes}
        
        print(f"\n[{stanza}] ({len(stypes)} sourcetypes):")
        for fake in CHECKS[stanza]:
            if fake.lower() in stypes_lower:
                print(f"  FOUND (need to remove): {fake}")
            else:
                print(f"  not present: {fake}")
        
        # Show all sourcetypes for context
        print(f"  All: {stypes}")
