# SCAN Development Chat History — Session: Header Redesign & Card Appearance Uniformity

**Date:** February 24, 2026  
**App:** Splunk Cisco App Navigator (SCAN)  
**Session Focus:** Header utility strip redesign + uniform card appearance across all 57 products

---

## Table of Contents

1. [Header Redesign — Utility Strip](#1-header-redesign--utility-strip)
2. [First Render Review](#2-first-render-review)
3. [CSS Fix Iteration](#3-css-fix-iteration)
4. [Card Appearance Uniformity](#4-card-appearance-uniformity)
5. [Documentation Updates](#5-documentation-updates)

---

## 1. Header Redesign — Utility Strip

### User Request

> Can we just make the top of the page neater and more professional looking please. For example where do you suggest we move the light/dark, platform and versions? Keep it top right? Maybe move it down a bit? Any suggestions will be great.

### Analysis

The current header had the Cisco logo, platform icon, version badge, and theme toggle emoji all stacked vertically in the top-right corner. This felt cluttered — functional controls were mixed with branding.

### Proposed Approach — "Utility Strip"

Three options were presented:

| Option | Description |
|---|---|
| **Utility strip below header** (selected) | Move platform, version, theme into a slim bar between the header and search. Cisco logo stays top-right alone, clean and uncluttered |
| Keep top-right, just tidy up | Keep controls in the top-right area but restyle as inline pill group |
| Move controls into search bar row | Embed as right-aligned items on the search bar row |

**Theme toggle style chosen:** Small pill with label (e.g., "☀️ LIGHT" / "🌙 DARK" / "🔄 AUTO")

### Implementation

**New layout structure:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Splunk Cisco App Navigator                           [CISCO LOGO]  │
│ The Front Door to the Cisco–Splunk Ecosystem                       │
│ (i) How do I get started...                                        │
├──────────────────────────────────────────────────────────────────────┤
│ 🏢 Splunk Enterprise  ·  v1.0.1               [☀️ Light]          │  ← utility strip
├──────────────────────────────────────────────────────────────────────┤
│ [Search: "Firewall", "Duo"...]              56 products            │
│ 📁 All 56 │ 🛡 Security 26 │ ...                                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Files changed:**

| File | Changes |
|---|---|
| `src/main/webapp/pages/products/index.jsx` | Removed platform/version/theme from `header-right` (kept only Cisco logo). Added new `scan-utility-strip` div with `scan-utility-left` (platform pill, version pill, update pill) and `scan-utility-right` (theme pill with label) |
| `src/main/resources/splunk/appserver/static/products.css` | Added `.scan-utility-strip`, `.scan-util-pill`, `.scan-util-platform`, `.scan-util-version`, `.scan-util-update`, `.scan-util-theme`, `.scan-util-theme-label` styles. Removed old `.header-meta-row`, `.platform-icon-only`, `.theme-toggle-btn`, `.app-version-label`, `.app-update-link` styles |

**New CSS classes introduced:**

| Class | Purpose |
|---|---|
| `.scan-utility-strip` | Slim rounded bar with gradient background, flexbox layout |
| `.scan-util-pill` | Shared pill base — inline-flex, 12px font, 12px border-radius |
| `.scan-util-platform` | Platform pill with icon + full text label |
| `.scan-util-version` | Version pill (e.g., "v1.0.1") |
| `.scan-util-update` | Orange gradient update pill with pulse animation |
| `.scan-util-theme` | Theme toggle pill — click to cycle |
| `.scan-util-theme-label` | Uppercase label text inside theme pill |

---

## 2. First Render Review

### User Feedback (with screenshot)

> Look at it (see screenshot), is this what you intended?

**Issues identified from the screenshot:**

1. Cisco logo was too large — dominating the right side without the meta-row balancing it
2. Utility strip had no visible background — the rounded bar wasn't rendering
3. "Splunk Enterprisev1.0.1" ran together — no spacing between pills
4. "Auto" pill dropped to a second line — strip wasn't a proper single row
5. Too much vertical whitespace between header and search

### Root Cause

- CSS `var()` fallback with a gradient value (`var(--utility-bg, linear-gradient(...))`) was unreliable across browsers
- Splunk's base styles were overriding some of our new styles (specificity issue)
- Browser cached the old CSS despite server-side cache clear (Splunk caches static files by build number)

---

## 3. CSS Fix Iteration

### Changes Applied

1. **Used `!important`** on all utility strip styles to override Splunk base styles
2. **Replaced `var()` fallbacks with direct values** — gradient fallbacks inside `var()` can be unreliable
3. **Reduced Cisco logo** from 180px → 130px (standalone, it needs to be smaller)
4. **Added `flex-wrap: nowrap`** on the strip to prevent wrapping
5. **Added `flex-shrink: 0`** on utility containers
6. **Tightened header margin** from `-2px 0 6px 0` to `-4px 0 0 0`
7. **Explicitly copied CSS to stage/** — `cp src/.../products.css stage/.../products.css`

### Deploy Notes

- CSS files are static assets — Splunk caches them by build number
- `rm -f /opt/splunk/var/run/splunk/appserver/i18n/products*.cache` only clears i18n cache
- **Browser hard refresh required:** Cmd+Shift+R to bypass browser CSS cache

---

## 4. Card Appearance Uniformity

### User Request

> Can we make sure all cards have card_accent, I love the accent and make sure we are uniform across products. Also I attached a screenshot for you to let me know what you think about the opacity and banner size we used and I can use some help deciding on these and the banner color vs bg_color so the banner stands out a little more.

### Audit Results

**Before:** 38 of 57 products had `card_accent`. 19 were missing (looked flat — no left border).

Missing products breakdown:
- 10 deprecated (smoke bg, no accent, no banner)
- 7 active Splunk-supported security (ESA, Cloudlock, UCS, WSA, Talos, Intersight)
- 1 observability (AppDynamics)
- 2 under-development (EVM, Radware)

### User Decisions

| Setting | Before | After | Rationale |
|---|---|---|---|
| `card_banner_opacity` | `0.08` (invisible) | **`0.12`** | Subtle but readable watermark |
| `card_banner_size` | `medium` (13px) | **`small`** (11px) | Elegant at higher opacity |
| Deprecated cards | No accent, no banner | **Gray accent + "Deprecated" red banner** | Visual EOL indicator |

### Accent Color Family Map (All 57 Products)

| Family | Accent Color | bg_color | Products |
|---|---|---|---|
| Cisco Security Cloud | `#049fd9` (Cisco blue) | ice | 17 active + 2 under-dev |
| Cisco Cloud Security | `#1976d2` (blue) | sky | Secure Access, Umbrella |
| Splunk-supported Security | `#1976d2` (blue) | pearl | ESA, Cloudlock, UCS, WSA, Talos, Intersight |
| Cisco Catalyst / Networking | `#6abf4b` (green) | mint | Meraki, ISE, SD-WAN, Catalyst Center, etc. |
| DC Networking | `#00897b` (teal) | ice | ACI, Nexus Dashboard, HyperFabric |
| Collaboration | `#7b1fa2` (purple) | lavender | Webex, CMS, CUCM |
| Observability | `#ff6f00` (amber) | cream | AppDynamics |
| Deprecated | `#9e9e9e` (gray) | smoke | 10 deprecated products |

### Banner Text Assignments (19 New)

| Category | Products | Banner Text | Banner Color |
|---|---|---|---|
| Deprecated (10) | CWS, Domain Protection, NAE, Prime, PSIRT, ACS, SecureX, IPS, CMX, BST | "Deprecated" | red |
| Splunk-supported (6) | ESA, Cloudlock, UCS, WSA, Talos, Intersight | "Cisco Supported" | blue |
| Under-development (2) | EVM, Radware | "Under Development" | gold |
| Observability (1) | AppDynamics | "Cisco Supported" | gold |

### Implementation

Created `scripts/uniform_card_appearance.py`:
- Global: `card_banner_opacity` 0.08 → 0.12 (57 replacements)
- Global: `card_banner_size` medium → small (57 replacements)
- Per-product: assigned `card_accent` to 19 missing products
- Per-product: assigned `card_banner` text and `card_banner_color` to 19 products
- **Total: 171 changes** across products.conf
- Dry-run verification before applying

Also created `scripts/audit_card_appearance.py` for future auditing — reports all products' accent/bg/banner/opacity/size fields and flags any missing values.

---

## 5. Documentation Updates

### Files Updated

| File | Changes |
|---|---|
| `packages/.../splunk/README.md` | Updated Card Appearance System section with all 7 accent families, default opacity 0.12, default size small. Updated header reference to "Utility Strip" |
| `packages/.../README.md` | Updated feature list with uniform card accents, utility strip, theme toggle pill |
| `README.md` (root) | Updated feature table (card appearance → "All 57 cards have card_accent"), added new scripts to directory tree |
| `docs/Executive_Brief.md` | Updated card appearance fields (accent families, default opacity/size), replaced "compact header" with utility strip description, added 3 new roadmap completed items |
| `docs/Cisco_Splunk_Apps_Presentation.md` | Replaced "compact header" row with utility strip + uniform card appearance rows |
| `docs/Cisco_Splunk_TA_Strategy_Presentation.md` | Added 3 new capability rows (uniform accent, utility strip, deprecated banners) |

### Chat History Export

This file (`docs/Chat_History_Header_CardAppearance.md`) exported as requested.

---

## Summary of All Changes This Session

### JSX Changes (index.jsx)

- Removed `header-meta-row` div with platform icon, version badge, theme button from `header-right`
- `header-right` now contains only the Cisco hero logo
- Added `scan-utility-strip` div between header and error/search sections
- Platform: icon-only → pill with icon + full text ("Splunk Enterprise" / "Splunk Cloud")
- Version: badge → pill in utility strip
- Theme: emoji button → pill with emoji + uppercase label ("☀️ LIGHT" etc.)
- Update link: standalone banner → orange pill in utility strip

### CSS Changes (products.css)

- Removed: `.header-meta-row`, `.platform-icon-only`, `.theme-toggle-btn`, `.app-version-label`, `.app-update-link`
- Added: `.scan-utility-strip`, `.scan-util-pill`, `.scan-util-platform`, `.scan-util-version`, `.scan-util-update`, `.scan-util-theme`, `.scan-util-theme-label` (with dark mode variants)
- Modified: `.header-right` (gap: 0), `.scan-hero-logo` (180px → 130px), `.products-page-header` (tighter margin)
- All utility strip styles use `!important` to override Splunk base styles

### products.conf Changes (171 total)

- `card_banner_opacity`: 0.08 → 0.12 (57 products)
- `card_banner_size`: medium → small (57 products)
- `card_accent`: assigned to 19 previously empty products
- `card_banner`: assigned text to 19 previously empty products
- `card_banner_color`: assigned to 19 previously empty products

### New Scripts

- `scripts/uniform_card_appearance.py` — Bulk card appearance update tool
- `scripts/audit_card_appearance.py` — Card appearance field auditor

---

*Generated: February 24, 2026*
