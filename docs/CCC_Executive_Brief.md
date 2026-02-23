# Cisco Control Center (CCC)

**Codename:** "The Front Door"

**Strategic Objective:** To provide a single, unified "Glass Pane" for the Cisco-Splunk ecosystem that identifies legacy technical debt, guides version parity, validates data flow, and provides an "Easy Button" for product activation and modernization.

---

## Summary for Executive Leadership

> *"The Cisco Control Center is the App Store for the Cisco Ecosystem within Splunk. It doesn't just list apps — it audits the environment, identifies outdated 'Legacy Debt,' validates data pipelines, and provides a 'One-Click' path to modernization. We have moved from a 'Search and Hope' model to a 'Detect and Direct' model, ensuring the 'Network is Innocent' by default."*

---

## 1. The Problem: "The Paradox of Choice"

The "Systemic Mess" of dozens of Cisco apps on Splunkbase creates three critical friction points:

1. **The Selection Gap:** Customers cannot identify the "Official" source of truth. For example, Cisco Secure Firewall alone has 4+ legacy apps on Splunkbase (Splunk Add-on for Cisco FireSIGHT, eStreamer Client Add-On, Firepower eNcore App, and Cisco Secure Firewall App for Splunk).
2. **The Compatibility Gap:** Uncertainty around Splunk Cloud vs. On-Prem support and "Legacy vs. Modern" app overlap (e.g., the standalone Duo Splunk Connector vs. the consolidated Cisco Security Cloud app).
3. **The Health Gap:** A "Black Box" experience where empty dashboards offer no diagnostic path, leaving users unable to tell if the issue is the App, the TA, or the Data.

---

## 2. The Solution: The "Product Card" Interface

The CCC App introduces a **Product Catalog UI** — a card-based discovery model following the **IS4S (Insights Suite for Splunk) green design language**. Each Cisco product (ISE, Meraki, ASA, Duo, Nexus, etc.) is represented by an **intelligent card** that actively inspects the local Splunk environment and renders real-time status.

### Current Product Catalog (57 Products)

| Category         | Active | Coming Soon | Deprecated | Total |
|------------------|:------:|:-----------:|:----------:|:-----:|
| **Security**     | 23     | 4           | —          | 27    |
| **Observability**| 2      | —           | —          | 2     |
| **Networking**   | 15     | —           | —          | 15    |
| **Collaboration**| 3      | —           | —          | 3     |
| **Deprecated**   | —      | —           | 10         | 10    |
| **Total**        | **43** | **4**       | **10**     | **57**|

### Anatomy of a CCC Product Card

Each card is a self-contained intelligence unit with the following layers:

- **Product Identity** — Display name, tagline, vendor, category icon, and a ⓘ tooltip showing the product description and value proposition.
- **Intelligence Badges** — Real-time color-coded status indicators:
  - **✓ Add-on Installed** (green) / **⬇ Add-on Not Installed** (gray)
  - **✓ App Installed** (green) / **⬇ App Not Installed** (gray) — for products with separate visualization apps
  - **⬆ Add-on/App Update Available: vX.Y.Z** (orange) — when a newer version is detected via `apps/local`
  - **📊 Data Flowing (N events)** (green) — live event count from the last 24 hours
  - **📊 Data Found — No Add-on Detected** (orange) — orphaned data warning
  - **⚠ N Legacy Apps Detected** (red) — with hover tooltip showing each legacy app's name, app ID, and Splunkbase link
  - **SOAR** (purple) — Indicates a Splunk SOAR connector exists for this product (with Splunkbase link)
  - **ITSI** (blue) — Indicates an ITSI Content Pack is available (installed via ITSI Content Library, not Splunkbase)
  - **Alert Actions** (blue) — Companion alert action add-on available on Splunkbase
  - **Platform: Enterprise / Cloud** — Platform compatibility badge with SVG icon
- **Dependency Section** — Shows the required Splunk add-on (TA) and visualization app with:
  - Clickable Splunkbase links
  - Installed version number
  - Update availability indicator
  - Individual install/upgrade buttons per dependency
- **SOAR Connector Section** — When a product has a SOAR connector, a dedicated section shows the connector name with a link to Splunkbase. SOAR connectors run in Splunk SOAR (not Splunk Enterprise), so no install button is shown.
- **ITSI Content Pack Section** — When a product has an ITSI Content Pack, a dedicated section shows the pack name with a docs link and a note: "Install via ITSI → Configuration → Data Integrations → Content Library." ITSI may run on a dedicated search head.
- **Alert Actions Section** — When a product has companion alert actions, they are shown with Splunkbase links. Alert actions fire from Splunk saved searches, ES correlation searches, or notable events.
- **Community App Warning** — A collapsible "⚠ Third-party add-on detected" warning (with "+ Details" toggle) appears when a non-Cisco community add-on is installed that shadows the official Cisco TA. Advises migration to the official add-on.
- **Data Validation Warning** — When a product has defined sourcetypes but no data is detected in the last 24 hours, a yellow warning panel appears with a clickable link to run a `| metadata` search for those sourcetypes.
- **Action Buttons** — Compact icon-based buttons with full-text hover tooltips:
  - 🚀 **Launch (Split Button)** — Opens the installed app's dashboards in a new tab. Features a **split-button design** with a dropdown caret (▾) offering:
    - The default Cisco dashboard (showing the actual dashboard name, e.g. "Aid Dashboard")
    - A custom dashboard (if configured by the customer)
    - "Set Custom…" / "Edit Custom…" to configure a custom dashboard via modal
  - 📥 **Add-on / App** — Direct install link for the TA or visualization app
  - ⬆ **vX.Y.Z** (orange) — One-click upgrade button for the TA or visualization app
  - ➕ **Add** — Adds the product to "My Configured Products" (persisted in localStorage)
  - 💡 **Best Practices** — Opens a modal with platform-aware configuration guidance (Cloud vs. Enterprise)
  - 🗑 **Remove** — Removes the product from the configured workspace
  - ↗ **Learn More** — Links to the official Cisco product page

### Five Section Layout (IS4S-Inspired)

Products are organized into five collapsible panels with a clean, uniform design:

1. **Configured Products** — Products the admin has added to their workspace.
2. **Available Products** — Active products ready to configure.
3. **Coming Soon** — Products under development (Preview badge).
4. **Collaboration** — Collaboration platform products (Webex, CMS, CUCM).
5. **Deprecated / Archived** — Products referencing add-ons or apps that have been archived on Splunkbase. Each deprecated card shows a "Deprecated" chip and a "Replacement" chip linking to the modern successor.

---

## 3. Key Functional Pillars

### A. The Intelligent Search Bar (The "Universal Finder")

A high-speed, keyword-optimized search bar that anticipates user intent using the product catalog's keyword library (10+ keywords per product, 400+ total keywords across the catalog).

| Search Term   | Surfaces                                          |
|---------------|---------------------------------------------------|
| "Firewall"    | Cisco Secure Firewall (ASA/FTD), Security Cloud   |
| "Identity"    | ISE, Identity Intelligence (CII), Duo             |
| "SSE"         | Cisco Secure Access (SSE)                         |
| "Switching"   | Nexus Switches, ACI, Nexus Dashboard              |
| "Kubernetes"  | Isovalent (eBPF Runtime Security)                 |
| "Email"       | ETD, ESA, Email Security                          |
| "SD-WAN"      | Catalyst SD-WAN                                   |
| "XDR"         | Extended Detection and Response                   |

The search bar also displays a result counter (`N of M products`) and provides keyword suggestions as users type.

### B. Category Filter Bar

A horizontal pill-style filter bar that allows instant filtering by domain:

- **📋 All** — Full catalog (excludes SOAR/Alert cross-cuts from count)
- **🛡️ Security** — Firewalls, identity, threat detection, endpoint, email, cloud access
- **📊 Observability** — Monitoring, DEM, telemetry
- **🌐 Networking** — Campus, branch, WAN, data center, OT/ICS
- **🎧 Collaboration** — Meeting, messaging, calling platforms
- **📦 Deprecated** — Archived or deprecated products

**Cross-cutting filters** (separated by a vertical divider):
- **⚡ SOAR** — Shows only products with Splunk SOAR connectors (amber styling)
- **🔔 Alert Actions** — Shows only products with custom alert actions (blue styling)

Each filter pill shows a live count of matching products.

### C. The "Legacy Debt" Auditor

The CCC runs a background scan of the Splunk REST `/services/apps/local` endpoint and compares installed apps against the product catalog's `legacy_apps` manifest. Currently tracks legacy mappings for:

| Product            | Legacy Apps Detected                                              |
|--------------------|-------------------------------------------------------------------|
| Cisco Secure Firewall | Splunk TA for Cisco FireSIGHT, eStreamer Client, Firepower eNcore App, Secure Firewall App |
| Cisco Duo Security | Duo Splunk Connector                                             |
| Cisco ETD          | Cisco ETD Connector for Splunk                                   |
| Cisco SMA          | Cisco Secure Malware Analytics (standalone TA)                   |

**Legacy intelligence is surfaced at three levels:**

1. **Per-card badge** — Red "⚠ N Legacy Apps Detected" badge with hover tooltip showing names, app IDs (monospace), and clickable Splunkbase links.
2. **Legacy Audit Banner** — A persistent yellow banner at the top of the page when any legacy apps are detected, with a "View Report" button.
3. **Legacy Audit Modal** — A detailed report showing all detected legacy apps with migration guidance and Splunkbase links.

### D. Mean Time to Innocence (MTTI) — Data Validation

Every product card with defined sourcetypes performs a live SPL search (`earliest=-24h`) to validate data flow:

- **📊 Data Flowing (N events)** — Green badge confirming events are arriving and parsed.
- **📊 Data Found — No Add-on Detected** — Orange badge warning that data exists but the TA is not installed (orphaned data).
- **No data warning** — Yellow panel with a direct search link to investigate missing sourcetypes using `| metadata type=sourcetypes`.

### E. SOAR Connector Intelligence

Products with Splunk SOAR connectors display a purple **SOAR** badge and a dedicated "SOAR Connector" detail section. Currently tracks 10 products with SOAR connectors:

| Product | SOAR Connector |
|---------|---------------|
| Cisco Secure Endpoint | Cisco Secure Endpoint (FireAMP) SOAR Connector |
| Cisco Secure Firewall | Cisco Firepower SOAR Connector |
| Cisco Secure Malware Analytics | Cisco Secure Malware Analytics SOAR Connector |
| Cisco Secure Email Gateway | Cisco ESA SOAR Connector |
| Cisco WSA | Cisco Secure Email and Web Manager SOAR Connector |
| Cisco Talos | Cisco Talos Intelligence SOAR Connector |
| Cisco Umbrella | Cisco Umbrella Investigate SOAR Connector |
| Cisco Meraki | Cisco Meraki SOAR Connector |
| Cisco ISE | Cisco ISE SOAR Connector |
| Cisco Webex | Cisco Webex SOAR Connector |

SOAR connectors run in **Splunk SOAR** (not Splunk Enterprise), so no app-install button is shown — only a Splunkbase link. The Category Filter Bar includes a cross-cutting **⚡ SOAR** filter to surface all SOAR-enabled products regardless of category.

### F. ITSI Content Pack Intelligence

Products with ITSI Content Packs display a blue **ITSI** badge (with SVG icon) and a dedicated section. ITSI Content Packs are **not installed via Splunkbase** — they are installed via ITSI → Configuration → Data Integrations → Content Library. ITSI may run on a dedicated search head, so the content pack is treated as a connector (like SOAR), not as a visualization app.

Currently 4 products have ITSI Content Packs:
- Cisco Meraki → Content Pack for Cisco Enterprise Networks
- Cisco ThousandEyes → Content Pack for Cisco ThousandEyes
- Cisco AppDynamics → Content Pack for Splunk AppDynamics
- Cisco Catalyst Center → Content Pack for Cisco Enterprise Networks

### G. Alert Actions Intelligence

Products with companion alert actions display an **Alert Actions** badge and detail section. Alert actions are standalone add-ons (or built into a TA) that fire from Splunk saved searches, ES correlation searches, or notable events. Currently 3 products have alert action mappings.

The Category Filter Bar includes a cross-cutting **🔔 Alert Actions** filter.

### H. Community App Detection

When the CCC detects a third-party (non-Cisco) community add-on installed that shadows an official Cisco TA, a collapsible **"⚠ Third-party add-on detected"** warning appears on the card. The warning is collapsed by default with a "+ Details" toggle that reveals:

- The community app name and Splunkbase link
- A recommendation to migrate to the official Cisco add-on

Currently 5 products have community app mappings (e.g., Duo, Secure Endpoint, ISE, Meraki, Umbrella).

### I. Version Intelligence & Upgrade Buttons

The CCC reads `update.version` from each app's `/services/apps/local/<app_id>` entry. When an update is available:

- An **orange ⬆ badge** appears in the intelligence row.
- An **orange ⬆ vX.Y.Z button** appears in the card footer (one per dependency — separate buttons for TA and viz app).
- Clicking the upgrade button navigates to Splunk's built-in app management page with the relevant search pre-filled.

### J. Best Practices Modal (Platform-Aware)

Each card offers a 💡 Best Practices button that opens a modal with tailored guidance:

- **Splunk Cloud:** Recommends HEC endpoints, Cloud Data Manager, and cloud-compatible input methods.
- **Splunk Enterprise:** Recommends SC4S (Splunk Connect for Syslog), heavy forwarder configurations.
- Lists the required add-on and visualization app by name.
- Enumerates expected sourcetypes for validation.
- Calls out legacy apps that should be disabled and removed.

### K. Custom Dashboard Launch

The CCC allows customers to customize the Launch button per product. Each product card's Launch button features a **split-button** design:

- **Main button ("Launch")** — Opens the preferred dashboard (custom if set, otherwise the Cisco default).
- **Caret button ("▾")** — Opens a dropdown menu with all available launch options.
- **Dropdown menu** — Shows:
  - The default Cisco dashboard (with the actual dashboard view name, title-cased)
  - The customer's custom dashboard (if configured), showing the view name
  - "Set Custom…" or "Edit Custom…" to open the configuration modal

**Custom Dashboard Modal:**
- Text input for the dashboard path in `app_name/view_name` or `view_name` format
- Format instructions and examples
- Saves to `local/products.conf` via Splunk REST API (`POST /servicesNS/nobody/<app>/configs/conf-products/<stanza>`)
- Persists across app upgrades since it lives in the `local/` directory
- Can be cleared by saving an empty value

The `custom_dashboard` field is documented in `products.conf.spec` and is fully layerable — customers can set it via the UI modal or by editing `local/products.conf` directly.

### L. Give Feedback

A persistent **"Give Feedback"** tab is fixed to the right edge of the viewport. Clicking it opens a modal with:

- **Feedback Type** selector (Feature Request, Bug Report, Improvement, General)
- **Star Rating** (1–5 stars)
- **Title** and **Description** fields
- Submissions are stored in Splunk's **summary index** using `| makeresults | collect` with sourcetype `ccc:feedback`, enabling the team to search and analyze feedback directly within Splunk.

---

## 4. Technical Architecture: "The Brain & The Body"

### The Brain: Product Catalog (`products.conf`)

A Splunk `.conf` file containing 57 product stanzas, each defining:

| Field                  | Purpose                                              |
|------------------------|------------------------------------------------------|
| `display_name`         | Full product name with abbreviation                  |
| `description`          | Detailed product description                         |
| `value_proposition`    | One-line value statement for the ⓘ tooltip           |
| `category`             | Domain classification (security/observability/networking/collaboration) |
| `status`               | `active` or `under_development`                      |
| `addon` / `addon_label`| Required Splunk TA app ID and human-readable name    |
| `addon_family`         | Add-on family grouping (e.g. "security-cloud", "catalyst", "dc-networking") |
| `addon_splunkbase_url` | Direct Splunkbase link for the TA                    |
| `addon_install_url`    | Splunk Manager deep-link for one-click install       |
| `addon_docs_url`       | Documentation URL for the TA                         |
| `app_viz` / `app_viz_label` | Separate visualization app (if applicable)       |
| `app_viz_2` / `app_viz_2_label` | Second visualization app (if applicable)      |
| `soar_connector_label/uid/url` | SOAR connector mapping (up to 3 connectors)  |
| `alert_action_label/uid/url`   | Alert action app mapping (up to 2 actions)   |
| `itsi_content_pack_label`      | ITSI Content Pack name (installed via ITSI Content Library) |
| `itsi_content_pack_docs_url`   | Documentation URL for the ITSI Content Pack  |
| `legacy_apps/labels/uids/urls` | Legacy app mappings for debt detection        |
| `community_apps/labels/uids/urls` | Community/third-party app detection         |
| `prereq_apps/labels/uids/urls` | Prerequisite companion app dependencies       |
| `aliases`              | Former/alternate product names ("Formerly: ...")      |
| `sourcetypes`          | Expected sourcetypes for data validation              |
| `dashboards`           | Dashboard XML view names for the Launch button        |
| `keywords`             | Search terms for the Universal Finder                 |
| `icon_emoji`           | Visual icon mapping                                   |
| `sort_order`           | Display ordering within category                      |
| `custom_dashboard`     | Customer-defined dashboard path (`app/view` format)   |

The `.conf` format means products.conf is **layerable** — customers or admins can add local overrides without modifying the default catalog. The `custom_dashboard` field is designed to live in `local/products.conf` so it survives app upgrades.

### The Body: React UI

| Component              | Version    | Purpose                                |
|------------------------|------------|----------------------------------------|
| React                  | 16.14.0    | Core framework                         |
| @splunk/react-ui       | 5.8.0      | Splunk's official UI component library |
| @splunk/themes         | 1.5.0      | Splunk theme tokens                    |
| @splunk/react-icons    | 5.8.0      | Splunk icon set                        |
| @splunk/react-page     | 8.2.1      | Splunk page bootstrapping              |
| `@splunk/splunk-utils`   | 3.4.0      | URL helper, CSRF token (`getCSRFToken`), REST utilities |
| @splunk/webpack-configs| 7.0.3      | Build tooling                          |
| @splunk/babel-preset   | 4.0.0      | Transpilation                          |
| styled-components      | 5.3.11     | CSS-in-JS (used by Splunk UI)          |
| Webpack                | 5.105.2    | Bundler (builds in ~800ms)             |

**All @splunk packages are at their latest versions** as of February 2026.

### Key React Components

| Component             | Responsibility                                             |
|-----------------------|------------------------------------------------------------|
| `CCCProductsPage`     | Main orchestrator — state management, data loading, filtering, rendering |
| `ProductCard`         | Individual card — icon, name, badges, dependencies, footer buttons |
| `IntelligenceBadges`  | Real-time status badges (TA, viz app, data flow, legacy)   |
| `UniversalFinderBar`  | Keyword search with result counter and suggestions         |
| `CategoryFilterBar`   | Horizontal domain filter tabs                              |
| `BestPracticesModal`  | Platform-aware configuration guidance                      |
| `LegacyAuditModal`   | Detailed legacy debt report                                |
| `FeedbackModal`       | User feedback form with Splunk summary index storage       |
| `FeedbackTab`         | Persistent floating "Give Feedback" button                 |
| `CustomDashModal`     | Custom dashboard configuration modal (per ProductCard)     |

### REST API Endpoints Used

| Endpoint                                     | Purpose                              |
|----------------------------------------------|--------------------------------------|
| `/servicesNS/-/<app>/configs/conf-products`  | Load product catalog from products.conf |
| `/services/apps/local`                       | Detect installed apps, versions, updates |
| `/services/apps/local/<app_id>`              | Per-app status (version, update.version) |
| `/services/search/jobs` (oneshot)            | Sourcetype data validation searches  |
| `/servicesNS/nobody/<app>/configs/conf-products/<stanza>` (POST) | Save custom dashboard to `local/products.conf` |
| `/servicesNS/-/-/data/user-prefs/general`    | Detect user's dark/light theme preference |

### Separation of Concerns

The CCC stores only one customer-editable configuration — the custom dashboard path — in `local/products.conf`. All other data is read-only or browser-local:

- Product metadata → `products.conf` (read from `default/`, layered with `local/`)
- Custom dashboard → `local/products.conf` (written via Splunk REST, survives upgrades)
- Workspace preferences → `localStorage` (browser-side only)
- App installations → Deferred to Splunk's native app management
- Data inputs → Deferred to the respective TA's setup pages
- Feedback → Splunk summary index via `| collect`

---

## 5. UI/UX Design (IS4S-Inspired)

The interface follows the design language of the **Insights Suite for Splunk (IS4S)** — clean white background with section-based visual hierarchy.

### Design Principles

- **IS4S green color scheme** — Primary accent `#1a7f3d` (dark mode: `#66bb6a`/`#2e9e56`). Green buttons, links, and accents throughout.
- **Typography** — `'Splunk Platform Sans', 'Proxima Nova', 'Helvetica Neue', Helvetica, Arial, sans-serif`.
- **White page background** — Sections and cards provide hierarchy, not the page background.
- **Collapsible section panels** — Clean toggle with uniform styling. No colored accent borders — panels use a clean, minimal design.
- **Uniform card styling** — Cards have a subtle 2px top accent stripe using the border color. No colored bottom borders — all cards share a consistent, clean look.
- **Subtle card lift on hover** — Light shadow elevation.
- **Compact icon buttons** — Emoji-based icons with full-text tooltips to maximize footer space and maintain uniform card heights.
- **SVG badge icons** — ITSI, SOAR, Enterprise, and Cloud badges use custom SVG icons from a unified design system (41×40px, orange-pink gradient). Dark mode applies a CSS `filter: invert(0.85) hue-rotate(180deg)`.
- **Split-button Launch** — Green "Launch" button with a dropdown caret for dashboard selection (Cisco default + custom).
- **Fluid responsive grid** — `grid-template-columns: repeat(auto-fill, minmax(420px, 1fr))` auto-flows from 1 to 3+ columns based on viewport width (max 1500px).
- **Dark/light mode support** — Full CSS variable system with 30+ dark-mode overrides. Theme detection uses three signals:
  1. DOM `data-theme` attributes on ancestor elements
  2. Body CSS classes (`.dark`, `.theme-dark`)
  3. Splunk REST API (`/servicesNS/-/-/data/user-prefs/general`) for async theme preference
  - Defaults to light mode; no `prefers-color-scheme` (avoids OS dark-mode override when Splunk is set to light).
  - Dark mode class: `:root.dce-dark` applied via `MutationObserver` for dynamic switching.

---

## 6. Strategic Value to Cisco

1. **Migration Acceleration:** The Legacy Debt Auditor actively pushes customers off 10-year-old deprecated TAs and onto the Cisco Security Cloud, Cisco Catalyst, and Cisco DC Networking "Super Apps." The card surfaces the exact legacy app, its Splunkbase page, and the recommended modern replacement — all in one view.

2. **Cross-Portfolio Visibility:** All four Cisco domains (Security, Observability, Networking, Collaboration) are represented in a single catalog. A customer with "Networking" data but no "Security" products sees available Security cards, providing a natural cross-sell path.

3. **Reduced Support (TAC) Burden:** By combining version intelligence with one-click upgrade buttons, the CCC ensures customers are always on the latest validated version. Data validation badges eliminate "empty dashboard" support tickets by immediately surfacing whether the issue is the TA (not installed), the data (not flowing), or a legacy conflict.

4. **Unified Engineer Experience:** Network, security, and platform engineers can use CCC as their single launch point to all Cisco-related dashboards. Instead of navigating Splunk's app menu to find the right app, they start at CCC and click 🚀 Launch. The **custom dashboard feature** allows each team to configure their preferred dashboard per product.

5. **Feedback Loop:** The built-in feedback mechanism stores user input directly in Splunk's summary index, enabling the team to query, analyze, and trend feedback without any external tooling.

6. **Customer Personalization:** The custom dashboard launch feature lets customers tailor CCC to their environment. Security teams can point to their custom threat dashboards, network teams to their custom topology views — all without modifying app code.

---

## 7. Product Catalog Reference

### Security — Active (23 products)

| # | Product | Add-on Family | SOAR | ITSI |
|---|---------|--------------|:----:|:----:|
| 1 | Cisco AI Defense | Security Cloud | | |
| 2 | Cisco Cloudlock CASB | Security Cloud | | |
| 3 | Cisco Duo Security | Security Cloud | | |
| 4 | Cisco Email Threat Defense (ETD) | Security Cloud | | |
| 5 | Cisco Extended Detection and Response (XDR) | Security Cloud | | |
| 6 | Cisco Identity Intelligence (CII) | Security Cloud | | |
| 7 | Cisco Intersight | Security Cloud | | |
| 8 | Cisco Isovalent | Security Cloud | | |
| 9 | Cisco Isovalent Edge Processor | Security Cloud | | |
| 10 | Cisco Multicloud Defense (MCD) | Security Cloud | | |
| 11 | Cisco Network Visibility Module (NVM) | Security Cloud | | |
| 12 | Cisco Secure Access (SSE) | Standalone | | |
| 13 | Cisco Secure Email Gateway | Security Cloud | ✓ | |
| 14 | Cisco Secure Endpoint (CSE/AMP) | Security Cloud | ✓ | |
| 15 | Cisco Secure Firewall (FTD/eStreamer/ASA) | Security Cloud | ✓ | |
| 16 | Cisco Secure Malware Analytics (SMA) | Security Cloud | ✓ | |
| 17 | Cisco Secure Network Analytics (SNA) | Security Cloud | | |
| 18 | Cisco Secure Workload (CSW) | Security Cloud | | |
| 19 | Cisco Talos | Security Cloud | ✓ | |
| 20 | Cisco Umbrella | Security Cloud | ✓ | |
| 21 | Cisco Unified Computing System (UCS) | Security Cloud | | |
| 22 | Cisco Vulnerability Intelligence (CVI) | Security Cloud | | |
| 23 | Cisco Web Security Appliance (WSA) | Security Cloud | ✓ | |

### Security — Coming Soon (4 products)

| # | Product | Status |
|---|---------|--------|
| 1 | Cisco AppOmni (SaaS Security Posture) | Under Development |
| 2 | Cisco Endpoint Visibility Module (EVM) | Under Development |
| 3 | Cisco Radware (DDoS and Application Security) | Under Development |
| 4 | Cisco Secure Endpoint EDR Agent (CSE EDR) | Under Development |

### Observability — Active (2 products)

| # | Product | Add-on Family | ITSI Content Pack |
|---|---------|--------------|------------------|
| 1 | Cisco AppDynamics | Observability | Content Pack for Splunk AppDynamics |
| 2 | Cisco ThousandEyes | Security Cloud | Content Pack for Cisco ThousandEyes |

### Networking — Active (15 products)

| # | Product | Add-on Family | Viz App | SOAR | ITSI |
|---|---------|--------------|---------|:----:|:----:|
| 1 | Cisco Access Points | Catalyst | Enterprise Networking | | |
| 2 | Cisco Aggregation Services Routers (ASR) | Catalyst | Enterprise Networking | | |
| 3 | Cisco Application Centric Infrastructure (ACI) | DC Networking | Enterprise Networking | | |
| 4 | Cisco Carrier Routing System (CRS) | Catalyst | Enterprise Networking | | |
| 5 | Cisco Catalyst Center | Catalyst | Enterprise Networking | | ✓ |
| 6 | Cisco Catalyst SD-WAN | Catalyst | Enterprise Networking | | |
| 7 | Cisco Catalyst Switches | Catalyst | Enterprise Networking | | |
| 8 | Cisco Cyber Vision | Catalyst | Enterprise Networking | | |
| 9 | Cisco Identity Services Engine (ISE) | Catalyst | Enterprise Networking | ✓ | |
| 10 | Cisco Integrated Services Routers (ISR) | Catalyst | Enterprise Networking | | |
| 11 | Cisco Meraki | Catalyst | Enterprise Networking | ✓ | ✓ |
| 12 | Cisco Nexus Dashboard | DC Networking | Enterprise Networking | | |
| 13 | Cisco Nexus HyperFabric | DC Networking | Enterprise Networking | | |
| 14 | Cisco Nexus Switches | DC Networking | Enterprise Networking | | |
| 15 | Cisco Wireless LAN Controller (WLC) | Catalyst | Enterprise Networking | | |

### Collaboration — Active (3 products)

| # | Product | Add-on Family | SOAR |
|---|---------|--------------|:----:|
| 1 | Cisco Meeting Server (CMS) | Collaboration | |
| 2 | Cisco Unified Communications Manager (CUCM) | Collaboration | |
| 3 | Cisco Webex | Collaboration | ✓ |

### Deprecated / Archived (10 products)

| # | Product | Reason |
|---|---------|--------|
| 1 | Cisco Bug Search Tool | Archived on Splunkbase |
| 2 | Cisco Cloud Web Security (CWS) | Archived on Splunkbase |
| 3 | Cisco Connected Mobile Experiences (CMX) | Archived on Splunkbase |
| 4 | Cisco Domain Protection | Archived on Splunkbase |
| 5 | Cisco Network Assurance Engine | Archived on Splunkbase |
| 6 | Cisco Prime Infrastructure | Archived on Splunkbase |
| 7 | Cisco Product Security Incident Response Team (PSIRT) | Archived on Splunkbase |
| 8 | Cisco Secure Access Control Server (ACS) | Archived on Splunkbase |
| 9 | Cisco Secure Intrusion Prevention System (IPS) | Archived on Splunkbase |
| 10 | Cisco SecureX | Archived on Splunkbase |

---

## 8. Roadmap (Planned)

| Item | Description | Status |
|------|-------------|--------|
| Real product icons | Replace remaining emoji icons with official Cisco product SVGs/PNGs | In Progress (ITSI, SOAR, Enterprise, Cloud done) |
| Splunkbase version sync | Query Splunkbase API for latest published version numbers | Planned |
| Onboarding wizard | Step-by-step setup flow for first-time users per product | Planned |
| Multiple custom dashboards | Allow multiple custom dashboards per product (comma-separated or indexed fields) | Planned |
| REST API expansion | Custom REST endpoints for external integrations | Planned |
| RBAC-aware cards | Tailor card visibility based on Splunk user roles | Planned |
| Dashboard deep-links | ~~Direct links to specific dashboards within installed apps~~ | ✅ Done (Custom Dashboard Launch) |

---

*Last updated: February 2026*
