#!/usr/bin/env python3
"""Check current aliases for products that need former name references."""
import configparser, os
CONF = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                    'src', 'main', 'resources', 'splunk', 'default', 'products.conf')
with open(CONF) as f:
    content = '[DEFAULT]\n' + f.read()
c = configparser.ConfigParser(interpolation=None)
c.read_string(content)

targets = [
    'cisco_secure_firewall', 'cisco_acs', 'cisco_ise', 'cisco_secure_endpoint',
    'cisco_cucm', 'cisco_esa', 'cisco_wsa', 'cisco_secure_ips', 'cisco_catalyst_sdwan',
    'cisco_umbrella', 'cisco_duo', 'cisco_appdynamics', 'cisco_meraki',
    'cisco_thousandeyes', 'cisco_webex', 'cisco_radware',
]
for s in targets:
    if s in c.sections():
        name = c.get(s, 'display_name', fallback='')
        aliases = c.get(s, 'aliases', fallback='(none)')
        print(f'[{s}]  name="{name}"  aliases="{aliases}"')
    else:
        print(f'[{s}]  -- NOT FOUND')
