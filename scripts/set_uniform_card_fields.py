#!/usr/bin/env python3
"""
Set uniform card appearance fields across all products in products.conf.

Strategy:
  card_banner_size    = small (uniform 11px watermark — clean, professional)
  card_banner_opacity = 0.08  (uniform — slightly more visible than default 0.055)
  card_bg_color       = per addon_family (visual grouping by platform):
      security-cloud   → ice       (#f0f8ff — cool blue tint, matches Cisco blue accent)
      cloud-security   → sky       (#eef6fc — lighter blue, distinguishes from sec-cloud)
      catalyst         → mint      (#f0fff4 — green tint, matches green accent)
      dc-networking    → ice       (#f0f8ff — cool tint, matches teal accent)
      collaboration    → lavender  (#f5f0ff — purple tint, matches purple accent)
      observability    → cream     (#fffdf5 — warm neutral)
      standalone       → pearl     (#fafafa — very subtle grey, neutral)
      deprecated       → smoke     (#f4f5f7 — muted grey, signals inactive)
      (anything else)  → pearl     (safe default)
"""
import re

CONF = 'packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'

# Map addon_family → card_bg_color
BG_MAP = {
    'security-cloud': 'ice',
    'cloud-security': 'sky',
    'catalyst':       'mint',
    'dc-networking':  'ice',
    'collaboration':  'lavender',
    'observability':  'cream',
    'standalone':     'pearl',
    'deprecated':     'smoke',
}

with open(CONF) as f:
    text = f.read()

stanzas = list(re.finditer(r'^\[([^\]]+)\]', text, re.MULTILINE))
changes = 0

for i, m in enumerate(stanzas):
    name = m.group(1)
    start = m.start()
    end = stanzas[i + 1].start() if i + 1 < len(stanzas) else len(text)
    block = text[start:end]

    # Extract addon_family
    fam_m = re.search(r'^addon_family\s*=\s*(\S*)', block, re.MULTILINE)
    fam = fam_m.group(1).strip() if fam_m else ''

    # Determine card_bg_color
    bg_color = BG_MAP.get(fam, 'pearl')

    # Set card_banner_size = small
    block, n = re.subn(r'^(card_banner_size\s*=\s*).*$', r'\g<1>small', block, flags=re.MULTILINE)
    changes += n

    # Set card_banner_opacity = 0.08
    block, n = re.subn(r'^(card_banner_opacity\s*=\s*).*$', rf'\g<1>0.08', block, flags=re.MULTILINE)
    changes += n

    # Set card_bg_color
    block, n = re.subn(r'^(card_bg_color\s*=\s*).*$', rf'\g<1>{bg_color}', block, flags=re.MULTILINE)
    changes += n

    text = text[:start] + block + text[end:]

with open(CONF, 'w') as f:
    f.write(text)

print(f'Done — {changes} field updates across {len(stanzas)} products')

# Summary
fam_counts = {}
for m in re.finditer(r'^\[([^\]]+)\]', text, re.MULTILINE):
    name = m.group(1)
    start = m.start()
    block_end = text.find('\n[', start + 1)
    block = text[start:block_end] if block_end != -1 else text[start:]
    fam_m = re.search(r'^addon_family\s*=\s*(\S*)', block, re.MULTILINE)
    bg_m = re.search(r'^card_bg_color\s*=\s*(\S*)', block, re.MULTILINE)
    fam = fam_m.group(1).strip() if fam_m else '(none)'
    bg = bg_m.group(1).strip() if bg_m else '(none)'
    fam_counts.setdefault(fam, {'bg': bg, 'count': 0})
    fam_counts[fam]['count'] += 1

print('\nFamily → card_bg_color mapping:')
for fam, info in sorted(fam_counts.items()):
    print(f'  {fam:20s} → {info["bg"]:10s}  ({info["count"]} products)')
