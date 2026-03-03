#!/usr/bin/env python3
"""Fix products.conf: remove sourcetypes that are rename= sources in props.conf.

A stanza like [cisco_ips_syslog] with rename=cisco:ips:syslog means
cisco_ips_syslog is NOT a real sourcetype. Only the rename TARGET is.

Case-only renames (e.g. [Cisco:ISE:Syslog] rename=cisco:ise:syslog) are
skipped because the lowercased form IS the real sourcetype.
"""
import re
import os

CONF = "/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf"

# From the rename audit: (product_stanza, fake_sourcetype_to_remove, rename_target)
# Only include where old.lower() != target.lower() (real renames, not case-only)
REMOVALS = {
    "cisco_secure_firewall": {
        "remove": ["cisco_asa", "sourcefire"],
        # cisco:asa and snort are already present (rename targets)
    },
    "cisco_esa": {
        "remove": ["cisco:esa", "cisco_esa"],
        # cisco:esa:legacy is already present (rename target)
    },
    "cisco_wsa": {
        "remove": ["cisco:wsa:squid:new"],
        # cisco:wsa:squid is already present (rename target)
    },
    "cisco_intersight": {
        "remove": ["cisco:intersight:contract", "cisco:intersight:fabric",
                    "cisco:intersight:license", "cisco:intersight:network",
                    "cisco:intersight:target"],
        # contracts, profiles, licenses, networkelements, targets are already present
    },
    "cisco_ise": {
        "remove": ["cisco:ise"],
        # cisco:ise:syslog is already present (rename target)
    },
    "cisco_catalyst_sdwan": {
        "remove": ["cisco:sdwan:sgacl:logs"],
        "add": ["cisco:sgacl:logs"],
        # rename target NOT currently present, need to add it
    },
    "cisco_secure_ips": {
        "remove": ["cisco_ips_syslog"],
        # cisco:ips:syslog is already present (rename target)
    },
}

with open(CONF) as f:
    content = f.read()

lines = content.split('\n')
stanza = None
changes = []

for i, line in enumerate(lines):
    m = re.match(r'^\[([^\]]+)\]', line)
    if m:
        stanza = m.group(1)
        continue

    if stanza and stanza in REMOVALS:
        m = re.match(r'^(sourcetypes\s*=\s*)(.*)', line)
        if m:
            prefix = m.group(1)
            raw = m.group(2).strip()
            stypes = [s.strip() for s in raw.split(',') if s.strip()]
            original_count = len(stypes)

            remove_set = set(s.lower() for s in REMOVALS[stanza]["remove"])
            add_list = REMOVALS[stanza].get("add", [])

            # Remove fake sourcetypes
            filtered = [s for s in stypes if s.lower() not in remove_set]
            removed = [s for s in stypes if s.lower() in remove_set]

            # Add any missing rename targets
            existing_lower = set(s.lower() for s in filtered)
            added = []
            for a in add_list:
                if a.lower() not in existing_lower:
                    filtered.append(a.lower())
                    added.append(a.lower())

            # Sort
            filtered.sort()

            new_val = ','.join(filtered)
            lines[i] = prefix + new_val

            print(f"[{stanza}] (line {i+1}): {original_count} -> {len(filtered)} sourcetypes")
            if removed:
                print(f"  Removed [{len(removed)}]: {', '.join(removed)}")
            if added:
                print(f"  Added [{len(added)}]: {', '.join(added)}")

            changes.append(stanza)

if changes:
    with open(CONF, 'w') as f:
        f.write('\n'.join(lines))
    print(f"\nDone. Fixed {len(changes)} stanza(s).")
else:
    print("No changes needed.")
