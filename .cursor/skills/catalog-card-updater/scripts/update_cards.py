#!/usr/bin/env python3
"""
Catalog Card Updater

Applies structured changes to products.conf stanzas.

Usage:
    python3 scripts/update_cards.py add-sourcetypes --product PID --sourcetypes "st1,st2"
    python3 scripts/update_cards.py promote --product PID --addon APPID --addon-uid UID --addon-label LABEL --support-level LEVEL
    python3 scripts/update_cards.py update-fields --product PID --fields "key1=val1,key2=val2"
"""

import argparse
import os
import re
import sys
from datetime import date

PRODUCTS_CONF = os.path.normpath(os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..",
    "packages", "splunk-cisco-app-navigator",
    "src", "main", "resources", "splunk", "default", "products.conf",
))


def read_conf(path):
    with open(path) as f:
        return f.read()


def write_conf(path, content):
    with open(path, "w") as f:
        f.write(content)


def find_stanza(content, product_id):
    """Find the start/end character positions of a stanza in products.conf."""
    pattern = re.compile(
        r"^\[" + re.escape(product_id) + r"\]\s*$",
        re.MULTILINE,
    )
    m = pattern.search(content)
    if not m:
        return None, None
    start = m.start()
    next_stanza = re.search(r"^\[", content[m.end():], re.MULTILINE)
    end = m.end() + next_stanza.start() if next_stanza else len(content)
    return start, end


def get_field(stanza_text, key):
    """Get a field value from stanza text."""
    m = re.search(r"^" + re.escape(key) + r"\s*=\s*(.+)$", stanza_text, re.MULTILINE)
    return m.group(1).strip() if m else None


def set_field(stanza_text, key, value):
    """Set or add a field in stanza text."""
    pattern = re.compile(r"^" + re.escape(key) + r"\s*=\s*.+$", re.MULTILINE)
    if pattern.search(stanza_text):
        return pattern.sub(f"{key} = {value}", stanza_text)
    # Add before the last non-empty line
    lines = stanza_text.rstrip().split("\n")
    lines.append(f"{key} = {value}")
    return "\n".join(lines) + "\n"


def cmd_add_sourcetypes(args):
    content = read_conf(PRODUCTS_CONF)
    start, end = find_stanza(content, args.product)
    if start is None:
        print(f"ERROR: Product [{args.product}] not found in products.conf", file=sys.stderr)
        sys.exit(1)

    stanza = content[start:end]
    existing = get_field(stanza, "sourcetypes")
    existing_set = {s.strip() for s in existing.split(",") if s.strip()} if existing else set()

    new_sts = {s.strip() for s in args.sourcetypes.split(",") if s.strip()}
    added = new_sts - existing_set
    if not added:
        print(f"No new sourcetypes to add to [{args.product}]. All already present.")
        return

    merged = sorted(existing_set | new_sts)
    stanza = set_field(stanza, "sourcetypes", ",".join(merged))
    stanza = set_field(stanza, "date_updated", str(date.today()))

    content = content[:start] + stanza + content[end:]
    write_conf(PRODUCTS_CONF, content)
    print(f"Added {len(added)} sourcetypes to [{args.product}]: {', '.join(sorted(added))}")
    print(f"Total sourcetypes now: {len(merged)}")


def cmd_promote(args):
    content = read_conf(PRODUCTS_CONF)
    start, end = find_stanza(content, args.product)
    if start is None:
        print(f"ERROR: Product [{args.product}] not found in products.conf", file=sys.stderr)
        sys.exit(1)

    stanza = content[start:end]
    old_status = get_field(stanza, "status")

    stanza = set_field(stanza, "status", "active")
    stanza = set_field(stanza, "support_level", args.support_level)
    stanza = set_field(stanza, "addon", args.addon)
    stanza = set_field(stanza, "addon_uid", args.addon_uid)
    stanza = set_field(stanza, "addon_label", args.addon_label)
    stanza = set_field(stanza, "date_updated", str(date.today()))

    content = content[:start] + stanza + content[end:]
    write_conf(PRODUCTS_CONF, content)
    print(f"Promoted [{args.product}] from {old_status} → active")
    print(f"  addon = {args.addon} (UID {args.addon_uid})")
    print(f"  support_level = {args.support_level}")


def cmd_update_fields(args):
    content = read_conf(PRODUCTS_CONF)
    start, end = find_stanza(content, args.product)
    if start is None:
        print(f"ERROR: Product [{args.product}] not found in products.conf", file=sys.stderr)
        sys.exit(1)

    stanza = content[start:end]
    pairs = [p.strip() for p in args.fields.split(",") if "=" in p]
    for pair in pairs:
        key, _, val = pair.partition("=")
        stanza = set_field(stanza, key.strip(), val.strip())

    if not any(p.startswith("date_updated=") for p in pairs):
        stanza = set_field(stanza, "date_updated", str(date.today()))

    content = content[:start] + stanza + content[end:]
    write_conf(PRODUCTS_CONF, content)
    print(f"Updated [{args.product}] with {len(pairs)} field(s)")
    for pair in pairs:
        print(f"  {pair}")


def main():
    parser = argparse.ArgumentParser(description="Catalog Card Updater")
    sub = parser.add_subparsers(dest="command")

    p_add = sub.add_parser("add-sourcetypes", help="Add sourcetypes to a product card")
    p_add.add_argument("--product", required=True, help="Product stanza ID")
    p_add.add_argument("--sourcetypes", required=True, help="Comma-separated sourcetypes to add")

    p_promo = sub.add_parser("promote", help="Promote a product to active status")
    p_promo.add_argument("--product", required=True, help="Product stanza ID")
    p_promo.add_argument("--addon", required=True, help="Splunk appid for the addon")
    p_promo.add_argument("--addon-uid", required=True, help="Splunkbase UID for the addon")
    p_promo.add_argument("--addon-label", required=True, help="Human-readable addon label")
    p_promo.add_argument("--support-level", required=True,
                         choices=["cisco_supported", "splunk_supported", "developer_supported"],
                         help="Support level after promotion")

    p_upd = sub.add_parser("update-fields", help="Update arbitrary fields on a product card")
    p_upd.add_argument("--product", required=True, help="Product stanza ID")
    p_upd.add_argument("--fields", required=True, help="Comma-separated key=value pairs")

    args = parser.parse_args()

    if args.command == "add-sourcetypes":
        cmd_add_sourcetypes(args)
    elif args.command == "promote":
        cmd_promote(args)
    elif args.command == "update-fields":
        cmd_update_fields(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
