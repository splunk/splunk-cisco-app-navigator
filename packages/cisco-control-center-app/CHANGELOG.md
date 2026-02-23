# Change Log

0.0.3 – February 22, 2026
-------

### Product Catalog Expansion
* **57 products** — Expanded from 47 to 57 total products across 5 categories.
* **10 deprecated products** — Added Bug Search Tool, Cloud Web Security, CMX, Domain Protection, NAE, Prime Infrastructure, PSIRT, ACS, Secure IPS, SecureX.
* **Collaboration active** — Webex, Meeting Server, and CUCM moved from "Coming Soon" to active.
* **New networking products** — Added Access Points, ASR, CRS, Catalyst Switches, ISR, WLC, Nexus HyperFabric, Meraki.
* **New security products** — Added AI Defense, Cloudlock CASB, Intersight, Talos, Umbrella, UCS, WSA, Secure Email Gateway.

### SOAR Connector Intelligence
* **SOAR badges** — Purple SOAR badge on cards with Splunk SOAR connectors (10 products).
* **SOAR detail section** — Dedicated card section with connector name and Splunkbase link.
* **SOAR cross-cutting filter** — Amber "⚡ SOAR" pill in the Category Filter Bar to show only SOAR-enabled products.
* **SVG icon** — Custom `icon-soar.svg` badge replacing emoji.

### ITSI Content Pack Intelligence
* **ITSI refactor** — ITSI moved from `app_viz` field to dedicated `itsi_content_pack` field (parallel to SOAR connector pattern). ITSI may run on a dedicated search head.
* **ITSI badges** — Blue ITSI badge on cards with Content Packs (4 products: Meraki, ThousandEyes, AppDynamics, Catalyst Center).
* **ITSI detail section** — Shows pack name, docs link, and install hint ("Install via ITSI → Content Library").
* **SVG icon** — Custom `icon-itsi.svg` badge replacing emoji.
* **`itsi_content_pack_label` / `itsi_content_pack_docs_url`** — New fields in `products.conf` and `products.conf.spec`.

### Alert Actions Intelligence
* **Alert Actions badges** — Blue badge on cards with companion alert action add-ons (3 products).
* **Alert Actions detail section** — Shows action name with Splunkbase link.
* **Alert Actions cross-cutting filter** — Blue "🔔 Alert Actions" pill in the Category Filter Bar.
* **`alert_action_label/uid/url`** — New fields in `products.conf` (supports up to 2 alert actions per product).

### Community App Detection
* **Community app warning** — Collapsible "⚠ Third-party add-on detected" warning on cards where a non-Cisco community TA is installed.
* **"+ Details" toggle** — Warning is collapsed by default; expands to show the community app name and Splunkbase link.
* **`community_apps/labels/uids/urls`** — New fields in `products.conf` (5 products mapped).

### SVG Badge Icons
* **Custom SVG icon set** — Replaced emoji for ITSI, SOAR, Splunk Enterprise, and Splunk Cloud badges with 41×40px SVG icons.
* **Dark mode support** — SVG icons use CSS `filter: invert(0.85) hue-rotate(180deg)` in dark mode.
* **Static assets** — `icon-itsi.svg`, `icon-soar.svg`, `icon-enterprise.svg`, `icon-cloud.svg` in `appserver/static/`.

### Deprecated Product Enhancements
* **Deprecated/Replacement chips** — Each deprecated card shows a "Deprecated" chip and a "Replacement" chip linking to the modern successor product.
* **`addon_family = deprecated`** — Deprecated products grouped by family.

### Additional Fields
* **`aliases`** — Former/alternate product names displayed as "Formerly: ..." on cards and included in search.
* **`prereq_apps/labels/uids/urls`** — Prerequisite companion app dependencies (e.g., Splunk App for Stream).
* **`addon_family`** — Add-on family grouping for catalog generation (security-cloud, catalyst, dc-networking, etc.).
* **`addon_docs_url`** — Documentation URL for add-ons.
* **`dashboards`** — Dashboard XML view names for the Launch button.

### Bug Fixes
* **Meraki prerequisite guard** — Fixed prereq dependency rendering when prereq fields are present.
* **FeedbackModal crash** — Fixed uncontrolled component warning on feedback type dropdown.

0.0.2 – February 22, 2026
-------

### UI/UX Redesign
* **IS4S green design language** — Replaced blue accent (#049fd9) with green (#1a7f3d) throughout: buttons, links, badges, category pills, and accent borders.
* **Typography** — Set `'Splunk Platform Sans', 'Proxima Nova', 'Helvetica Neue'` as the base font family.
* **Uniform card styling** — Removed colored bottom borders and per-section accent stripes. All cards share a clean, consistent design with a subtle 2px top accent stripe.
* **Card grid** — Updated to `minmax(420px, 1fr)` with 1500px max-width for better readability.

### Dark/Light Mode
* **Theme detection** — Detects Splunk's theme preference via DOM `data-theme` attributes, body CSS classes, and Splunk REST user-prefs API.
* **30+ dark-mode CSS overrides** — All green accents, badges, buttons, inputs, code blocks, and modals adapt to dark mode via `:root.dce-dark`.
* **No OS override** — Removed `prefers-color-scheme` media query to prevent macOS dark mode from overriding Splunk's explicit light-mode setting.
* **MutationObserver** — Watches for dynamic theme class changes on `<html>` and `<body>`.

### Custom Dashboard Launch
* **Split-button Launch** — Each configured+installed product's Launch button now has a dropdown caret (▾) with:
  - The default Cisco dashboard (showing the actual view name, title-cased)
  - A customer-configured custom dashboard (if set)
  - "Set Custom…" / "Edit Custom…" modal to configure.
* **Custom dashboard modal** — Text input for `app_name/view_name` format, with format help and save/cancel.
* **Persistence** — Custom dashboards are saved to `local/products.conf` via Splunk REST API, surviving app upgrades.
* **`custom_dashboard` field** — Added to `products.conf.spec` with full documentation.
* **Portal-based dropdown** — Menu renders via `ReactDOM.createPortal` to escape parent overflow constraints.

### Bug Fixes
* **CSRF authentication** — Replaced custom cookie regex with Splunk's official `getCSRFToken()` from `@splunk/splunk-utils/config`, fixing 401 errors on POST requests.
* **Modal `returnFocus` prop** — Added required `returnFocus` prop to custom dashboard Modal.
* **Modal.Header `onRequestClose`** — Removed invalid `onRequestClose` prop from all `Modal.Header` components (close button is provided via context from the parent `Modal`).
* **ITSI 404 elimination** — Per-app version checks now only query apps present in the bulk `installedApps` lookup, skipping HTTP requests for apps that aren't installed.
* **Sourcetype search guard** — `detectSourcetypeData()` skips the search POST if no CSRF token is available.

### Deprecated Section
* **Fourth section** — Added "Deprecated / Archived" collapsible panel for products with archived add-ons on Splunkbase.

0.0.1 – Release date: TBA
-------

* Initial version
