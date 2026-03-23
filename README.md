# Splunk Cisco App Navigator (SCAN)

**Codename:** "The Front Door"
**Version:** 1.0.21
**Author:** Amir (AK) Khamis

The **Splunk Cisco App Navigator** is a Splunkbase app that provides a unified
Product Catalog UI — the single entry point for all Cisco-Splunk integrations.
It catalogs **93 Cisco products**, maps each to the correct Splunk add-on,
validates data flow, detects legacy debt, and provides one-click install and
launch actions. Each product card displays Cisco brand SVG icons (97 icons),
SOAR/SecOps/ITOps/Alert/ES badges, SC4S documentation links, Splunkbase
compatibility filters, platform-aware best practices, and a **Props.conf Audit
(Magic Eight)** for ingestion health. The app also includes an **Ecosystem
Intelligence** dashboard for portfolio analytics, **Indexer Tier detection** for
deployment validation, and a **Catalog Vault** for disabled products.

---

## Directory Structure

```
splunk-cisco-app-navigator/
├── lerna.json
├── package.json
├── README.md
├── docs/                              # Local-only docs (gitignored)
│   ├── OPEN_QUESTIONS.md              # Pending decisions tracker
│   ├── The_Magic_Eight.md             # Props.conf ingestion health guide
│   └── slides/                        # Presentation decks
└── packages/
    └── splunk-cisco-app-navigator/    # Main Splunk app package
        ├── bin/                       # Build & packaging scripts
        │   ├── build.js               # Build orchestrator
        │   ├── generate-catalog.js    # products.conf → JS module
        │   ├── clean_build.sh         # Clean build script
        │   ├── package_app.sh         # Splunkbase packager
        │   ├── appinspect.sh          # AppInspect automation
        │   └── appinspect_html_report.py  # HTML report generator
        ├── docs/                      # Tracked documentation
        │   ├── SCAN_Architecture_Guide.md  # Comprehensive A-Z guide
        │   ├── SCAN_User_Manual.md    # End-user manual
        │   └── DECISIONS.md           # Design decisions log
        ├── webpack.config.js
        ├── CHANGELOG.md
        ├── src/main/
        │   ├── resources/splunk/
        │   │   ├── default/
        │   │   │   ├── app.conf       # Version 1.0.21
        │   │   │   ├── products.conf  # 93 products (~3378 lines)
        │   │   │   ├── savedsearches.conf  # 42 saved searches
        │   │   │   ├── props.conf     # Sourcetype + field extractions
        │   │   │   ├── transforms.conf    # Lookup definitions
        │   │   │   ├── commands.conf  # Custom search commands
        │   │   │   └── data/ui/
        │   │   ├── bin/
        │   │   │   ├── download_splunkbase_csv.py  # Custom command
        │   │   │   └── splunklib/     # Bundled splunklib 2.1.1
        │   │   ├── appserver/static/
        │   │   │   ├── products.css   # ~7652 lines (incl. dark mode)
        │   │   │   ├── icons/         # 97 Cisco brand icons
        │   │   │   └── fonts/         # CiscoSansTT
        │   │   ├── lookups/           # Splunkbase CSV catalog
        │   │   └── README/products.conf.spec
        │   └── webapp/pages/products/
        │       ├── index.jsx          # ~9280 lines (React UI)
        │       └── productCatalog.generated.js
        └── stage/                     # Build output
```

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Build
cd packages/splunk-cisco-app-navigator
node bin/build.js build

# 3. Deploy (symlink stage/ to Splunk)
ln -s "$(pwd)/stage" /opt/splunk/etc/apps/splunk-cisco-app-navigator

# 4. Clear cache & refresh
rm -f /opt/splunk/var/run/splunk/appserver/i18n/products*.cache
curl -sk -u admin:changeme \
  https://localhost:8089/servicesNS/nobody/splunk-cisco-app-navigator/configs/conf-products/_reload \
  -X POST > /dev/null 2>&1
```

## Feature Highlights

| Feature | Description |
|---|---|
| **93 Product Cards** | Security (43), Networking (35), Observability (3), Collaboration (12) |
| **Product Status** | 48 active, 22 roadmap, 3 deprecated, 2 under development, 11 retired, 7 archived |
| **Support Levels** | 36 Cisco, 9 Splunk, 6 Developer, 1 Community, 41 Not Supported |
| **97 Cisco Brand Icons** | SVGs with light/dark variants |
| **Cross-Cutting Badges** | SOAR (11), SecOps (ES) (34), ITOps (5), Alert Actions (8), SC4S (17) |
| **SC4S Integration** | 17 products with SC4S documentation links |
| **303 Unique Sourcetypes** | Data flow detection via `metadata` search |
| **19 Subcategories** | Granular filtering within Security, Networking, Collaboration, Observability |
| **Dark/Light/Auto Theme** | Three-state toggle with frosted glass card icons and theme-aware banners |
| **Props.conf Audit (Magic Eight)** | Per-product ingestion health check with tier version audit |
| **Indexer Tier Detection** | Validates add-on deployment across SH and indexer tiers |
| **Ecosystem Intelligence** | Dashboard Studio v2 with portfolio analytics + Splunkbase intel |
| **Catalog Vault** | Hidden disabled products accessible via vault toggle |
| **Integration Needed** | Section for Cisco products without Splunk add-ons (dev/GTM mode) |
| **Best Practices Modal** | Platform-aware tips (Cloud vs Enterprise) |
| **Legacy Debt Auditor** | Detects legacy apps with per-card badges |
| **Splunkbase Compatibility** | Platform & multi-select version filters synced from S3 |
| **FilterDrawer** | Sidebar drawer with advanced filters (support, visibility, onboarding) |
| **42 Saved Searches** | 7 categories of analytics + scheduled sync job |
| **Custom Search Command** | `downloadsplunkbasecsv` for catalog sync from S3 |
| **Portal-based Resizable Modals** | Draggable + resizable modals using ReactDOM.createPortal |
| **725+ Search Keywords** | Deep keyword search across all product metadata |
| **Lifecycle Tracking** | `date_created` / `date_updated` fields on every product card |
| **Strategic Sort Order** | Related products adjacent within categories |
| **Give Feedback** | In-app feedback form |

## Technology Stack

| Component | Version |
|---|---|
| React | 18.3.1 |
| @splunk/react-ui | 5.8.0 |
| @splunk/themes | 1.5.0 |
| @splunk/splunk-utils | 3.4.0 |
| Webpack | 5.105.4 |
| Simple XML | 1.1 |

## Cisco Brand Assets

The app uses Cisco brand icons, fonts, and logos. These assets are **not tracked
in git** (too large). To obtain them locally, download from:

- **BX Employee Collection:** https://bx.cisco.com/cisco-brand-exchange/employee
- **Cisco Security Brand Resources Hub:** https://brandfolder.com/ciscosecurity

Place downloaded assets in a local `cisco/` folder at the repo root. See
`cisco/README.md` (if present) for the expected folder structure.

The icons actually used in the app are already committed in
`packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/icons/`.

## Documentation

- [Architecture Guide](packages/splunk-cisco-app-navigator/docs/SCAN_Architecture_Guide.md) — comprehensive A-Z documentation
- [User Manual](packages/splunk-cisco-app-navigator/docs/SCAN_User_Manual.md) — end-user guide
- [Design Decisions](packages/splunk-cisco-app-navigator/docs/DECISIONS.md) — design decisions log
- [Changelog](packages/splunk-cisco-app-navigator/CHANGELOG.md)
- [Copilot Instructions](.github/copilot-instructions.md) — full technical context
