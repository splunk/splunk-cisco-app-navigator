#!/usr/bin/env python3
"""Compare secure_networking_gtm values in products.conf against the latest GTM list."""
import re, os

CONF_PATH = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                         'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

with open(CONF_PATH) as f:
    content = f.read()

stanzas = re.split(r'^\[([^\]]+)\]', content, flags=re.MULTILINE)
products = {}
for i in range(1, len(stanzas), 2):
    stanza_name = stanzas[i]
    stanza_body = stanzas[i + 1]
    display_name = None
    gtm = False
    for line in stanza_body.splitlines():
        line = line.strip()
        if line.startswith('#') or '=' not in line:
            continue
        key, val = line.split('=', 1)
        key, val = key.strip(), val.strip()
        if key == 'display_name':
            display_name = val
        elif key == 'secure_networking_gtm':
            gtm = (val.lower() == 'true')
    if display_name:
        products[display_name] = {'stanza': stanza_name, 'gtm': gtm}

desired = {
    'Cisco Access Points (AP)': True,
    'Cisco Aggregation Services Routers (ASR)': False,
    'Cisco AI Defense': True,
    'Cisco AppDynamics (AppD)': False,
    'Cisco Application Centric Infrastructure (Cisco ACI)': True,
    'Cisco Bug Search Tool (BST)': False,
    'Cisco Carrier Routing System (CRS)': False,
    'Cisco Catalyst Center': True,
    'Cisco Catalyst SD-WAN': True,
    'Cisco Catalyst Switches': True,
    'Cisco Cloud Web Security (CWS)': True,
    'Cisco Cloudlock Cloud Access Security Broker (CASB)': True,
    'Cisco Connected Mobile Experiences (Cisco CMX)': False,
    'Cisco Cyber Vision (CCV)': True,
    'Cisco Domain Protection': True,
    'Cisco Duo Security (Duo)': True,
    'Cisco Email Threat Defense (ETD)': True,
    'Cisco Encrypted Traffic Analytics (ETA)': True,
    'Cisco Endpoint Security Analytics (CESA)': True,
    'Cisco Enhanced Event Visibility (EVE)': True,
    'Cisco Extended Detection and Response (XDR)': True,
    'Cisco Hypershield': True,
    'Cisco Identity Intelligence (CII)': True,
    'Cisco Identity Services Engine (ISE)': True,
    'Cisco Industrial Ethernet (IE) Switches': True,
    'Cisco Industrial Routers (IR)': True,
    'Cisco Integrated Services Routers (ISR)': True,
    'Cisco Intersight (Intersight)': True,
    'Cisco Isovalent (Isovalent)': True,
    'Cisco Isovalent Edge Processor (IEP)': True,
    'Cisco Meeting Server (CMS)': False,
    'Cisco Meraki (Meraki)': True,
    'Cisco Multicloud Defense (MCD)': True,
    'Cisco Network Assurance Engine': True,
    'Cisco Network Convergence System (NCS)': False,
    'Cisco Network Visibility Module (NVM)': True,
    'Cisco Nexus Dashboard (ND)': True,
    'Cisco Nexus HyperFabric': True,
    'Cisco Nexus HyperFabric AI': True,
    'Cisco Nexus Switches (NEX)': True,
    'Cisco openVuln API Query': True,
    'Cisco Optics / CMIS Intelligence': False,
    'Cisco Prime Infrastructure (Cisco Prime)': True,
    'Cisco Product Security Incident Response Team (PSIRT)': True,
    'Cisco Provider Connectivity Assurance (PCA)': True,
    'Cisco pxGrid': True,
    'Cisco Secure Access (SSE)': True,
    'Cisco Secure Access Control Server (Cisco ACS)': True,
    'Cisco Secure Email Gateway': True,
    'Cisco Secure Endpoint (CSE/AMP)': True,
    'Cisco Secure Equipment Access (SEA)': True,
    'Cisco Secure Firewall (FTD/eStreamer/ASA)': True,
    'Cisco Secure Intrusion Prevention System (Cisco Secure IPS)': True,
    'Cisco Secure Malware Analytics (SMA)': True,
    'Cisco Secure Network Analytics (SNA)': True,
    'Cisco Secure Workload (CSW)': True,
    'Cisco SecureX': True,
    'Cisco Spaces': False,
    'Cisco Talos (Talos)': True,
    'Cisco ThousandEyes (TE)': True,
    'Cisco Threat Grid': True,
    'Cisco Umbrella': True,
    'Cisco Umbrella Investigate': True,
    'Cisco Unified Communications Manager (CUCM)': False,
    'Cisco Unified Computing System (UCS)': False,
    'Cisco Vulnerability Intelligence (CVI)': True,
    'Cisco Web Security Appliance (WSA)': True,
    'Cisco Webex (Webex)': False,
    'Cisco Wireless LAN Controller (WLC)': True,
    'Collaboration Hardware (Deskpro/Board)': False,
    'Isovalent Runtime Security': True,
    'NetFlow / IPFIX (Foundational Signal)': True,
    'Panoptica / Calisti': True,
}

print('=' * 80)
print('MISMATCHES (need to change):')
print('=' * 80)
mismatches = []
not_found = []
for display_name, desired_gtm in sorted(desired.items()):
    if display_name in products:
        current_gtm = products[display_name]['gtm']
        if current_gtm != desired_gtm:
            stanza = products[display_name]['stanza']
            mismatches.append((display_name, stanza, current_gtm, desired_gtm))
            action = 'ADD gtm=true' if desired_gtm else 'REMOVE gtm=true'
            print(f'  {display_name} [{stanza}]: current={current_gtm}, desired={desired_gtm} -> {action}')
    else:
        not_found.append(display_name)
        print(f'  WARNING: "{display_name}" not found in products.conf!')

if not mismatches and not not_found:
    print('  (none - all aligned!)')

print()
print('=' * 80)
print(f'SUMMARY: {len(mismatches)} mismatches, {len(not_found)} not found, out of {len(desired)} products')
print('=' * 80)

print()
print('Products in products.conf NOT in the GTM list (for reference):')
for display_name in sorted(products.keys()):
    if display_name not in desired:
        p = products[display_name]
        print(f'  {display_name} [{p["stanza"]}] gtm={p["gtm"]}')

print()
print('=' * 80)
print('CURRENT GTM=true count:', sum(1 for p in products.values() if p['gtm']))
print('DESIRED GTM=true count:', sum(1 for v in desired.values() if v))
print('=' * 80)
