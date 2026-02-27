# Splunk Cisco App Navigator (SCAN)

**Codename:** "The Front Door"  
**Version:** 1.0.1  
**Author:** Cisco Systems / Splunk

The **Splunk Cisco App Navigator** is a Splunkbase app that provides a unified Product Catalog UI — the single entry point for all Cisco-Splunk integrations. It catalogs 57 Cisco products, maps each to the correct Splunk add-on, validates data flow, detects legacy debt, and provides one-click install and launch actions.

---

## Directory Structure

```
cisco_control_center_app/
├── lerna.json                         # Lerna monorepo config
├── package.json                       # Root package config
├── README.md                          # This file
├── docs/                              # Documentation & presentations
│   ├── Executive_Brief.md              # Executive brief (feature-complete)
│   ├── Cisco_Splunk_Apps_Presentation.md
│   ├── Cisco_Splunk_TA_Strategy_Presentation.md
│   └── Secure_Networking_gtm.csv      # GTM strategy product mapping
├── scripts/                           # Utility & build scripts
│   ├── rename_ccc_to_scan.py          # SCAN rename utility
│   ├── normalize_products_conf.py     # products.conf normaliser
│   ├── resort_products.py             # Product sort order tool
│   ├── set_uniform_card_fields.py     # Uniform card styling tool
│   ├── uniform_card_appearance.py     # Card accent/opacity/banner uniformity
│   ├── audit_card_appearance.py       # Audit card appearance fields
│   ├── repair_card_fields.py          # Card field repair tool
│   ├── add_gtm_field.py              # GTM field injection
│   ├── gen_pptx_cisco.py             # PowerPoint generator (Cisco template)
│   ├── gen_pptx.py                   # PowerPoint generator (generic)
│   └── ...                            # Additional analysis scripts
└── packages/
    └── splunk-cisco-app-navigator/      # Main Splunk app package
        ├── bin/
        │   ├── build.js               # Build orchestrator (catalog + webpack)
        │   ├── generate-catalog.js    # Static catalog generator from products.conf
        │   ├── package_app.sh         # Splunkbase packaging script
        │   └── clean_build.sh         # Clean build utility
        ├── webpack.config.js          # Webpack 5 + CopyPlugin config
        ├── src/main/
        │   ├── resources/splunk/      # Splunk app resources (copied to stage/)
        │   │   ├── default/
        │   │   │   ├── app.conf       # App identity & version
        │   │   │   ├── products.conf  # Product catalog (57 stanzas, ~2300 lines)
        │   │   │   ├── savedsearches.conf  # 11 saved searches
        │   │   │   ├── server.conf    # SHC replication settings
        │   │   │   └── data/ui/       # Navigation & views
        │   │   ├── appserver/static/  # CSS, bootstrap JS, app icons, SVGs
        │   │   ├── lookups/           # Reference CSVs
        │   │   ├── metadata/          # Permissions
        │   │   ├── README/            # products.conf.spec
        │   │   └── static/            # Splunkbase listing icons
        │   └── webapp/
        │       └── pages/products/
        │           ├── index.jsx      # Main React component (2346 lines)
        │           ├── render.jsx     # React mount point
        │           └── productCatalog.generated.js  # Static fallback catalog
        └── stage/                     # Built output (symlinked to Splunk)
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
curl -sk -u admin:changeme https://localhost:8089/services/debug/refresh \
  -X POST -d "entity=data/ui/views"
```

## Feature Highlights

| Feature | Description |
|---|---|
| **57 Product Cards** | Security (27), Networking (15), Observability (2), Collaboration (3), Deprecated (10) |
| **Intelligence Badges** | TA/app install status, data flow (24h), version updates, legacy warnings, SOAR/ITSI/Alert Actions |
| **Optimised Data Validation** | Single SPL search validates 321 sourcetypes across 52 products (sub-second) |
| **Legacy Debt Auditor** | Detects 93 legacy apps across 29 products — per-card badge + audit modal |
| **Category Filter Bar** | Domain pills + cross-cutting filters: 🔐 Secure Networking, ⚡ SOAR, 🔔 Alert Actions |
| **Universal Finder** | 408+ keyword search with result counter |
| **Custom Dashboard Launch** | Split-button with per-product custom dashboard (persists in `local/products.conf`) |
| **Card Appearance System** | Uniform accent colors (7 families), banner watermarks, bg_color per product. All 57 cards have card_accent |
| **Secure Networking GTM** | 31 products tagged for Cisco's Secure Networking go-to-market strategy |
| **Dark/Light/Auto Theme** | Three-state toggle with 30+ CSS variable overrides |
| **11 Saved Searches** | Pre-built reports: ecosystem summary, sourcetype coverage, legacy inventory, gap analysis |
| **Community TA Detection** | Warns when third-party TAs shadow official Cisco add-ons (5 products) |
| **Give Feedback** | In-app feedback form → Splunk summary index (`scan:feedback`) |

## Technology Stack

| Component | Version |
|---|---|
| React | 16.14.0 |
| @splunk/react-ui | 5.8.0 |
| @splunk/themes | 1.5.0 |
| @splunk/splunk-utils | 3.4.0 |
| Webpack | 5.105.2 |
| Simple XML | 1.1 |

## Documentation

- [Executive Brief](docs/Executive_Brief.md) — Feature-complete product brief with full catalog reference
- [Apps Presentation](docs/Cisco_Splunk_Apps_Presentation.md) — Strategic blueprint for Cisco-Splunk app consolidation
- [TA Strategy](docs/Cisco_Splunk_TA_Strategy_Presentation.md) — Engineering strategy for TA quality & scale
- [App README](packages/splunk-cisco-app-navigator/src/main/resources/splunk/README.md) — Detailed feature documentation
