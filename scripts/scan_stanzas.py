import re

fpath = '/Users/akhamis/repo/splunk-cisco-app-navigator/packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf'
with open(fpath) as f:
    lines = f.readlines()

targets = [
    'cisco_acs','cisco_ise','cisco_secure_firewall','cisco_secure_endpoint',
    'cisco_cucm','cisco_esa','cisco_wsa','cisco_secure_ips',
    'cisco_catalyst_sdwan','cisco_umbrella','cisco_duo','cisco_appdynamics',
    'cisco_meraki','cisco_thousandeyes','cisco_webex','cisco_radware'
]

# Find all stanza starts
stanza_starts = []
for i, line in enumerate(lines):
    m = re.match(r'^\[([^\]]+)\]', line)
    if m:
        stanza_starts.append((i+1, m.group(1)))

for t in targets:
    header = None
    next_start = None
    for idx, (ln, name) in enumerate(stanza_starts):
        if name == t:
            header = ln
            if idx+1 < len(stanza_starts):
                next_start = stanza_starts[idx+1][0]
            else:
                next_start = len(lines)+1
            break
    if header is None:
        print(f'{t}: NOT FOUND')
        continue

    aliases_ln = None
    keywords_ln = None
    last_field_ln = None
    aliases_val = None
    for line_num in range(header+1, next_start):
        line = lines[line_num-1]
        if re.match(r'^aliases\s*=', line):
            aliases_ln = line_num
            aliases_val = line.strip()
        if re.match(r'^keywords\s*=', line):
            keywords_ln = line_num
        if re.match(r'^[a-z_]+\s*=', line):
            last_field_ln = line_num

    if aliases_ln:
        action = f'EXISTS at L{aliases_ln}: {aliases_val}'
    elif keywords_ln:
        action = f'INSERT new line BEFORE L{keywords_ln} (before keywords)'
    else:
        action = f'INSERT new line AFTER L{last_field_ln} (after last field)'

    print(f'[{t}]')
    print(f'  stanza_header  = L{header}')
    print(f'  aliases        = {"L"+str(aliases_ln) if aliases_ln else "NONE"}')
    print(f'  keywords       = {"L"+str(keywords_ln) if keywords_ln else "NONE"}')
    print(f'  last_field     = L{last_field_ln}')
    print(f'  next_stanza    = {"L"+str(next_start) if next_start<=len(lines) else "EOF"}')
    print(f'  ACTION: {action}')
    print()
