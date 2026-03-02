#!/usr/bin/env python3
"""Add card_banner_color, card_banner_size, card_accent, is_new to products.conf"""

import re, sys

CONF = "/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf"

# Banner text → (color preset, hex accent)
BANNER_MAP = {
    "Powered by Cisco Security Cloud": ("cisco", "#049fd9"),
    "Powered by Cisco Catalyst":       ("green", "#6abf4b"),
    "Powered by Cisco DC Networking":   ("teal",  "#00897b"),
    "Powered by Cisco Collaboration":   ("purple","#7b1fa2"),
    "Powered by Cisco Cloud Security":  ("blue",  "#1976d2"),
}

# Products to mark as NEW (flag ship / recently updated)
NEW_PRODUCTS = {
    "cisco_xdr",
    "cisco_secure_firewall",
    "cisco_secure_endpoint",
    "cisco_meraki",
    "cisco_thousandeyes",
    "cisco_splunk_otel",
}

with open(CONF) as f:
    lines = f.readlines()

out = []
current_banner = ""
current_stanza = ""
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.rstrip("\n")

    # Track stanza
    m = re.match(r'^\[(.+)\]', stripped)
    if m:
        current_stanza = m.group(1)
        current_banner = ""

    # Track card_banner value
    m2 = re.match(r'^card_banner\s*=\s*(.*)', stripped)
    if m2:
        current_banner = m2.group(1).strip()

    # After support_level line, inject the 4 new fields
    if stripped.startswith("support_level"):
        out.append(line)
        i += 1
        # Determine values
        color_preset, accent_hex = BANNER_MAP.get(current_banner, ("", ""))
        is_new_val = "true" if current_stanza in NEW_PRODUCTS else ""
        # Write new fields
        out.append(f"card_banner_color = {color_preset}\n")
        out.append(f"card_banner_size = \n")
        out.append(f"card_accent = {accent_hex}\n")
        out.append(f"is_new = {is_new_val}\n")
        continue

    out.append(line)
    i += 1

with open(CONF, "w") as f:
    f.writelines(out)

# Count
import collections
counts = collections.Counter()
for line in out:
    if line.startswith("is_new = true"):
        counts["new"] += 1
    if line.startswith("card_accent = #"):
        counts["accented"] += 1
    if line.startswith("card_banner_color = ") and line.strip() != "card_banner_color =":
        counts["colored"] += 1

print(f"Done. {counts['colored']} colored banners, {counts['accented']} accented cards, {counts['new']} marked NEW")
