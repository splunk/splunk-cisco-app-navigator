# Copilot Instructions — Splunk Cisco App Navigator (SCAN)

> This file is automatically loaded by GitHub Copilot at the start of every chat
> session. It provides the full technical context for this project.

---

## Project Identity

| Field | Value |
|---|---|
| **App Name** | Splunk Cisco App Navigator |
| **Acronym** | SCAN |
| **Splunk Folder** | `splunk-cisco-app-navigator` |
| **App Label** | Splunk Cisco App Navigator |
| **App ID** | `splunk-cisco-app-navigator` |
| **Version** | 1.0.2 |
| **GitLab Repo** | `https://cd.splunkdev.com/sg-cloud-tools-engineering/splunk-cisco-app-navigator.git` |
| **Old Repo (archived)** | `https://cd.splunkdev.com/sg-cloud-tools-engineering/cisco-control-center-app.git` |

Previously known as "Cisco Control Center" (CCC). Renamed to "Splunk Cisco App
Navigator" (SCAN) in Feb 2026.

---

## What This App Does

SCAN is a Splunk app that provides a unified "Glass Pane" UI for discovering,
deploying, and managing the full portfolio of Cisco Splunk apps and add-ons.
Each Cisco product gets a card in the UI showing:

- Which Splunk add-on (TA) is needed
- Which viz/dashboard app provides dashboards
- Whether those apps are installed and up-to-date
- Whether legacy/deprecated apps should be removed
- Whether expected sourcetypes are arriving (data flowing detection)
- Platform-aware best-practice guidance (Cloud vs Enterprise)
- Custom per-product best practices and SC4S links

The product catalog is driven by `products.conf` — a Splunk-style INI file with
one stanza per product.

---

## Repository Structure

```
.
├── lerna.json
├── package.json                      # Root workspace (Lerna + Yarn)
├── scripts/                          # Utility Python scripts (auditing, analysis)
├── docs/                             # Presentations, briefs (.gitignore'd)
└── packages/
    └── splunk-cisco-app-navigator/   # THE main Splunk app package
        ├── package.json
        ├── webpack.config.js
        ├── bin/
        │   ├── build.js              # Build orchestrator (generate-catalog → webpack)
        │   ├── generate-catalog.js   # Reads products.conf → productCatalog.generated.js
        │   ├── package_app.sh        # Creates .tar.gz for Splunkbase upload
        │   └── clean_build.sh
        ├── src/main/
        │   ├── resources/splunk/     # Splunk config files (deployed to stage/)
        │   │   ├── default/
        │   │   │   ├── app.conf      # App identity, label, version
        │   │   │   ├── products.conf # PRODUCT CATALOG — source of truth (57 stanzas, ~2316 lines)
        │   │   │   ├── savedsearches.conf
        │   │   │   ├── server.conf
        │   │   │   ├── splunk_create.conf
        │   │   │   └── data/ui/
        │   │   │       ├── nav/default.xml
        │   │   │       └── views/products.xml
        │   │   ├── appserver/
        │   │   │   ├── static/       # CSS, JS loaders
        │   │   │   │   ├── products.css          # All styles including dark mode
        │   │   │   │   ├── products_loader.js    # Bootstrap script
        │   │   │   │   ├── reloadui.css
        │   │   │   │   └── reloadui.js
        │   │   │   └── templates/products.html   # HTML template for the page
        │   │   ├── lookups/cisco_apps.csv
        │   │   ├── metadata/default.meta
        │   │   └── README/products.conf.spec     # Field documentation
        │   └── webapp/pages/products/
        │       ├── index.jsx                     # MAIN REACT COMPONENT (~2407 lines)
        │       ├── productCatalog.generated.js   # Auto-generated at build time (DO NOT EDIT)
        │       └── render.jsx
        └── stage/                    # Build output (symlinked into Splunk)
```

---

## Key Files (edit these)

### `products.conf` — Product Catalog
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf`

The single source of truth for all product data. Each stanza `[product_id]`
defines one card in the UI. Currently has 57 product stanzas.

**Key fields** (see `README/products.conf.spec` for full documentation):
- `display_name`, `description`, `value_proposition`, `tagline`
- `category` — `security | networking | collaboration | observability | deprecated`
- `status` — `active | archived`
- `addon`, `addon_label`, `addon_splunkbase_url`, `addon_docs_url`, `addon_install_url`
- `app_viz`, `app_viz_label`, `app_viz_splunkbase_url`, `app_viz_docs_url`
- `sourcetypes` — comma-separated list of expected Splunk sourcetypes
- `legacy_apps`, `legacy_labels`, `legacy_uids`, `legacy_urls`
- `prereq_apps`, `prereq_labels`, `prereq_uids`, `prereq_urls`
- `community_apps`, `community_labels`, `community_uids`, `community_urls`
- `sc4s_url`, `sc4s_label` — SC4S documentation link (shown as pill + in best practices)
- `best_practices` — pipe-delimited (`|`) custom tips shown in the Best Practices modal
- `soar_connector_label/uid/url` (up to 3)
- `alert_action_label/uid/url` (up to 2)
- `icon_emoji`, `card_accent`, `card_bg_color`, `card_banner`

**Format notes:**
- Only populated fields are present (compact format, no empty fields)
- Stanzas with `category = alert_actions` (or other non-card categories) are
  metadata-only and excluded from the UI grid
- Fields like `addon_install_url` use deep-links:
  `/manager/splunk-cisco-app-navigator/appsremote?order=relevance&query="..."`

### `index.jsx` — Main React Component
**Path:** `packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/index.jsx`

Single-file React app (~2407 lines) that renders the entire Glass Pane UI.
Uses `@splunk/react-ui` components. Key constant: `APP_ID = 'splunk-cisco-app-navigator'`.

**Major sections:**
- Constants & emoji map (lines 1–80)
- Static catalog import from `productCatalog.generated.js`
- Helper functions (configured products, theme, search)
- `getBestPractices(product, platformInfo)` — returns enriched tip objects with
  `{text, linkLabel, linkUrl, icon, custom}`. Merges platform-generic tips with
  SC4S-specific tips (when `sc4s_url` is set) and custom `best_practices` entries.
- Card components (collapsed/expanded views)
- Category sections, search/filter UI
- Modals: BestPracticesModal, DataModelModal, LegacyAppsModal
- Dark mode support via CSS variables and theme toggle

### `products.css` — Styles
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/products.css`

All card, layout, modal, dark mode styles. Key CSS variables:
- `--custom-tip-bg` — background for custom best practices tips (green)
- `.csc-split-pill-sc4s` — SC4S pill styling (blue, bold)
- Dark mode uses `[data-theme="dark"]` selector

### `generate-catalog.js` — Build-Time Catalog Generator
**Path:** `packages/splunk-cisco-app-navigator/bin/generate-catalog.js`

Reads `products.conf` at build time and emits `productCatalog.generated.js`.
This is the static fallback catalog that `index.jsx` imports. When adding new
fields to `products.conf`, you must also add them to the field mapping in this
file.

### `products.conf.spec` — Field Documentation
**Path:** `packages/splunk-cisco-app-navigator/src/main/resources/splunk/README/products.conf.spec`

Splunk-standard spec file documenting every field in `products.conf`. Update
this when adding new fields.

---

## Build & Deploy

### Prerequisites
- Node.js, Yarn, Lerna (monorepo)
- Splunk Enterprise installed at `/opt/splunk`
- Symlink: `/opt/splunk/etc/apps/splunk-cisco-app-navigator` → `packages/splunk-cisco-app-navigator/stage`

### Build (compile JS + copy configs to stage/)
```bash
cd packages/splunk-cisco-app-navigator && node bin/build.js build
```
This runs: `generate-catalog.js` (products.conf → JS) → `webpack` (JSX → bundle).

### Deploy JS/CSS changes (no restart needed)
```bash
rm -f /opt/splunk/var/run/splunk/appserver/i18n/products*.cache
curl -sk -u admin:changeme https://localhost:8089/services/debug/refresh \
  -X POST -d "entity=data/ui/views" > /dev/null 2>&1
```
Then hard-refresh the browser (Cmd+Shift+R).

### Deploy conf changes (requires restart)
```bash
/opt/splunk/bin/splunk restart
```

### Package for Splunkbase
```bash
cd packages/splunk-cisco-app-navigator && bash bin/package_app.sh
```
Produces `splunk-cisco-app-navigator-<version>.tar.gz`. Automatically strips
`local/` directory before packaging.

### Verify app is loaded
```bash
curl -sk -u admin:changeme \
  'https://localhost:8089/services/apps/local/splunk-cisco-app-navigator?output_mode=json' \
  | python3 -m json.tool | grep -E '"label"|"version"|"visible"|"disabled"'
```

---

## Git Workflow

| Remote | URL | Purpose |
|---|---|---|
| `origin` | `https://cd.splunkdev.com/sg-cloud-tools-engineering/splunk-cisco-app-navigator.git` | **Current** — push here |
| `old-ccc` | `https://cd.splunkdev.com/sg-cloud-tools-engineering/cisco-control-center-app.git` | **Old** — archive/remove |

**Primary branch:** `feature/scan-improvements` (has all latest work)
**Main branch:** `main`

After confirming new origin has everything: `git remote remove old-ccc`

---

## Architecture Notes

### Data Flow
1. Admin adds products to their workspace (localStorage, key: `scan_configured_products`)
2. App fetches live data from Splunk REST endpoints:
   - `configs/conf-products` — product metadata
   - `apps/local` — installed app inventory
   - `server/info` — platform detection (Cloud vs Enterprise)
   - `search/jobs` — sourcetype detection (data flowing checks, `| tstats count`)
3. Cards render with real-time install status, version checks, data flowing indicators

### Sourcetype Detection
- Uses `| tstats count WHERE index=* sourcetype=<st> | where count > 0`
- Three states: flowing (green), not flowing (red), checking (spinner)
- Count=0 is treated as "not flowing" (important fix)

### Best Practices Modal
- Platform-aware tips (different for Cloud vs Enterprise)
- Auto-generated tips from product metadata (addon docs, dashboards, legacy removal)
- SC4S tip merges with platform syslog tip when `sc4s_url` is set (avoids duplication)
- Custom per-product tips from `best_practices` field (pipe-delimited)
- Custom tips render with green styling (border + background)

### Dark Mode
- Theme toggle in header (sun/moon icon)
- Stored in localStorage (key: `scan_theme_preference`)
- CSS uses `[data-theme="dark"]` selector
- Variables: `--bg`, `--text`, `--card-bg`, `--border`, `--custom-tip-bg`, etc.

### Categories
Products are grouped into: Security, Networking, Collaboration, Observability, Deprecated.
Each category has an emoji icon and description. The `CATEGORY_IDS` set determines
which stanzas render as cards (non-card categories like `alert_actions` are excluded).

---

## Common Tasks

### Add a new product
1. Add a stanza to `products.conf` (follow existing examples)
2. Update `products.conf.spec` if adding new fields
3. Update `generate-catalog.js` field mapping if adding new fields
4. Build: `cd packages/splunk-cisco-app-navigator && node bin/build.js build`
5. Deploy (see above)

### Edit a product card
1. Edit the stanza in `products.conf`
2. Rebuild and deploy

### Add a new UI feature
1. Edit `index.jsx` for logic/components
2. Edit `products.css` for styles
3. If new conf fields needed: update `products.conf`, `generate-catalog.js`, `products.conf.spec`
4. Build and deploy

### Troubleshooting
- If cards don't appear: check browser console, verify app is loaded via REST API
- If data flowing shows wrong state: check sourcetype case sensitivity in products.conf
- If styles don't update: clear cache files and run debug/refresh endpoint
- If products.conf changes don't take effect: `splunk restart` is required

---

## Important Conventions

- **No empty fields** — if a field has no value, omit it entirely from products.conf
- **Sourcetypes are case-sensitive** — must match exactly what Splunk indexes
- **productCatalog.generated.js is auto-generated** — never edit directly; edit products.conf
- **stage/ is the build output** — don't edit files there; they're overwritten on build
- **`disabled = 1`** hides a product stanza from the UI entirely
- **addon_install_url** deep-links must use `/manager/splunk-cisco-app-navigator/...`

---

## Pending Tasks (as of Feb 2026)

- [ ] Push `main` and `feature/scan-improvements` branches to new `origin` (GitLab)
- [ ] Rename outer repo folder: `~/repo/cisco_control_center_app` → `~/repo/splunk-cisco-app-navigator`
  - Requires: close VS Code, `mv` folder, fix symlink, reopen
  - Fix symlink: `rm /opt/splunk/etc/apps/splunk-cisco-app-navigator && ln -s ~/repo/splunk-cisco-app-navigator/packages/splunk-cisco-app-navigator/stage /opt/splunk/etc/apps/splunk-cisco-app-navigator`
- [ ] Archive old GitLab project: Settings → General → Advanced → Archive
- [ ] Remove `old-ccc` remote after confirming new origin has all branches

---

## Utility Scripts (in `scripts/`)

| Script | Purpose |
|---|---|
| `normalize_products_conf.py` | Normalize/clean products.conf formatting |
| `resort_products.py` | Re-sort product stanzas in products.conf |
| `csv_deep_v2.py` | Deep CSV analysis of product data |
| `csv_correct_analysis.py` | CSV correction analysis |
| `gen_pptx_cisco.py` | Generate Cisco-branded PowerPoint presentations |
| `convert_potx_to_pptx.py` | Convert PowerPoint templates |
| `verify_pptx.py` | Verify generated presentations |
| `inspect_template.py` | Inspect PowerPoint template structure |
