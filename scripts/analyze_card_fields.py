#!/usr/bin/env python3
"""Analyze all products to understand current card field values."""
import re

conf = 'packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
with open(conf) as f:
    text = f.read()

stanzas = re.findall(r'^\[([^\]]+)\]', text, re.MULTILINE)
print(f'Total stanzas: {len(stanzas)}')

for s in stanzas:
    block = re.search(rf'^\[{re.escape(s)}\].*?(?=^\[|\Z)', text, re.MULTILINE | re.DOTALL)
    if not block:
        continue
    b = block.group()
    def val(field):
        m = re.search(rf'^{field}\s*=\s*(.*)', b, re.MULTILINE)
        return m.group(1).strip() if m else ''
    
    cat_v = val('category')
    fam_v = val('addon_family')
    sta_v = val('status')
    ban_v = val('card_banner')
    col_v = val('card_banner_color')
    siz_v = val('card_banner_size')
    opa_v = val('card_banner_opacity')
    acc_v = val('card_accent')
    bg_v  = val('card_bg_color')
    new_v = val('is_new')
    
    print(f'{s:45s} | cat={cat_v:15s} | fam={fam_v:20s} | sta={sta_v:10s} | ban="{ban_v}" | col={col_v:6s} | siz={siz_v:6s} | opa={opa_v:5s} | acc={acc_v:8s} | bg={bg_v:10s} | new={new_v}')
