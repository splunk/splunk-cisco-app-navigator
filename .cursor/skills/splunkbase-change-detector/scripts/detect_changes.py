#!/usr/bin/env python3
"""
Splunkbase Change Detector

Cross-references scan_splunkbase_apps.csv.gz against products.conf to detect:
  1. New Cisco apps not referenced by any product card
  2. Version bumps on referenced apps
  3. New sourcetypes in Splunkbase metadata
  4. GTM/roadmap promotion candidates

Usage:
    python3 .cursor/skills/splunkbase-change-detector/scripts/detect_changes.py
"""

import csv
import gzip
import json
import os
import re
import sys
from collections import defaultdict

BASE_DIR = os.path.normpath(os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..",
))

PRODUCTS_CONF = os.path.join(
    BASE_DIR,
    "packages", "splunk-cisco-app-navigator",
    "src", "main", "resources", "splunk", "default", "products.conf",
)

SPLUNKBASE_CSV = os.path.join(
    BASE_DIR,
    "packages", "splunk-cisco-app-navigator",
    "src", "main", "resources", "splunk", "lookups", "scan_splunkbase_apps.csv.gz",
)

CISCO_APPID_PREFIXES = (
    "cisco", "Cisco", "Splunk_TA_cisco", "Splunk_TA_Cisco",
    "TA_cisco", "TA-cisco", "CiscoSecurity",
)


def parse_products_conf(path):
    """Return dict of product_id -> {addon_uid, app_viz_uid, legacy_uids, sourcetypes, status, ...}."""
    products = {}
    current = None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";") or line.startswith("#"):
                continue
            m = re.match(r"^\[(.+)\]$", line)
            if m:
                current = m.group(1)
                products[current] = {
                    "addon": None, "addon_uid": None,
                    "app_viz_uid": None, "legacy_uids": set(),
                    "sourcetypes": set(), "status": None,
                    "support_level": None, "display_name": None,
                }
                continue
            if current and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip()
                if key == "addon":
                    products[current]["addon"] = val
                elif key == "addon_uid":
                    products[current]["addon_uid"] = val
                elif key == "app_viz_uid":
                    products[current]["app_viz_uid"] = val
                elif key == "legacy_uids":
                    products[current]["legacy_uids"] = {
                        u.strip() for u in val.split(",") if u.strip()
                    }
                elif key == "sourcetypes":
                    products[current]["sourcetypes"] = {
                        s.strip() for s in val.split(",") if s.strip()
                    }
                elif key == "status":
                    products[current]["status"] = val
                elif key == "support_level":
                    products[current]["support_level"] = val
                elif key == "display_name":
                    products[current]["display_name"] = val
    return products


def load_splunkbase(path):
    """Return list of dicts from the CSV."""
    apps = []
    with gzip.open(path, "rt", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            apps.append(row)
    return apps


def is_cisco_app(row):
    """Heuristic: is this a Cisco-related Splunkbase entry?"""
    appid = row.get("appid", "")
    title = row.get("title", "")
    support = row.get("support", "")
    author = row.get("created_by", "")

    if support == "cisco":
        return True
    if any(appid.startswith(p) for p in CISCO_APPID_PREFIXES):
        return True
    if "cisco" in title.lower():
        return True
    if "cisco" in author.lower():
        return True
    return False


def get_all_referenced_uids(products):
    """Collect every UID referenced by any product card."""
    uids = set()
    for pid, info in products.items():
        if info["addon_uid"]:
            uids.add(info["addon_uid"])
        if info["app_viz_uid"]:
            uids.add(info["app_viz_uid"])
        uids |= info["legacy_uids"]
    return uids


def get_latest_version_from_release_history(release_history_json):
    """Extract the latest version string from the release_history JSON field."""
    if not release_history_json:
        return None
    try:
        releases = json.loads(release_history_json)
        if isinstance(releases, list) and releases:
            return releases[0].get("version")
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def main():
    if not os.path.isfile(PRODUCTS_CONF):
        print(f"ERROR: products.conf not found at {PRODUCTS_CONF}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(SPLUNKBASE_CSV):
        print(f"ERROR: Splunkbase CSV not found at {SPLUNKBASE_CSV}", file=sys.stderr)
        sys.exit(1)

    products = parse_products_conf(PRODUCTS_CONF)
    splunkbase = load_splunkbase(SPLUNKBASE_CSV)

    all_ref_uids = get_all_referenced_uids(products)

    # Build UID -> product mapping
    uid_to_products = defaultdict(list)
    for pid, info in products.items():
        if info["addon_uid"]:
            uid_to_products[info["addon_uid"]].append(pid)
        if info["app_viz_uid"]:
            uid_to_products[info["app_viz_uid"]].append(pid)

    # Build UID -> splunkbase row
    uid_to_sb = {}
    for row in splunkbase:
        uid_to_sb[row.get("uid", "")] = row

    # ── Section 1: New Cisco apps not referenced ──
    new_cisco_apps = []
    for row in splunkbase:
        uid = row.get("uid", "")
        if uid in all_ref_uids:
            continue
        if row.get("is_archived", "").lower() == "true":
            continue
        if is_cisco_app(row):
            new_cisco_apps.append(row)

    # ── Section 2: Version bumps ──
    version_bumps = []
    for uid, pids in uid_to_products.items():
        if uid not in uid_to_sb:
            continue
        sb_row = uid_to_sb[uid]
        sb_version = sb_row.get("app_version", "")
        rh = sb_row.get("release_history", "")
        latest_rh_version = get_latest_version_from_release_history(rh)
        if latest_rh_version and sb_version and latest_rh_version != sb_version:
            version_bumps.append({
                "uid": uid,
                "title": sb_row.get("title", ""),
                "sb_version": sb_version,
                "rh_version": latest_rh_version,
                "products": pids,
            })

    # ── Section 3: New sourcetypes in Splunkbase metadata ──
    new_sourcetypes = []
    for uid, pids in uid_to_products.items():
        if uid not in uid_to_sb:
            continue
        sb_row = uid_to_sb[uid]
        raw_sts = sb_row.get("sourcetypes", "")
        sep = "|" if "|" in raw_sts else ","
        sb_sts = {s.strip() for s in raw_sts.split(sep) if s.strip()}
        if not sb_sts:
            continue
        claimed = set()
        for pid in pids:
            claimed |= products[pid]["sourcetypes"]
        unclaimed = sb_sts - claimed
        if unclaimed:
            new_sourcetypes.append({
                "uid": uid,
                "title": sb_row.get("title", ""),
                "unclaimed": sorted(unclaimed),
                "products": pids,
            })

    # ── Section 4: GTM / roadmap promotion candidates ──
    promotable = []
    for pid, info in products.items():
        if info["status"] not in ("roadmap", "under_development"):
            continue
        if info["addon_uid"]:
            continue  # already has an addon — not a candidate
        display = info["display_name"] or pid
        keywords = [w.lower() for w in re.split(r"[\s()/]+", display) if len(w) > 2]
        keywords = [w for w in keywords if w not in ("cisco", "the", "for", "and")]
        matches = []
        for row in splunkbase:
            if row.get("is_archived", "").lower() == "true":
                continue
            title_lower = row.get("title", "").lower()
            if any(kw in title_lower for kw in keywords) and is_cisco_app(row):
                matches.append(row)
        if matches:
            promotable.append({
                "product_id": pid,
                "display_name": display,
                "status": info["status"],
                "matches": matches,
            })

    # ── Output ──
    sep = "=" * 60

    print(f"\n{sep}")
    print(f"NEW CISCO APPS (not referenced by any product card): [{len(new_cisco_apps)}]")
    print(sep)
    for row in sorted(new_cisco_apps, key=lambda r: r.get("title", "")):
        uid = row.get("uid", "?")
        title = row.get("title", "?")
        ver = row.get("app_version", "?")
        support = row.get("support", "?")
        archived = row.get("is_archived", "false")
        print(f"  UID {uid}: \"{title}\" (v{ver}, support={support}, archived={archived})")

    print(f"\n{sep}")
    print(f"VERSION BUMPS (Splunkbase vs release_history): [{len(version_bumps)}]")
    print(sep)
    for vb in sorted(version_bumps, key=lambda x: x["title"]):
        print(f"  {vb['title']} (UID {vb['uid']}): app_version={vb['sb_version']} vs release_history latest={vb['rh_version']}")
        print(f"    Affects: {', '.join(vb['products'])}")

    print(f"\n{sep}")
    print(f"NEW SOURCETYPES IN SPLUNKBASE METADATA: [{len(new_sourcetypes)}]")
    print(sep)
    for ns in sorted(new_sourcetypes, key=lambda x: x["title"]):
        print(f"  {ns['title']} (UID {ns['uid']}): +{len(ns['unclaimed'])} unclaimed")
        for st in ns["unclaimed"]:
            print(f"    {st}")
        print(f"    Affects: {', '.join(ns['products'])}")

    print(f"\n{sep}")
    print(f"GTM / ROADMAP PROMOTION CANDIDATES: [{len(promotable)}]")
    print(sep)
    for p in sorted(promotable, key=lambda x: x["display_name"]):
        print(f"  [{p['product_id']}] \"{p['display_name']}\" (status={p['status']})")
        for m in p["matches"][:5]:
            print(f"    → UID {m.get('uid','?')}: \"{m.get('title','?')}\" (support={m.get('support','?')})")

    print(f"\n{sep}")
    print("SUMMARY")
    print(sep)
    print(f"  New Cisco apps (unreferenced):  {len(new_cisco_apps)}")
    print(f"  Version bumps:                  {len(version_bumps)}")
    print(f"  New Splunkbase sourcetypes:      {len(new_sourcetypes)}")
    print(f"  Promotion candidates:            {len(promotable)}")


if __name__ == "__main__":
    main()
