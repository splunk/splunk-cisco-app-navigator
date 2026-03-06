# Splunk Cisco App Navigator (SCAN)

**Version:** 1.0.6

The **Splunk Cisco App Navigator** is the unified "Glass Pane" for the
Cisco-Splunk ecosystem — a single Product Catalog UI where Splunk administrators
can discover, install, configure, and monitor all **79 Cisco integrations**
across Security, Observability, Networking, and Collaboration.

## Quick Start

```bash
# Install dependencies (from repo root)
yarn install

# Build the app
cd packages/splunk-cisco-app-navigator
node bin/build.js build

# Symlink to Splunk
ln -s "$(pwd)/stage" /opt/splunk/etc/apps/splunk-cisco-app-navigator
```

## Key Features

- **79 product cards** with real-time intelligence badges
- **128 Cisco brand icons** (126 SVGs + 2 PNGs) with light/dark variants
- **429+ sourcetypes** validated via `metadata` search for data flow detection
- **13 subcategories** across Security, Networking, and Observability
- **Cross-cutting badges** — SOAR (12), ITSI (6), Alert Actions (6), AI-Powered (15)
- **SC4S integration** — 18 products with SC4S links
- **Secure Networking GTM** — 65 products tagged
- **Splunkbase compatibility** — Platform & version filters synced from S3 catalog
- **35 saved searches** — 7 categories of analytics + scheduled sync
- **Custom search command** — `downloadsplunkbasecsv` for catalog sync
- **Category Filter Bar** — domain pills + subcategory expansion + cross-cutting filters
- **Universal Finder** — deep keyword search
- **Best Practices Modal** — platform-aware tips, custom guidance, SC4S links
- **Legacy Debt Auditor** — detects deprecated apps
- **Dark/Light/Auto theme** — frosted glass card icons, Cisco-blue glow
- **Strategic sort order** — related products adjacent
- **Community TA Detection** — warns on third-party TAs (6 products)
- **Give Feedback** — in-app form to `scan:feedback`

## Product Catalog Breakdown

| Category | Count | Subcategories |
|---|---|---|
| Security | 39 | cloud_security, network_security, identity_access, endpoint_security, email_security, threat_response, workload_security, application_security |
| Networking | 31 | campus_wireless, routing_wan, data_center_net, compute_infra |
| Collaboration | 6 | — |
| Observability | 3 | infrastructure_monitoring |

| Status | Count |
|---|---|
| Active | 47 |
| Deprecated | 3 |
| Roadmap | 16 |
| Retired | 11 |
| Under Development | 2 |

## Architecture

- **Product catalog:** `default/products.conf` — 79 stanzas (~3386 lines)
- **React UI:** `index.jsx` (~5561 lines) via Simple XML + RequireJS + webpack
- **Styles:** `products.css` (~4547 lines) with CSS variables and dark mode
- **Build:** `node bin/build.js build` runs generate-catalog.js + webpack
- **Logging:** `props.conf` with Magic Six + field extractions via `transforms.conf`
- **Sync:** `downloadsplunkbasecsv` custom search command (Python 3, splunklib 2.1.1)

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `src/main/webapp/pages/products/index.jsx` | ~5561 | Main React component |
| `src/main/resources/splunk/default/products.conf` | ~3386 | Product catalog (79 stanzas) |
| `src/main/resources/splunk/appserver/static/products.css` | ~4547 | All styles including dark mode |
| `src/main/resources/splunk/default/savedsearches.conf` | ~794 | 35 saved searches |
| `src/main/resources/splunk/default/props.conf` | — | Sourcetype + field extractions |
| `src/main/resources/splunk/default/transforms.conf` | — | Lookup definitions |
| `src/main/resources/splunk/default/commands.conf` | — | Custom search command registration |
| `src/main/resources/splunk/bin/download_splunkbase_csv.py` | — | Splunkbase CSV sync command |
| `bin/generate-catalog.js` | — | Build-time catalog generator |
| `bin/build.js` | — | Build orchestrator |
| `src/main/resources/splunk/README/products.conf.spec` | — | Field documentation |
