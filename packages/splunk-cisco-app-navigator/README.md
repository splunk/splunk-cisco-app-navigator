# Splunk Cisco App Navigator (SCAN)

**Version:** 1.0.19

The **Splunk Cisco App Navigator** is the unified "Glass Pane" for the
Cisco-Splunk ecosystem — a single Product Catalog UI where Splunk administrators
can discover, install, configure, and monitor all **93 Cisco integrations**
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

- **93 product cards** with real-time intelligence badges
- **97 Cisco brand icons** (SVGs) with light/dark variants
- **293+ unique sourcetypes** validated via `metadata` search for data flow detection
- **19 subcategories** across Security, Networking, Collaboration, and Observability
- **Cross-cutting badges** — SOAR (12), ITSI (6), Alert Actions (4), AI-Powered (17), ES (25)
- **SC4S integration** — 18 products with SC4S links
- **Secure Networking GTM** — 71 products tagged
- **Splunkbase compatibility** — Platform & multi-select version filters synced from S3
- **42 saved searches** — 7 categories of analytics + scheduled sync
- **Custom search command** — `downloadsplunkbasecsv` for catalog sync
- **Props.conf Audit (Magic Eight)** — per-product ingestion health check with 8-setting analysis
- **Indexer Tier Detection** — validates add-on deployment across SH and indexer tiers
- **Ecosystem Intelligence Dashboard** — Dashboard Studio v2 with portfolio analytics + Cisco Splunkbase intel
- **Catalog Vault** — hidden disabled products accessible via vault toggle
- **FilterDrawer** — sidebar drawer with advanced filters (support level, visibility, onboarding, platform, version)
- **"Integration Needed" section** — Cisco products without a dedicated Splunk add-on (gated behind dev/GTM mode)
- **Portal-based resizable modals** — draggable + resizable using ReactDOM.createPortal (DRM pattern)
- **Category Filter Bar** — domain pills + subcategory expansion + cross-cutting filters
- **Universal Finder** — deep keyword search across 725+ keywords
- **Best Practices Modal** — platform-aware tips, custom guidance, SC4S links
- **Legacy Debt Auditor** — detects deprecated apps
- **Dark/Light/Auto theme** — frosted glass card icons, Cisco-blue glow, theme-aware warning banners
- **Strategic sort order** — related products adjacent
- **Community TA Detection** — warns on third-party TAs
- **`date_created` / `date_updated`** — lifecycle tracking fields on every product card
- **Give Feedback** — in-app form to `scan:feedback`

## Product Catalog Breakdown

| Category | Count | Subcategories |
|---|---|---|
| Security | 43 | cloud_security, network_security, identity_access, endpoint_security, email_security, threat_response, workload_security, application_security, threat_intelligence |
| Networking | 35 | campus_wireless, routing_wan, data_center_net, compute_infra |
| Collaboration | 12 | meetings_calling, voice_telephony, contact_center |
| Observability | 3 | infrastructure_monitoring, digital_experience, application_monitoring |

| Status | Count |
|---|---|
| Active | 47 |
| Roadmap | 30 |
| Retired | 11 |
| Deprecated | 3 |
| Under Development | 2 |

| Support Level | Count |
|---|---|
| Cisco Supported | 36 |
| Splunk Supported | 9 |
| Developer Supported | 5 |
| Community Supported | 1 |
| Not Supported | 42 |

## Architecture

- **Product catalog:** `default/products.conf` — 93 stanzas (~3250 lines)
- **React UI:** `index.jsx` (~8772 lines) via Simple XML + RequireJS + webpack
- **Styles:** `products.css` (~7165 lines) with CSS variables and dark mode
- **Build:** `node bin/build.js build` runs generate-catalog.js + webpack
- **Logging:** `props.conf` with Magic Eight + field extractions via `transforms.conf`
- **Sync:** `downloadsplunkbasecsv` custom search command (Python 3, splunklib 2.1.1)
- **Dashboard:** `ecosystem_intelligence.xml` (Dashboard Studio v2) — Cisco ecosystem analytics
- **Modals:** Portal-based resizable modals using `ReactDOM.createPortal` (DRM pattern)

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `src/main/webapp/pages/products/index.jsx` | ~8772 | Main React component |
| `src/main/resources/splunk/default/products.conf` | ~3250 | Product catalog (93 stanzas) |
| `src/main/resources/splunk/appserver/static/products.css` | ~7165 | All styles including dark mode |
| `src/main/resources/splunk/default/savedsearches.conf` | — | 42 saved searches |
| `src/main/resources/splunk/default/data/ui/views/ecosystem_intelligence.xml` | — | Ecosystem Intelligence dashboard (Studio v2) |
| `src/main/resources/splunk/default/props.conf` | — | Sourcetype + field extractions |
| `src/main/resources/splunk/default/transforms.conf` | — | Lookup definitions |
| `src/main/resources/splunk/default/commands.conf` | — | Custom search command registration |
| `src/main/resources/splunk/bin/download_splunkbase_csv.py` | — | Splunkbase CSV sync command |
| `bin/generate-catalog.js` | — | Build-time catalog generator |
| `bin/build.js` | — | Build orchestrator |
| `src/main/resources/splunk/README/products.conf.spec` | — | Field documentation |
