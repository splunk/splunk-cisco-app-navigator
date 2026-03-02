#!/usr/bin/env python3
"""Add card_banner_opacity and card_bg_color fields to products.conf."""
import re

conf_path = 'packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
with open(conf_path, 'r') as f:
    content = f.read()

# Add card_banner_opacity after card_banner_size
content = re.sub(
    r'(card_banner_size = [^\n]*\n)(card_accent = )',
    r'\1card_banner_opacity = \n\2',
    content
)

# Add card_bg_color after card_accent
content = re.sub(
    r'(card_accent = [^\n]*\n)(is_new = )',
    r'\1card_bg_color = \n\2',
    content
)

with open(conf_path, 'w') as f:
    f.write(content)

count_opacity = content.count('card_banner_opacity')
count_bg = content.count('card_bg_color')
print(f'card_banner_opacity lines: {count_opacity}')
print(f'card_bg_color lines: {count_bg}')
