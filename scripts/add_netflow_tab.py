#!/usr/bin/env python3
"""
add_netflow_tab.py — Add netflow_ fields to products.conf

For products that reference the Cisco Catalyst Enhanced Netflow Add-on
(splunk_app_stream_ipfix_cisco_hsl) as a legacy app:
1. Remove it from legacy_apps/legacy_labels/legacy_uids/legacy_urls/legacy_statuses
2. Add netflow_supported = true and related netflow_ fields
"""

import re
import sys
from pathlib import Path

CONF_PATH = Path(__file__).resolve().parent.parent / \
    'packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf'

NETFLOW_ADDON_ID = 'splunk_app_stream_ipfix_cisco_hsl'
NETFLOW_ADDON_LABEL = 'Cisco Catalyst Enhanced Netflow Add-on for Splunk'
NETFLOW_ADDON_UID = '6872'
NETFLOW_ADDON_URL = 'https://splunkbase.splunk.com/app/6872'


def parse_stanzas(text):
    """Parse products.conf into a list of (stanza_name, raw_lines) tuples.
    Lines between stanzas are grouped with the following stanza.
    The preamble (before any stanza) is grouped as stanza_name=None."""
    stanzas = []
    current_name = None
    current_lines = []

    for line in text.splitlines(keepends=True):
        m = re.match(r'^\[(.+)\]\s*$', line.strip())
        if m:
            stanzas.append((current_name, current_lines))
            current_name = m.group(1)
            current_lines = [line]
        else:
            current_lines.append(line)

    stanzas.append((current_name, current_lines))
    return stanzas


def csv_split(val):
    """Split a CSV value into a list, preserving empty slots."""
    return [s.strip() for s in val.split(',')]


def csv_join(items):
    """Join a list back into a CSV value."""
    return ','.join(items)


def get_field(lines, key):
    """Get the value of a field from stanza lines."""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('#') or not stripped:
            continue
        m = re.match(rf'^{re.escape(key)}\s*=\s*(.*)', stripped)
        if m:
            return m.group(1).strip()
    return None


def remove_index_from_csv_fields(lines, keys, index):
    """Remove the item at `index` from multiple CSV fields."""
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('#') or not stripped:
            new_lines.append(line)
            continue

        matched = False
        for key in keys:
            m = re.match(rf'^({re.escape(key)}\s*=\s*)(.*)', stripped)
            if m:
                prefix = m.group(1)
                items = csv_split(m.group(2))
                if index < len(items):
                    items.pop(index)
                # Preserve original indentation
                indent = line[:len(line) - len(line.lstrip())]
                new_lines.append(f'{indent}{prefix}{csv_join(items)}\n')
                matched = True
                break

        if not matched:
            new_lines.append(line)

    return new_lines


def find_insert_point(lines):
    """Find the line index where netflow_ fields should be inserted.
    Insert before sort_order if it exists, otherwise at end of stanza."""
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('sort_order'):
            return i
    # Fall back: insert before last blank line or at end
    return len(lines)


def add_netflow_fields(lines, product_id):
    """Add netflow_ fields to a stanza."""
    insert_idx = find_insert_point(lines)

    # Determine if product already has sc4s fields (to know proper spacing)
    has_sc4s = any('sc4s_supported' in l for l in lines)

    netflow_block = []
    if has_sc4s:
        netflow_block.append('\n')  # blank line separator after sc4s block

    netflow_block.extend([
        '# ── NetFlow / Stream (Dual-Path Onboarding) ────────────────────────────────\n',
        'netflow_supported = true\n',
        f'netflow_addon = {NETFLOW_ADDON_ID}\n',
        f'netflow_addon_label = {NETFLOW_ADDON_LABEL}\n',
        f'netflow_addon_splunkbase_url = {NETFLOW_ADDON_URL}\n',
        f'netflow_addon_splunkbase_id = {NETFLOW_ADDON_UID}\n',
        'netflow_addon_install_url = /manager/splunk-cisco-app-navigator/appsremote?order=relevance&query=%22Enhanced+Netflow%22&offset=0&support=cisco\n',
        f'netflow_addon_docs_url = {NETFLOW_ADDON_URL}\n',
        'netflow_config_notes = Configure NetFlow v9 or IPFIX export on your Cisco devices to point at the Stream Forwarder.|Requires Splunk App for Stream + Add-on for Stream Forwarders as prerequisites — install both before enabling NetFlow collection.|The Cisco Enhanced Netflow Add-on extends Stream with Cisco-specific IPFIX templates and field extractions.\n',
    ])

    lines[insert_idx:insert_idx] = netflow_block
    return lines


def process():
    text = CONF_PATH.read_text()
    stanzas = parse_stanzas(text)

    modified = 0
    new_stanzas = []

    for name, lines in stanzas:
        if name is None:
            new_stanzas.append((name, lines))
            continue

        legacy_apps = get_field(lines, 'legacy_apps')
        if not legacy_apps or NETFLOW_ADDON_ID not in legacy_apps:
            new_stanzas.append((name, lines))
            continue

        # Find the index of the Enhanced Netflow add-on in legacy_apps
        la_items = csv_split(legacy_apps)
        try:
            idx = la_items.index(NETFLOW_ADDON_ID)
        except ValueError:
            new_stanzas.append((name, lines))
            continue

        print(f'  [{name}] Removing Enhanced Netflow from legacy_apps (index {idx}), adding netflow_ fields')

        # Remove from all legacy CSV fields
        lines = remove_index_from_csv_fields(
            lines,
            ['legacy_apps', 'legacy_labels', 'legacy_uids', 'legacy_urls', 'legacy_statuses'],
            idx
        )

        # Add netflow_ fields
        lines = add_netflow_fields(lines, name)
        modified += 1

        new_stanzas.append((name, lines))

    # Reassemble
    output = ''
    for name, lines in new_stanzas:
        output += ''.join(lines)

    CONF_PATH.write_text(output)
    print(f'\nDone: modified {modified} product stanzas')
    print(f'Written to: {CONF_PATH}')


if __name__ == '__main__':
    process()
