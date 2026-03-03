import re

# Read recovered stanzas
with open('/tmp/recovered_stanzas.txt') as f:
    recovered = f.read()

# Read current products.conf
conf_path = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'
with open(conf_path) as f:
    content = f.read()

# Insert them before the Security — Standalone TA Products section header
marker = '##############################################################################\n# Security \u2014 Standalone TA Products\n##############################################################################'

# Add a section header for under_development products
insertion = '##############################################################################\n# Coming Soon \u2014 Under Development\n##############################################################################\n\n' + recovered + '\n\n\n'

new_content = content.replace(marker, insertion + marker, 1)

with open(conf_path, 'w') as f:
    f.write(new_content)

# Verify
stanza_count = len(re.findall(r'^\[', new_content, re.MULTILINE))
print(f'Total stanzas now: {stanza_count}')
for s in ['cisco_evm', 'cisco_secure_endpoint_edr', 'cisco_radware', 'cisco_appomni']:
    if f'[{s}]' in new_content:
        print(f'  OK [{s}] present')
    else:
        print(f'  MISSING [{s}]')
