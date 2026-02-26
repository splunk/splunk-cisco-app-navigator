#!/usr/bin/env python3
"""
Repair and set uniform card appearance fields across all products in products.conf.

Fixes any corrupted lines from previous runs, then sets:
  card_banner_size    = small
  card_banner_opacity = 0.08
  card_bg_color       = per addon_family
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
    lines = f.readlines()

# First pass: remove orphaned value-only lines (artifacts from broken regex)
# These are lines that contain ONLY a preset value name or number with no key=
ORPHAN_VALUES = {'small', 'medium', 'large', 'ice', 'mint', 'lavender', 'rose',
                 'cream', 'smoke', 'sky', 'pearl', '0.08', '0.10', '0.15'}
cleaned = []
for line in lines:
    stripped = line.strip()
    if stripped in ORPHAN_VALUES:
        print(f'  Removing orphan line: "{stripped}"')
        continue
    cleaned.append(line)

# Second pass: rebuild file ensuring proper card fields
output = []
i = 0
stanza_count = 0
while i < len(cleaned):
    line = cleaned[i]
    stripped = line.strip()

    # If this is a stanza header (not a comment), track it
    if stripped.startswith('[') and not stripped.startswith('#'):
        stanza_count += 1

    # Look for the card field block: starts at card_banner = ...
    # We need to find and fix the block: card_banner through sort_order
    if stripped.startswith('card_banner ='):
        # We found the start of card fields. Collect ALL card-related lines
        # until we hit sort_order or a blank line or next key that's not card_*
        card_block = {}
        card_block['card_banner'] = stripped.split('=', 1)[1].strip()
        i += 1

        # Read remaining card/support/sort fields
        while i < len(cleaned):
            s = cleaned[i].strip()
            if s == '' or s.startswith('[') or s.startswith('#'):
                break
            if '=' in s:
                key, val = s.split('=', 1)
                key = key.strip()
                val = val.strip()
                card_block[key] = val
                if key == 'sort_order':
                    i += 1
                    break
            i += 1

        # Determine addon_family from context — scan backwards in output
        addon_family = ''
        for prev_line in reversed(output[-80:]):
            if prev_line.strip().startswith('addon_family'):
                addon_family = prev_line.strip().split('=', 1)[1].strip()
                break

        bg_color = BG_MAP.get(addon_family, 'pearl')

        # Ensure all fields exist with proper values
        card_block.setdefault('support_level', '')
        card_block.setdefault('card_banner_color', '')
        card_block.setdefault('card_banner_size', '')
        card_block.setdefault('card_banner_opacity', '')
        card_block.setdefault('card_accent', '')
        card_block.setdefault('card_bg_color', '')
        card_block.setdefault('is_new', '')
        card_block.setdefault('sort_order', '100')

        # Apply uniform settings
        card_block['card_banner_size'] = 'small'
        card_block['card_banner_opacity'] = '0.08'
        card_block['card_bg_color'] = bg_color

        # Write fields in canonical order
        field_order = [
            'card_banner', 'support_level', 'card_banner_color',
            'card_banner_size', 'card_banner_opacity', 'card_accent',
            'card_bg_color', 'is_new', 'sort_order',
        ]
        for field in field_order:
            val = card_block.get(field, '')
            output.append(f'{field} = {val}\n')

        continue  # already advanced i past sort_order

    output.append(line)
    i += 1

with open(CONF, 'w') as f:
    f.writelines(output)

print(f'Repaired and set card fields for {stanza_count} stanzas')

# Verification
with open(CONF) as f:
    text = f.read()
for field in ['card_banner_size = small', 'card_banner_opacity = 0.08']:
    count = text.count(field)
    print(f'  {field}: {count} occurrences')
for bg in ['ice', 'mint', 'sky', 'lavender', 'cream', 'pearl', 'smoke']:
    count = text.count(f'card_bg_color = {bg}')
    if count:
        print(f'  card_bg_color = {bg}: {count} products')
