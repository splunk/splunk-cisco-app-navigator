# SCAN — Decision Log

> Living record of key design decisions, conventions, and rationale.
> Updated after each significant change. Newest entries at the top.
> This file is the "institutional memory" that survives chat sessions.

---

## 2026-03-21 — Remove AI-Powered Filter

**Decision:** Remove the AI-Powered category filter from the UI entirely.
Keep the `ai_enabled` field in `products.conf` for future use.

**Rationale:** "AI-Powered" is a marketing label, not a technical one. Every
other filter (SC4S, NetFlow, SOAR, Alert Actions, SecOps, ITOps) maps to a
concrete Splunk integration or content ecosystem. Cisco is branding nearly
everything as AI-powered, so the filter was becoming meaningless.

**Scope:** Removed from filter pills, subcategory bars, drawer pills,
`crossCutLabels`, `CROSS_CUT_IDS`, `categoryCounts`, filtering logic, saved
filter state, and all associated CSS.

---

## 2026-03-21 — Badge Color Palette Overhaul

**Decision:** Replace the original amber/purple badge colors with a cohesive
cool-toned palette. Also shift Alert Actions from orange to rose.

| Badge | Light Mode | Dark Mode |
|-------|-----------|-----------|
| SecOps | Slate `#F1F5F9` bg, `#334155` text | Slate overlay, `#CBD5E1` text |
| ITOps | Indigo `#EEF2FF` bg, `#4F46E5` text | Indigo overlay, `#A5B4FC` text |
| Alert Actions | Rose `#FDF2F8` bg, `#BE185D` text | Rose overlay, `#F9A8D4` text |

**Rationale:** Category badges should use cool, non-status tones. The original
amber (SecOps) and orange (Alert Actions) colors clashed with red/yellow/green
status indicators on the cards, creating visual confusion. Research from
PatternFly and Splunk Design System confirmed: warm colors = status, cool colors
= categories.

---

## 2026-03-21 — Splunk React Icons for SecOps/ITOps Badges

**Decision:** Use `Shield` from `@splunk/react-icons/Shield` for SecOps and
`Pulse` from `@splunk/react-icons/Pulse` for ITOps. Other badges (SC4S,
NetFlow, SOAR, Alert Actions) stay text-only.

**Rationale:** SecOps and ITOps represent major content ecosystems (ES/SSE/ESCU
and ITSI/ITE Learn) — they deserve extra visual weight. Adding icons to every
badge would create clutter on cards with 4-5 badges. The `Pulse` icon matches
Splunk's existing ITSI app icon.

---

## 2026-03-21 — SecOps + ITOps Unified Badge System

**Decision:** Rename the ES badge to "SecOps" and ITSI badge to "ITOps" to
reflect broader content ecosystems beyond the premium products.

- **SecOps** appears when a product has `es_compatible` OR `sse_content`.
  Modal shows two tiers: ES (Premium) and Security Essentials (Free).
- **ITOps** appears when a product has `itsi_content_pack` OR `ite_learn_content`.
  Modal shows two tiers: ITSI (Premium) and IT Essentials Learn (Free).

**Rationale:** The old "ES" and "ITSI" badges were too narrow — they only
surfaced premium product compatibility. Many products have free content in SSE
and ITE Learn that admins should know about. The unified badges surface the
full value of each product across the ecosystem.

**Data model additions:**
- `sse_content`, `sse_use_cases`, `sse_use_case_count`, `sse_data_sources`
- `ite_learn_content`, `ite_learn_procedures`, `ite_learn_procedure_count`

---

## 2026-03-21 — ITOps Stats Tile

**Decision:** Add an ITOps tile to the stats bar (after SecOps) showing the
count of products with ITSI content packs or ITE Learn procedures.

**Rationale:** SecOps already had a tile. Parity for ITOps gives admins a
quick glance at ITOps coverage.

---

## 2026-03-21 — ITE Learn Firewall Procedures Are Correctly ITOps

**Decision:** The ITE Learn procedures for Cisco Secure Firewall ("Rarely
used firewall rules", "Detect blocked traffic to host", "Detect blocked
traffic from host") are correctly categorized under ITOps.

**Rationale:** These procedures live in ITE Learn (Splunk's ITOps tool).
Firewall rule hygiene is a legitimate network operations concern. The content
is security-adjacent but published in the ITOps ecosystem — we catalog where
Splunk publishes it, not where it arguably "belongs."

---

## 2026-03-20 — Dark Mode Is Mandatory

**Decision:** Every UI change must account for dark mode. Added to all three
AI skills as a mandatory section.

**Convention:** The app uses `:root.dce-dark` as the dark-mode selector. All
new CSS classes need both a light-mode rule and a dark-mode override. Inline
styles should prefer CSS custom properties over hardcoded hex.

---

## 2026-03-20 — Git Workflow: Stacked Topic Commits

**Decision:** Use stacked/topic commits — one logical change per commit with
a descriptive message. Preferred over monolithic commits.

**Convention:** Branch naming is `TENG-<Jira Number>` (mandatory).
Documented in Section 29 of the Architecture Guide.

---

## 2026-03-20 — Documentation Lives in Package Docs

**Decision:** Essential app documentation (Architecture Guide, User Manual)
lives in `packages/splunk-cisco-app-navigator/docs/` and is tracked by git.
The top-level `docs/` directory is git-ignored and used for working notes.

**Convention:** `.gitignore` uses `/docs/` (anchored) so only the top-level
directory is ignored. The package-level `docs/` is always tracked.

---

## 2026-03-20 — Build Process Must Not Modify app.conf

**Decision:** The build script must not add version comments (e.g. `# v1.0.19`)
to `app.conf`. The file should remain clean.

---

## 2026-03-20 — Sourcetype Search Filters

**Decision:** Sourcetype detection searches exclude "junk" Splunk apps
(system, learned, etc.) to avoid false positives.

---

## 2026-03-20 — Naming: ITOps (Not Observability or O11y)

**Decision:** Use "ITOps" for the ITSI/ITE Learn category, not "Observability"
or "O11y".

**Rationale:** ITSI and ITE Learn are firmly IT Operations tools. "Observability"
is a broader concept that includes APM, RUM, and infrastructure monitoring —
none of which are in scope for these badges. "ITOps" is precise and matches
how Splunk positions ITSI.

## 12. Contextual Launch dropdown for TA-only products (2025-03-21)

**Decision:** When a product has an installed add-on but no companion app with
visible UI (e.g. `Splunk_TA_cisco-wsa`, `Splunk_TA_cisco-esa`), replace the
green "Launch" button with a blue "Explore" button. The dropdown offers
"Explore Data in Search" (pre-filled sourcetype metadata query) and "Create
Dashboard" (opens Dashboard Studio). The "Set Custom" option lets users
point the button at their own Dashboard Studio creation. Detection is
runtime: `checkAppStatus` now returns `visible` from the Splunk REST API.

**Rationale:** TA-only products (add-on for data ingest + CIM normalization,
no built-in dashboards) previously led to a 404 when users clicked "Launch"
because the TA's `is_visible = false`. Rather than hiding the button entirely,
we guide users toward the next productive step: exploring their data or
creating their first dashboard. Option C (contextual dropdown) was chosen
over Options A (single Explore button) and B (single Create Dashboard button)
because it serves both the "I just want to see my data" and "I want to build
something" use cases without forcing a choice.
