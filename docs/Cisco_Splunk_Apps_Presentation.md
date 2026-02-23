# Strategic Blueprint: Cisco-Splunk App Overhaul

**Consolidating 100+ Apps into a Unified Super App Strategy**

Alan Ivarson, Group Vice President, Field Solutions
Amir (AK) Khamis, Principal Architect

February 19, 2026

---

## Today's Agenda

1. **The Current State** — The Systemic Mess
2. **The Vision** — The Two Super Apps Model
3. **Technical Innovation** — The Dynamic Configuration Engine (DCE)
4. **The Cisco Control Center (CCC)** — The Customer-Facing Control Plane
5. **Strategic Alignment & Data Fabric**
6. **Tactical Roadmap** (The 3/6/12 Month Plan)
7. **Conclusion & Next Steps**

---

## Slide 1: The Current State — The Systemic Mess

> *A customer searching for "Cisco Firewall" on Splunkbase today sees 13 different apps and add-ons — and has no way to know which one to install.*

### The Numbers Tell the Story

We audited every Cisco-related app and add-on on Splunkbase. The results paint a stark picture of fragmentation:

| Metric | Count | % of Total |
|--------|------:|:----------:|
| **Total Cisco-related Splunkbase apps audited** | **100** | 100% |
| Archived or removed from Splunkbase | 52 | **52%** |
| Unsupported (no vendor support) | 41 | **41%** |
| Flagged on Splunkbase | 4 | 4% |
| Still live and available | 42 | 42% |

### Who Built These 100 Apps?

| Developer | Apps | % |
|-----------|-----:|--:|
| **Cisco** (Cisco Systems, Cisco Security, Cisco EN) | 41 | 41% |
| **Community / third-party** | 46 | **46%** |
| **Splunk** (Splunk LLC, Splunk Works) | 13 | 13% |

**Key Insight:** Nearly half of all "Cisco" apps on Splunkbase were not built by Cisco. Customers have no reliable way to distinguish official from unofficial.

### Support Status

| Support Level | Apps | % |
|---------------|-----:|--:|
| **Not supported** | 41 | **41%** |
| Developer-supported (best effort) | 38 | 38% |
| Cisco-supported | 13 | 13% |
| Splunk-supported | 6 | 6% |

> **41% of existing Cisco apps are unsupported** — creating significant security and operational risk for customers relying on them.

---

## Slide 2: The Confusion Problem — A Customer's Perspective

### Case Study: "I Need to Monitor My Cisco Firewall"

A customer searching Splunkbase for Cisco Firewall visibility today encounters **13 different apps and add-ons**:

| # | App Name | Status | Developer |
|---|----------|--------|-----------|
| 1 | Splunk Add-on for Cisco FireSIGHT | Legacy | Splunk |
| 2 | Cisco Secure eStreamer Client Add-On for Splunk | Legacy | Cisco |
| 3 | Cisco Firepower eNcore App for Splunk | Legacy | Community |
| 4 | Cisco Secure Firewall App for Splunk | Legacy | Cisco |
| 5 | Splunk Add-on for Cisco ASA | Legacy | Splunk |
| 6 | Enosys Add-on for Cisco Firepower eStreamer | Legacy | Community |
| 7 | Cisco Firepower Threat Defense FTD sourcetype | Legacy | Community |
| 8 | Cisco Firepower Threat Defense FTD Dashboards | Legacy | Community |
| 9 | Cisco Firepower pcap Add-on | Legacy | Community |
| 10 | Cisco eStreamer Client for Splunk | Legacy | Cisco |
| 11 | Firegen Log Analyzer for Cisco ASA | Legacy | Community |
| 12 | Cisco Security Suite | Legacy | Community |
| 13 | Cisco Suite for Splunk | Legacy | Community |

**The correct answer:** Install **Cisco Security Cloud** (1 add-on). That's it.

> *13 wrong choices. 1 right choice. No guidance anywhere on Splunkbase. This is the "Systemic Mess."*

### It's Not Just Firewalls

| Cisco Product | Legacy Apps on Splunkbase | Correct Answer |
|---------------|:------------------------:|----------------|
| **Secure Firewall** | **13** | Cisco Security Cloud |
| **Webex** | **8** | TA for Cisco CDR |
| **Meraki** | **5** | Cisco Catalyst Add-on |
| **Catalyst Center** | **5** | Cisco Catalyst Add-on |
| **Nexus Switches** | **5** | Cisco DC Networking |
| **Umbrella** | **4** | Cisco Security Cloud |
| **Secure Network Analytics** | **3** | Cisco Security Cloud |
| **ThousandEyes** | **3** | Cisco Security Cloud |
| **ISE** | **3** | Cisco Catalyst Add-on |
| **Duo** | **2** | Cisco Security Cloud |

**29 of 57 products** (51%) have at least one legacy app that customers might accidentally install instead of the correct modern add-on.

**93 total legacy app entries** are tracked across the catalog — these are apps that customers should *not* be using anymore.

---

## Slide 3: The Vision — The Two Super Apps Model

### Before: The Mess

```
98+ individual apps and add-ons on Splunkbase
   ├── 23 separate Splunk TAs (Technology Add-ons)
   ├── 7 separate visualization apps
   ├── 72+ legacy/community/deprecated apps
   ├── 46 community-built (no Cisco support)
   └── 41 with zero vendor support
```

### After: Three Super Add-ons

```
3 unified add-ons covering 57 products
   ├── Cisco Security Cloud          → 19 products
   ├── Cisco Catalyst Add-on         → 13 products
   └── Cisco DC Networking           →  3 products
   + 6 standalone TAs (specialized use cases)
```

### The Consolidation Ratios

| Super Add-on | Products Served | Previous Individual TAs | Ratio |
|---|:---:|:---:|:---:|
| **Cisco Security Cloud** | 19 | 15+ standalone TAs | **19 : 1** |
| **Cisco Catalyst Add-on** | 13 | 8+ standalone TAs | **13 : 1** |
| **Cisco DC Networking** | 3 | 5+ standalone TAs | **3 : 1** |

> *19 Cisco security products — from Firewall to XDR to Duo — now share a single add-on: Cisco Security Cloud. One install. One upgrade cycle. One support contract.*

### Visualization App Consolidation

| Viz App | Products Served |
|---------|:---:|
| **Cisco Enterprise Networking for Splunk** | 16 |
| Cisco Secure Access App | 1 |
| Cisco CDR Reporting and Analytics | 2 |

**16 networking products** share a single visualization app — down from 5+ individual apps.

---

## Slide 4: The CCC Product Catalog — By the Numbers

The **Cisco Control Center (CCC)** provides a single "Glass Pane" that catalogs every Cisco product, maps it to the correct add-on, and actively audits the customer's Splunk environment.

### Product Catalog Overview

| Category | Active | Coming Soon | Deprecated | **Total** |
|----------|:------:|:-----------:|:----------:|:---------:|
| Security | 23 | 4 | — | **27** |
| Networking | 15 | — | — | **15** |
| Observability | 2 | — | — | **2** |
| Collaboration | 3 | — | — | **3** |
| Deprecated | — | — | 10 | **10** |
| **Total** | **43** | **4** | **10** | **57** |

### Intelligence Built Into Every Product Card

| Intelligence Layer | Coverage | Detail |
|---|:---:|---|
| **Sourcetype validation** (MTTI) | 52 of 57 (91%) | 321 sourcetypes monitored for data flow |
| **Search keywords** | 57 of 57 (100%) | 408 keywords for instant product discovery |
| **Legacy debt detection** | 29 of 57 (51%) | 93 legacy apps auto-detected at runtime |
| **Learn More links** | 57 of 57 (100%) | Every product links to official Cisco docs |
| **Dashboard launch** | 26 products | One-click launch to the right dashboard |
| **Product aliases** | 9 products | "Formerly: StealthWatch" → helps search |

### Cross-Platform Integration

| Integration | Products Mapped | Value |
|---|:---:|---|
| **Splunk SOAR** connectors | 10 | Pre-mapped for automated response workflows |
| **Splunk ITSI** Content Packs | 4 | Service-level monitoring via ITSI Content Library |
| **Custom Alert Actions** | 3 | Companion alert action add-ons on Splunkbase |
| **Community TA detection** | 5 | Warns when a 3rd-party TA shadows the official one |
| **Prerequisite app tracking** | 13 | Companion apps auto-detected (e.g., Splunk App for Stream) |

---

## Slide 5: Technical Innovation — The DCE

**Dynamic Configuration Engine** — the server-side brain that makes the Super App model possible.

| Capability | Description |
|---|---|
| **Master Library** | Centralized repository of Mini-TAs |
| **DCE Cooker** | Python-based REST handler that "cooks" config files on-demand |
| **Default deny policy** | Prevents lookup replication bloat and indexer crashes |
| **Platform awareness** | Automatic detection of Splunk Cloud vs. On-Premise |

### How CCC Complements the DCE

| CCC Capability | DCE Benefit |
|---|---|
| 57 products cataloged with correct add-on mappings | Customers know *what* to install; DCE handles *how* |
| 321 sourcetypes monitored | Validates the DCE is delivering data correctly |
| Legacy debt detection (93 legacy apps) | Identifies what to *remove* before configuring DCE |
| Version intelligence + upgrade buttons | Keeps the DCE add-ons at the latest version |

---

## Slide 6: The "Before & After" — One Slide Summary

### BEFORE (The Systemic Mess)

| Metric | Value |
|--------|------:|
| Cisco apps on Splunkbase | **100+** |
| Archived / removed | **52** (52%) |
| Unsupported | **41** (41%) |
| Community-built (no Cisco QA) | **46** (46%) |
| Separate TAs to choose from | **23** |
| Legacy apps customers may install by mistake | **72+** |
| Worst case: Firewall alone | **13 wrong choices** |

### AFTER (Unified Super App Strategy + CCC)

| Metric | Value |
|--------|------:|
| Super Add-ons to install | **3** |
| Products covered | **57** (across 5 categories) |
| Sourcetypes monitored for data health | **321** |
| Legacy apps auto-detected and flagged | **93** |
| Search keywords for instant discovery | **408** |
| SOAR connectors pre-mapped | **10** |
| ITSI Content Packs mapped | **4** |
| Customer action needed | **1 app install** per domain |

---

## Slide 7: The Worst Offenders — Legacy Debt Hall of Fame

### Top 10 Products by Legacy App Count

| Rank | Product | Legacy Apps | Correct Add-on |
|:----:|---------|:-----------:|----------------|
| 1 | **Cisco Secure Firewall** | **13** | Cisco Security Cloud |
| 2 | **Cisco Webex** | **8** | TA for Cisco CDR |
| 3 | **Cisco Meraki** | **5** | Cisco Catalyst Add-on |
| 4 | **Cisco Catalyst Center** | **5** | Cisco Catalyst Add-on |
| 5 | **Cisco Nexus Switches** | **5** | Cisco DC Networking |
| 6 | **Cisco Umbrella** | **4** | Cisco Security Cloud |
| 7 | **Cisco NVM** | **3** | Cisco Security Cloud |
| 8 | **Cisco Secure Network Analytics** | **3** | Cisco Security Cloud |
| 9 | **Cisco ThousandEyes** | **3** | Cisco Security Cloud |
| 10 | **Cisco ISE** | **3** | Cisco Catalyst Add-on |

### The Firewall Example in Detail

A customer with Cisco ASA/FTD firewalls searching Splunkbase today sees:

1. ~~Splunk Add-on for Cisco FireSIGHT~~ — archived
2. ~~Cisco Secure eStreamer Client Add-On~~ — legacy
3. ~~Cisco Firepower eNcore App~~ — community, 3rd-party
4. ~~Cisco Secure Firewall App for Splunk~~ — superseded
5. ~~Splunk Add-on for Cisco ASA~~ — legacy
6. ~~Enosys Add-on for Cisco Firepower eStreamer~~ — community
7. ~~Cisco FTD sourcetype~~ — community
8. ~~Cisco FTD Dashboards~~ — community
9. ~~Cisco Firepower pcap Add-on~~ — community
10. ~~Cisco eStreamer Client for Splunk~~ — legacy
11. ~~Firegen Log Analyzer for Cisco ASA~~ — community
12. ~~Cisco Security Suite~~ — community
13. ~~Cisco Suite for Splunk~~ — community

**→ The CCC shows one card: "Cisco Secure Firewall" → Install: Cisco Security Cloud. Done.**

---

## Slide 8: Strategic Alignment & Data Fabric

| Initiative | Alignment |
|---|---|
| **Cisco Data Fabric (CDF)** | Mapping Master Library logic to data products abstraction |
| **AI Readiness** | Integration with Splunk's Model Context Protocol (MCP) for AI agent telemetry context |
| **Foundational Signals** | NetFlow/IPFIX elevated to "First-Class" signals for MTTI workflows |

---

## Slide 9: Tactical Roadmap (The 3/6/12 Month Plan)

### Phase 1: Stabilization (0–3 months)

- Harden the top 20 TAs; establish credibility
- CCC product catalog at 57 products (✅ done)
- Legacy debt detection for 93 legacy apps (✅ done)
- SOAR + ITSI + Alert Action mappings (✅ done)

### Phase 2: Systematization (3–6 months)

- Ship the DCE SDK and align with OpenTelemetry (OTel)
- Expand CCC to track real-time Splunkbase version data
- Onboarding wizard for first-time product setup

### Phase 3: Differentiation (6–12 months)

- Full CDF/MDL contract integration
- MCP-driven AI features
- RBAC-aware product cards
- Multiple custom dashboards per product

---

## Slide 10: Conclusion & Next Steps

### The Problem is Quantified

| | Before | After |
|---|:---:|:---:|
| Apps on Splunkbase | 100+ | 3 Super Add-ons |
| Unsupported apps | 41% | 0% |
| Customer confusion | 13 choices for Firewall | 1 card, 1 install |
| Data validation | None | 321 sourcetypes monitored |
| Legacy detection | Manual | Automatic (93 apps) |
| Time to first dashboard | Hours/days | Minutes |

### Executive Asks

1. **Approval** for the FDSE (AI-driven maintenance) partnership
2. **Coordination** with Kunal Mukerjee for the 4-slide executive summary
3. **Goal:** Move from "Systemic Mess" to "Systematized Excellence"

---

## Appendix A: Add-on Family Breakdown

| Add-on Family | Products | Add-on ID |
|---|:---:|---|
| **Cisco Security Cloud** | 19 | `CiscoSecurityCloud` |
| **Cisco Catalyst** | 13 | `TA_cisco_catalyst` |
| **Deprecated** | 10 | Various (archived on Splunkbase) |
| **Standalone** | 6 | Individual TAs (ESA, UCS, WSA, IPS, etc.) |
| **Cisco DC Networking** | 3 | `cisco_dc_networking_app_for_splunk` |
| **Collaboration** | 3 | `TA_cisco_cdr`, `SA_cisco_meeting_server` |
| **Cloud Security** | 2 | `TA-cisco-cloud-security-addon` |
| **Observability** | 1 | `Splunk_TA_AppDynamics` |
| **Total** | **57** | **23 unique TAs** |

## Appendix B: SOAR Connector Inventory

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

## Appendix C: ITSI Content Pack Inventory

| Product | Content Pack | Install Method |
|---------|-------------|----------------|
| Cisco Meraki | Content Pack for Cisco Enterprise Networks | ITSI → Content Library |
| Cisco ThousandEyes | Content Pack for Cisco ThousandEyes | ITSI → Content Library |
| Cisco AppDynamics | Content Pack for Splunk AppDynamics | ITSI → Content Library |
| Cisco Catalyst Center | Content Pack for Cisco Enterprise Networks | ITSI → Content Library |

## Appendix D: Splunkbase Audit Summary (cisco_apps.csv)

| Metric | Count | % |
|--------|------:|--:|
| Total apps audited | 100 | 100% |
| Live on Splunkbase | 42 | 42% |
| Archived | 39 | 39% |
| Manually archived | 13 | 13% |
| Flagged | 4 | 4% |
| Deprecated | 13 | 13% |
| Cisco-developed | 41 | 41% |
| Splunk-developed | 13 | 13% |
| Community-developed | 46 | 46% |
| Not supported | 41 | 41% |
| Developer-supported | 38 | 38% |
| Cisco-supported | 13 | 13% |
| Splunk-supported | 6 | 6% |

---

*Data sourced from `cisco_apps.csv` (100 Splunkbase apps) and CCC `products.conf` (57 product catalog). All stats as of February 2026.*
