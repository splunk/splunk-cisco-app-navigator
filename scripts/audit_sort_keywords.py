#!/usr/bin/env python3
"""Audit sort_order and keywords for all products in products.conf."""

import re, os

CONF = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                     'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

with open(CONF) as f:
    text = f.read()

stanzas = re.split(r'\n(?=\[)', text)
products = []
for s in stanzas:
    m = re.match(r'\[([^\]]+)\]', s)
    if not m:
        continue
    sid = m.group(1)
    if sid == 'default':
        continue

    def gv(key, block=s):
        m2 = re.search(rf'^{key}\s*=\s*(.+)', block, re.M)
        return m2.group(1).strip() if m2 else ''

    disabled = gv('disabled')
    if disabled == '1':
        continue

    cat = gv('category')
    subcat = gv('subcategory')
    status = gv('status')
    name = gv('display_name')
    sort_val = gv('sort_order') or '999'
    kw = gv('keywords')
    addon_family = gv('addon_family')

    products.append({
        'cat': cat, 'subcat': subcat, 'sort': int(sort_val),
        'sid': sid, 'name': name, 'status': status,
        'kw': kw, 'addon_family': addon_family
    })

products.sort(key=lambda x: (x['cat'], x['sort']))

cur_cat = ''
for p in products:
    if p['cat'] != cur_cat:
        print(f"\n{'='*80}")
        print(f"  {p['cat'].upper()}")
        print(f"{'='*80}")
        cur_cat = p['cat']
    dep = ' [RETIRED]' if p['status'] == 'deprecated' else ''
    fam = f" fam={p['addon_family']}" if p['addon_family'] else ''
    print(f"  {p['sort']:4d} | {p['sid']:42s} | {p['name'][:55]:55s} | sub={p['subcat']:20s}{dep}{fam}")
    print(f"       | kw: {p['kw']}")
