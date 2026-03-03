#!/usr/bin/env python3
"""Find existing stanzas that match the 9 new SC4S products."""
import re, os

CONF = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                    'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

with open(CONF) as f:
    content = f.read()

stanzas = re.split(r'^\[([^\]]+)\]', content, flags=re.MULTILINE)
products = {}
for i in range(1, len(stanzas), 2):
    body = stanzas[i + 1]
    fields = {}
    for line in body.splitlines():
        line = line.strip()
        if line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        fields[k.strip()] = v.strip()
    if fields.get('display_name'):
        products[stanzas[i]] = fields

# New SC4S products to find (excluding 7 already done)
targets = {
    'ACE': ['ace'],
    'ACS': ['cisco_acs'],
    'IMC': ['imc', 'intersight'],
    'Meeting Management': ['meeting'],
    'CMS': ['cisco_cms', 'meeting_server'],
    'TVCS / TelePresence': ['telepresence', 'tvcs'],
    'UCM / CUCM': ['cucm', 'ucm', 'unified_comm'],
    'UCS': ['ucs', 'unified_computing'],
    'Viptela / SD-WAN': ['sdwan', 'sd_wan', 'viptela', 'catalyst_sdwan'],
}

print("=" * 80)
print("SEARCH: Finding stanzas for 9 new SC4S products")
print("=" * 80)

for label, keywords in targets.items():
    found = []
    for sid, fields in products.items():
        dn = fields.get('display_name', '').lower()
        for kw in keywords:
            if kw in sid.lower() or kw in dn:
                sc4s = fields.get('sc4s_supported', '') == 'true'
                found.append((sid, fields.get('display_name', ''), sc4s))
                break
    if found:
        for sid, dn, sc4s in found:
            tag = " [ALREADY SC4S]" if sc4s else ""
            print(f"  {label}: [{sid}] -> {dn}{tag}")
    else:
        print(f"  {label}: *** NOT FOUND IN products.conf ***")

print()
print("=" * 80)
print("ALL existing SC4S-enabled products:")
print("=" * 80)
for sid, fields in sorted(products.items()):
    if fields.get('sc4s_supported') == 'true':
        print(f"  [{sid}] {fields.get('display_name')}")
