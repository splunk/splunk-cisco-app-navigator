#!/usr/bin/env python3
"""Fix sourcetypes in products.conf: lowercase all and remove case-insensitive duplicates."""
import re

conf = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
with open(conf) as f:
    content = f.read()

lines = content.split('\n')
stanza = None
changes = []

for i, line in enumerate(lines):
    m = re.match(r'^\[(.+)\]', line)
    if m:
        stanza = m.group(1)
        continue
    m = re.match(r'^(sourcetypes\s*=\s*)(.*)', line)
    if m and stanza:
        prefix = m.group(1)
        raw = m.group(2).strip()
        if not raw:
            continue
        stypes = [s.strip() for s in raw.split(',') if s.strip()]
        
        # Lowercase all and deduplicate preserving order
        seen = set()
        deduped = []
        for s in stypes:
            lower = s.lower()
            if lower not in seen:
                seen.add(lower)
                deduped.append(lower)
        
        # Sort alphabetically for consistency
        deduped.sort()
        
        new_val = ','.join(deduped)
        old_val = ','.join(stypes)
        
        if new_val != old_val:
            changes.append({
                'stanza': stanza,
                'line': i,
                'old_count': len(stypes),
                'new_count': len(deduped),
                'removed': len(stypes) - len(deduped),
            })
            lines[i] = prefix + new_val
            print(f"[{stanza}] line {i+1}: {len(stypes)} -> {len(deduped)} sourcetypes (removed {len(stypes)-len(deduped)} dupes)")
            # Show what was removed
            old_lower_set = set()
            for s in stypes:
                if s.lower() in old_lower_set or s != s.lower():
                    if s != s.lower():
                        print(f"  LOWERED: {s} -> {s.lower()}")
                old_lower_set.add(s.lower())

if changes:
    with open(conf, 'w') as f:
        f.write('\n'.join(lines))
    print(f"\nDone. Fixed {len(changes)} stanza(s).")
else:
    print("No changes needed.")
