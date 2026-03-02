#!/usr/bin/env python3
"""
Uniforms card appearance across all 57 products in products.conf:
  1. Assigns card_accent to 19 products that are currently missing it
  2. Changes card_banner_opacity from 0.08 → 0.12 across all products
  3. Changes card_banner_size from medium → small across all products
  4. Adds card_accent + card_banner + card_banner_color to deprecated products

Run: python3 scripts/uniform_card_appearance.py [--dry-run]
"""

import re, sys, os

DRY_RUN = "--dry-run" in sys.argv

CONF_PATH = os.path.join(os.path.dirname(__file__), "..",
    "packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf")

# ── Accent assignments for the 19 products missing card_accent ──
ACCENT_MAP = {
    # Splunk-supported active security products → blue
    "cisco_esa":         "#1976d2",
    "cisco_cloudlock":   "#1976d2",
    "cisco_ucs":         "#1976d2",
    "cisco_wsa":         "#1976d2",
    "cisco_talos":       "#1976d2",
    "cisco_intersight":  "#1976d2",
    # Observability → amber
    "cisco_appdynamics": "#ff6f00",
    # Under-development (Security Cloud family) → cisco blue
    "cisco_evm":         "#049fd9",
    "cisco_radware":     "#049fd9",
    # Deprecated → gray
    "cisco_cloud_web_security":      "#9e9e9e",
    "cisco_domain_protection":       "#9e9e9e",
    "cisco_network_assurance_engine":"#9e9e9e",
    "cisco_prime_infrastructure":    "#9e9e9e",
    "cisco_psirt":                   "#9e9e9e",
    "cisco_acs":                     "#9e9e9e",
    "cisco_securex":                 "#9e9e9e",
    "cisco_secure_ips":              "#9e9e9e",
    "cisco_cmx":                     "#9e9e9e",
    "cisco_bug_search":              "#9e9e9e",
}

# Deprecated stanzas that need banner text
DEPRECATED_STANZAS = {
    "cisco_cloud_web_security", "cisco_domain_protection",
    "cisco_network_assurance_engine", "cisco_prime_infrastructure",
    "cisco_psirt", "cisco_acs", "cisco_securex", "cisco_secure_ips",
    "cisco_cmx", "cisco_bug_search",
}

# Splunk-supported active products that also need banner + banner_color
SPLUNK_SUPPORTED_NEED_BANNER = {
    "cisco_esa":         "Cisco Supported",
    "cisco_cloudlock":   "Cisco Supported",
    "cisco_ucs":         "Cisco Supported",
    "cisco_wsa":         "Cisco Supported",
    "cisco_talos":       "Cisco Supported",
    "cisco_intersight":  "Cisco Supported",
}

# Under-dev products that need banner
UNDER_DEV_NEED_BANNER = {
    "cisco_evm":     "Under Development",
    "cisco_radware": "Under Development",
}

# AppDynamics needs banner
APPDYNAMICS_BANNER = {
    "cisco_appdynamics": "Cisco Supported",
}


def process():
    with open(CONF_PATH, "r") as f:
        content = f.read()

    changes = 0

    # 1. Global: opacity 0.08 → 0.12
    old_count = content.count("card_banner_opacity = 0.08")
    content = content.replace("card_banner_opacity = 0.08", "card_banner_opacity = 0.12")
    changes += old_count
    if old_count:
        print(f"  opacity 0.08 → 0.12: {old_count} replacements")

    # 2. Global: size medium → small (only for card_banner_size lines)
    old_count_sz = len(re.findall(r'^card_banner_size = medium$', content, re.M))
    content = re.sub(r'^(card_banner_size) = medium$', r'\1 = small', content, flags=re.M)
    changes += old_count_sz
    if old_count_sz:
        print(f"  banner_size medium → small: {old_count_sz} replacements")

    # 3. Per-product: assign card_accent where missing
    for stanza, accent in ACCENT_MAP.items():
        # Find pattern: within [stanza] block, replace empty card_accent
        pattern = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_accent) = \s*$',
            re.M | re.S
        )
        m = pattern.search(content)
        if m:
            content = content[:m.start(1)] + m.group(1) + f" = {accent}" + content[m.end():]
            changes += 1
            print(f"  {stanza}: card_accent = {accent}")
        else:
            print(f"  WARNING: could not find empty card_accent for [{stanza}]")

    # 4. Deprecated: add banner text + banner_color + bg_color
    for stanza in DEPRECATED_STANZAS:
        # Set card_banner = Deprecated
        pattern = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner) = \s*$',
            re.M | re.S
        )
        m = pattern.search(content)
        if m:
            content = content[:m.start(1)] + m.group(1) + " = Deprecated" + content[m.end():]
            changes += 1
            print(f"  {stanza}: card_banner = Deprecated")

        # Set card_banner_color = red (for the gray/red deprecated look)
        pattern2 = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner_color) = \s*$',
            re.M | re.S
        )
        m2 = pattern2.search(content)
        if m2:
            content = content[:m2.start(1)] + m2.group(1) + " = red" + content[m2.end():]
            changes += 1
            print(f"  {stanza}: card_banner_color = red")

    # 5. Splunk-supported active products: add banner
    for stanza, banner_text in SPLUNK_SUPPORTED_NEED_BANNER.items():
        pattern = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner) = \s*$',
            re.M | re.S
        )
        m = pattern.search(content)
        if m:
            content = content[:m.start(1)] + m.group(1) + f" = {banner_text}" + content[m.end():]
            changes += 1
            print(f"  {stanza}: card_banner = {banner_text}")

        # Also set banner_color to blue for splunk-supported
        pattern2 = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner_color) = \s*$',
            re.M | re.S
        )
        m2 = pattern2.search(content)
        if m2:
            content = content[:m2.start(1)] + m2.group(1) + " = blue" + content[m2.end():]
            changes += 1
            print(f"  {stanza}: card_banner_color = blue")

    # 6. Under-dev products: add banner
    for stanza, banner_text in UNDER_DEV_NEED_BANNER.items():
        pattern = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner) = \s*$',
            re.M | re.S
        )
        m = pattern.search(content)
        if m:
            content = content[:m.start(1)] + m.group(1) + f" = {banner_text}" + content[m.end():]
            changes += 1
            print(f"  {stanza}: card_banner = {banner_text}")

        pattern2 = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner_color) = \s*$',
            re.M | re.S
        )
        m2 = pattern2.search(content)
        if m2:
            content = content[:m2.start(1)] + m2.group(1) + " = gold" + content[m2.end():]
            changes += 1
            print(f"  {stanza}: card_banner_color = gold")

    # 7. AppDynamics: add banner
    for stanza, banner_text in APPDYNAMICS_BANNER.items():
        pattern = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner) = \s*$',
            re.M | re.S
        )
        m = pattern.search(content)
        if m:
            content = content[:m.start(1)] + m.group(1) + f" = {banner_text}" + content[m.end():]
            changes += 1
            print(f"  {stanza}: card_banner = {banner_text}")

        pattern2 = re.compile(
            r'(^\[' + re.escape(stanza) + r'\].*?^card_banner_color) = \s*$',
            re.M | re.S
        )
        m2 = pattern2.search(content)
        if m2:
            content = content[:m2.start(1)] + m2.group(1) + " = gold" + content[m2.end():]
            changes += 1
            print(f"  {stanza}: card_banner_color = gold")

    print(f"\nTotal changes: {changes}")

    if DRY_RUN:
        print("\n[DRY RUN] No files modified.")
    else:
        with open(CONF_PATH, "w") as f:
            f.write(content)
        print(f"\nWritten to {CONF_PATH}")


if __name__ == "__main__":
    process()
