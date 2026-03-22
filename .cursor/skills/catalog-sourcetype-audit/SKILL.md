---
name: catalog-sourcetype-audit
description: >-
  Scan on-disk Splunk TAs against products.conf to detect new, missing, or
  changed sourcetypes. Use when asked to audit sourcetypes, validate sourcetypes,
  check TAs, detect sourcetype drift, or verify product catalog accuracy.
---

# Catalog Sourcetype Audit

Validates that the sourcetypes declared in `products.conf` match what is
actually installed on-disk in the Splunk TA directories.

## Key Files

- **products.conf**: `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf`
- **On-disk TAs**: `/opt/splunk/etc/apps/{addon}/default/` — the `addon` field in each product stanza maps to the directory name.
- **Audit script**: `scripts/audit_sourcetypes.py` (in this skill directory)

## Workflow

1. Run the audit script:

```bash
python3 .cursor/skills/catalog-sourcetype-audit/scripts/audit_sourcetypes.py
```

2. Review the output. The script categorises findings into:
   - **NEW on disk** — sourcetypes found in a TA that no product card claims. These likely need adding to `products.conf`.
   - **MISSING on disk** — sourcetypes claimed by a product card but not found in the TA configs. May indicate metadata-only entries (e.g. from `inputs.conf` patterns) or stale entries.
   - **Case variants** — same sourcetype with different casing. Splunk is case-insensitive so these are informational.
   - **Internal / utility** — filtered out automatically (e.g. `splunktacisco*`, `syslog`, wildcard patterns).

3. For each **NEW on disk** finding, decide:
   - **Add to product card** if it's a genuine data sourcetype → edit `products.conf`, add to the correct product's `sourcetypes` field (alphabetically), set `date_updated` to today.
   - **Ignore** if it's internal telemetry, a parent/wildcard type, or a legacy alias.

4. After edits, regenerate the catalog:

```bash
node packages/splunk-cisco-app-navigator/bin/generate-catalog.js
```

5. Re-run the audit to confirm no regressions.

## Understanding Shared TAs

Multiple product cards can share the same `addon` (e.g. `CiscoSecurityCloud` serves
Secure Firewall, XDR, SNA, etc.). The script groups products by addon and checks
the *union* of all claimed sourcetypes against the on-disk TA, so a sourcetype
only needs to appear on one product card to be considered "claimed".

## Filtering Rules

The script automatically filters out:
- Sourcetypes matching `splunktacisco*`, `ciscothousandeyes:*` (internal app telemetry)
- Generic sourcetypes: `syslog`, `too_small`
- Wildcard/parent patterns: anything with `*`, `source::`, `host::`
- Stanza names that are clearly transform-only (e.g. `[set_sourcetype_*]`)

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

## Example Output

```
=== ADDON: CiscoSecurityCloud (3 products) ===
Products: cisco_secure_firewall, cisco_xdr, cisco_sna

NEW on disk (not claimed by any product):
  cisco:sfw:policy  →  Recommend adding to [cisco_secure_firewall]

=== ADDON: TA_cisco_catalyst (5 products) ===
Products: cisco_catalyst_center, cisco_catalyst_switches, ...

NEW on disk:
  cisco:sdwan:sytem:logs  →  KNOWN TYPO — see OPEN_QUESTIONS.md Q4

CASE VARIANTS (informational):
  cisco:isovalent:processConnect (disk) vs processconnect (products.conf)
```
