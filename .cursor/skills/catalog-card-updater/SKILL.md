---
name: catalog-card-updater
description: >-
  Apply detected changes to product cards in products.conf — promote
  GTM/roadmap products to active, add new sourcetypes, update addon references,
  and regenerate the catalog. Use when asked to update catalog, promote card,
  upgrade product, add sourcetype to card, or apply audit findings.
---

# Catalog Card Updater

Applies changes to `products.conf` product cards and regenerates the catalog.
Designed to consume output from the `catalog-sourcetype-audit` and
`splunkbase-change-detector` skills.

## Key Files

- **products.conf**: `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf`
- **Catalog generator**: `packages/splunk-cisco-app-navigator/bin/generate-catalog.js`
- **Update script**: `scripts/update_cards.py` (in this skill directory)

## Supported Operations

### 1. Add sourcetypes to a product card

```bash
python3 .cursor/skills/catalog-card-updater/scripts/update_cards.py \
  add-sourcetypes \
  --product cisco_secure_firewall \
  --sourcetypes "cisco:sfw:policy,cisco:sfw:newtype"
```

Adds to the `sourcetypes` field alphabetically, sets `date_updated` to today.

### 2. Promote a product from roadmap/under_development to active

```bash
python3 .cursor/skills/catalog-card-updater/scripts/update_cards.py \
  promote \
  --product cisco_secure_cloud_analytics \
  --addon CiscoSecurityCloud \
  --addon-uid 7404 \
  --addon-label "Cisco Security Cloud" \
  --support-level cisco_supported
```

Sets `status=active`, fills in addon fields, sets `date_updated` to today.

### 3. Update arbitrary fields on a product card

```bash
python3 .cursor/skills/catalog-card-updater/scripts/update_cards.py \
  update-fields \
  --product cisco_meraki \
  --fields "addon=Splunk_TA_cisco_meraki,addon_uid=5580,date_updated=2026-03-10"
```

### 4. Regenerate catalog (always run after edits)

```bash
node packages/splunk-cisco-app-navigator/bin/generate-catalog.js
```

## Recommended Workflow

1. Run `splunkbase-change-detector` to identify changes.
2. Review the output and decide which changes to apply.
3. Use this skill's script (or manual edits) to apply them.
4. Regenerate the catalog.
5. Run `catalog-sourcetype-audit` to verify no regressions.

```
detect → review → apply → regenerate → verify
```

## products.conf Format Reference

Each product card is an INI stanza:

```ini
[product_id]
disabled = 0
display_name = Human Readable Name
status = active|under_development|roadmap|archived
support_level = cisco_supported|splunk_supported|developer_supported|not_supported
addon = splunk_app_id
addon_uid = 1234
addon_label = Human Readable Addon Name
sourcetypes = type1,type2,type3
date_created = YYYY-MM-DD
date_updated = YYYY-MM-DD
```

Key rules:
- `sourcetypes` is a comma-separated list, kept in alphabetical order.
- `date_updated` must be set to today whenever any field changes.
- When promoting from `roadmap` to `active`, also set `support_level` and addon fields.
- When adding a product to `legacy_uids`, remove it from `addon_uid` or `app_viz_uid` if present.

## Visual Consistency Sweep

When changing any visual element (color, badge, icon, label, filter name),
search for **ALL occurrences** across the entire codebase. The same element
can appear on card badges, the Help/Guide modal, filter drawer pills, category
bar buttons, stats bar tiles, customer summary export (HTML + plain text),
CSS classes (light + dark), and inline JSX styles. A visual change is not done
until every surface is updated.

## Dark Mode

Every UI change **must** account for dark mode. The app uses `:root.dce-dark` as the
dark-mode selector. When adding or modifying:

- **Badge colors / CSS classes** — always provide both a light-mode rule and a
  `:root.dce-dark` override with appropriate translucent backgrounds and lighter
  text colors.
- **Inline styles in JSX** — use CSS custom properties (`var(--card-border, #ddd)`,
  `var(--page-color, #333)`, etc.) instead of hardcoded hex where possible.
- **New stat tiles / accent colors** — verify they remain readable on the dark
  background (`#101418`).
- **Modal content** — test that links, borders, and section backgrounds render
  correctly in both themes.

After any visual change, toggle dark mode in the Splunk UI and visually verify
before considering the task complete.

## Validation

After applying changes, always:
1. Regenerate: `node packages/splunk-cisco-app-navigator/bin/generate-catalog.js`
2. Verify count: the generator prints how many products were written.
3. Run the sourcetype audit to confirm alignment.
