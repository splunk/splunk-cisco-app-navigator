# Splunk Cisco App Navigator (SCAN)

The **Splunk Cisco App Navigator** is the unified "Glass Pane" for the Cisco-Splunk ecosystem — a single Product Catalog UI where Splunk administrators can discover, install, configure, and monitor all 57 Cisco integrations across Security, Observability, Networking, and Collaboration.

## Quick Start

```bash
# Install dependencies (from repo root)
yarn install

# Build the app
cd packages/cisco-control-center-app
node bin/build.js build

# The built app lives in stage/ — symlink to your Splunk apps directory:
ln -s "$(pwd)/stage" /opt/splunk/etc/apps/cisco-control-center-app
```

## Key Features

- **57 product cards** with real-time intelligence badges (install status, data flow, version updates, legacy debt)
- **Optimized data validation** — single SPL search validates 321 sourcetypes across 52 products
- **Legacy Debt Auditor** — detects 93 legacy/deprecated apps and guides migration
- **Category Filter Bar** — domain pills + cross-cutting filters (🔐 Secure Networking, ⚡ SOAR, 🔔 Alert Actions)
- **Universal Finder** — 408+ keyword search across the entire catalog
- **Custom Dashboard Launch** — split-button with per-product custom dashboard support
- **IS4S-inspired card design** — 3D shadows, gradient bottom borders, uniform card accents across all 57 products
- **Utility strip header** — platform label, version pill, theme toggle pill below header; Cisco logo stands alone
- **Dark/Light/Auto theme** — three-state toggle pill with label (Light/Dark/Auto)
- **11 saved searches** — pre-built reports accessible from the Reports nav menu
- **Give Feedback** — in-app feedback form stored in Splunk's summary index

## Architecture

- **Product catalog:** `default/products.conf` — 57 product stanzas with 60+ fields each
- **React UI:** Single-page app mounted via Simple XML → RequireJS → webpack React bundle
- **Build:** `node bin/build.js build` runs `generate-catalog.js` (static fallback) + webpack (~1s)
- **Deploy:** `stage/` folder symlinked to Splunk's `etc/apps/` directory

See [src/main/resources/splunk/README.md](src/main/resources/splunk/README.md) for full feature documentation.
