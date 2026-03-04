#!/usr/bin/env python3
"""Audit products.conf to generate presentation stats."""
import re, os

CONF = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                    'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

conf = open(CONF).read()
stanzas = re.split(r'(?=^\[)', conf, flags=re.MULTILINE)

products = []
for s in stanzas:
    if not s.strip() or not s.startswith('['):
        continue
    name = re.match(r'\[([^\]]+)\]', s).group(1)
    fields = {}
    for line in s.split('\n'):
        line = line.strip()
        if '=' in line and not line.startswith('#') and not line.startswith('['):
            k, v = line.split('=', 1)
            fields[k.strip()] = v.strip()
    products.append((name, fields))

print(f"Total products in catalog: {len(products)}")
print()

# Status breakdown
statuses = {}
for name, f in products:
    st = f.get('status', 'active')
    statuses.setdefault(st, []).append(name)
for st, names in sorted(statuses.items()):
    print(f"  status={st}: {len(names)}")

print()

# Support level breakdown
support = {}
for name, f in products:
    sl = f.get('support_level', 'unknown')
    support.setdefault(sl, []).append(name)
for sl, names in sorted(support.items()):
    print(f"  support_level={sl}: {len(names)}")

print()

# Count unique addons, apps, alert actions across ALL products
addons = set()
apps = set()
alert_actions = set()
soar = set()

for name, f in products:
    if f.get('addon'): addons.add(f['addon'])
    if f.get('app_viz'): apps.add(f['app_viz'])
    if f.get('app_viz_2'): apps.add(f['app_viz_2'])
    for i in ['', '_2']:
        au = f.get(f'alert_action_uid{i}')
        if au: alert_actions.add(au)
    for i in ['', '_2', '_3']:
        su = f.get(f'soar_connector_uid{i}')
        if su: soar.add(su)

print(f"Unique add-ons (TAs): {len(addons)}")
print(f"Unique viz/dashboard apps: {len(apps)}")
print(f"Unique alert actions: {len(alert_actions)}")
print(f"Unique SOAR connectors: {len(soar)}")
print(f"Total apps+addons+alert_actions: {len(addons) + len(apps) + len(alert_actions)}")
print()

# Active-only breakdown
print("=== ACTIVE products only (status=active) ===")
active = [(n, f) for n, f in products if f.get('status', 'active') == 'active']
print(f"Active products: {len(active)}")
a_addons = set()
a_apps = set()
a_alerts = set()
a_support = {}
for name, f in active:
    sl = f.get('support_level', 'unknown')
    a_support.setdefault(sl, []).append(name)
    if f.get('addon'): a_addons.add(f['addon'])
    if f.get('app_viz'): a_apps.add(f['app_viz'])
    if f.get('app_viz_2'): a_apps.add(f['app_viz_2'])
    for i in ['', '_2']:
        au = f.get(f'alert_action_uid{i}')
        if au: a_alerts.add(au)

print(f"  Add-ons: {len(a_addons)}, Apps: {len(a_apps)}, Alert Actions: {len(a_alerts)}")
print(f"  Total: {len(a_addons) + len(a_apps) + len(a_alerts)}")
for sl, names in sorted(a_support.items()):
    print(f"  support_level={sl}: {len(names)}")

print()

# Under development
print("=== UNDER DEVELOPMENT ===")
ud = [(n, f) for n, f in products if f.get('status') == 'under_development']
print(f"Under development: {len(ud)}")
for n, f in ud:
    print(f"  {n}")

print()

# Deprecated
print("=== DEPRECATED ===")
dep = [(n, f) for n, f in products if f.get('status') == 'deprecated']
print(f"Deprecated: {len(dep)}")
for n, f in dep:
    print(f"  {n}")

print()

# Retired
print("=== RETIRED ===")
ret = [(n, f) for n, f in products if f.get('status') == 'retired']
print(f"Retired: {len(ret)}")
for n, f in ret:
    print(f"  {n}")

print()

# Roadmap / coverage gap
print("=== COVERAGE GAP (GTM Roadmap) ===")
gap = [(n, f) for n, f in products if f.get('coverage_gap') in ('true', '1')]
print(f"Coverage gap: {len(gap)}")
for n, f in gap:
    print(f"  {n}")

print()

# Legacy/archived apps
legacy_apps = set()
for name, f in products:
    la = f.get('legacy_apps', '')
    if la:
        for app_id in la.split(','):
            app_id = app_id.strip()
            if app_id:
                legacy_apps.add(app_id)
print(f"Total unique legacy/archived app IDs referenced: {len(legacy_apps)}")

# Community apps
comm_apps = set()
for name, f in products:
    ca = f.get('community_apps', '')
    if ca:
        for app_id in ca.split(','):
            app_id = app_id.strip()
            if app_id: comm_apps.add(app_id)
print(f"Total unique community app IDs referenced: {len(comm_apps)}")
