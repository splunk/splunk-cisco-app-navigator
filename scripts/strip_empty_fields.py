#!/usr/bin/env python3
"""
Strip empty fields from products.conf stanzas.
Keep only fields that have a non-empty value.
Preserve the header comment block and section comments.
"""
import re
import shutil

CONF = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
BACKUP = '/Users/akhamis/repo/cisco_control_center_app/backups/products.conf.pre_strip_empty.bak'

# Read original
with open(CONF) as f:
    content = f.read()

# Make backup
shutil.copy2(CONF, BACKUP)
print(f"Backup: {BACKUP}")

lines = content.split('\n')
out = []
in_header = True  # True while we're in the top comment block (before first stanza)

i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    # Pass through header comments (everything before first stanza)
    if in_header:
        if stripped.startswith('[') and not stripped.startswith('#'):
            in_header = False
            # Fall through to handle the stanza line
        else:
            out.append(line)
            i += 1
            continue

    # Section comment lines (e.g. ####### Security #######)
    if stripped.startswith('#') or stripped == '':
        # Check if this is a section divider or blank line between stanzas
        # Blank lines: collapse multiple into max 2
        if stripped == '':
            # Count consecutive blanks
            blank_count = 0
            while i < len(lines) and lines[i].strip() == '':
                blank_count += 1
                i += 1
            # Keep at most 2 blank lines
            for _ in range(min(blank_count, 2)):
                out.append('')
            continue
        else:
            out.append(line)
            i += 1
            continue

    # Stanza header
    if stripped.startswith('['):
        out.append(line)
        i += 1
        continue

    # Key = value line
    if '=' in stripped:
        key, _, val = line.partition('=')
        val = val.strip()
        if val:
            # Has a value — keep it
            out.append(line)
        # else: empty value — skip it
        i += 1
        continue

    # Anything else — keep it
    out.append(line)
    i += 1

# Write result
result = '\n'.join(out)
# Clean up: ensure file ends with single newline
result = result.rstrip('\n') + '\n'

with open(CONF, 'w') as f:
    f.write(result)

# Count stanzas and lines
new_lines = result.count('\n')
stanzas = len(re.findall(r'^\[', result, re.MULTILINE))
print(f"Original: {len(lines)} lines")
print(f"New:      {new_lines} lines")
print(f"Removed:  {len(lines) - new_lines} lines")
print(f"Stanzas:  {stanzas}")
