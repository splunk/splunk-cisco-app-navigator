#!/usr/bin/env python3
"""Add card_banner and support_level fields to all stanzas in products.conf."""
import re

CONF = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'

# Mapping: addon_family -> (card_banner, support_level)
FAMILY_MAP = {
    'security-cloud': ('Powered by Cisco Security Cloud', 'cisco_supported'),
    'catalyst': ('Powered by Cisco Catalyst', 'cisco_supported'),
    'dc-networking': ('Powered by Cisco DC Networking', 'cisco_supported'),
    'cloud-security': ('Powered by Cisco Cloud Security', 'cisco_supported'),
    'collaboration': ('Powered by Cisco Collaboration', 'cisco_supported'),
    'standalone': ('', 'splunk_supported'),
    'deprecated': ('', 'not_supported'),
    'observability': ('', 'splunk_supported'),
}

# Override for specific products
PRODUCT_OVERRIDES = {
    'cisco_evm': ('', 'cisco_supported'),
    'cisco_radware': ('', 'developer_supported'),
    'cisco_secure_endpoint_edr': ('Powered by Cisco Security Cloud', 'cisco_supported'),
}

with open(CONF, 'r') as f:
    lines = f.readlines()

output = []
current_stanza = None
current_family = None
inserted = False

for line in lines:
    stripped = line.strip()

    # Detect stanza header
    m = re.match(r'^\[(.+)\]$', stripped)
    if m:
        # If we were in a stanza and never inserted, do it now
        if current_stanza and not inserted:
            if current_stanza in PRODUCT_OVERRIDES:
                cb, sl = PRODUCT_OVERRIDES[current_stanza]
            elif current_family in FAMILY_MAP:
                cb, sl = FAMILY_MAP[current_family]
            else:
                cb, sl = '', ''
            output.append('card_banner = %s\n' % cb)
            output.append('support_level = %s\n' % sl)

        current_stanza = m.group(1)
        current_family = None
        inserted = False
        output.append(line)
        continue

    # Track addon_family
    if current_stanza and stripped.startswith('addon_family'):
        eq = stripped.index('=')
        current_family = stripped[eq + 1:].strip()

    # Insert before sort_order
    if current_stanza and stripped.startswith('sort_order') and not inserted:
        if current_stanza in PRODUCT_OVERRIDES:
            cb, sl = PRODUCT_OVERRIDES[current_stanza]
        elif current_family in FAMILY_MAP:
            cb, sl = FAMILY_MAP[current_family]
        else:
            cb, sl = '', ''
        output.append('card_banner = %s\n' % cb)
        output.append('support_level = %s\n' % sl)
        inserted = True

    output.append(line)

# Handle last stanza
if current_stanza and not inserted:
    if current_stanza in PRODUCT_OVERRIDES:
        cb, sl = PRODUCT_OVERRIDES[current_stanza]
    elif current_family in FAMILY_MAP:
        cb, sl = FAMILY_MAP[current_family]
    else:
        cb, sl = '', ''
    output.append('card_banner = %s\n' % cb)
    output.append('support_level = %s\n' % sl)

with open(CONF, 'w') as f:
    f.writelines(output)

print('Done! Added card_banner and support_level to all stanzas.')
