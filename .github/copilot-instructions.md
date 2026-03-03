# Copilot Instructions — Splunk Cisco App Navigator (SCAN)

> This file is automatically loaded by GitHub Copilot at the start of every chat
> session. It provides the full technical context for this project.
> **Last updated:** March 2, 2026

---

## Project Identity

| Field | Value |
|---|---|
| **App Name** | Splunk Cisco App Navigator |
| **Acronym** | SCAN |
| **Splunk Folder** | `splunk-cisco-app-navigator` |
| **App Label** | Splunk Cisco App Navigator |
| **App ID** | `splunk-cisco-app-navigator` |
| **Version** | 1.0.4 |
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
├── scripts/                          # 70 utility Python scripts
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
        │   └── clean_build.sh
        ├── src/main/
        │   ├── resources/splunk/
        │   │   ├── default/
        │   │   │   ├── app.conf      # App identity, version (1.0.4)
        │   │   │   ├── products.conf # PRODUCT CATALOG (78 stanzas, ~3263 lines)
        │   │   │   ├── savedsearches.conf
        │   │   │   ├── server.conf
        │   │   │   ├── splunk_create.conf
        │   │   │   └── data/ui/
        │   │   ├── appserver/static/
        │   │   │   ├── products.css  # All styles + dark mode (~4079 lines)
        │   │   │   ├── icons/        # 128 Cisco brand icons
        │   │   │   └── fonts/        # CiscoSansTT font family
        │   │   ├── lookups/cisco_apps.csv
        │   │   ├── metadata/default.meta
        │   │   └── README/products.conf.spec
        │   └── webapp/pages/products/
        │       ├── index.jsx         # MAIN REACT COMPONENT (~4243 lines)
        │       ├── productCatalog.generated.js  # Auto-generated (DO NOT EDIT)
        │       └── render.jsx
        └── stage/                    # Build output (symlinked into Splunk)
```

---

## Key Files (edit these)

### `products.conf` — Product Catalog
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf`

Source of truth for all product data. Each stanza `[product_id]` defines one
card. Currently **78 product stanzas** (~3263 lines).

**Product breakdown:**
- 39 Security, 30 Networking, 3 Observability, 6 Collaboration
- 48 active, 11 deprecated, 17 roadmap, 2 under development
- 13 subcategories across Security and Networking
- 60 tagged for Secure Networking GTM
- 18 with SC4S documentation links
- 15 AI-enabled, 12 with SOAR connectors, 5 with ITSI Content Packs
- 5 with alert actions, 6 with community TA detection
- 429+ sourcetypes across all products

**Key fields** (see `README/products.conf.spec` for full docs):
- `display_name`, `description`, `value_proposition`, `tagline`
- `category` — `security | networking | collaboration | observability`
- `subcategory` — 13 subcategories
- `status` — `active | deprecated | roadmap | under_development`
- `sort_order` — strategic ordering (related products adjacent)
- `keywords` — comma-separated search keywords (primary acronym first)
- `icon_svg` — Cisco brand icon filename (without .svg)
- `icon_emoji` — fallback emoji via ICON_EMOJI_MAP (32 mapped)
- `addon`, `addon_label`, `addon_splunkbase_url`, `addon_docs_url`
- `app_viz`, `app_viz_label`, `app_viz_splunkbase_url`
- `sourcetypes` — comma-separated expected Splunk sourcetypes
- `legacy_apps`, `legacy_labels`, `legacy_uids`, `legacy_urls`
- `prereq_apps`, `prereq_labels`, `prereq_uids`, `prereq_urls`
- `community_apps`, `community_labels`, `community_uids`, `community_urls`
- `sc4s_url`, `sc4s_label` — SC4S documentation link
- `best_practices` — pipe-delimited custom tips
- `soar_connector_label/uid/url` (up to 3)
- `alert_action_label/uid/url` (up to 2)
- `ai_enabled`, `ai_description` — AI badge and tooltip
- `secure_networking_gtm` — GTM tag (1 = included)
- `itsi_content_pack_label`, `itsi_content_pack_docs_url`
- `card_accent`, `card_bg_color`, `card_banner`

### `index.jsx` — Main React Component
**Path:** `packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/index.jsx`

Single-file React app (~4243 lines). Uses `@splunk/react-ui` components.
Key constant: `APP_ID = 'splunk-cisco-app-navigator'`.

**Major sections:**
- Constants, ICON_EMOJI_MAP (32 emojis), PERSONA_PRESETS (lines 1-115)
- Static catalog import from `productCatalog.generated.js`
- Helper functions (configured products, theme, search)
- `getBestPractices(product, platformInfo)` — enriched tip objects
- Icon rendering: `icon_svg` loads from icons/ directory with dark variant
- Card components (collapsed/expanded views)
- Category filter bar with subcategory pills and cross-cutting filters
- Filter pill icons use `csc-filter-pill-icon` class for dark mode
- Search with `deepMatch` — checks keywords, aliases, display_name, etc.
- Modals: BestPractices, DataModel, LegacyApps, TechStack, PersonaQuickStart
- Dark/Light/Auto theme toggle (three-state)

### `products.css` — Styles
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/products.css`

All styles (~4079 lines). Key features:
- CSS variables for theme switching
- `.csc-filter-pill-icon` — dark mode white chip for filter pill SVGs
- Dark mode uses `:root.dce-dark` selector
- Dark mode card icons: frosted glass + Cisco-blue glow + white drop-shadow
- Dark mode badge pills: light-mode styling preserved
- CiscoSansTT font integration
- Subcategory pill styling with animated slide-in

### `generate-catalog.js` — Build-Time Catalog Generator
**Path:** `packages/splunk-cisco-app-navigator/bin/generate-catalog.js`

Reads `products.conf` at build time and emits `productCatalog.generated.js`.

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

### Deploy (no restart needed for JS/CSS/conf)
Build auto-clears cache and triggers Splunk `_reload` endpoints.
Hard-refresh browser (Cmd+Shift+R).

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

### Icon System
- **Primary:** `icon_svg` loads `icons/{name}.svg` (light) / `{name}_white.svg` (dark)
- **Fallback:** `icon_emoji` via ICON_EMOJI_MAP (32 emojis)
- **Ultimate fallback:** First letter of `display_name`
- **128 icon files:** 126 SVGs + 2 PNGs
- **Dark mode:** Frosted glass + Cisco-blue glow + drop-shadow

### Categories & Subcategories
4 main categories: Security (39), Networking (30), Collaboration (6), Observability (3).
13 subcategories for granular filtering.
Cross-cutting filters: SOAR (12), Alert Actions (5), AI-Powered (15), Secure Networking GTM (60).

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

---

## Utility Scripts (scripts/ — 70 scripts)

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
