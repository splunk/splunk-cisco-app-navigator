# Splunk Cisco App Navigator (SCAN)

**Codename:** "The Front Door"
**Version:** 1.0.6
**Author:** Cisco Systems / Splunk

The **Splunk Cisco App Navigator** is a Splunkbase app that provides a unified
Product Catalog UI — the single entry point for all Cisco-Splunk integrations.
It catalogs **79 Cisco products**, maps each to the correct Splunk add-on,
validates data flow, detects legacy debt, and provides one-click install and
launch actions. Each product card displays Cisco brand SVG icons (128 icons),
AI/SOAR/ITSI/Alert badges, SC4S documentation links, Splunkbase compatibility
filters, and platform-aware best practices.

---

## Directory Structure

```
splunk-cisco-app-navigator/
├── lerna.json
├── package.json
├── README.md
├── docs/                              # Documentation & presentations
│   └── SCAN_Architecture_Guide.md     # Comprehensive A-Z guide
├── scripts/                           # 84 utility Python scripts
├── backups/                           # Organized backup archive
└── packages/
    └── splunk-cisco-app-navigator/    # Main Splunk app package
        ├── bin/                       # Build & packaging scripts
        │   ├── build.js               # Build orchestrator
        │   ├── generate-catalog.js    # products.conf → JS module
        │   ├── clean_build.sh         # Clean build script
        │   └── package_app.sh         # Splunkbase packager
        ├── webpack.config.js
        ├── CHANGELOG.md
        ├── src/main/
        │   ├── resources/splunk/
        │   │   ├── default/
        │   │   │   ├── app.conf       # Version 1.0.6
        │   │   │   ├── products.conf  # 79 products (~3386 lines)
        │   │   │   ├── savedsearches.conf  # 35 saved searches
        │   │   │   ├── props.conf     # Sourcetype + field extractions
        │   │   │   ├── transforms.conf    # Lookup definitions
        │   │   │   ├── commands.conf  # Custom search commands
        │   │   │   └── data/ui/
        │   │   ├── bin/
        │   │   │   ├── download_splunkbase_csv.py  # Custom command
        │   │   │   └── splunklib/     # Bundled splunklib 2.1.1
        │   │   ├── appserver/static/
        │   │   │   ├── products.css   # ~4547 lines (incl. dark mode)
        │   │   │   ├── icons/         # 128 Cisco brand icons
        │   │   │   └── fonts/         # CiscoSansTT
        │   │   ├── lookups/           # Splunkbase CSV catalog
        │   │   └── README/products.conf.spec
        │   └── webapp/pages/products/
        │       ├── index.jsx          # ~5561 lines (React UI)
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
| **79 Product Cards** | Security (39), Networking (31), Observability (3), Collaboration (6) |
| **Product Status** | 47 active, 3 deprecated, 16 roadmap, 2 under development, 11 retired |
| **128 Cisco Brand Icons** | 126 SVGs + 2 PNGs with light/dark variants |
| **Cross-Cutting Badges** | SOAR (12), ITSI (6), Alert Actions (6), AI-Powered (15) |
| **SC4S Integration** | 18 products with SC4S documentation links |
| **429+ Sourcetypes** | Data flow detection via `metadata` search |
| **13 Subcategories** | Granular filtering within Security, Networking, Observability |
| **Secure Networking GTM** | 65 products tagged for go-to-market strategy |
| **Dark/Light/Auto Theme** | Three-state toggle with frosted glass card icons |
| **Best Practices Modal** | Platform-aware tips (Cloud vs Enterprise) |
| **Legacy Debt Auditor** | Detects legacy apps with per-card badges |
| **Splunkbase Compatibility** | Platform & version filters synced from S3 catalog |
| **35 Saved Searches** | 7 categories of analytics + scheduled sync job |
| **Custom Search Command** | `downloadsplunkbasecsv` for catalog sync from S3 |
| **Strategic Sort Order** | Related products adjacent within categories |
| **Give Feedback** | In-app feedback form |

## Technology Stack

| Component | Version |
|---|---|
| React | 16.14.0 |
| @splunk/react-ui | 5.8.0 |
| @splunk/themes | 1.5.0 |
| @splunk/splunk-utils | 3.4.0 |
| Webpack | 5.105.2 |
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

- [Architecture Guide](docs/SCAN_Architecture_Guide.md) — comprehensive A-Z documentation
- [Package README](packages/splunk-cisco-app-navigator/README.md)
- [Changelog](packages/splunk-cisco-app-navigator/CHANGELOG.md)
- [Copilot Instructions](.github/copilot-instructions.md) — full technical context
