# Splunk Cisco App Navigator (SCAN) for Splunk

**Codename:** "The Front Door"  
**Author:** Cisco Systems  
**Version:** 1.0.1  
**Compatibility:** Splunk Enterprise / Splunk Cloud 9.0+

## What It Does

The **Splunk Cisco App Navigator (SCAN)** is the unified "Glass Pane" for the Cisco-Splunk ecosystem. It provides a single Product Catalog UI where Splunk administrators can discover, install, configure, and monitor all Cisco integrations — across Security, Observability, Networking, and Collaboration domains.

Each Cisco product is represented by an **intelligent card** that actively inspects the local Splunk environment and surfaces real-time status: installed apps, available upgrades, data flow validation, and legacy debt detection.

## Getting Started

1. Install the app on your Splunk Search Head (or Search Head Cluster).
2. Open the app — the **Products** page is your landing view.
3. Browse the **Available Products** catalog and click **➕ Add** to add products to your workspace.
4. Use **📥 Install** buttons to install the required add-ons and visualization apps directly from Splunkbase.
5. Click **🚀 Launch** to open dashboards for configured products.
6. Use the **🔐 Secure Networking** pill to filter products by Cisco's Secure Networking GTM strategy.

## Key Features

### Product Catalog
- **57 Cisco products** across 5 categories: **Security** (27), **Networking** (15), **Observability** (2), **Collaboration** (3), **Deprecated** (10).
- IS4S-inspired card design with 3D shadows, gradient bottom borders, and configurable card appearance fields.

### Intelligence Badges (Per Card)
- **✓ Add-on Installed / ⬇ Not Installed** — Real-time TA detection via `/services/apps/local`.
- **✓ App Installed / ⬇ Not Installed** — Visualization app detection.
- **⬆ Update Available: vX.Y.Z** — Orange badge when a newer version is detected.
- **📊 Data Flowing (N events)** — Live 24h event count per product's sourcetypes.
- **📊 Data Found — No Add-on Detected** — Orphaned data warning.
- **⚠ N Legacy Apps Detected** — Red badge with hover tooltip listing each legacy app.
- **SOAR** — Purple badge for products with Splunk SOAR connectors.
- **ITSI** — Blue badge for products with ITSI Content Packs.
- **Alert Actions** — Badge for companion alert action add-ons.
- **Platform: Enterprise / Cloud** — SVG platform compatibility badge.

### Version Intelligence & Upgrade Buttons
- Detects installed app versions and highlights available upgrades.
- Separate orange **⬆ vX.Y.Z** buttons for TA and viz app upgrades.

### Legacy Debt Auditor
- Scans `/services/apps/local` against the product catalog's 93 legacy app mappings.
- Per-card red badge, page-level legacy banner, and detailed Legacy Audit Modal.
- Covers 29 of 57 products (51%) with at least one legacy app mapping.

### Optimized Data Validation (MTTI)
- **Single search** validates all 321 sourcetypes across 52 products in one SPL query.
- Uses `| tstats count WHERE index=* by sourcetype` for sub-second validation.
- Results distributed to individual cards — green (data flowing), orange (orphaned), or yellow (no data).
- **Mean Time to Innocence (MTTI):** Proves data flow instantly to eliminate finger-pointing.

### Category Filter Bar
- Horizontal pill-style filter bar with live counts per category.
- **Cross-cutting filters** (after a vertical separator):
  - **🔐 Secure Networking** — Filters products by Cisco Secure Networking GTM strategy (teal-green pill).
  - **⚡ SOAR** — Shows only products with Splunk SOAR connectors (amber pill).
  - **🔔 Alert Actions** — Shows only products with custom alert actions (blue pill).
- Each filter pill shows a live count of matching products.

### Universal Finder (Search Bar)
- Keyword-optimized search across 408+ keywords.
- Displays result counter (`N of M products`).
- Searches product names, descriptions, aliases, keywords, add-on names, and sourcetypes.

### Custom Dashboard Launch (Split-Button)
- **Main button (🚀 Launch)** — Opens the preferred dashboard (custom if set, otherwise Cisco default).
- **Caret button (▾)** — Dropdown with all available launch options.
- **Custom dashboard** — Customers set a custom dashboard path (`app/view` format) via modal. Persists in `local/products.conf` — survives app upgrades.

### Card Appearance System
- **card_banner** — Diagonal translucent watermark across the card (e.g., "Powered by Cisco Security Cloud", "Deprecated").
- **card_banner_color** — Named presets (blue, green, gold, red, purple, teal, cisco) or hex.
- **card_banner_size** — small (11px, default), medium (13px), large (16px).
- **card_banner_opacity** — Float 0.0–1.0 (default `0.12` — subtle, readable watermark).
- **card_accent** — 4px bold left-border stripe in any hex color. **All 57 products** now have a card_accent assigned by family:
  - `#049fd9` (Cisco blue) — Security Cloud products
  - `#1976d2` (blue) — Splunk-supported security products + Cloud Security
  - `#6abf4b` (green) — Catalyst / Networking products
  - `#00897b` (teal) — DC Networking products
  - `#7b1fa2` (purple) — Collaboration products
  - `#ff6f00` (amber) — Observability products
  - `#9e9e9e` (gray) — Deprecated products
- **card_bg_color** — Named background presets (ice, mint, lavender, rose, cream, smoke, sky, pearl) or hex. Set by add-on family.
- **is_new** — Orange gradient "NEW!" corner ribbon.
- **Gradient bottom border** — IS4S-inspired 3px gradient bar color-coded by add-on family.

### Secure Networking GTM Filter
- Products tagged with `secure_networking_gtm = true` appear under the **🔐 Secure Networking** cross-cutting pill.
- Driven by Cisco's Secure Networking Go-To-Market strategy.
- 31 of 57 products are part of this GTM.

### Dark Mode & Theme Toggle
- Full CSS variable system with 30+ dark-mode overrides.
- **Three-state theme toggle**: ☀️ Light → 🌙 Dark → 🔄 Auto (system).
- Theme detection via DOM attributes, body classes, and Splunk REST API.
- Dark mode class: `:root.dce-dark` applied via `MutationObserver`.

### Additional Features
- **Community App Detection** — Warns when a third-party TA shadows the official Cisco add-on (5 products).
- **Prerequisite App Tracking** — Detects companion apps (e.g., Splunk App for Stream) for 13 products.
- **Best Practices Modal** — Platform-aware guidance per product (Cloud vs. Enterprise inputs, sourcetypes, legacy removal).
- **Give Feedback** — In-app feedback form stored in Splunk's summary index (`scan:feedback`).
- **Utility Strip** — A slim horizontal toolbar below the header containing platform label ("Splunk Enterprise" / "Splunk Cloud"), version badge, update link, and theme toggle pill — separated from the Cisco hero logo which stands alone as branding in the top-right.
- **11 Saved Searches** — Pre-built reports for catalog analysis (SCAN - Ecosystem Summary, SCAN - Sourcetype Coverage, etc.) accessible from the Reports nav menu.

## App Structure

| Directory | Purpose |
|---|---|
| `default/products.conf` | Product catalog — 57 stanzas defining all card metadata and appearance |
| `default/savedsearches.conf` | 11 saved searches for catalog analysis and troubleshooting |
| `default/app.conf` | App identity and version |
| `default/server.conf` | SHC replication settings for products.conf |
| `default/data/ui/nav/` | Navigation bar with Products view and Reports menu |
| `default/data/ui/views/` | Simple XML views (products.xml, reloadui.xml) |
| `metadata/default.meta` | Permissions and sharing |
| `README/products.conf.spec` | Spec file documenting all products.conf fields |
| `appserver/static/` | React bundle (products.js), CSS (products.css), app icons, SVG badges |
| `appserver/templates/` | HTML template for legacy browser fallback |
| `lookups/scan_splunkbase_apps.csv.gz` | Canonical Splunkbase catalog (synced by SCAN - Splunkbase Catalog Sync); used for app metadata, legacy/deprecated resolution, and SOAR connectors |
| `static/` | Splunkbase listing icons |

## Technology Stack

| Component | Version | Purpose |
|---|---|---|
| React | 16.14.0 | Core UI framework |
| @splunk/react-ui | 5.8.0 | Splunk's official UI component library |
| @splunk/themes | 1.5.0 | Splunk theme tokens |
| @splunk/splunk-utils | 3.4.0 | URL helpers, CSRF tokens, REST utilities |
| Webpack | 5.105.2 | Module bundler (~1s build time) |
| Simple XML | 1.1 | Splunk dashboard container (`products.xml`) |

## Support

For issues, questions, or feature requests, use the in-app **Give Feedback** button or contact your Cisco account team.
