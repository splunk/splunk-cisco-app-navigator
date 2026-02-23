# Cisco Control Center App for Splunk

**Codename:** "The Front Door"  
**Author:** Cisco Systems  
**Compatibility:** Splunk Enterprise / Splunk Cloud 9.0+

## What It Does

The Cisco Control Center (CCC) is the unified "Glass Pane" for the Cisco-Splunk ecosystem. It provides a single Product Catalog UI where Splunk administrators can discover, install, configure, and monitor all Cisco integrations — across Security, Observability, Networking, and Collaboration domains.

Each Cisco product is represented by an intelligent card that actively inspects the local Splunk environment and surfaces real-time status: installed apps, available upgrades, data flow validation, and legacy debt detection.

## Getting Started

1. Install the app on your Splunk Search Head (or Search Head Cluster).
2. Open the app — the **Products** page is your landing view.
3. Browse the **Available Products** catalog and click **➕ Add** to add products to your workspace.
4. Use **📥 Install** buttons to install the required add-ons and visualization apps directly from Splunkbase.
5. Click **🚀 Launch** to open dashboards for configured products.

## Key Features

- **Product Catalog** — 38 Cisco products across 4 categories (Security, Observability, Networking, Collaboration), each with real-time intelligence.
- **Intelligence Badges** — Color-coded indicators for add-on install status, viz app status, data flow (24h), update availability, and legacy app warnings.
- **Version Intelligence** — Detects installed app versions and highlights available upgrades with one-click upgrade buttons.
- **Legacy Debt Auditor** — Scans `/services/apps/local` to detect deprecated TAs (e.g., old Duo connector, eStreamer, Firepower apps) and guides migration.
- **Data Validation** — Live SPL queries validate whether expected sourcetypes are flowing. Missing data triggers actionable warnings.
- **Universal Finder** — Keyword-optimized search bar with 380+ keywords across the catalog.
- **Category Filter** — Instant domain filtering (Security, Observability, Networking, Collaboration).
- **Platform-Aware Best Practices** — Per-product guidance tailored to Splunk Cloud vs. Enterprise.
- **Give Feedback** — Built-in feedback form that stores submissions in Splunk's summary index.
- **Dark Mode** — Full theme support via CSS variables.

## App Structure

| Directory | Purpose |
|---|---|
| `default/products.conf` | Product catalog — 38 stanzas defining all card metadata |
| `default/app.conf` | App identity and version |
| `default/server.conf` | SHC replication settings for products.conf |
| `default/data/ui/` | Navigation and view definitions |
| `metadata/default.meta` | Permissions and sharing |
| `README/products.conf.spec` | Spec file documenting products.conf fields |
| `appserver/templates/` | HTML template with all inline CSS |
| `appserver/static/` | App icons |
| `static/` | Splunkbase listing icons |

## Support

For issues, questions, or feature requests, use the in-app **Give Feedback** button or contact your Cisco account team.
