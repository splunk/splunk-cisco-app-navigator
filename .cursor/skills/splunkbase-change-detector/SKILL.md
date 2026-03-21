---
name: splunkbase-change-detector
description: >-
  Monitor scan_splunkbase_apps.csv.gz for changes that affect the product
  catalog — new Cisco apps, version bumps, new sourcetypes, and GTM-to-active
  promotion opportunities. Use when asked to check splunkbase, detect new
  integrations, find new apps, scan for updates, or identify what changed.
---

# Splunkbase Change Detector

Cross-references the nightly-updated `scan_splunkbase_apps.csv.gz` against
`products.conf` to surface actionable changes.

## Key Files

- **Splunkbase lookup**: `packages/splunk-cisco-app-navigator/src/main/resources/splunk/lookups/scan_splunkbase_apps.csv.gz`
- **products.conf**: `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf`
- **Detection script**: `scripts/detect_changes.py` (in this skill directory)

## Workflow

1. Run the detection script:

```bash
python3 .cursor/skills/splunkbase-change-detector/scripts/detect_changes.py
```

2. Review the output categories:

   - **New Cisco apps** — Splunkbase entries with `support=cisco` or author containing "Cisco" that are not referenced by any product card via `addon_uid`, `app_viz_uid`, or `legacy_uids`.
   - **Version bumps** — Apps referenced by product cards where the Splunkbase version is newer than what we last recorded (compare against `release_history` JSON).
   - **New sourcetypes** — Sourcetypes listed in the Splunkbase `sourcetypes` field that are not in the corresponding product card.
   - **GTM promotion candidates** — Products with `status=roadmap` or `status=under_development` where a matching Cisco app/TA now exists on Splunkbase.

3. For each finding, decide the appropriate action:

   **New Cisco app found:**
   - Is it a new integration for an existing product card? → Update the card's addon fields.
   - Is it for a product we don't have a card for? → Consider adding a new card.
   - Is it a companion app (viz/dashboard app)? → Add as `app_viz_uid`.

   **Version bump detected:**
   - Check the release notes for mentions of new product support, new sourcetypes, or deprecations.
   - Update the product card's metadata if relevant.

   **GTM promotion candidate:**
   - If a roadmap product now has a Cisco-supported TA → promote to `status=active`, `support_level=cisco_supported`, fill in addon fields.
   - If under_development → may promote to `active` if the TA is GA.

4. Apply changes using the `catalog-card-updater` skill, or edit `products.conf` manually.

## How the Script Identifies Cisco Apps

The script considers an app "Cisco-related" if any of these are true:
- `support` field is `cisco`
- `author` contains "Cisco"
- `appid` starts with `cisco`, `Cisco`, `Splunk_TA_cisco`, or `TA_cisco`
- `title` contains "Cisco"
- The app's UID is referenced by any product card

## Example Output

```
=== NEW CISCO APPS (not referenced by any product card) ===
  UID 9999: "Cisco FooBar Add-on for Splunk" (v1.0.0, support=cisco)
    → Possible match: [cisco_foobar] (status=roadmap) — PROMOTION CANDIDATE

=== VERSION BUMPS ===
  CiscoSecurityCloud (UID 7404): Splunkbase v3.7.0 vs last known v3.6.3
    Release notes mention: "Added Secure Cloud Analytics support"
    → May affect: [cisco_secure_cloud_analytics] (currently status=roadmap)

=== NEW SOURCETYPES IN SPLUNKBASE METADATA ===
  TA_cisco_catalyst (UID 7538): +2 new sourcetypes
    cisco:catalyst:newtype1, cisco:catalyst:newtype2
    → Not claimed by any product card

=== GTM PROMOTION CANDIDATES ===
  [cisco_secure_cloud_analytics] status=roadmap
    → New app detected: UID 9998 "Cisco SCA Add-on" (support=cisco)
    → Recommend: promote to active, set addon_uid=9998
```
