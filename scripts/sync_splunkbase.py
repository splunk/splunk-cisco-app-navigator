#!/usr/bin/env python3
"""
sync_splunkbase.py — Pre-release Splunkbase sync for SCAN

Pulls the latest Splunkbase app catalog from S3 and:
  1. Updates cisco_apps.csv with fresh data for every tracked UID
  2. Detects NEW Cisco-related apps on Splunkbase not yet in our CSV
  3. Alerts on deprecation/archive changes, version bumps, title renames
  4. Preserves all custom enrichment columns (Cisco_App_Class, Deprecated, etc.)

Usage:
  python3 bin/sync_splunkbase.py                    # Sync and update CSV
  python3 bin/sync_splunkbase.py --dry-run           # Report changes only, don't write
  python3 bin/sync_splunkbase.py --profile MyProfile  # Use specific AWS profile
  python3 bin/sync_splunkbase.py --local /path/to.gz  # Skip S3, use local file

Exit codes:
  0 = no changes needed
  1 = changes applied (or would be applied in dry-run)
  2 = error
"""

import argparse
import ast
import csv
import gzip
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
PKG_ROOT = os.path.join(REPO_ROOT, "packages", "splunk-cisco-app-navigator")
CSV_PATH = os.path.join(
    PKG_ROOT, "src", "main", "resources", "splunk", "lookups", "cisco_apps.csv"
)
BACKUP_DIR = os.path.join(REPO_ROOT, "backups")

S3_URI = "s3://is4s/splunkbase_assets/splunkbase_apps.csv.gz"
DEFAULT_PROFILE = "SPLKAdministratorAccess-424205266756"

# Columns that exist only in our CSV — never overwritten from Splunkbase
CUSTOM_COLUMNS = {
    "Supported_Cisco_Products_Zipped",
    "Cisco_App_Class",
    "Deprecated",
    "Replacement",
    "Cisco_Category",
    "Cisco_Sub_Category",
    "username",
    "display_name",
    "hosting",
}

# Fields that trigger an ALERT when they change (important changes)
ALERT_FIELDS = {"title", "is_archived", "archive_status", "app_version"}

# Fields that change frequently but are low-signal (updated silently)
NOISY_FIELDS = {
    "download_count", "install_count", "rating",
    "updated_time", "created_time", "published_time",  # timezone-format diffs
}

# Fields where format differences are expected — normalize before comparing
# These use list-syntax in Splunkbase but pipe-delimited in our CSV
LIST_FORMAT_FIELDS = {
    "categories", "sourcetypes", "cim_compatibility", "cim_tags",
    "product_compatibility", "version_compatibility",
}

# Boolean-like fields (True/true case mismatch)
BOOL_FIELDS = {
    "is_archived", "appinspect_passed", "passed_validation",
    "fedramp_validation", "fips_compatibility", "appinspect_status",
    "install_method_single", "install_method_distributed", "install_method_cloud",
}

# Date fields (ISO vs MM/DD/YYYY format)
DATE_FIELDS = {"updated_time", "created_time", "published_time"}

# Long-text fields — compare only semantic content, not whitespace
LONG_TEXT_FIELDS = {"description", "documentation", "notes"}

# Keywords used to detect "Cisco-related" apps in Splunkbase
CISCO_KEYWORDS_TITLE = [
    "cisco", "meraki", "webex", "umbrella", "thousandeyes", "duo ",
    "appdynamics", "intersight", "firepower", "stealthwatch",
    "secure endpoint", "secure firewall", "secure email",
    "secure network analytics", "secure malware analytics",
    "catalyst center", "catalyst sd-wan", "splunk for cisco",
    "splunk add-on for cisco", "talos", "radware",
]
CISCO_KEYWORDS_AUTHOR = ["cisco"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def log(msg, level="INFO"):
    colors = {"INFO": "\033[36m", "WARN": "\033[33m", "ERROR": "\033[31m",
              "OK": "\033[32m", "ALERT": "\033[35m", "RESET": "\033[0m"}
    prefix = colors.get(level, "")
    reset = colors["RESET"]
    print(f"{prefix}[{level}]{reset} {msg}")


def download_from_s3(profile, dest):
    """Download splunkbase_apps.csv.gz from S3."""
    cmd = ["aws", "s3", "cp", S3_URI, dest, "--profile", profile]
    log(f"Downloading from S3: {S3_URI}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            stderr = result.stderr.strip()
            if "Token has expired" in stderr or "Unable to locate credentials" in stderr:
                log("AWS SSO token expired or missing. Attempting SSO login...", "WARN")
                login_cmd = ["aws", "sso", "login", "--profile", profile]
                login_result = subprocess.run(login_cmd, capture_output=False, timeout=120)
                if login_result.returncode != 0:
                    log("SSO login failed. Please run: aws sso login --profile " + profile, "ERROR")
                    return False
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode != 0:
                    log(f"S3 download failed after login: {result.stderr}", "ERROR")
                    return False
            else:
                log(f"S3 download failed: {stderr}", "ERROR")
                return False
        log("Download complete.", "OK")
        return True
    except subprocess.TimeoutExpired:
        log("S3 download timed out.", "ERROR")
        return False
    except FileNotFoundError:
        log("AWS CLI not found. Install it or use --local.", "ERROR")
        return False


def load_splunkbase_csv(gz_path):
    """Load and parse the gzipped Splunkbase CSV."""
    with gzip.open(gz_path, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    log(f"Loaded {len(rows)} apps from Splunkbase catalog.")
    return rows


def load_our_csv():
    """Load our cisco_apps.csv."""
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    log(f"Loaded {len(rows)} apps from cisco_apps.csv.")
    return rows, fieldnames


def parse_created_by(raw):
    """Parse created_by field which is a Python-dict-like string."""
    try:
        d = ast.literal_eval(raw)
        if isinstance(d, dict):
            return d.get("username", ""), d.get("display_name", "")
    except Exception:
        pass
    return "", ""


def is_cisco_related(row):
    """Determine if a Splunkbase app is Cisco-related.

    For new-app detection, we use a tiered approach:
      - Tier 1 (high confidence): Author is "cisco" or title starts with "Cisco "
      - Tier 2 (medium confidence): Title contains Cisco brand keywords
      - Tier 3 (low confidence): Title contains adjacent brand keywords (Radware, etc.)

    Returns: (is_related, tier) tuple
    """
    title = row.get("title", "").lower()
    author_raw = row.get("created_by", "")
    username, _ = parse_created_by(author_raw)
    username = username.lower()

    # Tier 1: Cisco-authored or Cisco-prefixed
    if username == "cisco" or title.startswith("cisco "):
        return True, 1

    # Tier 2: Contains Cisco brand keywords
    tier2_keywords = [
        "cisco", "meraki", "webex", "umbrella", "thousandeyes",
        "firepower", "catalyst center", "catalyst sd-wan",
        "secure endpoint", "secure firewall", "secure email",
        "secure network analytics", "secure malware analytics",
        "intersight", "stealthwatch", "talos",
    ]
    for kw in tier2_keywords:
        if kw in title:
            return True, 2

    # Tier 3: Adjacent brands (Radware, AppDynamics, Duo, etc.)
    tier3_keywords = [
        "radware", "appdynamics", "duo ", "clearswift",
        "splunk add-on for cisco", "splunk for cisco",
    ]
    for kw in tier3_keywords:
        if kw in title:
            return True, 3

    return False, 0


# ---------------------------------------------------------------------------
# Normalization — compare semantic content, not formatting
# ---------------------------------------------------------------------------
def parse_list_field(val):
    """Parse a list-like field into a sorted set of strings.

    Handles both formats:
      - Python list:  "['a', 'b']"
      - Pipe-delimited: "a|b"
      - Comma-separated: "a, b"
    """
    val = val.strip()
    if not val or val == "null":
        return set()
    # Try Python list literal
    if val.startswith("["):
        try:
            items = ast.literal_eval(val)
            if isinstance(items, list):
                return set(str(x).strip() for x in items if str(x).strip() and str(x).strip() != "__no_tag__")
        except Exception:
            pass
    # Pipe-delimited
    if "|" in val:
        return set(x.strip() for x in val.split("|") if x.strip() and x.strip() != "__no_tag__")
    # Comma-separated
    if "," in val:
        return set(x.strip() for x in val.split(",") if x.strip() and x.strip() != "__no_tag__")
    return {val}


def normalize_bool(value):
    """Normalize boolean-like strings (True/true/TRUE → true)."""
    return value.strip().lower() if value else ""


def parse_datetime_for_compare(val):
    """Extract a date (YYYY-MM-DD) from either format for comparison.

    Handles:
      - "02/05/2026 12:08:26.000000"
      - "2026-02-05T17:08:26+00:00"
    We only compare the date part since timezone differences cause mismatches.
    """
    val = val.strip()
    if not val or val == "null":
        return ""
    # ISO format
    m = re.match(r"(\d{4}-\d{2}-\d{2})", val)
    if m:
        return m.group(1)
    # MM/DD/YYYY format
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", val)
    if m:
        return f"{m.group(3)}-{m.group(1)}-{m.group(2)}"
    return val


def normalize_text(val):
    """Normalize long text for comparison: collapse whitespace."""
    return re.sub(r"\s+", " ", val.strip()) if val else ""


def semantically_equal(col, our_val, sb_val):
    """Check if two values are semantically equal despite format differences."""
    # Empty/null check
    our_empty = not our_val or not our_val.strip() or our_val.strip() == "null"
    sb_empty = not sb_val or not sb_val.strip() or sb_val.strip() == "null"

    if our_empty and sb_empty:
        return True
    # If Splunkbase has empty/null/[] but we have data, they're equal (keep ours)
    if sb_empty or sb_val.strip() in ("null", "[]"):
        return True

    if col in LIST_FORMAT_FIELDS:
        return parse_list_field(our_val) == parse_list_field(sb_val)
    if col in BOOL_FIELDS:
        return normalize_bool(our_val) == normalize_bool(sb_val)
    if col in DATE_FIELDS:
        return parse_datetime_for_compare(our_val) == parse_datetime_for_compare(sb_val)
    if col in LONG_TEXT_FIELDS:
        return normalize_text(our_val) == normalize_text(sb_val)

    return our_val == sb_val


def create_backup():
    """Create a timestamped backup of cisco_apps.csv."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"cisco_apps.csv.{ts}_pre_sync.bak")
    shutil.copy2(CSV_PATH, backup_path)
    log(f"Backup created: {backup_path}", "OK")
    return backup_path


# ---------------------------------------------------------------------------
# Core sync logic
# ---------------------------------------------------------------------------
def sync(sb_rows, our_rows, our_fieldnames):
    """
    Compare Splunkbase data to our CSV and produce:
      - updated_rows: our rows with Splunkbase fields refreshed
      - meaningful_changes: changes that matter (title, version, etc.)
      - silent_updates: noisy/format-only updates applied without reporting
      - alerts: important alerts (new apps, deprecations, etc.)
    """
    sb_map = {r["uid"]: r for r in sb_rows}

    # Determine which columns to sync
    sb_cols = set(sb_rows[0].keys()) if sb_rows else set()
    our_cols = set(our_fieldnames)
    sync_cols = (sb_cols & our_cols) - CUSTOM_COLUMNS
    sync_cols.discard("uid")
    log(f"Syncing {len(sync_cols)} columns from Splunkbase.")

    meaningful_changes = []
    silent_updates = 0
    alerts = []

    # --- Pass 1: Update existing UIDs ---
    for row in our_rows:
        uid = row["uid"]
        if uid not in sb_map:
            alerts.append(
                f"⚠️  UID {uid} ({row['title'][:40]}) in our CSV but NOT in Splunkbase — may have been removed"
            )
            continue

        sb = sb_map[uid]
        for col in sync_cols:
            sb_val = sb.get(col, "")
            our_val = row.get(col, "")

            # Skip if Splunkbase value is empty/null
            sb_stripped = sb_val.strip() if sb_val else ""
            if not sb_stripped or sb_stripped == "null":
                continue
            # Also skip empty list values like "[]"
            if sb_stripped == "[]" and not our_val.strip():
                continue

            # Check if semantically equal
            if semantically_equal(col, our_val, sb_val):
                continue

            # --- Real change detected ---
            # Always update the value in our row
            row[col] = sb_val

            # Categorize the change
            if col in NOISY_FIELDS:
                silent_updates += 1
                continue

            old_display = our_val[:60] if our_val else "(empty)"
            new_display = sb_val[:60]

            meaningful_changes.append({
                "uid": uid,
                "title": row["title"][:40],
                "field": col,
                "old": old_display,
                "new": new_display,
            })

            if col in ALERT_FIELDS:
                alerts.append(
                    f"🔔 UID {uid} ({row['title'][:40]}): {col} changed "
                    f"'{old_display}' → '{new_display}'"
                )

        # Special handling: extract username/display_name from created_by
        if "created_by" in sb:
            username, display_name = parse_created_by(sb["created_by"])
            if username and row.get("username", "") != username:
                meaningful_changes.append({
                    "uid": uid, "title": row["title"][:40],
                    "field": "username", "old": row.get("username", ""), "new": username,
                })
                row["username"] = username
            if display_name and row.get("display_name", "") != display_name:
                meaningful_changes.append({
                    "uid": uid, "title": row["title"][:40],
                    "field": "display_name", "old": row.get("display_name", ""), "new": display_name,
                })
                row["display_name"] = display_name

    # --- Pass 2: Detect new Cisco apps ---
    our_uids = set(r["uid"] for r in our_rows)
    new_apps_by_tier = {1: [], 2: [], 3: []}
    for sb_row in sb_rows:
        uid = sb_row["uid"]
        if uid in our_uids:
            continue
        is_related, tier = is_cisco_related(sb_row)
        if not is_related:
            continue

        title = sb_row.get("title", "unknown")
        is_arch = sb_row.get("is_archived", "")
        version = sb_row.get("app_version", "")
        username, _ = parse_created_by(sb_row.get("created_by", ""))
        tier_label = {1: "Cisco 1st-party", 2: "Cisco brand", 3: "Adjacent brand"}[tier]
        entry = (
            f"🆕 [{tier_label}] uid={uid} | {title} | "
            f"archived={is_arch} | ver={version} | by={username}"
        )
        new_apps_by_tier[tier].append(entry)
        alerts.append(entry)

    # --- Pass 3: Auto-detect deprecations ---
    for row in our_rows:
        is_archived = normalize_bool(row.get("is_archived", ""))
        deprecated = row.get("Deprecated", "").strip()
        title = row.get("title", "")

        if is_archived == "true" and deprecated != "Yes":
            if "deprecated" in title.lower():
                alerts.append(
                    f"🗑️  UID {row['uid']} ({title[:40]}) appears deprecated "
                    f"(archived + title says DEPRECATED) — Deprecated field is '{deprecated}'"
                )

    total_updates = len(meaningful_changes) + silent_updates
    return our_rows, meaningful_changes, silent_updates, total_updates, alerts


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def print_report(meaningful_changes, silent_updates, total_updates, alerts, dry_run=False):
    """Print a formatted change report."""
    print("\n" + "=" * 70)
    print("  SPLUNKBASE SYNC REPORT")
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("  Mode: DRY RUN (no changes written)")
    print("=" * 70)

    # Alerts section
    if alerts:
        print(f"\n{'─' * 70}")
        print(f"  🚨 ALERTS ({len(alerts)})")
        print(f"{'─' * 70}")
        for a in alerts:
            print(f"  {a}")
    else:
        print(f"\n  ✅ No alerts — no new Cisco apps or deprecation changes detected.")

    # Meaningful changes
    if meaningful_changes:
        print(f"\n{'─' * 70}")
        print(f"  📝 MEANINGFUL UPDATES ({len(meaningful_changes)})")
        print(f"{'─' * 70}")

        by_uid = {}
        for c in meaningful_changes:
            by_uid.setdefault(c["uid"], []).append(c)

        for uid, uid_changes in sorted(by_uid.items(), key=lambda x: x[0]):
            title = uid_changes[0]["title"]
            print(f"\n  uid={uid} ({title}):")
            for c in uid_changes:
                print(f"    • {c['field']}: '{c['old']}' → '{c['new']}'")

        field_counts = {}
        for c in meaningful_changes:
            field_counts[c["field"]] = field_counts.get(c["field"], 0) + 1
        print(f"\n  Summary by field:")
        for field, count in sorted(field_counts.items(), key=lambda x: -x[1]):
            print(f"    {field}: {count} changes")

    # Silent updates summary
    if silent_updates:
        print(f"\n  📊 Also applied {silent_updates} routine updates (download/install counts, ratings)")

    if not meaningful_changes and not silent_updates:
        print(f"\n  ✅ No updates needed — CSV is fully in sync with Splunkbase.")

    print(f"\n  Total fields updated: {total_updates}")
    print(f"\n{'=' * 70}\n")


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
def write_csv(rows, fieldnames):
    """Write updated CSV back to disk."""
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    log(f"Updated CSV written: {CSV_PATH}", "OK")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Sync cisco_apps.csv with latest Splunkbase data from S3"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report changes without modifying cisco_apps.csv"
    )
    parser.add_argument(
        "--profile", default=DEFAULT_PROFILE,
        help=f"AWS profile to use (default: {DEFAULT_PROFILE})"
    )
    parser.add_argument(
        "--local", metavar="PATH",
        help="Path to local splunkbase_apps.csv.gz (skip S3 download)"
    )
    args = parser.parse_args()

    print("\n" + "=" * 70)
    print("  🔄 SCAN — Splunkbase Sync")
    print("=" * 70 + "\n")

    # Step 1: Get Splunkbase data
    if args.local:
        gz_path = args.local
        if not os.path.exists(gz_path):
            log(f"Local file not found: {gz_path}", "ERROR")
            sys.exit(2)
        log(f"Using local file: {gz_path}")
    else:
        gz_path = os.path.join(tempfile.gettempdir(), "splunkbase_apps.csv.gz")
        if not download_from_s3(args.profile, gz_path):
            sys.exit(2)

    # Step 2: Load data
    sb_rows = load_splunkbase_csv(gz_path)
    our_rows, our_fieldnames = load_our_csv()

    # Step 3: Sync
    updated_rows, meaningful_changes, silent_updates, total_updates, alerts = sync(
        sb_rows, our_rows, our_fieldnames
    )

    # Step 4: Report
    print_report(meaningful_changes, silent_updates, total_updates, alerts, dry_run=args.dry_run)

    # Step 5: Write (if any updates and not dry-run)
    if total_updates > 0:
        if args.dry_run:
            log(f"{total_updates} updates would be applied. Run without --dry-run to apply.", "WARN")
        else:
            create_backup()
            write_csv(updated_rows, our_fieldnames)
            log(f"{total_updates} updates applied ({len(meaningful_changes)} meaningful, "
                f"{silent_updates} routine).", "OK")
        sys.exit(1)
    else:
        log("Nothing to do — CSV is up to date.", "OK")
        sys.exit(0)


if __name__ == "__main__":
    main()
