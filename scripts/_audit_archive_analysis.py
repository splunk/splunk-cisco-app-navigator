#!/usr/bin/env python3
"""Quick audit of retired, GTM roadmap, and roadmap products for archive analysis."""
import configparser, os

conf = configparser.ConfigParser()
conf_path = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                         'src', 'main', 'resources', 'splunk', 'default', 'products.conf')
conf.read(conf_path)

print("=== RETIRED PRODUCTS (status=retired) ===")
retired = []
for s in conf.sections():
    if conf.get(s, 'status', fallback='') == 'retired':
        retired.append(s)
        print(f"  {s}: {conf.get(s, 'display_name', fallback='?')}  |  support={conf.get(s, 'support_level', fallback='(default)')}")
print(f"  Total: {len(retired)}\n")

print("=== GTM ROADMAP (coverage_gap=true) ===")
gtm = []
for s in conf.sections():
    cg = conf.get(s, 'coverage_gap', fallback='')
    if cg in ('true', '1'):
        gtm.append(s)
        st = conf.get(s, 'status', fallback='?')
        sl = conf.get(s, 'support_level', fallback='(default)')
        print(f"  {s}: {conf.get(s, 'display_name', fallback='?')}  |  status={st}  |  support={sl}")
print(f"  Total: {len(gtm)}\n")

print("=== ROADMAP (status=roadmap) ===")
roadmap = []
for s in conf.sections():
    if conf.get(s, 'status', fallback='') == 'roadmap':
        roadmap.append(s)
        cg = conf.get(s, 'coverage_gap', fallback='false')
        sl = conf.get(s, 'support_level', fallback='(default)')
        print(f"  {s}: {conf.get(s, 'display_name', fallback='?')}  |  coverage_gap={cg}  |  support={sl}")
print(f"  Total: {len(roadmap)}\n")

print("=== SUMMARY ===")
all_prods = conf.sections()
active = [s for s in all_prods if conf.get(s, 'status', fallback='') == 'active']
deprecated = [s for s in all_prods if conf.get(s, 'status', fallback='') == 'deprecated']
under_dev = [s for s in all_prods if conf.get(s, 'status', fallback='') == 'under_development']

print(f"  Total product stanzas: {len(all_prods)}")
print(f"  Active: {len(active)}")
print(f"  Retired: {len(retired)}")
print(f"  Deprecated: {len(deprecated)}")
print(f"  Roadmap: {len(roadmap)}")
print(f"  Under Development: {len(under_dev)}")
print(f"  GTM Roadmap (coverage_gap): {len(gtm)}")
print()

# Which retired products overlap with coverage_gap?
retired_gtm = set(retired) & set(gtm)
print(f"  Retired AND coverage_gap: {len(retired_gtm)} -> {list(retired_gtm)}")

# Roadmap that are NOT coverage_gap
roadmap_no_gap = [s for s in roadmap if s not in gtm]
print(f"  Roadmap WITHOUT coverage_gap: {len(roadmap_no_gap)} -> {[conf.get(s,'display_name',fallback=s) for s in roadmap_no_gap]}")
