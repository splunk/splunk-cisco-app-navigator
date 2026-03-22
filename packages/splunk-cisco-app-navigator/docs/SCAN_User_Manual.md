# Splunk Cisco App Navigator — User Manual

**Version:** 1.0.19 · **Last Updated:** March 22, 2026

---

## Table of Contents

1. [Overview](#1-overview)  
2. [Installation](#2-installation)  
3. [Product Catalog](#3-product-catalog)  
4. [Finding Products](#4-finding-products)  
5. [Working with Product Cards](#5-working-with-product-cards)  
6. [Intelligence Badges](#6-intelligence-badges)  
7. [Special Modals](#7-special-modals)  
8. [Custom Product Cards](#8-custom-product-cards)  
9. [Copy to Clipboard](#9-copy-to-clipboard)  
10. [Dark Mode](#10-dark-mode)  
11. [Ecosystem Intelligence Dashboard](#11-ecosystem-intelligence-dashboard)  
12. [Saved Searches & Reports](#12-saved-searches--reports)  
13. [Splunkbase Catalog Sync](#13-splunkbase-catalog-sync)  
14. [Performance & Splunk Cloud Considerations](#14-performance--splunk-cloud-considerations)  
15. [Troubleshooting](#15-troubleshooting)  
16. [Configuration Reference](#16-configuration-reference)  

---

## 1. Overview

**Splunk Cisco App Navigator (SCAN)** is a Splunk application that provides a **unified glass pane** for discovering, deploying, and managing Cisco Splunk integrations. It is designed for Splunk administrators who own Cisco data onboarding, add-on deployment, and operational health across the Cisco portfolio.

### What SCAN does

- **Discover** supported Cisco products, add-ons, sourcetype expectations, and documentation from one place.  
- **Deploy** by jumping to Splunkbase, checking versions, and understanding prerequisites.  
- **Manage** by seeing which add-ons are installed, whether data is flowing, and how configuration aligns with best practices.

The catalog covers **93 Cisco products** spanning **Security**, **Networking**, **Observability**, and **Collaboration**. The primary experience is a **single-page React application** embedded in Splunk, so you work inside the familiar Splunk UI without switching contexts.

---

## 2. Installation

### Where to install

Install SCAN on a **search head** or, in a **search head cluster (SHC)**, deploy it from your **SHC deployer** so all members receive the app.

### Supported platforms

- **Splunk Enterprise** 9.0 and later  
- **Splunk Cloud**

### After installation

1. Open the **Splunk Cisco App Navigator** app from the Splunk app bar.  
2. In the app navigation, choose **Cisco Products** (the default view).  
3. On first launch, a **welcome card** orients you to key actions—search, filters, adding products to your workspace, and opening documentation.

> **Tip:** Ensure the app is **enabled** for the roles that should use it (typically admin or a dedicated integration team role).

---

## 3. Product Catalog

Each Cisco integration is represented as an **intelligent product card**. Cards surface **live context** from your environment (where supported), not only static text.

### What each card shows

- **Product name** and positioning (including tagline / value text where configured).  
- **Add-on status**—whether the expected Splunk add-on is present and its version relative to Splunkbase metadata.  
- **Data flow** indicators derived from sourcetype activity in your indexes.  
- **Badges** for ecosystem features (ES, SOAR, ITSI, SC4S, NetFlow, and more—see [Section 6](#6-intelligence-badges)).  
- **Sourcetypes** associated with the product, used for detection and audits.

### How products are organized

The page groups cards into sections:

| Section | Purpose |
|--------|---------|
| **Configured Products** | Your working set—products you have added for quick access. **Persisted in the browser** (per user / per browser profile). |
| **Available Products** | Supported integrations you can deploy or evaluate. |
| **Coming Soon** | Products under active development or not yet generally available in the catalog sense shown here. |
| **Deprecated** | Add-ons or paths being sunset; plan migration. |
| **Retired** | End-of-life Cisco products—historical context only. |
| **Custom Products** | Cards **you** define for internal or non-catalog integrations (see [Section 8](#8-custom-product-cards)). |

Sections can be **expanded or collapsed** to reduce noise when you are focused on one part of the portfolio.

---

## 4. Finding Products

SCAN combines **free-text search**, **high-level category filters**, **cross-cutting capability pills**, and a **filters sidebar** so you can narrow hundreds of catalog terms down to a short list.

### Search bar

The search field matches across a large keyword index (**725+ terms**), including:

- Product display names and aliases  
- Sourcetypes  
- Descriptions and related catalog text  

Type a vendor name, product family, sourcetype, or concept (for example “ISE”, “firewall”, “sourcetype:cisco:asa”).

### Category pills

Quick filters:

- **All**  
- **Security**  
- **Networking**  
- **Observability**  
- **Collaboration**

### Cross-cutting filter pills

Narrow to products that share operational characteristics:

- **SC4S Ready** — documented for syslog via Splunk Connect for Syslog  
- **NetFlow** — NetFlow / flow-related collection patterns  
- **ES Ready** — CIM-oriented for Enterprise Security workflows  
- **ITSI** — ITSI content available  
- **SOAR** — Splunk SOAR connectors available  

### Filters sidebar

Use the sidebar for finer control:

- **Support level** and visibility options  
- **Platform / Splunk version** compatibility filters  
- **“Powered By”** add-on family filter (when you care about a specific technical add-on stack)  
- Additional toggles as provided in your SCAN version  

### Expand All / Collapse All

Use the **Expand All** or **Collapse All** control (and the documented **keyboard shortcut** where enabled) to open or close every catalog section at once—useful after a heavy filter pass.

---

## 5. Working with Product Cards

### Adding products

- Click **+ Add** on a card to move it into **Configured Products**.  
- Click **Remove** (or the equivalent control on configured cards) to move it back to the general catalog sections.

Configured Products are **workspace shortcuts**; they do not change Splunk’s installed apps by themselves.

### Installation actions

- **Install** opens **Splunkbase** for the **required** add-on (or primary add-on) for that product.  
- **Update** appears when Splunkbase metadata indicates a **newer** version than what SCAN detects locally.  
- **Launch** opens the product’s **dashboard or primary Splunk view** when one is defined for that card.

Always verify **compatibility** with your Splunk version and **deployment** model (on-prem vs. Cloud) on Splunkbase before installing.

### Data flow detection

SCAN evaluates whether expected **sourcetypes** have recent data:

- **Green** — matching sourcetype data found in the **last 7 days**.  
- **Yellow** — **no** matching data in that window (may be normal for lab systems, mis-tagged data, or wrong indexes/time range).

Detection uses Splunk metadata, conceptually aligned with:

```splunk
| metadata type=sourcetypes
```

Interpret yellow states as “no evidence of data,” not necessarily “broken”—confirm index access, inputs, and parsing.

### Indexer tier detection

For supported deployments, SCAN checks whether add-ons are present on the **search head** and the **indexer tier** (indexers or indexer peers as applicable).

| Badge / state | Meaning (simplified) |
|---------------|----------------------|
| **Deployed** (green) | Add-on detected where expected; versions align. |
| **Version Mismatch** (amber) | Present but **different versions** across tiers or vs. expected baseline. |
| **Missing** (yellow) | Not detected on indexers (or relevant tier) where required for parsing/index-time rules. |
| **Disabled** (red) | Add-on or related component treated as **disabled** or unusable in context. |

**Why it matters:** Many add-ons ship **`props.conf`** and **`transforms.conf`** that must apply **at index time**. If the add-on exists only on the search head, **indexed field extraction and line breaking** may not match vendor intent—leading to poor search, CIM alignment, or ES content pack behavior.

### Legacy app detection

When **deprecated legacy apps** are detected in your environment, SCAN can show a **red badge** on affected cards. Use the control to **review legacy app names** and **migration guidance** toward supported add-ons or architectures.

---

## 6. Intelligence Badges

Badges summarize **how** a product fits the broader Splunk ecosystem. Not every badge appears on every card.

| Badge | Meaning |
|-------|---------|
| **ES Ready** | **CIM-aligned** products suitable for **Splunk Enterprise Security**. Includes **out-of-the-box detections** where the catalog lists them. As of this manual, **34** products carry this designation (subject to catalog updates). |
| **SOAR** | **Splunk SOAR** connectors exist—click for connector details and Splunkbase links. |
| **ITSI** | **ITSI Content Packs** or related ITSI assets are available—click for specifics. |
| **AI-Powered** | Product or add-on leverages **ML/AI** capabilities in the Splunk or Cisco integration story. |
| **Alert Actions** | **Custom alert action** add-ons extend alerting or response workflows. |
| **NetFlow** | Product supports **NetFlow** (or related flow) collection patterns; often pairs with deeper NetFlow modal guidance. |
| **SC4S Ready** | Product includes **SC4S syslog** documentation or positioning for **Splunk Connect for Syslog**. |

Badges are **informational**: always confirm versions, data models, and ESCU content in your environment.

---

## 7. Special Modals

Modals provide **deep links**, **structured guidance**, and **audits** without leaving SCAN.

### Props.conf audit (Magic Eight)

Open **Best Practices** on a product card to run the **Magic Eight** audit:

- Reviews **eight critical `props.conf` settings** for the product’s sourcetypes.  
- Shows **deployment version alignment** (for example **search head vs. indexer tier**) when REST access allows.  
- Includes **educational copy** explaining **why** each setting matters for parsing, timestamps, and search reliability.

The eight settings evaluated are:

1. `SHOULD_LINEMERGE`  
2. `TIME_FORMAT`  
3. `LINE_BREAKER`  
4. `TRUNCATE`  
5. `TIME_PREFIX`  
6. `MAX_TIMESTAMP_LOOKAHEAD`  
7. `ANNOTATE_PUNCT`  
8. `LEARN_SOURCETYPE`  

Use this modal when onboarding a new data source or when search-time fields “look wrong.”

### SC4S modal

Explains **Splunk Connect for Syslog (SC4S)** integration for the product and links to **SC4S documentation** for syslog architecture, filters, and deployment patterns.

### NetFlow modal

Describes the **multi-package NetFlow / Splunk Stream** solution (the **four-package** story in the catalog) and provides a **step-by-step installation** outline so forwarders, Stream, and NetFlow collectors land in a supportable order.

### ES compatibility modal

Covers how **CIM mapping** relates to **Enterprise Security**, including practical guidance such as:

- **Accelerate** relevant data models where appropriate.  
- Install the **technology add-on (TA)** before relying on ES content.  
- Keep **ESCU** and related content packs **current**.

### SOAR modal

Lists **SOAR connector** metadata and **Splunkbase** references for playbooks and app dependencies.

### ITSI modal

Summarizes **ITSI Content Pack** availability and points to **documentation** for KPIs, services, and deep dives.

### Heavy Forwarder modal

Provides **Heavy Forwarder** deployment guidance when that topology is recommended or common for the product (for example certain collection or API polling patterns).

---

## 8. Custom Product Cards

Custom cards let you represent **integrations beyond** the built-in Cisco catalog—lab gear, bespoke parsers, or internal-only sourcetypes—**with the same UX** as native cards.

### Creating cards

1. Scroll to **Custom Products**.  
2. Click **New Custom Card**.  
3. Optionally **clone** an existing Cisco card as a template (faster than starting empty).  
4. Complete fields such as **name**, **description**, **category**, **subcategory**, **add-on identity**, **sourcetypes**, and **keywords** for search.

### Managing cards

- **Edit** or **delete** custom cards at any time.  
- Custom cards participate in **data flow detection**, **badges** (where applicable), and the **Best Practices (Magic Eight)** audit like standard cards.

### Persistence

Custom definitions are stored in **`local/products.conf`** inside the app. That location **survives app upgrades** when you follow normal Splunk practices (do not replace `local` on upgrade).

---

## 9. Copy to Clipboard

Many cards and modals expose a **Copy** action. It places a **formatted text summary** on the clipboard—suitable for **email**, **runbooks**, **ticketing**, or **chat** with vendors or teammates. Use it when you need a concise, consistent description of a product’s add-ons, sourcetypes, and status.

---

## 10. Dark Mode

SCAN supports Splunk’s theming expectations:

- **Light** — fixed light palette.  
- **Dark** — fixed dark palette.  
- **Auto** — follows the **active Splunk theme** when available.

Use the **theme toggle** in the **toolbar** area of the Products page. **Cards, modals, badges, and charts** are styled for both themes so contrast and readability remain consistent.

---

## 11. Ecosystem Intelligence Dashboard

From the app menu, open **Ecosystem Intelligence**. This loads the **Cisco Ecosystem Intelligence** dashboard (Dashboard Studio), which complements the Products page with portfolio-level analytics.

### Tabs

1. **Product Intelligence** — portfolio analytics, category views, and operational angles tied to the catalog (including data-quality style summaries where implemented).  
2. **Splunkbase & Operations** — **Splunkbase**-centric analytics such as download and rating trends, freshness, and ecosystem comparisons for Cisco apps referenced by SCAN.

Use this dashboard when leadership or platform owners ask “how healthy is our Cisco Splunk footprint?” rather than “how do I configure one add-on?”

---

## 12. Saved Searches & Reports

SCAN ships **42+** prebuilt **saved searches**. Open **Analytics & Reports** in the app nav to browse grouped shortcuts; use **All Reports** for the full list.

Illustrative groupings:

| Collection | Example topics |
|------------|----------------|
| **Ecosystem Overview** | Executive summaries, full catalog dumps, involved add-ons |
| **Catalog Analysis** | Category slices, sourcetype coverage, SOAR inventory |
| **Migration & Legacy** | Legacy and archived app inventories |
| **Installation & Deployment** | Installed vs. catalog, deployment readiness |
| **Splunkbase Intelligence** | Splunkbase ecosystem views, support distribution |
| **Versions & Compliance** | Version trackers, CIM reports, AppInspect, FedRAMP/FIPS notes |
| **Data Coverage** | Coverage matrices tying data to products |

Additional operational reports (for example **Magic Eight** summaries, **environment health**, **command logs**) appear under **Health & Troubleshooting** and in **All Reports**. Schedule or embed them like any other Splunk saved search.

---

## 13. Splunkbase Catalog Sync

SCAN includes a **Splunkbase metadata lookup** used for **version** and **compatibility** checks in the UI.

- Use the **Sync** control in the **Filters sidebar** to **refresh** Splunkbase-derived fields on demand.  
- A **scheduled** saved search (**SCAN - Splunkbase Catalog Sync**) also **refreshes** metadata periodically—confirm schedule and permissions in **Settings → Searches, reports, and alerts** if your environment restricts outbound or scripted operations.

If Splunkbase data is stale, **Update** buttons and compatibility hints may lag until the next successful sync.

---

## 14. Performance & Splunk Cloud Considerations

### On page load

The Products experience issues approximately **eight API operations** during load—on the order of **five REST GET** requests plus **three searches** (exact mix may vary slightly by version).  

- **Sourcetype detection** and **indexer tier detection** are the main workloads that **fan out** toward indexing infrastructure.  
- Other calls typically stay on the **search head** REST layer.

### Splunk Cloud notes

| Capability | On-prem Enterprise | Splunk Cloud |
|------------|-------------------|--------------|
| **Sourcetype / metadata detection** | Supported | Supported via metadata-style searches |
| **Indexer tier badges** | Supported when peers are reachable | **Not supported** — REST to indexer tier is not exposed the same way; tier badges are skipped or limited |
| **Custom cards** | Written to `local/products.conf` | Written via **REST** to the same logical configuration |

Plan communications for Cloud users: **data detection** can be green/yellow, but **indexer tier** states may be absent—rely on **Splunk Cloud Admin** tooling and **support** for add-on deployment verification.

---

## 15. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| **Cards not loading** | Open the **browser developer console** for JavaScript errors. Perform a **hard refresh** (for example **Cmd+Shift+R** on macOS, **Ctrl+Shift+R** on Windows/Linux). |
| **Data not detected** | Confirm sourcetypes exist in **indexes your role can search**. Remember the **7-day** window. Verify inputs and **props/transforms**. |
| **Add-on shows “Not Installed”** | Verify the add-on is **installed and enabled** on **this search head** (or the SHC member you are using). |
| **Indexer tier shows “Missing”** | Deploy the add-on to **indexers** using **deployment server** or **cluster manager** / **peer bundle** patterns appropriate to your architecture. |
| **Stale CSS or UI assets** | Clear Splunk’s cached app static files, for example: `rm -rf $SPLUNK_HOME/var/run/splunk/appserver/i/splunk-cisco-app-navigator` then reload (adjust path on Windows). **Coordinate** with platform owners—this removes cached static assets only for this app’s hashed bundle. |
| **Props.conf audit errors** | Confirm **indexer peers** are reachable from the search head. **HTTP 503** often means a **peer** is **temporarily unavailable**—retry after cluster health recovers. |

If problems persist, capture **Splunk version**, **SCAN version**, **browser**, and **screenshots** of the card or modal for support.

---

## 16. Configuration Reference

Paths are relative to the app directory:  
`$SPLUNK_HOME/etc/apps/splunk-cisco-app-navigator/`

| File | Purpose |
|------|---------|
| `default/products.conf` | **Shipped catalog**—do **not** edit. Use **custom cards** or `local` overrides instead. |
| `local/products.conf` | **Custom product cards** and administrator overrides. Created as you save custom content. |
| `default/savedsearches.conf` | Prebuilt **saved searches** and schedules (including Splunkbase sync). |
| `README/products.conf.spec` | **Authoritative field specification** for every product card key SCAN understands—use this when advanced `local` tuning is required. |

For Splunk Cloud, manage files through **support-approved** configuration methods (for example **ACS** or admin REST), consistent with your organization’s change policy.

---

*This manual describes Splunk Cisco App Navigator as shipped. Feature availability may vary slightly by Splunk platform version and role permissions. For the latest release notes, refer to Splunkbase and your internal change management records.*
