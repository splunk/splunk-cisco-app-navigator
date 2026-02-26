#!/usr/bin/env python3
"""Audit card appearance fields across all products."""
import re, os

CONF = os.path.join(os.path.dirname(__file__), "..",
    "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")

conf = open(CONF).read()
stanzas = re.split(r'\n\[([^\]]+)\]', conf)[1:]

fmt = "{:<45} {:<12} {:<10} {:<14} {:<8} {:<8} {:<35}"
print(fmt.format("Product", "accent", "bg_color", "banner_clr", "opacity", "size", "banner"))
print("-" * 140)

missing_accent = []
for i in range(0, len(stanzas), 2):
    name = stanzas[i]
    body = stanzas[i + 1]
    if name == "default":
        continue
    def get(key):
        m = re.search(r'^' + key + r'\s*=\s*(.*)', body, re.M)
        return m.group(1).strip() if m else ""
    dn = get("display_name") or name
    accent = get("card_accent")
    bg = get("card_bg_color")
    bc = get("card_banner_color")
    op = get("card_banner_opacity")
    sz = get("card_banner_size")
    bn = get("card_banner")
    print(fmt.format(dn[:44], accent or "NONE", bg or "NONE", bc or "NONE", op or "NONE", sz or "NONE", (bn or "NONE")[:34]))
    if not accent:
        missing_accent.append(name)

print()
if missing_accent:
    print(f"Products MISSING card_accent ({len(missing_accent)}):")
    for n in missing_accent:
        print(f"  - {n}")
else:
    print("All products have card_accent.")
