#!/usr/bin/env python3
"""
Normalize products.conf — ensure every stanza has ALL fields in canonical order.
Fields with no value are kept as empty (e.g. `legacy_apps =`).
Comments between stanzas are preserved.
"""

import re
import os

CONF_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'packages',
    'cisco-control-center-app', 'src', 'main', 'resources', 'splunk',
    'default', 'products.conf'
)

# Canonical field order — matches products.conf.spec
CANONICAL_FIELDS = [
    "disabled",
    "display_name",
    "description",
    "value_proposition",
    "vendor",
    "tagline",
    "category",
    "version",
    "status",
    "addon",
    "addon_label",
    "addon_family",
    "addon_splunkbase_url",
    "addon_docs_url",
    "addon_install_url",
    "app_viz",
    "app_viz_label",
    "app_viz_splunkbase_url",
    "app_viz_docs_url",
    "app_viz_install_url",
    "app_viz_2",
    "app_viz_2_label",
    "app_viz_2_splunkbase_url",
    "app_viz_2_docs_url",
    "app_viz_2_install_url",
    "learn_more_url",
    "legacy_apps",
    "legacy_labels",
    "legacy_uids",
    "legacy_urls",
    "prereq_apps",
    "prereq_labels",
    "prereq_uids",
    "prereq_urls",
    "community_apps",
    "community_labels",
    "community_uids",
    "community_urls",
    "sourcetypes",
    "dashboards",
    "custom_dashboard",
    "keywords",
    "aliases",
    "icon_emoji",
    "soar_connector_label",
    "soar_connector_uid",
    "soar_connector_url",
    "soar_connector_2_label",
    "soar_connector_2_uid",
    "soar_connector_2_url",
    "soar_connector_3_label",
    "soar_connector_3_uid",
    "soar_connector_3_url",
    "alert_action_label",
    "alert_action_uid",
    "alert_action_url",
    "alert_action_2_label",
    "alert_action_2_uid",
    "alert_action_2_url",
    "itsi_content_pack_label",
    "itsi_content_pack_docs_url",
    "sort_order",
]

def parse_conf(path):
    """Parse products.conf into a list of (header_comments, stanza_name, fields_dict)."""
    stanzas = []
    header_comments = []  # comments/blanks before the first stanza or between stanzas
    current_name = None
    current_fields = {}
    preamble = []  # file-level comments before any stanza

    with open(path, 'r') as f:
        lines = f.readlines()

    in_preamble = True
    pending_comments = []

    for line in lines:
        stripped = line.rstrip('\n')

        # Stanza header
        m = re.match(r'^\[(.+)\]\s*$', stripped)
        if m:
            if current_name is not None:
                stanzas.append((header_comments, current_name, current_fields))
                header_comments = pending_comments[:]
            elif in_preamble:
                preamble = pending_comments[:]
                header_comments = []
            else:
                header_comments = pending_comments[:]
            pending_comments = []
            current_name = m.group(1)
            current_fields = {}
            in_preamble = False
            continue

        # Comment or blank line
        if not stripped or stripped.startswith('#'):
            pending_comments.append(stripped)
            continue

        # Key = value (possibly commented out like "# addon = ...")
        eq = stripped.find('=')
        if eq > 0:
            raw_key = stripped[:eq].strip()
            val = stripped[eq + 1:].strip()

            # Handle commented-out fields: "# addon = CiscoSecurityCloud"
            if raw_key.startswith('# '):
                key = raw_key[2:].strip()
                # Store as commented value — we'll uncomment and include
                if key in CANONICAL_FIELDS:
                    # Keep the value but mark it was commented
                    current_fields[key] = val
            else:
                current_fields[raw_key] = val

    # Last stanza
    if current_name is not None:
        stanzas.append((header_comments, current_name, current_fields))

    return preamble, stanzas


def write_conf(path, preamble, stanzas):
    """Write normalized products.conf."""
    with open(path, 'w') as f:
        # File preamble
        for line in preamble:
            f.write(line + '\n')

        for i, (comments, name, fields) in enumerate(stanzas):
            # Section comments (e.g. "# Coming Soon — Security")
            for c in comments:
                f.write(c + '\n')

            # Stanza header
            f.write(f'[{name}]\n')

            # All fields in canonical order
            for key in CANONICAL_FIELDS:
                val = fields.get(key, '')
                f.write(f'{key} = {val}\n')

            # Blank line between stanzas
            f.write('\n')


def main():
    print(f"Reading: {CONF_PATH}")
    preamble, stanzas = parse_conf(CONF_PATH)
    print(f"Found {len(stanzas)} stanzas, {len(CANONICAL_FIELDS)} canonical fields")

    # Report any fields in conf that aren't in canonical list
    for comments, name, fields in stanzas:
        for key in fields:
            if key not in CANONICAL_FIELDS:
                print(f"  WARNING: [{name}] has unknown field '{key}' — will be dropped!")

    write_conf(CONF_PATH, preamble, stanzas)

    # Verify
    _, check = parse_conf(CONF_PATH)
    print(f"\nWrote {len(check)} stanzas, each with {len(CANONICAL_FIELDS)} fields")

    # Quick sanity: count lines
    with open(CONF_PATH) as f:
        total = sum(1 for _ in f)
    print(f"Total lines: {total}")
    print("Done — all stanzas normalized.")


if __name__ == '__main__':
    main()
