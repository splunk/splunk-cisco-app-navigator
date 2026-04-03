# SCAN Architecture Guide — A to Z

> **Splunk Cisco App Navigator (SCAN)** — The Front Door to the Cisco–Splunk Ecosystem
> **Version:** 1.0.23 · **Last updated:** April 1, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What SCAN Does](#2-what-scan-does)
3. [Repository Structure](#3-repository-structure)
4. [Product Catalog (`products.conf`)](#4-product-catalog)
5. [Build Pipeline](#5-build-pipeline)
6. [Rendering Architecture](#6-rendering-architecture)
7. [UI Component Hierarchy](#7-ui-component-hierarchy)
8. [Filter Pipeline](#8-filter-pipeline)
9. [Counter Logic](#9-counter-logic)
10. [Splunkbase Compatibility System](#10-splunkbase-compatibility-system)
11. [Data Flow Detection](#11-data-flow-detection)
12. [Icon System](#12-icon-system)
13. [Theme System (Dark/Light/Auto)](#13-theme-system)
14. [Modals & Overlays](#14-modals--overlays)
15. [Props.conf Audit (Magic Eight)](#15-propsconf-audit-magic-eight)
16. [Indexer Tier Detection](#16-indexer-tier-detection)
16a. [Runtime Search Inventory](#16a-runtime-search-inventory)
16b. [Custom Product Cards](#16b-custom-product-cards)
16c. [ES Compatible Badge System](#16c-es-compatible-badge-system)
17. [Catalog Vault](#17-catalog-vault)
18. [Configuration Files](#18-configuration-files)
19. [Custom Search Command (`downloadsplunkbasecsv`)](#19-custom-search-command)
20. [Logging & Observability](#20-logging--observability)
21. [Saved Searches](#21-saved-searches)
22. [Ecosystem Intelligence Dashboard](#22-ecosystem-intelligence-dashboard)
23. [Navigation Menu](#23-navigation-menu)
24. [Developer Mode](#24-developer-mode)
24a. [GTM Mode](#24a-gtm-mode)
25. [CSS Architecture](#25-css-architecture)
26. [Technology Stack & Constraints](#26-technology-stack--constraints)
27. [Deployment & Operations](#27-deployment--operations)
28. [Utility Scripts](#28-utility-scripts)
29. [Git Workflow](#29-git-workflow)

---

## 1. Executive Summary

SCAN is a Splunk app that provides a unified "Glass Pane" UI for discovering,
deploying, and managing the full portfolio of Cisco Splunk apps and add-ons.
It renders ~93 product cards across 4 categories (Security, Networking,
Observability, Collaboration), each showing installation status, data flow
health, compatibility info, and platform-aware best practices.

The app is a **single-page React application** embedded inside a Splunk Simple
XML dashboard. The product catalog is defined in `products.conf` (a standard
Splunk INI file), which is parsed at build time into a JavaScript module and
also loaded live via Splunk's REST API at runtime.

**Key metrics:**
- ~93 product stanzas in `products.conf` (~3,315 lines)
- ~9,113 lines of React code in a single `index.jsx`
- ~7,600+ lines of CSS with full dark mode support
- 97 Cisco brand SVG icons with light/dark variants
- 42+ saved searches across multiple analytical categories
- 12 configuration files in `default/`
- 84 utility scripts in `scripts/`
- 2 dashboards: Product Catalog (React) + Ecosystem Intelligence (Studio v2)

---

## 2. What SCAN Does

For every Cisco product in the catalog, SCAN shows:

| Feature | Description |
|---|---|
| **Add-on mapping** | Which Splunk TA ingests data for this product |
| **Viz app mapping** | Which Splunk app provides dashboards |
| **Installation status** | Whether the TA/app is installed and what version |
| **Data flow detection** | Whether expected sourcetypes are arriving (last 7 days) |
| **Legacy debt audit** | Whether deprecated apps need to be removed first |
| **Best practices** | Platform-aware tips (Cloud vs Enterprise) |
| **SC4S links** | SC4S documentation for syslog-based products |
| **Compatibility** | Splunkbase platform and version compatibility |
| **Cross-cutting badges** | AI-Powered, SOAR, ITSI, Alert Actions, NetFlow |
| **Secure Networking GTM** | Go-to-market strategy tagging for 65 products |
| **Support level** | Cisco, Splunk, Developer, Community, or Unsupported |
| **Props.conf Audit** | Magic Eight ingestion health check per product |
| **Indexer Tier detection** | Validates add-on deployment across SH and indexer tiers |
| **Ecosystem Intelligence** | Dashboard Studio v2 dashboard for portfolio analytics |
| **Custom Cards** | Customer-created product cards stored in `local/products.conf` |
| **ES Compatible badge** | CIM-compliant products ready for Enterprise Security |
| **Copy-to-clipboard** | Share product details from cards and modals |
| **devmode / gtmmode** | Hidden keyboard shortcuts in the search bar for internal content gating |

### Product breakdown

| Category | Count | Subcategories |
|---|---|---|
| Security | 56 | cloud_security, network_security, identity_access, endpoint_security, email_security, threat_response, workload_security, application_security |
| Networking | 31 | campus_wireless, routing_wan, data_center_net, compute_infra |
| Observability | 3 | infrastructure_monitoring |
| Collaboration | 6 | — |

| Status | Count |
|---|---|
| Active | 48 |
| Retired | 11 |
| Roadmap | 16 |
| Deprecated | 3 |
| Under Development | 2 |

| Support Level | Count |
|---|---|
| Cisco Supported | 38 |
| Not Supported | 25 |
| Developer Supported | 9 |
| Splunk Supported | 6 |
| Community Supported | 1 |

### Cross-cutting filters

| Filter | Count | Description |
|---|---|---|
| Secure Networking GTM | 65 | Products in the Cisco Secure Networking go-to-market strategy |
| SC4S | 18 | Products with SC4S syslog documentation |
| AI-Powered | 16 | Products leveraging ML/AI capabilities |
| SOAR Connectors | 12 | Products with Splunk SOAR integration |
| NetFlow | 11 | Products supporting NetFlow |
| ITSI Content Packs | 6 | Products with IT Service Intelligence content |
| Alert Actions | 8 | Products with custom alert actions |
| Coverage Gaps | 16 | GTM roadmap products with no integration yet |

---

## 3. Repository Structure

```
splunk-cisco-app-navigator/               # Git root
├── lerna.json                            # Lerna monorepo config
├── package.json                          # Root workspace (Yarn + Lerna)
├── README.md                             # Project README
├── .github/
│   └── copilot-instructions.md           # Copilot context (auto-loaded)
├── scripts/                              # 84 utility Python scripts
├── docs/                                 # Documentation & presentations
│   ├── Blueprint.md
│   ├── CiscoSecurityCloud_Audit_Report.md
│   ├── SCAN_Architecture_Guide.md        # THIS FILE
│   └── *.docx / *.pptx
├── backups/                              # Organized backup archive
│   ├── 20260223_pre_plan_a/              # Pre-redesign snapshot
│   ├── chat_history/                     # Copilot chat sessions
│   ├── conf/                             # products.conf backup versions
│   ├── css/                              # products.css backups
│   ├── docs/                             # doc file backups
│   ├── lookups/                          # CSV/lookup backups
│   ├── jsx/                              # JSX backups
│   └── misc/                             # Other backups
└── packages/
    └── splunk-cisco-app-navigator/       # THE main Splunk app
        ├── package.json                  # App-level dependencies
        ├── webpack.config.js             # Webpack 5 config
        ├── CHANGELOG.md
        ├── README.md
        ├── bin/                           # Build & packaging scripts
        │   ├── build.js                  # Build orchestrator
        │   ├── generate-catalog.js       # products.conf → JS module
        │   ├── clean_build.sh            # Clean build script
        │   └── package_app.sh            # Splunkbase tar.gz packager
        └── src/main/
            ├── resources/splunk/          # Splunk app contents
            │   ├── default/
            │   │   ├── app.conf
            │   │   ├── products.conf      # PRODUCT CATALOG
            │   │   ├── savedsearches.conf
            │   │   ├── props.conf
            │   │   ├── transforms.conf
            │   │   ├── commands.conf
            │   │   ├── searchbnf.conf
            │   │   ├── restmap.conf
            │   │   ├── distsearch.conf
            │   │   ├── server.conf
            │   │   ├── splunk_create.conf
            │   │   └── data/ui/
            │   │       ├── nav/default.xml
            │   │       └── views/
            │   │           ├── products.xml
            │   │           └── ecosystem_intelligence.xml
            │   ├── bin/
            │   │   ├── download_splunkbase_csv.py
            │   │   └── splunklib/         # Bundled splunklib 2.1.1
            │   ├── appserver/static/
            │   │   ├── products.css
            │   │   ├── icons/             # 97 SVG icons
            │   │   └── fonts/             # CiscoSansTT
            │   ├── lookups/
            │   │   └── scan_splunkbase_apps.csv.gz
            │   ├── metadata/
            │   │   └── default.meta
            │   └── README/
            │       └── products.conf.spec
            └── webapp/pages/products/    # React source
                ├── index.jsx              # Main component (~9,113 lines)
                ├── productCatalog.generated.js
                └── render.jsx             # Mount point
```

---

## 4. Product Catalog

### Source of truth: `products.conf`

Every product card is defined by a stanza in `products.conf`, a standard Splunk
INI configuration file. Each stanza uses a snake_case `product_id` as its name.

**Example stanza:**
```ini
[cisco_secure_firewall]
display_name = Cisco Secure Firewall
description = Next-generation firewall with IPS, URL filtering...
tagline = Protect your network perimeter
category = security
subcategory = network_security
status = active
support_level = cisco_supported
sort_order = 10
keywords = ASA, FTD, Firepower, NGFW, firewall
icon_svg = secure_firewall
addon = Splunk_TA_cisco-firepower-estreamer
addon_label = Cisco Secure Firewall (eStreamer)
addon_splunkbase_url = https://splunkbase.splunk.com/app/1234
sourcetypes = cisco:firepower:syslog, cisco:asa
sc4s_url = https://splunk.github.io/splunk-connect-for-syslog/...
best_practices = Enable eStreamer on FMC|Use SC4S for syslog ingestion
ai_enabled = true
ai_description = ML-powered threat detection
secure_networking_gtm = true
soar_connector_label = Cisco Firepower
soar_connector_uid = 1234
soar_connector_url = https://splunkbase.splunk.com/app/1234
```

### Field reference

The full field spec is documented in `README/products.conf.spec`. Key categories:

**Identity fields:**
`display_name`, `description`, `value_proposition`, `tagline`, `product_id`

**Classification:**
`category` (security | networking | observability | collaboration),
`subcategory` (13 options), `status` (active | deprecated | retired | roadmap | under_development),
`support_level` (cisco_supported | splunk_supported | developer_supported | community_supported | not_supported)

**Presentation:**
`sort_order`, `keywords`, `icon_svg`, `icon_emoji`, `card_accent`, `card_bg_color`, `card_banner`

**Integrations:**
`addon`, `addon_label`, `addon_splunkbase_url`, `addon_docs_url`,
`app_viz`, `app_viz_label`, `app_viz_splunkbase_url`,
`app_viz_2`, `app_viz_2_label`, `app_viz_2_splunkbase_url`

**Data sources:**
`sourcetypes` (comma-separated), `sc4s_url`, `sc4s_label`, `netflow_supported`

**Legacy & Prerequisites:**
`legacy_apps`, `legacy_labels`, `legacy_uids`, `legacy_urls`, `legacy_statuses`,
`prereq_apps`, `prereq_labels`, `prereq_uids`, `prereq_urls`,
`community_apps`, `community_labels`, `community_uids`, `community_urls`

**Cross-cutting tags:**
`ai_enabled`, `ai_description`, `secure_networking_gtm`, `coverage_gap`

**Ecosystem integrations:**
`soar_connector_label/uid/url` (up to 3),
`alert_action_label/uid/url` (up to 2),
`itsi_content_pack_label`, `itsi_content_pack_docs_url`

**Best practices:**
`best_practices` (pipe-delimited tips)

### How the catalog gets to the browser

```
products.conf  ──[build]──>  productCatalog.generated.js  ──[webpack]──>  bundle.js
                                                                            ↓
                             configs/conf-products REST API  ──[runtime]──> state
```

1. At **build time**, `generate-catalog.js` parses `products.conf` and writes
   `productCatalog.generated.js` — a JS module exporting a `PRODUCT_CATALOG` array.
2. At **runtime**, the React app imports the static catalog as a fallback, then
   attempts to load live data from Splunk's `configs/conf-products` REST endpoint.
3. If the live load succeeds, it replaces the static catalog. If it fails (e.g.,
   running outside Splunk), the static catalog is used.

---

## 5. Build Pipeline

### Overview

```
yarn run clean:build              # Optional: wipe stage/ (preserves local/)
         │
         ▼
node bin/build.js build
         │
         ├── 1. stampBuildHash()         # Git short hash → app.conf build field
         ├── 2. generate-catalog.js      # products.conf → productCatalog.generated.js
         ├── 3. webpack                  # Compile JSX → stage/appserver/static/pages/products.js
         │      └── CopyPlugin           # Copy src/main/resources/splunk → stage/
         └── 4. postBuildRefresh()       # Clear cache + curl _reload endpoints
```

### Step 1: Build Hash Stamp (`stampBuildHash`)

Writes the current git short hash (8 chars) into `app.conf`'s `build` field.
Falls back to a date-based hex stamp if git is unavailable.

### Step 2: Catalog Generation (`generate-catalog.js`)

- Parses `products.conf` using a simple INI parser
- Converts CSV fields to arrays (sourcetypes, keywords, etc.)
- Builds legacy/prereq/community app relationship objects
- Assembles SOAR connector and alert action arrays
- Handles boolean fields (ai_enabled, secure_networking_gtm, etc.)
- Emits `productCatalog.generated.js` with `export const PRODUCT_CATALOG = [...]`

### Step 3: Webpack Bundle

- Entry point: `render.jsx`
- Output: `stage/appserver/static/pages/products.js`
- Babel transpiles JSX
- `DefinePlugin` injects `SCAN_DEPENDENCY_VERSIONS` (for Tech Stack modal)
- `CopyPlugin` copies all Splunk resources into `stage/`

### Step 4: Post-Build Refresh

- Clears Splunk's UI cache (`products*.cache`)
- Curls `_reload` endpoints for `conf-products` and `data/ui/views`
- No Splunk restart needed for JS/CSS/conf changes

### Clean Build (`clean_build.sh`)

- Removes `stage/` directory entirely
- **Always preserves `stage/local/`** (runtime user data like custom dashboards)
- Pass `--wipe-local` flag to remove local/ as well (rarely needed)

---

## 6. Rendering Architecture

### How a Splunk Simple XML dashboard embeds React

```
Splunk Web Server
  └── /app/splunk-cisco-app-navigator/products
        └── products.xml (Simple XML dashboard)
              ├── stylesheet="products.css"    # CSS loaded by Splunk
              ├── script="products_bootstrap.js" # RequireJS entry point
              └── <html><div id="scan-root"/></html>
                    │
                    ▼
              render.jsx
                    │
                    ├── SplunkThemeProvider (Prisma, light, comfortable)
                    └── ProductsPage component (index.jsx)
```

1. User navigates to the "Cisco Products" view
2. Splunk renders `products.xml` — a Simple XML dashboard v1.1
3. The dashboard loads `products.css` for all styles
4. RequireJS loads the webpack-built `products.js` bundle
5. `render.jsx` waits for `#scan-root` DOM element, then mounts React
6. `SplunkThemeProvider` wraps the app for consistent Splunk UI styling
7. `ProductsPage` (the main component from `index.jsx`) renders everything

### Why Simple XML + React?

Splunk's dashboard framework requires Simple XML for navigation integration,
saved search menus, and AppInspect compliance. The React app runs inside a
Simple XML `<html>` panel, getting the best of both worlds: full React
interactivity inside Splunk's standard app shell.

---

## 7. UI Component Hierarchy

```
SCANProductsPage
├── Header (title, subtitle, Cisco logo)
├── Utility Strip
│   ├── InfoTooltip ("How do I get started?")
│   ├── Portfolio Toggle (Supported Only / All Products)
│   ├── Platform Badge (Splunk Cloud / Enterprise)
│   ├── Version Badge (v1.0.23)
│   ├── Theme Toggle (Auto / Light / Dark)
│   ├── Guide Button
│   └── Role Button
├── UniversalFinderBar (search + result count)
├── CategoryFilterBar
│   ├── Category Pills (All, Security, Networking, Observability, Collaboration)
│   ├── Cross-Cutting Pills (Secure Networking GTM, SOAR, Alert Actions, AI-Powered)
│   ├── Subcategory Pills (when category selected)
│   └── Filter Drawer Toggle Button
├── FilterDrawer (Sidebar Drawer — slides from left)
│   ├── Support Level Checkboxes (Cisco, Splunk, Developer, Unsupported)
│   ├── Visibility Toggles (Retired, Deprecated, Coming Soon, GTM Roadmap)
│   ├── Onboarding (SC4S, NetFlow)
│   ├── Platform Dropdown
│   ├── Version Multi-Select Checkboxes (grouped by major version)
│   ├── Powered By (Addon Family) bordered list with count badges
│   ├── Sync Button + InfoTooltip
│   └── ActiveFilterChips bar (with clear-all)
├── AddonFilterBar ("Powered By" dropdown)
├── Product Sections (CollapsiblePanel)
│   ├── Configured Products
│   ├── Detected Products (data flowing)
│   ├── Available Products
│   ├── Unsupported Products
│   ├── Coming Soon
│   ├── Deprecated / Archived
│   ├── Retired
│   └── GTM Roadmap — Coverage Gaps
├── ProductCard (per product)
│   ├── Icon (SVG with dark mode variant)
│   ├── Display Name + Tagline
│   ├── Status Badge + Support Badge
│   ├── Cross-Cutting Badges (AI, SOAR, ITSI, Alert, NetFlow)
│   ├── Indexer Tier Badge (deployed/mismatch/missing/disabled)
│   ├── Add-on Section (install/launch/docs links)
│   ├── Viz App Section
│   ├── Legacy Apps Warning
│   ├── Data Flow Indicator
│   ├── Compatibility Section (collapsible)
│   └── Action Buttons (Add/Remove, Best Practices, Config Viewer)
├── CatalogVault (disabled products section)
└── Modals
    ├── PersonaModal
    ├── BestPracticesModal
    ├── LegacyAuditModal
    ├── DataModelModal
    ├── SC4SInfoModal, NetFlowInfoModal, HFInfoModal
    ├── ESInfoModal, ITSIInfoModal, AlertActionsInfoModal
    ├── CustomProductFormModal, DeleteCustomProductModal
    ├── Card legend (Guide modal)
    ├── MagicEightModal (portal-based DRM — props.conf Magic Eight audit)
    ├── SOARInfoModal
    ├── TechStackModal (dev mode only)
    ├── ConfigViewerModal (dev mode only)
    ├── FeedbackModal
    └── RemoveAllConfirmation
```

---

## 8. Filter Pipeline

The UI implements a sophisticated multi-stage filter pipeline. Each stage
narrows the product list further:

### Stage 1: Portfolio Filter (`portfolioProducts`)

```javascript
// State: showFullPortfolio (boolean, persisted in localStorage)
if (!showFullPortfolio) {
    // "SUPPORTED ONLY" mode:
    // Keep only cisco_supported + splunk_supported
    // Exclude under_development products
    base = base.filter(p =>
        SUPPORTED_LEVELS.has(p.support_level) && p.status !== 'under_development'
    );
}
```

Then visibility toggles further refine:
- `showRetired` (default: true) → hides/shows retired products
- `showDeprecated` (default: true) → hides/shows deprecated products
- `showComingSoon` (default: true) → hides/shows under_development
- `showGtmRoadmap` (default: true) → hides/shows coverage_gap products

### Stage 2: Category Filter

```javascript
if (selectedCategory === 'soar') filtered = filtered.filter(p => p.soar_connectors?.length > 0);
else if (selectedCategory === 'secure_networking') filtered = filtered.filter(p => p.secure_networking_gtm);
else if (selectedCategory) filtered = filtered.filter(p => p.category === selectedCategory);
```

### Stage 3: Subcategory Filter

```javascript
if (selectedSubCategory) filtered = filtered.filter(p => p.subcategory === selectedSubCategory);
```

### Stage 4: Cross-Cutting Filters

```javascript
if (aiFilter) filtered = filtered.filter(p => p.ai_enabled);
if (streamFilter) filtered = filtered.filter(p => p.netflow_supported);
if (sc4sFilter) filtered = filtered.filter(p => p.sc4s_supported);
```

### Stage 5: Search Filter

Deep keyword match across multiple fields:
```javascript
// Checks: keywords[], aliases[], display_name, tagline, description, vendor, product_id
const q = searchQuery.toLowerCase().trim();
filtered = filtered.filter(p => {
    if (p.keywords.some(k => k.includes(q) || q.includes(k))) return true;
    if (p.aliases.some(a => a.includes(q) || q.includes(a))) return true;
    return `${p.display_name} ${p.tagline} ${p.description}...`.toLowerCase().includes(q);
});
```

### Stage 6: Platform & Version Compatibility Filters

```javascript
// Platform: substring match on product_compatibility (e.g., "Splunk Cloud")
// Version: exact match on version_compatibility (e.g., "10.2")
// Both use getProductUids() to extract UIDs from Splunkbase URLs
// Then look up each UID in the splunkbaseData lookup table
```

### Stage 7: Addon Filter ("Powered By")

```javascript
if (selectedAddon === '__standalone__') filtered = filtered.filter(p => !p.addon && !p.sc4s_supported);
else if (selectedAddon === '__sc4s__') filtered = filtered.filter(p => !p.addon && p.sc4s_supported);
else filtered = filtered.filter(p => p.addon === selectedAddon);
```

### Stage 8: Section Assignment

After all filters, products are distributed into sections:
```
configuredProducts    → manually added by user (localStorage)
detectedProducts      → sourcetypes actively flowing (last 7 days)
availableProducts     → supported, not configured, not detected
unsupportedProducts   → support_level === 'not_supported'
comingSoonProducts    → status === 'under_development'
deprecatedProducts    → status === 'deprecated'
retiredProducts       → status === 'retired'
gtmGapProducts        → coverage_gap === true
```

---

## 9. Counter Logic

### Category pill counts

Computed as a `useMemo` starting from `portfolioProducts`:
1. Apply cross-cutting filters (stream, sc4s, ai)
2. Apply search filter
3. Apply platform/version compat filters
4. Count per category

The "All" count is the sum of the 4 category counts (excludes cross-cutting).

### Advanced filter counts

Three independent count bases, all starting from `allProducts` (full catalog):
1. Apply `applyCompatFilters()` for platform/version
2. Apply portfolio semantics (supported-only mode excludes unsupported + under_development)
3. Apply category filter

Then compute:
- **Support counts**: from catBase + visibility + onboarding (excludes support filter itself)
- **Visibility counts**: from catBase + support + onboarding (excludes visibility filters)
- **Onboarding counts**: from catBase + support + visibility (excludes onboarding filters)

This ensures each filter group shows what *would* be revealed by toggling.

### Search bar counts

- `totalCount`: `portfolioProducts.length` (pre-filter baseline)
- `resultCount`: `filteredProducts.length` (post-all-filters)
- Display: "42 products" or "12 of 42 products" (when filtering)

---

## 10. Splunkbase Compatibility System

### Data flow

```
S3 (public)                                     Splunk lookup
┌─────────────────────────────────────┐         ┌──────────────────────────────┐
│ is4s.s3.amazonaws.com/              │ ──curl──> │ lookups/                     │
│   splunkbase_assets/                │         │   scan_splunkbase_apps.csv.gz │
│     splunkbase_apps.csv.gz          │         └──────────────────────────────┘
└─────────────────────────────────────┘                    │
                                                 | inputlookup ...
                                                           ↓
                                                 splunkbaseData (React state)
                                                 uid → { version_compatibility,
                                                         product_compatibility,
                                                         app_version, title }
```

### Sync process

1. User clicks **Sync** button in Advanced filters
2. React runs `| downloadsplunkbasecsv input_csv=... output_csv=...` via
   app-namespaced REST endpoint
3. Python command downloads gzipped CSV from S3
4. Saves to `lookups/scan_splunkbase_apps.csv.gz`
5. React reloads data via `| inputlookup scan_splunkbase_apps`

### UID extraction

```javascript
function getProductUids(product) {
    const uids = new Set();
    // Extract UID from URLs like https://splunkbase.splunk.com/app/1234
    const addonUid = extractSplunkbaseUid(product.addon_splunkbase_url);
    const vizUid = extractSplunkbaseUid(product.app_viz_splunkbase_url);
    const viz2Uid = extractSplunkbaseUid(product.app_viz_2_splunkbase_url);
    if (addonUid) uids.add(addonUid);
    if (vizUid) uids.add(vizUid);
    if (viz2Uid) uids.add(viz2Uid);
    return [...uids];
}
```

### Version filtering logic

The version filter uses **multi-select checkboxes** (not a single dropdown).
`versionFilter` state is a `string[]`. When user selects e.g. "10.2" and "9.3":
1. For each product, extract all UIDs via `getProductUids()`
2. Look up each UID in the `splunkbaseData` lookup table
3. Split the `version_compatibility` field (pipe-delimited) into an array
4. Check if **any** selected version is an exact match in that array
5. Product passes filter if **any** of its UIDs match **any** selected version

```javascript
result = result.filter(p => {
    const uids = getProductUids(p);
    return uids.some(uid => {
        const entry = splunkbaseData[uid];
        if (!entry || !entry.version_compatibility) return false;
        const compat = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
        return versionFilter.some(v => compat.includes(v));
    });
});
```

### Platform filtering logic

Similar to version but uses **substring match** instead of exact match:
```javascript
return entry.product_compatibility.split(/[|,]/).map(v => v.trim())
    .some(pl => pl.toLowerCase().includes(platformFilter.toLowerCase()));
```

### Version checkbox population

Only versions > 9.0 are shown, collected from UIDs that belong to products
in the current view, sorted descending (latest first). Versions are grouped
by major version (10.x, 9.x) with group headers and custom-styled checkboxes
with left accent highlights. A "Clear" link resets the selection.

---

## 11. Data Flow Detection

### How it works

On page load, SCAN runs a Splunk metadata query to detect which products
have data actively flowing:

```spl
| metadata type=sourcetypes | where lastTime > relative_time(now(), "-7d")
| table sourcetype totalCount
```

This returns all sourcetypes with activity in the last 7 days.

### Matching logic

For each product, SCAN compares its `sourcetypes` field against the results.
Pattern matching supports:
- **Exact match**: `cisco:asa` matches `cisco:asa`
- **Prefix match**: `cisco:firepower:` matches `cisco:firepower:syslog`, etc.

Products with matching sourcetypes are placed in the **Detected Products**
section instead of **Available Products**.

### Display

Each detected product shows an event count and sourcetype summary:
> "3 sourcetypes active · 1.2M events"

---

## 12. Icon System

### Icon loading priority

1. **SVG icon** (`icon_svg` field):
   - Light mode: `icons/{name}.svg`
   - Dark mode: `icons/{name}_white.svg` (with transparent fallback)
2. **Emoji fallback** (`icon_emoji` field via `ICON_EMOJI_MAP`)
   - 32 product-specific emoji mappings
3. **Letter fallback**: First character of `display_name`

### Dark mode icon treatment

In dark mode, icons receive a CSS treatment:
- Frosted glass backdrop (`backdrop-filter: blur`)
- Cisco-blue glow (`box-shadow` with `#049fd9`)
- White drop-shadow on the icon image

### Icon count

97 total SVG icon files. Each product can have both a standard and a
`_white` variant for dark mode.

---

## 13. Theme System

### Three-state toggle

- **Auto**: Follow Splunk's user preference (detected via REST API + DOM)
- **Light**: Force light mode
- **Dark**: Force dark mode

Stored in `localStorage` key `scan_theme_preference`.

### Detection logic

1. Check DOM attributes: `data-theme="dark"` on `<html>` or `<body>`
2. Check CSS classes: `dark`, `theme-dark`
3. If inconclusive, fetch Splunk REST API: `data/user-prefs/general` → `theme` field
4. MutationObserver watches for dynamic theme changes

### CSS implementation

- Light mode: default CSS variables
- Dark mode: `:root.dce-dark` selector overrides all CSS variables
- SCAN adds/removes `dce-dark` class on `<html>` — never touches Splunk's `data-theme`

---

## 14. Modals & Overlays

| Modal | Trigger | Purpose |
|---|---|---|
| **PersonaModal** | Role button / first visit | Select a persona to auto-configure workspace filters |
| **BestPracticesModal** | Card button | Platform-aware tips, SC4S links, custom guidance (with copy-to-clipboard) |
| **LegacyAuditModal** | Legacy & compatibility on card | Legacy debt audit — apps to remove or migrate |
| **DataModelModal** | Card link | Data model mapping info |
| **SC4SInfoModal** | Onboarding / SC4S entry points | SC4S syslog ingestion overview |
| **NetFlowInfoModal** | Onboarding / NetFlow entry points | Four-package NetFlow / Splunk Stream install guide |
| **ESInfoModal** | ES Compatible badge / link | Enterprise Security compatibility — CIM models, ESCU context |
| **ITSIInfoModal** | ITSI badge / link | IT Service Intelligence content pack details |
| **HeavyForwarderModal** (`HFInfoModal`) | HF onboarding link | Heavy forwarder deployment guidance (Cloud vs Enterprise aware) |
| **CustomCardCreateModal** | Custom Products section | Create, clone, and edit custom product cards (implemented as `CustomProductFormModal`) |
| **DeleteCustomProductModal** | Delete on custom card | Confirm delete of a custom stanza from `local/products.conf` |
| **CardLegendModal** (Guide) | Guide button | Section layout and badge legend |
| **TechStackModal** | Dev mode button | React/Splunk UI version info (from webpack DefinePlugin) |
| **ConfigViewerModal** | Dev mode / card action | Raw `products.conf` stanza for selected product |
| **MagicEightModal** | Card button | Portal-based DRM — props.conf Magic Eight ingestion health audit |
| **AlertActionsInfoModal** | Alert Actions badge | Custom alert action details |
| **SOARInfoModal** | SOAR badge link | SOAR connector details and Splunkbase links |
| **FeedbackModal** | "Give Feedback" tab | In-app feedback form (writes to scan:feedback index) |
| **InfoTooltip** | Multiple info buttons | Persistent tooltip with pin + drag capability |
| **RemoveAllConfirmation** | Configured section | Confirm removal of all configured products |

### Portal-Based Resizable Modal (DRM Pattern)

The MagicEightModal uses `ReactDOM.createPortal` to render directly to
`document.body`, bypassing `@splunk/react-ui/Modal`'s react-spring
`animated.div` which caches style props and prevents resize.

**Implementation:**
- `position: fixed` overlay with backdrop (`scan-drm-overlay`)
- Drag-to-move via header (`cursor: move`)
- Resize from SE corner handle (`scan-modal-resize-handle`)
- ESC key to close, backdrop click-away
- `opacity: 0.85` during drag/resize for visual feedback
- State: `size {w, h}`, `pos {x, y}`, `isDragging`, `isResizing`
- Three `useEffect` hooks: drag movement, resize movement, ESC handler

### InfoTooltip

A custom component used across the UI for contextual help. Features:
- Click to pin (stays open)
- Drag to reposition
- Auto-dismiss on click-away when unpinned
- Configurable width, delay, placement

---

## 15. Props.conf Audit (Magic Eight)

SCAN includes a **Magic Eight** props.conf health check feature that audits
ingestion configuration for each product's sourcetypes.

### The Eight Settings

| # | Setting | Nickname | Why It Matters |
|---|---|---|---|
| 1 | `SHOULD_LINEMERGE` | The Gatekeeper | Must be `false` — eliminates heavy line-merge CPU overhead |
| 2 | `TIME_FORMAT` | The Timekeeper | Explicit `strptime()` — avoids datetime.xml cascade |
| 3 | `LINE_BREAKER` | The Surgeon | Regex event boundary — replaces line-merge heuristics |
| 4 | `TRUNCATE` | The Bouncer | Raised limit for large events — prevents silent truncation |
| 5 | `TIME_PREFIX` | The Spotter | Narrows timestamp search — reduces false-positive parsing |
| 6 | `MAX_TIMESTAMP_LOOKAHEAD` | The Leash | Caps character scan width — prevents runaway parsing |
| 7 | `ANNOTATE_PUNCT` | (punct off) | Set `false` — skips `punct::` annotation (CPU + disk savings) |
| 8 | `LEARN_SOURCETYPE` | (trust sourcetype) | Set `false` — trust assigned sourcetype; no auto re-classification |

### Audit SPL
```spl
| btool props list --debug
| rex "^(?<conf_file>[^\s]+)\s+\[(?<sourcetype>[^\]]+)\]"
| search sourcetype IN (cisco:*, meraki:*, ...)
| stats values(SHOULD_LINEMERGE) as SLM ...
```

### MagicEightModal
The UI modal uses the portal-based DRM pattern (see [Section 14](#14-modals--overlays)).
Content includes educational material: SHOULD_LINEMERGE cost math (60% CPU
reduction), datetime.xml tax, Recipe Principle, Cascade effect, Precision
Chain diagram, and an example stanza.

Full documentation: `docs/The_Magic_Eight.md`

---

## 16. Indexer Tier Detection

### How it works

`detectIndexerTierApps()` runs a REST query to find add-ons deployed on
non-search-head servers (indexers/heavy forwarders):

```spl
| rest splunk_server=* /services/apps/local
| search splunk_server!=<search_heads>
| stats latest(version) as version, max(is_disabled) as disabled,
        dc(splunk_server) as indexerCount by title
```

### Per-card states

| State | Condition | Badge |
|---|---|---|
| `deployed` | Addon found on indexers, version matches SH | Green checkmark |
| `mismatch` | Addon found but version differs from SH | Amber warning |
| `missing` | Addon not found on any indexer | Yellow caution |
| `disabled` | Addon deployed but `is_disabled=1` | Red alert (🔴 IDX Disabled) |

### State management

`indexerApps` state:
- `null` — loading (spinner shown)
- `{}` — no indexer-tier servers found
- `{appId: {version, disabled, indexerCount}}` — per-app status

Badges shown in both collapsed card summary chips and expanded dependency section.

---

## 16a. Runtime Search Inventory

Every search/API call the UI makes, when it fires, and its `splunk_server` scope:

### On App Load (8 calls)

| # | What | Endpoint / SPL | splunk_server Scope | Mode |
|---|---|---|---|---|
| 1 | Load product catalog | `GET /servicesNS/-/splunk-cisco-app-navigator/configs/conf-products` | local (implicit) | REST GET |
| 2 | List all installed apps | `GET /services/apps/local` | local (implicit) | REST GET |
| 3 | Platform detection | `GET /services/server/info` | local (implicit) | REST GET |
| 4 | App version + build | `GET /services/apps/local/splunk-cisco-app-navigator` | local (implicit) | REST GET |
| 5 | Splunk theme preference | `GET /servicesNS/-/-/data/user-prefs/general` | local (implicit) | REST GET |
| 6 | Sourcetype detection | `\| metadata type=sourcetypes index=*` | `*` (all indexers) | Oneshot |
| 7 | Indexer tier app detection | `\| rest splunk_server=* /servicesNS/-/-/apps/local` + indexer role filter | `*` filtered to indexers | Background + poll |
| 8 | Splunkbase lookup | `\| inputlookup scan_splunkbase_apps.csv.gz` | local (lookup file) | Oneshot |

### On User Action (6 calls)

| # | What | Triggered By | splunk_server Scope | Mode |
|---|---|---|---|---|
| 9 | Magic Eight props.conf audit | User clicks Best Practices | `local` (standalone) or `*` filtered to indexers (distributed) | Oneshot |
| 10 | Save custom dashboard | User sets custom dashboard | local (implicit) | REST POST |
| 11 | Create custom product | User creates custom card | local (implicit) | REST POST |
| 12 | Update custom product | User edits custom card | local (implicit) | REST POST |
| 13 | Delete custom product | User deletes custom card | local (implicit) | REST DELETE |
| 14 | Submit feedback | User submits feedback | local (implicit) | Oneshot |

**Key design decisions:**
- Only searches #6, #7, and #9 (distributed mode) fan out to `splunk_server=*`
- Search #7 is skipped on Splunk Cloud (indexers unreachable via REST)
- Search #9 excludes system apps: `system`, `learned`, `_cluster_manager_app`, `splunk_ingest_actions`, `SplunkUniversalForwarder`, `SplunkForwarder`, `SplunkDeploymentServerConfig`, `Splunk_SA_CIM`, `python_upgrade_readiness_app`, `splunk_instrumentation`, `splunk_internal_metrics`, `splunk_monitoring_console`, `splunk_secure_gateway`

---

## 16b. Custom Product Cards

Users can author **custom product cards** that behave like first-class catalog entries:

- **Creation** — The **CustomCardCreateModal** flow (implemented as `CustomProductFormModal` in `index.jsx`) captures stanza fields; new cards appear in the **Custom Products** section and participate in search and filters like Cisco-defined products.
- **Persistence** — Stanzas are written to **`local/products.conf`**, so they survive app upgrades (unlike edits under `default/`).
- **Clone** — Any existing Cisco card can be cloned as a starting point for a custom stanza (IDs and labels adjusted in the form).
- **Lifecycle** — Edit, delete, and **Add to Configured Products** work the same as for built-in cards; delete removes the stanza from `local/products.conf` after confirmation.
- **Parity** — Custom cards receive the same UX affordances as catalog cards where applicable: installation detection, sourcetype / data-flow chips, indexer-tier badges, cross-cutting badges, and compatibility surfaces driven by the fields you set.

---

## 16c. ES Compatible Badge System

The **ES Compatible** badge marks integrations whose data is suitable for **Splunk Enterprise Security (ES)** workflows.

- **Two tiers** — **Tier 1:** out-of-the-box ESCU (Splunk Enterprise Security Content Update) detections or stories where the TA participates. **Tier 2:** CIM data model mapping so the data can power ES data models, correlations, and dashboards even when a specific ESCU story is not listed on the card.
- **`es_compatible = true`** — Indicates the product’s data is intended to participate in ES (subject to your deployment and CIM alignment).
- **`es_cim_data_models`** — Lists the **CIM data models** the TA maps to (e.g. Network Traffic, Authentication), surfaced in `ESInfoModal`.
- **Coverage** — As of v1.0.23, **36** catalog products carry the SecOps badge; counts may change as the catalog evolves.
- **Tooltip** — “CIM-compliant products ready for Enterprise Security — includes OOB detections where available.”

---

## 17. Catalog Vault

Products with `catalog_disabled: true` in `products.conf` are excluded from
the main catalog and rendered in a separate **Catalog Vault** section.

### How it works

1. `generate-catalog.js` includes `catalog_disabled` field in generated catalog
2. `index.jsx` separates products: `vaultProducts` vs active catalog
3. Vault section shown below main product sections with distinct styling
4. Vault products are excluded from all filter counts and category pills
5. Useful for temporarily hiding products without removing their stanzas

---

## 18. Configuration Files

### `app.conf`
App identity, version (1.0.23), supported themes, launcher description.
`reload.products = simple` enables hot-reload via `_reload` endpoint.

### `products.conf`
The product catalog — see [Section 4](#4-product-catalog).

### `savedsearches.conf`
42+ saved searches — see [Section 21](#21-saved-searches).

### `props.conf`
Reference implementation of **Magic Eight** ingestion settings for SCAN’s own
log sources (`synclookup`, `synccatalog`). Each governed stream uses a
**source** stanza for index-time Magic Eight; the **sourcetype** stanza adds
search-time extractions only.

| Setting | Value | Purpose |
|---|---|---|
| SHOULD_LINEMERGE | false | Skip expensive line-merging |
| LINE_BREAKER | `([\n\r]+)\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}` | Event boundary |
| TRUNCATE | 9999 | Non-default truncation reviewed for log lines |
| TIME_FORMAT | %Y-%m-%d %H:%M:%S%z | Explicit strptime |
| TIME_PREFIX | ^ | Timestamp at start of line |
| MAX_TIMESTAMP_LOOKAHEAD | 24 | Cap scan width |
| ANNOTATE_PUNCT | false | Disable punct:: annotation |
| LEARN_SOURCETYPE | false | Trust assigned sourcetype |

Search-time field extractions: `log_level`, `logger_name`, `message`.

### `transforms.conf`
Lookup table definitions:
- `scan_splunkbase_apps`: points to `scan_splunkbase_apps.csv.gz`

### `commands.conf`
Registers the `downloadsplunkbasecsv` custom search command (Python 3, generating).

### `searchbnf.conf`
Search assistant syntax for `downloadsplunkbasecsv` — provides inline help
in Splunk's search bar.

### `default.meta`
Metadata and permissions:
- Base: `export = none` (app-private by default)
- `[props] export = system` — field extractions work globally
- `[transforms] export = system` — lookups available everywhere

### `distsearch.conf`
Distributed search configuration for search head clustering.

---

## 19. Custom Search Command

### `downloadsplunkbasecsv`

**Type:** Generating command (Python 3)
**Library:** splunklib 2.1.1 (bundled)
**Source:** `bin/download_splunkbase_csv.py`

### Usage
```spl
| downloadsplunkbasecsv input_csv=splunkbase_assets/splunkbase_apps.csv.gz output_csv=scan_splunkbase_apps.csv.gz
```

### What it does
1. Downloads gzipped CSV from `https://is4s.s3.amazonaws.com/{input_csv}`
2. Saves to `$SPLUNK_HOME/etc/apps/splunk-cisco-app-navigator/lookups/{output_csv}`
3. Returns status, bytes written, and file info as search results
4. Logs all activity to `$SPLUNK_HOME/var/log/splunk/download_splunkbase_csv.log`

### Logging
Uses a custom `_UTCFormatter` class that always emits UTC timestamps with
`+0000` suffix, regardless of system timezone. Log format:
```
2026-03-06 03:53:24+0000 [INFO] downloadsplunkbasecsv - Wrote 4031474 bytes...
```

---

## 20. Logging & Observability

### Log pipeline

```
download_splunkbase_csv.py
  └── FileHandler → /var/log/splunk/download_splunkbase_csv.log
                          │
                          ▼ (Splunk monitors internal logs)
                    source::...download_splunkbase_csv.log
                          │
                          ▼ (props.conf source stanza)
                    sourcetype = scan:downloadsplunkbasecsv:log
                          │
                          ▼ (props.conf sourcetype stanza)
                    EXTRACT-log_level, EXTRACT-logger_name, EXTRACT-message
```

### Searching the logs

```spl
index=_internal sourcetype="scan:downloadsplunkbasecsv:log"
| table _time log_level logger_name message
```

### Why `export = system` matters

Without `[props] export = system` in `default.meta`, the EXTRACT-* rules
would only apply when searching from within the SCAN app. With the export,
field extractions work from any app context (e.g., the `search` app).

---

## 21. Saved Searches

`default/savedsearches.conf` defines **42** active `[SCAN - …]` saved searches (v1.0.23). The comments in that file group them by purpose; stanza titles and SPL are authoritative.

**Product catalog & Splunkbase gap analysis**
- **SCAN - Product Catalog - Full Dump**, **SCAN - Product Catalog - By Category**, **SCAN - Product Catalog - By Add-on Family**
- **SCAN - SOAR Connector Inventory**, **SCAN - Sourcetype Coverage**, **SCAN - Data Quality - Missing Fields Audit**
- **SCAN - Gap Analysis - Splunkbase vs Catalog**

**Legacy, migration, and estate**
- **SCAN - Legacy App Inventory**, **SCAN - Archived App Inventory**, **SCAN - Deprecated Migration Map**
- **SCAN - Installed Apps vs Catalog**, **SCAN - Installed vs Splunkbase - Full Estate Audit**, **SCAN - Install Footprint by Category**

**Ecosystem summary & Splunkbase intelligence**
- **SCAN - Ecosystem Summary**
- **SCAN - Splunkbase Ecosystem Overview**, **SCAN - Splunkbase Category Breakdown**, **SCAN - Support Level Distribution**, **SCAN - Support x Category Heatmap**, **SCAN - Download Popularity Ranking**
- **SCAN - All Apps and Add-ons Involved**, **SCAN - Cisco Splunkbase Ecosystem**, **SCAN - Cisco Splunkbase Apps Detailed**, **SCAN - Release History Explorer**
- **SCAN - Cisco and Splunk Supported Apps**

**Readiness, compatibility, and compliance**
- **SCAN - Deployment Readiness**, **SCAN - Platform Compatibility Matrix**, **SCAN - Version and Update Tracker**, **SCAN - App Age Analysis**, **SCAN - Splunk Version Compatibility**
- **SCAN - CIM Compatibility Report**, **SCAN - Validation and AppInspect Status**, **SCAN - Compliance Status (FedRAMP and FIPS)**
- **SCAN - Compatibility Debugger - Platform**, **SCAN - Compatibility Debugger - Version**
- **SCAN - Product Version Support Matrix**, **SCAN - Products WITHOUT Version Support**

**Coverage & cross-reference**
- **SCAN - Sourcetype Cross-Reference**, **SCAN - Cisco Products Coverage Matrix**

**Magic Eight, health, and command telemetry**
- **SCAN - Magic Eight Audit**, **SCAN - Environment Health Summary**, **SCAN - Command Logs**

**Scheduled**
- **SCAN - Splunkbase Catalog Sync** — scheduled Splunkbase CSV sync into `scan_splunkbase_apps`

A commented-out **GTM Roadmap by Pillar** block remains in the file for optional dashboard use; it is not an active stanza.

---

## 22. Ecosystem Intelligence Dashboard

### Overview

`ecosystem_intelligence.xml` is a **Dashboard Studio v2** dashboard providing
portfolio analytics for the Cisco ecosystem (~125 apps, 53 live + 72 archived).

### Two tabs

| Tab | Focus | Content |
|---|---|---|
| **Product Intelligence** | `products.conf` catalog | Ecosystem Health KPIs (9), Portfolio Analysis (category/status/support charts), SOAR Inventory, Add-on Families, Data Quality Audit |
| **Splunkbase & Operations** | Cisco Splunkbase data | Cisco Splunkbase KPIs (live/archived/downloads), Freshness/Platform/Downloads charts, Installed Estate, Version Tracker, Migration, Compliance |

### Data sources

28 total: 2 base searches + 16 chain searches + 10 standalone.

- Base: `SCAN - Ecosystem Summary` (products.conf) + `SCAN - Cisco Splunkbase Ecosystem` (filtered Splunkbase)
- Chain searches use `"type": "ds.chain"` with `extend` in `options` (Splunk 10 requirement)
- All data filtered exclusively to Cisco ecosystem apps

### Visualizations

34 total: 10 section headers, 12 KPIs, 6 charts (pie/column/bar), 6 tables.
Each table has color-coded headers (Cisco blue, amber, purple, orange, red, green, teal).

---

## 23. Navigation Menu

The `default.xml` nav file defines:
- **Default view**: "Cisco Products" (the main `products` dashboard)
- **Ecosystem Intelligence**: Dashboard Studio v2 analytics dashboard
- **Analytics & Reports**: 8 collections matching the saved search categories
- **"All Reports" link**: Opens the standard Splunk reports page
- **Search link**: External link to the search app
- **Datasets view**: Standard Splunk datasets

---

## 24. Developer Mode

Type `devmode` in the search bar to toggle developer mode on/off.
Persisted in `localStorage`.

For lighter-weight GTM/roadmap visibility without vault or dev tooling, see [Section 24a (GTM Mode)](#24a-gtm-mode).

### Features

- **Dev Mode Banner**: Pulsing "DEVELOPER MODE" strip at top
- **Config Viewer**: Right-click any card to see its raw `products.conf` stanza
- **Tech Stack Modal**: Shows all React/Splunk UI dependency versions
  (injected via webpack's `DefinePlugin` at build time)
- **Dev Toast**: Brief notification when mode toggles

---

## 24a. GTM Mode

Type **`gtmmode`** in the search bar to toggle GTM (go-to-market) preview mode on/off (same persistence pattern as developer mode).

**Behavior:**
- **Surfaces** — Makes **Coming Soon** and **GTM Roadmap** sections and related ribbon content visible according to GTM rules.
- **Auto-expand** — Those sections **expand automatically** so internal roadmap and “coming soon” cards are immediately visible.
- **Support levels** — All support levels are shown, including **`not_supported`**, so nothing is hidden behind the default “supported portfolio” filter for this session.
- **Relationship to devmode** — **`devmode` is a superset**: it shows the Catalog Vault, developer tools (config viewer, tech stack modal), **and** everything **gtmmode** reveals. Use **gtmmode** when you only need GTM/roadmap visibility without vault or dev tooling.

---

## 25. CSS Architecture

### File: `products.css` (~7,600+ lines)

All styles in a single file. No CSS modules or CSS-in-JS (beyond styled-components
from Splunk UI components).

### Key patterns

**CSS Variables for theming:**
```css
:root {
    --card-bg: #fff;
    --card-border: #e0e0e0;
    --page-color: #333;
    /* ... 30+ variables ... */
}
:root.dce-dark {
    --card-bg: #1a1a2e;
    --card-border: #2a2a3e;
    --page-color: #e0e0e0;
    /* ... dark overrides ... */
}
```

**Dark mode icon treatment:**
```css
:root.dce-dark .csc-product-icon img {
    filter: drop-shadow(0 0 8px rgba(4, 159, 217, 0.4));
}
```

**Filter pill system:**
- `.csc-filter-pill-icon` — white filter for SVG icons in dark mode
- `.csc-subcategory-pill` — base pill style with animated slide-in
- `.csc-support-pill-*` — colored pills per support level
- `.csc-visibility-pill-on/off` — toggle-style visibility pills
- `.csc-compat-select` — dropdown styling for platform/version selects
- `.scan-drawer-*` — Sidebar Drawer and advanced filter styles
- `.scan-idx-tier-badge`, `.scan-idx-chip-*` — Indexer tier badges
- `.scan-drawer-version-*` — Multi-select version checkboxes with groups
- `.scan-drawer-addon-*` — Powered By addon list with count badges
- `.scan-drm-overlay`, `.scan-modal-resize-handle` — Portal-based DRM modal

**CiscoSansTT font:**
```css
@font-face {
    font-family: 'CiscoSansTT';
    src: url('fonts/CiscoSansTTRegular.woff2') format('woff2');
}
```

---

## 26. Technology Stack & Constraints

| Component | Version | Constraint |
|---|---|---|
| React | 16.14.0 | **DO NOT upgrade** — `@splunk/react-ui@5.8.0` requires React 16. Splunk's SDK pins `^16.12.0`. Upgrading to React 17/18 would cause peer dependency failures. |
| @splunk/react-ui | 5.8.0 | Splunk's official UI component library |
| @splunk/themes | 1.5.0 | Theme provider for Splunk UI |
| @splunk/splunk-utils | 3.4.0 | URL creation, CSRF tokens |
| styled-components | 5.3.11 | **DO NOT upgrade past 5.x** — v6 drops the `.attrs` API that Splunk UI relies on |
| Webpack | 5.105.2 | Standard build tool |
| splunklib (Python) | 2.1.1 | Bundled in `bin/splunklib/` for the custom command |
| Simple XML | 1.1 | Splunk dashboard framework |
| Node.js | 18+ | Build requirement |
| Yarn | 1.x | Package manager (workspace mode) |

---

## 27. Deployment & Operations

### Local development

```bash
# Symlink stage/ into Splunk
ln -s "$(pwd)/packages/splunk-cisco-app-navigator/stage" \
      /opt/splunk/etc/apps/splunk-cisco-app-navigator

# Build
cd packages/splunk-cisco-app-navigator && node bin/build.js build

# Changes visible immediately (Cmd+Shift+R in browser)
```

### When restart is required

| Change | Restart? |
|---|---|
| JS/JSX, CSS, products.conf | No — build + hard refresh |
| props.conf, transforms.conf | **Yes** |
| commands.conf, searchbnf.conf | **Yes** |
| metadata/default.meta | **Yes** |
| Python command code | **Yes** (or `splunk cmd python3` to test) |

### Packaging for Splunkbase

```bash
cd packages/splunk-cisco-app-navigator && bash bin/package_app.sh
```

Creates a `.tar.gz` file suitable for upload to Splunkbase or deployment
via Splunk Cloud's self-service tools.

### S3 data source

The Splunkbase CSV catalog is hosted at:
```
https://is4s.s3.amazonaws.com/splunkbase_assets/splunkbase_apps.csv.gz
```
- Public bucket, no authentication required
- No CORS headers (server-side download via Python command only)
- ~4MB gzipped, contains all Splunkbase app metadata

---

## 28. Utility Scripts

The `scripts/` directory contains 84 Python utility scripts for catalog
maintenance, auditing, and data management:

| Category | Scripts | Purpose |
|---|---|---|
| **Audit** | `audit_sourcetypes.py`, `audit_card_appearance.py`, `audit_support_level.py`, etc. | Validate product catalog completeness |
| **Normalize** | `normalize_products_conf.py`, `resort_products.py` | Format and sort products.conf |
| **Bulk Update** | `update_sort_keywords_v2.py`, `add_conf_fields.py` | Batch field updates |
| **Analysis** | `analyze_fields.py`, `analyze_gtm_coverage.py` | Catalog analytics |
| **Migration** | `rename_ccc_to_scan.py` | Rename from old "CCC" branding |
| **Presentation** | `gen_pptx_cisco.py` | Generate Cisco-branded PPTX |
| **CSV** | `audit_csv_vs_conf.py`, `fix_csv.py` | CSV catalog management |

**Note:** `update_sort_keywords.py` (v1) is broken — use `update_sort_keywords_v2.py` instead.

---

## 29. Git Workflow

| Remote | Host | URL |
|---|---|---|
| `origin` | GitHub | `https://github.com/splunk/splunk-cisco-app-navigator.git` |

**Default branch:** `main`

**Workflow:** All development happens on GitHub. Feature branches follow the `TENG-<Jira Number>` naming convention and merge to `main` via pull request.

The app was previously hosted on GitLab (cd.splunkdev.com) and before that at a separate "Cisco Control Center" repo — both have been archived. All development now happens on GitHub.

### Branching Convention

Branch names **must** follow the pattern `TENG-<Jira Number>` (e.g., `TENG-2573`).
All feature work stays on the Jira branch until it is ready to merge to `main`.

### Stacked / Topic Commits (Preferred)

Instead of committing all changes at once, group related changes into small,
atomic commits so each one can be reverted independently:

```bash
# Example: separate build fixes from UI polish
git add bin/build.js webpack.config.js app.conf
git commit -m "fix: simplify build hash stamping, inject via DefinePlugin"

git add products.css index.jsx
git commit -m "fix: modal link styling, peek icon tooltip, dark mode text"

git add products.conf
git commit -m "chore: bump products.conf version timestamp"
```

Benefits:
- `git revert <hash>` removes one logical change without touching the rest.
- `git log --oneline` reads like a changelog.
- Code review is easier — each commit tells a self-contained story.

Rule of thumb: if the commit message needs the word "and" to describe two
unrelated things, split it into two commits.

### Pre-Feature Tags (Future Use)

Tags are lightweight bookmarks on a specific commit. They are useful as
rollback anchors before starting a risky feature:

```bash
# Create a tag before starting a big feature
git tag pre-secops-badges

# ... develop the feature ...

# If everything goes wrong, reset to the tag
git reset --hard pre-secops-badges

# List all tags
git tag -l

# Delete a tag when no longer needed
git tag -d pre-secops-badges
```

Tags stay local unless explicitly pushed (`git push origin <tag>`).
They do not create branches or affect the working tree — think of them
as named snapshots you can jump back to.

### Quick Reference

| Task | Command |
|---|---|
| Stash work-in-progress | `git stash push -m "WIP: description"` |
| Resume stashed work | `git stash pop` |
| Revert a single commit | `git revert <hash>` |
| Tag current state | `git tag <name>` |
| View recent history | `git log --oneline -20` |
