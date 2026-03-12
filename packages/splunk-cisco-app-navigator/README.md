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
- **97 Cisco brand icons** (SVGs) with light/dark variants
- **429+ sourcetypes** validated via `metadata` search for data flow detection
- **13 subcategories** across Security, Networking, and Observability
- **Cross-cutting badges** — SOAR (12), ITSI (6), Alert Actions (8), AI-Powered (16)
- **SC4S integration** — 18 products with SC4S links
- **Secure Networking GTM** — 65 products tagged
- **Splunkbase compatibility** — Platform & multi-select version filters synced from S3
- **40 saved searches** — 7 categories of analytics + scheduled sync
- **Custom search command** — `downloadsplunkbasecsv` for catalog sync
- **Props.conf Audit (Magic Eight)** — per-product ingestion health check with 8-setting analysis
- **Indexer Tier Detection** — validates add-on deployment across SH and indexer tiers
- **Ecosystem Intelligence Dashboard** — Dashboard Studio v2 with portfolio analytics + Cisco Splunkbase intel
- **Catalog Vault** — hidden disabled products accessible via vault toggle
- **FilterDrawer** — sidebar drawer with advanced filters (support level, visibility, onboarding, platform, version)
- **Portal-based resizable modals** — draggable + resizable using ReactDOM.createPortal (DRM pattern)
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
| Security | 56 | cloud_security, network_security, identity_access, endpoint_security, email_security, threat_response, workload_security, application_security |
| Networking | 31 | campus_wireless, routing_wan, data_center_net, compute_infra |
| Collaboration | 6 | — |
| Observability | 3 | infrastructure_monitoring |

| Status | Count |
|---|---|
| Active | 48 |
| Deprecated | 3 |
| Roadmap | 16 |
| Retired | 11 |
| Under Development | 2 |

## Architecture

- **Product catalog:** `default/products.conf` — 79 stanzas (~2669 lines)
- **React UI:** `index.jsx` (~7373 lines) via Simple XML + RequireJS + webpack
- **Styles:** `products.css` (~6123 lines) with CSS variables and dark mode
- **Build:** `node bin/build.js build` runs generate-catalog.js + webpack
- **Logging:** `props.conf` with Magic Eight + field extractions via `transforms.conf`
- **Sync:** `downloadsplunkbasecsv` custom search command (Python 3, splunklib 2.1.1)
- **Dashboard:** `ecosystem_intelligence.xml` (Dashboard Studio v2) — Cisco ecosystem analytics
- **Modals:** Portal-based resizable modals using `ReactDOM.createPortal` (DRM pattern)

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `src/main/webapp/pages/products/index.jsx` | ~7373 | Main React component |
| `src/main/resources/splunk/default/products.conf` | ~2669 | Product catalog (79 stanzas) |
| `src/main/resources/splunk/appserver/static/products.css` | ~6123 | All styles including dark mode |
| `src/main/resources/splunk/default/savedsearches.conf` | ~994 | 40 saved searches |
| `src/main/resources/splunk/default/data/ui/views/ecosystem_intelligence.xml` | — | Ecosystem Intelligence dashboard (Studio v2) |
| `src/main/resources/splunk/default/props.conf` | — | Sourcetype + field extractions |
| `src/main/resources/splunk/default/transforms.conf` | — | Lookup definitions |
| `src/main/resources/splunk/default/commands.conf` | — | Custom search command registration |
| `src/main/resources/splunk/bin/download_splunkbase_csv.py` | — | Splunkbase CSV sync command |
| `bin/generate-catalog.js` | — | Build-time catalog generator |
| `bin/build.js` | — | Build orchestrator |
| `src/main/resources/splunk/README/products.conf.spec` | — | Field documentation |
