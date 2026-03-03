# Splunk Cisco App Navigator (SCAN)

**Version:** 1.0.4

The **Splunk Cisco App Navigator** is the unified "Glass Pane" for the
Cisco-Splunk ecosystem — a single Product Catalog UI where Splunk administrators
can discover, install, configure, and monitor all **78 Cisco integrations**
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

- **78 product cards** with real-time intelligence badges
- **128 Cisco brand icons** (126 SVGs + 2 PNGs) with light/dark variants
- **429+ sourcetypes** validated via `tstats` for data flow detection
- **13 subcategories** across Security and Networking
- **Cross-cutting badges** — SOAR (12), ITSI (5), Alert Actions (5), AI-Powered (15)
- **SC4S integration** — 18 products with SC4S links
- **Secure Networking GTM** — 60 products tagged
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
| Networking | 30 | campus_wireless, routing_wan, data_center_net, compute_infra |
| Collaboration | 6 | — |
| Observability | 3 | infrastructure_monitoring |

| Status | Count |
|---|---|
| Active | 48 |
| Deprecated | 11 |
| Roadmap | 17 |
| Under Development | 2 |

## Architecture

- **Product catalog:** `default/products.conf` — 78 stanzas (~3263 lines)
- **React UI:** `index.jsx` (~4243 lines) via Simple XML + RequireJS + webpack
- **Styles:** `products.css` (~4079 lines) with CSS variables and dark mode
- **Build:** `node bin/build.js build` runs generate-catalog.js + webpack

## Key Files

| File | Lines | Purpose |
|---|---|---|
| `src/main/webapp/pages/products/index.jsx` | ~4243 | Main React component |
| `src/main/resources/splunk/default/products.conf` | ~3263 | Product catalog (78 stanzas) |
| `src/main/resources/splunk/appserver/static/products.css` | ~4079 | All styles including dark mode |
| `bin/generate-catalog.js` | — | Build-time catalog generator |
| `bin/build.js` | — | Build orchestrator |
| `src/main/resources/splunk/README/products.conf.spec` | — | Field documentation |
