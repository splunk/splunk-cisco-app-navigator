#!/usr/bin/env python3
"""Analyze field usage in products.conf."""
import collections

conf = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
with open(conf) as f:
    lines = f.readlines()

field_usage = collections.Counter()
field_total = collections.Counter()
current_stanza = None
for line in lines:
    line = line.rstrip()
    if line.startswith('[') and not line.startswith('#'):
        current_stanza = line
    elif current_stanza and '=' in line and not line.startswith('#'):
        key = line.split('=', 1)[0].strip()
        val = line.split('=', 1)[1].strip()
        field_total[key] += 1
        if val:
            field_usage[key] += 1

stanza_count = sum(1 for l in lines if l.startswith('[') and not l.startswith('#'))
print(f'Total stanzas: {stanza_count}')
print()
print(f'{"Field":<35} {"Used":>5} / {"Total":>5}  {"Empty":>5}')
print('-' * 60)
for field in sorted(field_total.keys()):
    used = field_usage.get(field, 0)
    total = field_total[field]
    empty = total - used
    print(f'{field:<35} {used:>5} / {total:>5}  {empty:>5}')
