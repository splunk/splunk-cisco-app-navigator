# Change Log

1.0.4 — March 2, 2026
-------

### Dark Mode Icon Enhancements
* **Filter pill icon visibility** — Added `csc-filter-pill-icon` class to all category filter pill `<img>` tags for dark mode white chip treatment.
* **Card icon frosted glass** — Dark mode card icons render with frosted glass container, Cisco-blue glow, white drop-shadow, and 40px sizing.
* **Badge pill preservation** — SOAR, AI, ITSI, and Alert badge pills preserve light-mode styling in dark mode for icon visibility.

### Documentation
* Updated copilot-instructions.md, README.md, and CHANGELOG.md with current v1.0.4 stats.

1.0.3 — February 28, 2026
-------

### AI-Powered Badge
* **AI badge** — Purple gradient badge with sparkle icon on cards with `ai_enabled = 1`.
* **AI tooltip** — Hover tooltip shows `ai_description` text.
* **AI cross-cutting filter** — "AI-Powered" pill in Category Filter Bar (15 products).
* **`ai_enabled`, `ai_description`** — New fields in products.conf.

### Subcategory Pills
* **13 subcategories** — Granular filtering within Security (8), Networking (4), and Observability (1).
* **Animated slide-in** — Subcategory pills expand with CSS animation when category selected.
* **`subcategory`** — New field in products.conf.

### SC4S Integration
* **SC4S pills** — Blue SC4S pill on cards with `sc4s_url` set (18 products).
* **SC4S best practices** — SC4S tip merges with platform syslog tip, avoids duplication.
* **`sc4s_url`, `sc4s_label`** — New fields in products.conf.

1.0.2 — February 27, 2026
-------

### Strategic Sort Order
* **Sort ranges** — Products strategically sorted with related products adjacent within categories.
* **Keyword cleanup** — Keywords start with primary acronym; generic terms removed.
* **`update_sort_keywords_v2.py`** — Line-by-line parser for bulk updates (replaces broken v1).

### Cisco Brand Icons
* **128 icons** — 126 SVGs + 2 PNGs covering all 78 products.
* **Light/dark variants** — `{name}.svg` and `{name}_white.svg` variants.
* **Icon fallback chain** — icon_svg -> icon_emoji (32 emojis) -> first-letter fallback.

### ACE Product Addition
* **Application Centric Engine (ACE)** — New product in Networking/data_center_net.

1.0.1 — February 26, 2026
-------

### Secure Networking GTM
* **GTM tagging** — 60 products tagged with `secure_networking_gtm = 1`.
* **GTM filter pill** — Secure Networking GTM cross-cutting filter with `cat-secnet.svg` icon.

### Product Catalog Expansion (57 -> 78)
* **78 total products** — Added 21 new products across all categories.
* **Security:** 27 -> 39 products.
* **Networking:** 15 -> 30 products.
* **Observability:** 2 -> 3 products.
* **Collaboration:** 3 -> 6 products.

### CCC -> SCAN Rename
* **Full rebrand** — Cisco Control Center renamed to Splunk Cisco App Navigator.
* **App ID:** `splunk-cisco-app-navigator`
* **Git:** New repo, old repo archived.

1.0.0 — February 25, 2026
-------

### Production Release
* **Feature-complete Glass Pane UI** — All card intelligence badges, category filtering, search, theme toggle, best practices modals.
* **Build system** — generate-catalog.js + webpack + auto build hash stamp.
* **Splunkbase packaging** — package_app.sh creates versioned tarball.
* **CiscoSansTT fonts** — Cisco brand typography integrated.
* **Platform detection** — Cloud vs Enterprise via server/info REST endpoint.
* **Sourcetype detection** — tstats-based data flow validation for 429+ sourcetypes.
* **Persona Quick Start** — Pre-built workspace configurations.
* **Tech Stack Modal** — Full technology stack visualization.

0.0.3 — February 22, 2026
-------

### Product Catalog Expansion
* **57 products** — Expanded from 47 to 57 total products.
* **10 deprecated products** added.
* **Collaboration active** — Webex, Meeting Server, CUCM moved to active.
* **New networking/security products** added.

### SOAR Connector Intelligence
* **SOAR badges** — Purple badge on cards with SOAR connectors (10 products).
* **SOAR cross-cutting filter** — SOAR pill in Category Filter Bar.
* **SVG icon** — Custom icon-soar.svg badge.

### ITSI Content Pack Intelligence
* **ITSI refactor** — Dedicated `itsi_content_pack` fields.
* **ITSI badges** — Blue badge on cards with Content Packs (4 products).
* **SVG icon** — Custom icon-itsi.svg badge.

### Alert Actions Intelligence
* **Alert Actions badges** — Blue badge on cards with alert action add-ons.
* **Alert Actions cross-cutting filter** — Alert Actions pill in Category Filter Bar.

### Community App Detection
* **Community app warning** — Collapsible warning for non-Cisco community TAs.

### SVG Badge Icons
* **Custom SVG icon set** — Replaced emoji for ITSI, SOAR, Enterprise, Cloud badges.

### Deprecated Product Enhancements
* **Deprecated/Replacement chips** — Each deprecated card links to successor.

### Additional Fields
* **aliases**, **prereq_apps**, **addon_family**, **addon_docs_url**, **dashboards** — New fields.

### Bug Fixes
* **Meraki prerequisite guard** — Fixed prereq dependency rendering.
* **FeedbackModal crash** — Fixed uncontrolled component warning.

0.0.2 — February 22, 2026
-------

### UI/UX Redesign
* **IS4S green design language** — Green accent throughout.
* **Uniform card styling** — Clean design with subtle accent stripe.

### Dark/Light Mode
* **Theme detection** — Detects Splunk theme via DOM attributes and REST API.
* **30+ dark-mode CSS overrides** via `:root.dce-dark`.
* **MutationObserver** — Watches for dynamic theme class changes.

### Custom Dashboard Launch
* **Split-button Launch** — Default + custom dashboard dropdown.
* **Persistence** — Custom dashboards saved to `local/products.conf` via REST API.

### Bug Fixes
* **CSRF authentication** — Uses Splunk's official `getCSRFToken()`.
* **ITSI 404 elimination** — Only queries installed apps.
* **Sourcetype search guard** — Skips search if no CSRF token.

0.0.1
-------

* Initial version
