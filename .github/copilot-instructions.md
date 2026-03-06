# Copilot Instructions — Splunk Cisco App Navigator (SCAN)

> This file is automatically loaded by GitHub Copilot at the start of every chat
> session. It provides the full technical context for this project.
> **Last updated:** March 6, 2026

---

## Project Identity

| Field | Value |
|---|---|
| **App Name** | Splunk Cisco App Navigator |
| **Acronym** | SCAN |
| **Splunk Folder** | `splunk-cisco-app-navigator` |
| **App Label** | Splunk Cisco App Navigator |
| **App ID** | `splunk-cisco-app-navigator` |
| **Version** | 1.0.6 |
| **GitLab Repo** | `https://cd.splunkdev.com/sg-cloud-tools-engineering/splunk-cisco-app-navigator.git` |

Previously known as "Cisco Control Center" (CCC). Renamed to "Splunk Cisco App
Navigator" (SCAN) in Feb 2026. Old repo archived.

---

## What This App Does

SCAN is a Splunk app that provides a unified "Glass Pane" UI for discovering,
deploying, and managing the full portfolio of Cisco Splunk apps and add-ons.
Each Cisco product gets a card in the UI showing:

- Which Splunk add-on (TA) is needed
- Which viz/dashboard app provides dashboards
- Whether those apps are installed and up-to-date
- Whether legacy/deprecated apps should be removed
- Whether expected sourcetypes are arriving (data flowing detection)
- Platform-aware best-practice guidance (Cloud vs Enterprise)
- Custom per-product best practices and SC4S links
- AI-enabled badge for products leveraging ML/AI
- SOAR connector availability
- ITSI Content Pack availability
- Alert action availability
- Indexer tier add-on deployment detection (version match, disabled alert)
- Splunkbase compatibility (platform + version) via synced CSV catalog
- Cisco brand SVG icons (128 icons: 126 SVGs + 2 PNGs)

The product catalog is driven by `products.conf` — a Splunk-style INI file with
one stanza per product.

---

## Repository Structure

```
.
├── lerna.json
├── package.json                      # Root workspace (Lerna + Yarn)
├── README.md                         # Project overview
├── .github/copilot-instructions.md   # THIS FILE — Copilot context
├── scripts/                          # 84 utility Python scripts
├── docs/                             # Documentation & presentations
│   ├── Blueprint.md                  # Architecture blueprint
│   ├── CiscoSecurityCloud_Audit_Report.md
│   ├── SCAN_Architecture_Guide.md    # Comprehensive A-Z guide
│   └── *.docx / *.pptx              # Exported presentations
├── backups/                          # Organized backup archive
│   ├── 20260223_pre_plan_a/          # Pre-redesign snapshot
│   ├── chat_history/                 # Copilot chat session backups
│   ├── conf/                         # products.conf versioned backups
│   ├── css/                          # products.css backups
│   ├── lookups/                      # CSV/lookup file backups
│   └── misc/                         # Other file backups
└── packages/
    └── splunk-cisco-app-navigator/   # THE main Splunk app package
        ├── package.json
        ├── webpack.config.js
        ├── CHANGELOG.md
        ├── README.md
        ├── bin/
        │   ├── build.js              # Build orchestrator
        │   ├── generate-catalog.js   # products.conf → productCatalog.generated.js
        │   ├── package_app.sh        # Splunkbase packaging
        │   └── clean_build.sh        # Clean build (preserves stage/local by default)
        ├── src/main/
        │   ├── resources/splunk/
        │   │   ├── default/
        │   │   │   ├── app.conf          # App identity, version (1.0.6)
        │   │   │   ├── products.conf     # PRODUCT CATALOG (79 stanzas, ~3386 lines)
        │   │   │   ├── savedsearches.conf # 35 saved searches (~794 lines)
        │   │   │   ├── props.conf        # Sourcetype + field extractions (Magic Six)
        │   │   │   ├── transforms.conf   # Lookup definitions
        │   │   │   ├── commands.conf     # Custom search commands
        │   │   │   ├── searchbnf.conf    # Search assistant syntax
        │   │   │   ├── restmap.conf      # REST endpoint mappings
        │   │   │   ├── distsearch.conf   # Distributed search config
        │   │   │   ├── server.conf
        │   │   │   ├── splunk_create.conf
        │   │   │   └── data/ui/
        │   │   │       ├── nav/default.xml   # Navigation menu
        │   │   │       └── views/
        │   │   │           ├── products.xml
        │   │   │           └── ecosystem_intelligence.xml  # Dashboard Studio v2
        │   │   ├── bin/
        │   │   │   ├── download_splunkbase_csv.py  # Custom search command
        │   │   │   └── splunklib/                   # Bundled splunklib 2.1.1
        │   │   ├── appserver/static/
        │   │   │   ├── products.css  # All styles + dark mode (~4547 lines)
        │   │   │   ├── icons/        # 128 Cisco brand icons
        │   │   │   └── fonts/        # CiscoSansTT font family
        │   │   ├── lookups/scan_splunkbase_apps.csv.gz  # Synced Splunkbase catalog
        │   │   ├── metadata/default.meta
        │   │   └── README/products.conf.spec
        │   └── webapp/pages/products/
        │       ├── index.jsx         # MAIN REACT COMPONENT (~5900 lines)
        │       ├── productCatalog.generated.js  # Auto-generated (DO NOT EDIT)
        │       └── render.jsx
        └── stage/                    # Build output (symlinked into Splunk)
```

---

## Key Files (edit these)

### `products.conf` — Product Catalog
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf`

Source of truth for all product data. Each stanza `[product_id]` defines one
card. Currently **79 product stanzas** (~3386 lines).

**Product breakdown:**
- 39 Security, 31 Networking, 3 Observability, 6 Collaboration
- 47 active, 3 deprecated, 16 roadmap, 2 under development, 11 retired
- 13 subcategories across Security, Networking, and Observability
- 65 tagged for Secure Networking GTM
- 18 with SC4S documentation links
- 15 AI-enabled, 12 with SOAR connectors, 6 with ITSI Content Packs
- 6 with alert actions, 10 with NetFlow support
- 16 coverage gap products (GTM roadmap)
- 429+ sourcetypes across all products

**Support levels:** 38 Cisco, 6 Splunk, 9 Developer, 1 Community, 25 Not Supported

**Key fields** (see `README/products.conf.spec` for full docs):
- `display_name`, `description`, `value_proposition`, `tagline`
- `category` — `security | networking | collaboration | observability`
- `subcategory` — 13 subcategories
- `status` — `active | deprecated | retired | roadmap | under_development`
- `support_level` — `cisco_supported | splunk_supported | developer_supported | community_supported | not_supported`
- `sort_order` — strategic ordering (related products adjacent)
- `keywords` — comma-separated search keywords (primary acronym first)
- `icon_svg` — Cisco brand icon filename (without .svg)
- `icon_emoji` — fallback emoji via ICON_EMOJI_MAP (32 mapped)
- `addon`, `addon_label`, `addon_splunkbase_url`, `addon_docs_url`
- `app_viz`, `app_viz_label`, `app_viz_splunkbase_url`
- `app_viz_2`, `app_viz_2_label`, `app_viz_2_splunkbase_url`
- `sourcetypes` — comma-separated expected Splunk sourcetypes
- `legacy_apps`, `legacy_labels`, `legacy_uids`, `legacy_urls`
- `prereq_apps`, `prereq_labels`, `prereq_uids`, `prereq_urls`
- `community_apps`, `community_labels`, `community_uids`, `community_urls`
- `sc4s_url`, `sc4s_label` — SC4S documentation link
- `best_practices` — pipe-delimited custom tips
- `soar_connector_label/uid/url` (up to 3)
- `alert_action_label/uid/url` (up to 2)
- `ai_enabled`, `ai_description` — AI badge and tooltip
- `secure_networking_gtm` — GTM tag (true = included)
- `itsi_content_pack_label`, `itsi_content_pack_docs_url`
- `netflow_supported` — NetFlow compatibility
- `coverage_gap` — GTM roadmap product with no integration yet
- `card_accent`, `card_bg_color`, `card_banner`

### `index.jsx` — Main React Component
**Path:** `packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/index.jsx`

Single-file React app (~5900 lines). Uses `@splunk/react-ui` components.
Key constant: `APP_ID = 'splunk-cisco-app-navigator'`.

**Major sections:**
- Constants, ICON_EMOJI_MAP (32 emojis), PERSONA_PRESETS (5 personas)
- Static catalog import from `productCatalog.generated.js`
- Helper functions (configured products, theme, search, UID extraction)
- `getProductUids(product)` — extracts Splunkbase UIDs from addon/viz URLs
- `detectAllSourcetypeData(products)` — `| metadata` search for data flow detection
- `getBestPractices(product, platformInfo)` — enriched tip objects
- Icon rendering: `icon_svg` loads from icons/ directory with dark variant
- Card components (collapsed/expanded views) with compatibility section
- Indexer tier add-on detection badges (deployed/mismatch/missing/disabled)
- Sidebar Drawer (FilterDrawer) replacing old in-page advanced filter panels
- Category filter bar with subcategory pills and cross-cutting filters
- Advanced filters: Support level, Visibility, Onboarding, Compatibility
- Multi-select version filter (checkbox list, Splunkbase-style)
- Platform filter dropdown (Splunkbase compatibility)
- Splunkbase CSV sync button + InfoTooltip
- Search with `deepMatch` — checks keywords, aliases, display_name, etc.
- Modals: BestPractices, DataModel, LegacyApps, TechStack, PersonaQuickStart, ConfigViewer, Feedback
- Dark/Light/Auto theme toggle (three-state)
- "Supported Only" toggle (portfolio filter)
- Developer mode (type "devmode" in search bar)

### `products.css` — Styles
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/products.css`

All styles (~5130 lines). Key features:
- CSS variables for theme switching
- `.csc-filter-pill-icon` — dark mode white chip for filter pill SVGs
- Dark mode uses `:root.dce-dark` selector
- Dark mode card icons: frosted glass + Cisco-blue glow + white drop-shadow
- Dark mode badge pills: light-mode styling preserved
- CiscoSansTT font integration
- Subcategory pill styling with animated slide-in
- Support level pill colors (Cisco green, Splunk blue, Developer orange)
- Compatibility select dropdown styling
- Sidebar Drawer styles (`.scan-drawer-*`)
- Indexer tier badge styles (`.scan-idx-tier-badge`, `.scan-idx-chip-*`)
- Multi-select version checkbox styles (`.scan-drawer-version-*`)

### `generate-catalog.js` — Build-Time Catalog Generator
**Path:** `packages/splunk-cisco-app-navigator/bin/generate-catalog.js`

Reads `products.conf` at build time and emits `productCatalog.generated.js`.

### `download_splunkbase_csv.py` — Custom Search Command
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/bin/download_splunkbase_csv.py`

Downloads Splunkbase CSV from S3 and saves as compressed lookup. Uses splunklib 2.1.1.
Logs to `$SPLUNK_HOME/var/log/splunk/download_splunkbase_csv.log` with UTC timestamps.
Sourcetype: `scan:downloadsplunkbasecsv:log`.

### `props.conf` — Sourcetype Definition
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/props.conf`

Defines sourcetype for the command's log file with "Magic Six" best practices:
SHOULD_LINEMERGE=false, TIME_FORMAT, LINE_BREAKER, TRUNCATE, TIME_PREFIX, MAX_TIMESTAMP_LOOKAHEAD.
Search-time field extractions: `log_level`, `logger_name`, `message`.

### `default.meta` — Metadata & Permissions
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/metadata/default.meta`

Key exports: `[props] export = system` and `[transforms] export = system` ensure
field extractions and lookups work globally (not just within the SCAN app context).

### `savedsearches.conf` — 35 Saved Searches
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/savedsearches.conf`

Organized in 7 sections: Ecosystem Overview, Catalog Analysis, Migration & Legacy,
Installation & Deployment, Splunkbase Intelligence, Versions & Compliance, Data Coverage.
Plus the scheduled Splunkbase Catalog Sync job.

---

## Build & Deploy

### Prerequisites
- Node.js, Yarn, Lerna (monorepo)
- Splunk Enterprise at `/opt/splunk`
- Symlink: `/opt/splunk/etc/apps/splunk-cisco-app-navigator` -> `stage/`

### Build
```bash
cd packages/splunk-cisco-app-navigator && node bin/build.js build
```

### Clean Build
```bash
cd packages/splunk-cisco-app-navigator && yarn run clean:build
```
`clean_build.sh` always preserves `stage/local/` by default. Use `--wipe-local` flag for explicit removal.

### Deploy (no restart needed for JS/CSS/conf changes)
Build auto-clears cache and triggers Splunk `_reload` endpoints.
Hard-refresh browser (Cmd+Shift+R).

**Restart required for:** props.conf, transforms.conf, commands.conf, metadata changes.

### Package for Splunkbase
```bash
cd packages/splunk-cisco-app-navigator && bash bin/package_app.sh
```

---

## Git Workflow

| Remote | URL | Purpose |
|---|---|---|
| `origin` | `https://cd.splunkdev.com/sg-cloud-tools-engineering/splunk-cisco-app-navigator.git` | Primary |

**Primary branch:** `feature/scan-improvements`
**Main branch:** `main`

---

## Architecture Notes

### Filter Pipeline
The UI has a multi-stage filter pipeline:
1. **Portfolio filter** (`showFullPortfolio` toggle): Supported-only vs All products
2. **Category filter** (pills): Security, Networking, Observability, Collaboration, cross-cutting
3. **Subcategory filter** (sub-pills): 13 subcategories + AI-Powered
4. **Cross-cutting filters**: SOAR, Alert Actions, Secure Networking GTM, AI-Powered
5. **Advanced filters** (in Sidebar Drawer): Support level, Visibility (Retired/Deprecated/Coming Soon/GTM Roadmap), Onboarding (SC4S/NetFlow), Platform/Version compatibility
6. **Search filter**: Deep keyword match
7. **Addon filter** ("Powered By" dropdown): Filter by TA family
8. **Product sections**: Configured → Detected → Available → Unsupported → Coming Soon → Deprecated → Retired → GTM Gaps

### Counter Logic
- **Category pill counts** (`categoryCounts` useMemo): Start from `portfolioProducts`, apply cross-cutting + search + compat filters, then count per-category
- **Advanced filter counts**: Start from `allProducts` with `applyCompatFilters()`, then re-apply portfolio semantics (support level + `under_development` exclusion in supported-only mode), then segregate into support/visibility/onboarding bases
- **`totalCount`** in search bar: `portfolioProducts.length`
- **`resultCount`** in search bar: `filteredProducts.length`

### Splunkbase Compatibility System
1. **Sync** button runs `| downloadsplunkbasecsv` to download CSV from S3
2. CSV stored as `scan_splunkbase_apps.csv.gz` in lookups/
3. On page load, `| inputlookup scan_splunkbase_apps` loads into `splunkbaseData` state
4. `getProductUids(product)` extracts UIDs from addon/viz Splunkbase URLs
5. Version filter: multi-select checkboxes, each version exact-matched against `version_compatibility` field (pipe-delimited)
6. Platform filter: substring match against `product_compatibility` field
7. Only versions > 9.0 shown in checkbox list; sorted descending

### Icon System
- **Primary:** `icon_svg` loads `icons/{name}.svg` (light) / `{name}_white.svg` (dark)
- **Fallback:** `icon_emoji` via ICON_EMOJI_MAP (32 emojis)
- **Ultimate fallback:** First letter of `display_name`
- **128 icon files:** 126 SVGs + 2 PNGs
- **Dark mode:** Frosted glass + Cisco-blue glow + drop-shadow

### Categories & Subcategories
4 main categories: Security (39), Networking (31), Collaboration (6), Observability (3).
13 subcategories for granular filtering.
Cross-cutting filters: SOAR (12), Alert Actions (6), AI-Powered (15), Secure Networking GTM (65), SC4S (18), NetFlow (10).

### Sort Order Strategy
Products sorted with related products adjacent:
- Security: 10-60, 900-909 (Retired)
- Networking: 100-141, 899-908 (Retired)
- Observability: 200-202
- Collaboration: 300-305

### Dark Mode
- Three-state toggle: Light / Dark / Auto
- CSS uses `:root.dce-dark` selector
- Card icons: frosted glass + Cisco-blue glow
- Filter pill icons: white chip via `.csc-filter-pill-icon`
- Badge pills: light-mode styling preserved in dark mode

### Indexer Tier Detection
- `detectIndexerTierApps()` runs `| rest splunk_server=* /services/apps/local` filtered to non-SH servers
- SPL: `| stats latest(version) as version, max(is_disabled) as disabled, dc(splunk_server) as indexerCount by title`
- State: `indexerApps` — null (loading) / {} (no indexers) / `{appId: {version, disabled, indexerCount}}`
- Per-card `idxTierState`: deployed (version match), mismatch (version differs), missing (not on indexers), disabled
- Badges shown in expanded dependency section + collapsed card summary chips
- Disabled state shown as red alert chip (🔴 IDX Disabled)

### Sidebar Drawer (FilterDrawer)
- Replaces old in-page advanced filter panels
- Slides in from right; `drawerOpen` state toggle
- Contains: Support level checkboxes, Visibility toggles, Onboarding (SC4S/NetFlow), Platform dropdown, Version multi-select checkboxes
- ActiveFilterChips bar shows selected filters with clear-all
- Splunkbase CSV sync button inside drawer

### Ecosystem Intelligence Dashboard
- File: `ecosystem_intelligence.xml` (Dashboard Studio v2)
- 2 base data sources + 18 chain data sources
- Chain `extend` property must be inside `options` object (Studio v2 requirement)
- Navigation: accessible from SCAN nav menu

### Logging
- Log file: `$SPLUNK_HOME/var/log/splunk/download_splunkbase_csv.log`
- Sourcetype: `scan:downloadsplunkbasecsv:log`
- UTC timestamps via `_UTCFormatter` class
- Field extractions: `log_level`, `logger_name`, `message`
- Magic Six props.conf settings for optimal parsing

---

## Technology Stack

| Component | Version | Notes |
|---|---|---|
| React | 16.14.0 | DO NOT upgrade — Splunk SDK constraint |
| @splunk/react-ui | 5.8.0 | |
| @splunk/themes | 1.5.0 | |
| @splunk/splunk-utils | 3.4.0 | |
| styled-components | 5.3.11 | DO NOT upgrade past 5.x |
| Webpack | 5.105.2 | |
| splunklib (Python) | 2.1.1 | Bundled in bin/splunklib/ |
| Simple XML | 1.1 | Splunk dashboard framework |

---

## Utility Scripts (scripts/ — 84 scripts)

| Script | Purpose |
|---|---|
| `normalize_products_conf.py` | Normalize products.conf formatting |
| `resort_products.py` | Re-sort product stanzas |
| `update_sort_keywords_v2.py` | Bulk update sort_order and keywords |
| `audit_sourcetypes.py` | Audit sourcetype coverage |
| `audit_card_appearance.py` | Audit card appearance fields |
| `rename_ccc_to_scan.py` | SCAN rename utility |
| `gen_pptx_cisco.py` | Generate Cisco-branded presentations |

**Note:** `update_sort_keywords.py` (v1) is broken — use `update_sort_keywords_v2.py` instead.

---

## Session History (recent work)

### March 6, 2026
- Added Indexer Tier add-on detection (`detectIndexerTierApps()`) with per-card badges
  - States: deployed (green), mismatch (amber), missing (yellow), disabled (red)
  - Collapsed card summary chips + expanded dependency section badges
- Converted version filter from single-select dropdown to multi-select checkboxes
  - `versionFilter` state changed from `null | string` to `string[]`
  - Splunkbase-style checkbox list with "Clear" link
- Fixed all 18 chain data sources in `ecosystem_intelligence.xml`
  - Moved `extend` from top-level into `options` (Dashboard Studio v2 requirement)
- Implemented Sidebar Drawer (FilterDrawer) redesign for advanced filters
- Renamed "NetFlow / Stream" → "NetFlow" across all UI labels, comments, and docs
- Updated this copilot-instructions.md with new architecture sections

### March 5, 2026
- Commented out all `console.log`/`console.debug` calls (kept `console.warn`/`console.error`)
- Fixed counter logic bug: Advanced filter support counts included `under_development` products in "Supported Only" mode (44 vs 42 mismatch). Fix: added `&& p.status !== 'under_development'` to `portfolioBase`
- Reorganized `backups/` into `chat_history/`, `conf/`, `css/`, `lookups/`, `misc/`
- Cleaned up `docs/` (moved .bak and utility scripts out)
- Created comprehensive SCAN Architecture Guide (`docs/SCAN_Architecture_Guide.md`)
- Updated this copilot-instructions.md with current accurate data

### March 4, 2026
- Created `props.conf` with Magic Six settings for command log
- Fixed Python logger (_UTCFormatter for UTC timestamps, LOGGER.setLevel(DEBUG))
- Fixed `default.meta` exports (`[props]` and `[transforms]` export = system)
- Added Compatibility Debugger saved searches (#34, #35) for Platform and Version
- Fixed counter reactivity (applyCompatFilters helper for subcategory pills)
- Fixed `clean_build.sh` to always preserve `stage/local/`
- Delivered package version audit (don't upgrade React/styled-components/ESLint)

### Earlier sessions
- Built `downloadsplunkbasecsv` custom search command (S3 → gzipped lookup)
- Migrated all 15 searches from `cisco_apps` to `scan_splunkbase_apps`
- Added Platform/Version compatibility filters with IS4S-style InfoTooltips
- Moved sync button to Advanced filters section
- Fixed Compatibility section rendering on product cards
- Fixed sync button 400 error (app-namespaced endpoint)
- Upgraded splunklib to 2.1.1
