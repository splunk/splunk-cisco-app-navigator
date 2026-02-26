#!/usr/bin/env python3
"""Add secure_networking_gtm field to all products in products.conf."""
import re

CONF = 'packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'

# Products that are part of Secure Networking GTM (from CSV)
GTM_STANZAS = {
    'cisco_ai_defense',
    'cisco_access_points',
    'cisco_catalyst_center',
    'cisco_catalyst_sdwan',
    'cisco_catalyst_switches',
    'cisco_cloud_web_security',   # deprecated but in GTM
    'cisco_cyber_vision',
    'cisco_duo',
    'cisco_etd',
    'cisco_xdr',
    'cisco_identity_intelligence',
    'cisco_ise',
    'cisco_isovalent',
    'cisco_isovalent_edge_processor',
    'cisco_meraki',
    'cisco_multicloud_defense',
    'cisco_nvm',
    'cisco_nexus_hyperfabric',
    'cisco_nexus',
    'cisco_secure_access',
    'cisco_esa',
    'cisco_secure_endpoint',
    'cisco_secure_firewall',
    'cisco_secure_malware_analytics',
    'cisco_secure_network_analytics',
    'cisco_secure_workload',
    'cisco_talos',
    'cisco_thousandeyes',
    'cisco_umbrella',
    'cisco_wlc',
    'cisco_evm',  # EVM is likely part of this strategy as endpoint visibility
}

with open(CONF) as f:
    text = f.read()

# Add secure_networking_gtm after is_new for each stanza
current_stanza = None
lines = text.split('\n')
new_lines = []
for line in lines:
    # Track current stanza
    m = re.match(r'^\[([^\]]+)\]', line)
    if m:
        current_stanza = m.group(1)
    
    new_lines.append(line)
    
    # After is_new line, insert secure_networking_gtm
    if re.match(r'^is_new\s*=', line):
        gtm_val = 'true' if current_stanza in GTM_STANZAS else ''
        new_lines.append(f'secure_networking_gtm = {gtm_val}')

text = '\n'.join(new_lines)

with open(CONF, 'w') as f:
    f.write(text)

# Verify
true_count = text.count('secure_networking_gtm = true')
empty_count = text.count('secure_networking_gtm = \n') + text.count('secure_networking_gtm = \r')
total = text.count('secure_networking_gtm =')
print(f'secure_networking_gtm field added: {total} total, {true_count} = true')

# List which ones got true
for stanza in sorted(GTM_STANZAS):
    pattern = rf'\[{re.escape(stanza)}\].*?secure_networking_gtm\s*=\s*true'
    if re.search(pattern, text, re.DOTALL):
        print(f'  ✓ {stanza}')
    else:
        print(f'  ✗ {stanza} (not found in conf)')
