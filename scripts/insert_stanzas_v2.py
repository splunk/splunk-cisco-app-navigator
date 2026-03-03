import re, sys

conf_path = '/Users/akhamis/repo/cisco_control_center_app/packages/cisco-control-center-app/src/main/resources/splunk/default/products.conf'

with open(conf_path) as f:
    content = f.read()

# Guard against re-run
if '[cisco_evm]' in content:
    print('ABORT: cisco_evm already present. Stanzas already inserted.')
    sys.exit(1)

with open('/tmp/recovered_stanzas.txt') as f:
    recovered = f.read().rstrip()

marker = '##############################################################################\n# Security \u2014 Standalone TA Products\n##############################################################################'

if marker not in content:
    print('ABORT: Could not find insertion marker.')
    sys.exit(1)

header = '##############################################################################\n# Coming Soon \u2014 Under Development\n##############################################################################'

insertion = header + '\n\n' + recovered + '\n\n\n'

new_content = content.replace(marker, insertion + marker, 1)

with open(conf_path, 'w') as f:
    f.write(new_content)

stanza_count = len(re.findall(r'^\[', new_content, re.MULTILINE))
print(f'Total stanzas: {stanza_count}')
for s in ['cisco_evm', 'cisco_secure_endpoint_edr', 'cisco_radware', 'cisco_appomni']:
    found = new_content.count(f'[{s}]')
    print(f'  [{s}] count={found}')
