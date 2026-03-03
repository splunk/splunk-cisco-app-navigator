#!/usr/bin/env python3
"""Show the dashboard → app context mapping for all products with dashboards."""
import re

conf = "/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf"
stanza = None
products = {}
current = None

with open(conf) as f:
    for line in f:
        line = line.strip()
        m = re.match(r'^\[([^\]]+)\]', line)
        if m:
            if current:
                products[current['stanza']] = current
            current = {'stanza': m.group(1)}
            continue
        if current and '=' in line:
            key, _, val = line.partition('=')
            current[key.strip()] = val.strip()
if current:
    products[current['stanza']] = current

print(f"{'Stanza':<35} {'app_viz':<30} {'addon':<30} {'dashboards'}")
print('-' * 130)
for name, p in sorted(products.items()):
    dash = p.get('dashboards', '')
    app_viz = p.get('app_viz', '')
    addon = p.get('addon', '')
    if dash:
        print(f"{name:<35} {app_viz:<30} {addon:<30} {dash}")
