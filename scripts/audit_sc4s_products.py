#!/usr/bin/env python3
"""Audit 16 SC4S solutions against products.conf"""
import configparser
import os

CONF = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                    'src', 'main', 'resources', 'splunk', 'default', 'products.conf')

with open(CONF) as f:
    content = '[DEFAULT]\n' + f.read()
c = configparser.ConfigParser(interpolation=None)
c.read_string(content)

products = {}
for s in c.sections():
    if s == 'DEFAULT':
        continue
    products[s] = {
        'name': c.get(s, 'display_name', fallback=s),
        'sc4s': c.get(s, 'sc4s_supported', fallback=''),
        'url': c.get(s, 'sc4s_url', fallback=''),
        'ta': c.get(s, 'sc4s_search_head_ta', fallback=''),
        'status': c.get(s, 'status', fallback=''),
        'disabled': c.get(s, 'disabled', fallback='0'),
    }

sc4s_list = [
    ('ACE',         'Application Control Engine',               ['cisco_ace']),
    ('ACS',         'Cisco Access Control System',              ['cisco_acs']),
    ('ASA/FTD',     'ASA/FTD (Firepower)',                      ['cisco_secure_firewall']),
    ('DNA',         'Digital Network Area',                     ['cisco_catalyst_center']),
    ('ESA',         'Email Security Appliance',                 ['cisco_esa']),
    ('IMC',         'Cisco Integrated Management Controller',   ['cisco_imc', 'cisco_cimc']),
    ('IOS',         'Cisco Networking (IOS)',                    ['cisco_catalyst_switches', 'cisco_ios', 'cisco_networking']),
    ('ISE',         'Cisco ISE',                                ['cisco_ise']),
    ('Meraki',      'Cisco Meraki',                             ['cisco_meraki']),
    ('Meeting Mgmt','Meeting Management',                       ['cisco_meeting_management', 'cisco_tms']),
    ('CMS',         'Meeting Server',                           ['cisco_meeting_server', 'cisco_cms']),
    ('TVCS',        'TelePresence VCS',                         ['cisco_tvcs', 'cisco_telepresence_vcs']),
    ('UCM',         'Unified Communications Manager',           ['cisco_cucm', 'cisco_ucm']),
    ('UCS',         'Unified Computing System',                 ['cisco_ucs']),
    ('Viptela',     'Viptela / SD-WAN',                         ['cisco_catalyst_sdwan', 'cisco_viptela']),
    ('WSA',         'Web Security Appliance',                   ['cisco_wsa']),
]

print('=== SC4S AUDIT: 16 solutions vs products.conf ===\n')
ok = 0
missing_sc4s = 0
no_stanza = 0
for short, desc, candidates in sc4s_list:
    found = None
    for cand in candidates:
        if cand in products:
            found = cand
            break
    if found:
        p = products[found]
        sc4s_flag = p['sc4s'] in ('true', '1')
        ta_info = p['ta'] if p['ta'] else '(no TA needed)'
        disabled = ' [DISABLED]' if p['disabled'] == '1' else ''
        if sc4s_flag:
            print(f'  OK  {short:15} -> [{found}] "{p["name"]}"{disabled}')
            print(f'       TA: {ta_info}')
            print(f'       URL: {p["url"] or "(none)"}')
            ok += 1
        else:
            print(f'  !!  {short:15} -> [{found}] "{p["name"]}"{disabled}  -- sc4s_supported NOT SET')
            missing_sc4s += 1
    else:
        print(f'  XX  {short:15} -> NO STANZA FOUND (tried: {", ".join(candidates)})')
        no_stanza += 1
    print()

print(f'Summary: {ok} connected, {missing_sc4s} missing sc4s flag, {no_stanza} no stanza')
