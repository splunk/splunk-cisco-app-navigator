/**
 * Splunk Cisco App Navigator — Products Page ("The Glass Pane")
 *
 * The Splunk Cisco App Navigator helps Splunk administrators find the exact Splunk
 * add-ons and apps required for each Cisco product — no guessing.  Each card
 * represents a Cisco product and shows:
 *
 *   • Which Splunk add-on (TA) is needed to ingest data
 *   • Which Splunk app provides dashboards to visualise the data
 *   • Whether those apps are installed and up-to-date
 *   • Whether legacy/deprecated apps should be removed first
 *   • Whether the expected sourcetypes are already arriving
 *   • Platform-aware best-practice guidance (Cloud vs Enterprise)
 *
 * Five sections:
 *   1. Configured Products    — products the admin has added to their workspace
 *   2. Available Products     — active products ready to configure
 *   3. Unsupported Products   — products with no official support (not_supported)
 *   4. Coming Soon            — products under development
 *   5. Deprecated / Archived  — archived products no longer on Splunkbase
 *   6. GTM Roadmap — Coverage Gaps — Cisco products with zero Splunk integration
 *
 * All product metadata lives in products.conf.  A static PRODUCT_CATALOG
 * array mirrors that file so cards always render even outside Splunk.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { createURL } from '@splunk/splunk-utils/url';
import { getCSRFToken } from '@splunk/splunk-utils/config';
import Button from '@splunk/react-ui/Button';
import CollapsiblePanel from '@splunk/react-ui/CollapsiblePanel';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import Message from '@splunk/react-ui/Message';
import Modal from '@splunk/react-ui/Modal';
import Tooltip from '@splunk/react-ui/Tooltip';

// ─────────────────────────────  CONSTANTS  ─────────────────────────────

const APP_ID = 'splunk-cisco-app-navigator';
const CONF_ENDPOINT = `/splunkd/__raw/servicesNS/-/${APP_ID}/configs/conf-products`;
const APPS_LOCAL_ENDPOINT = '/splunkd/__raw/services/apps/local';
const SERVER_INFO_ENDPOINT = '/splunkd/__raw/services/server/info';
const SEARCH_ENDPOINT = '/splunkd/__raw/services/search/jobs';
const CONFIGURED_STORAGE_KEY = 'scan_configured_products';
const THEME_STORAGE_KEY = 'scan_theme_preference'; // 'light' | 'dark' | 'auto'
const PORTFOLIO_STORAGE_KEY = 'scan_show_full_portfolio'; // 'true' | 'false'
const DEVMODE_STORAGE_KEY = 'scan_developer_mode'; // 'true' | 'false'
const PERSONA_STORAGE_KEY = 'scan_persona_shown'; // 'true' once persona modal dismissed
const SUPPORTED_LEVELS = new Set(['cisco_supported', 'splunk_supported']);

/** Persona presets — each maps a role to a category filter + suggested product IDs */
const PERSONA_PRESETS = [
    {
        id: 'security',
        icon: '🛡️',
        title: 'Security Analyst',
        description: 'Firewalls, threat detection, identity, XDR, and endpoint protection',
        category: 'security',
        color: '#e53935',
        suggested: [
            'cisco_secure_firewall', 'cisco_secure_endpoint', 'cisco_xdr',
            'cisco_duo', 'cisco_umbrella', 'cisco_ise', 'cisco_secure_network_analytics',
            'cisco_secure_access', 'cisco_talos',
        ],
    },
    {
        id: 'networking',
        icon: '🌐',
        title: 'Network Engineer',
        description: 'Campus, SD-WAN, switches, routers, Meraki, and data center networking',
        category: 'networking',
        color: '#00897b',
        suggested: [
            'cisco_catalyst_center', 'cisco_catalyst_sdwan', 'cisco_meraki',
            'cisco_nexus', 'cisco_aci', 'cisco_ise', 'cisco_wlc',
            'cisco_access_points', 'cisco_catalyst_switches',
        ],
    },
    {
        id: 'collaboration',
        icon: '🎧',
        title: 'Collaboration Admin',
        description: 'Webex, CUCM, video conferencing, and meeting infrastructure',
        category: 'collaboration',
        color: '#5e35b1',
        suggested: [
            'cisco_webex', 'cisco_cucm', 'cisco_meeting_server',
            'cisco_meeting_management', 'cisco_tvcs',
        ],
    },
    {
        id: 'observability',
        icon: '📊',
        title: 'Observability Engineer',
        description: 'APM, monitoring, ThousandEyes, and full-stack telemetry',
        category: 'observability',
        color: '#1565c0',
        suggested: [
            'cisco_thousandeyes', 'cisco_appdynamics',
        ],
    },
    {
        id: 'explorer',
        icon: '🧭',
        title: 'Explorer',
        description: 'Browse the full Cisco portfolio — all categories, all products',
        category: null,
        color: '#049fd9',
        suggested: [],
    },
];

const CATEGORIES = [
    { id: 'security', name: 'Security', icon: 'shield', description: 'Firewalls, identity, threat detection, and secure access' },
    { id: 'observability', name: 'Observability', icon: 'chart', description: 'Monitoring, analytics, and telemetry' },
    { id: 'networking', name: 'Networking', icon: 'globe', description: 'Campus, branch, WAN, and OT/ICS networking' },
    { id: 'collaboration', name: 'Collaboration', icon: 'headset', description: 'Meeting, messaging, calling, and workspace platforms' },
];

// Categories that render as product cards. Stanzas with a category NOT in this
// set (e.g. alert_actions) are metadata-only and excluded from the UI grid.
const CATEGORY_IDS = new Set([...CATEGORIES.map(c => c.id)]);

// Sub-categories within main categories, keyed by subcategory field value.
// Based on official Cisco product taxonomy.
const SUB_CATEGORIES = {
    security: [
        { id: 'cloud_security', name: 'Cloud Security', icon: '☁️' },
        { id: 'network_security', name: 'Network Security', icon: '🔥' },
        { id: 'identity_access', name: 'Identity & Access', icon: '🔑' },
        { id: 'email_security', name: 'Email Security', icon: '📧' },
        { id: 'endpoint_security', name: 'Endpoint Security', icon: '🖥️' },
        { id: 'workload_security', name: 'Workload Security', icon: '🐝' },
        { id: 'application_security', name: 'Application Security', icon: '🛡️' },
        { id: 'threat_response', name: 'Threat Intel & Response', icon: '🔍' },
    ],
    networking: [
        { id: 'campus_wireless', name: 'Campus & Wireless', icon: '📡' },
        { id: 'routing_wan', name: 'Routing & WAN', icon: '🛣️' },
        { id: 'data_center_net', name: 'Data Center', icon: '🏢' },
        { id: 'compute_infra', name: 'Compute & Infra', icon: '🖥️' },
    ],
};

const ICON_EMOJI_MAP = {
    robot: '🤖', lock: '🔒', email: '📧', search: '🔍', badge: '🪪',
    bee: '🐝', zap: '⚡', cloud: '☁️', satellite: '📡', shield: '🛡️',
    fire: '🔥', microscope: '🔬', chart: '📊', building: '🏢', eye: '👁️',
    mag: '🔎', detective: '🕵️', stop_sign: '🛑', cloud_lock: '🔐',
    factory: '🏭', globe: '🌐', key: '🔑', highway: '🛣️',
    switch: '🔀', jigsaw: '🧩', dashboard: '📋',
    server: '🖥️', web: '🌍', skull: '💀', umbrella: '☂️',
    lock_globe: '🔒🌐',
    cloud_network: '☁️🌐',
    headset: '🎧', video: '📹', phone: '📞',
    archive: '📦', shield_cloud: '🛡️☁️',
};

// ─────────────────  STATIC PRODUCT CATALOG  ─────────────────
// Generated at build time from products.conf by bin/generate-catalog.js.
// To add/edit products, update products.conf and rebuild.
import { PRODUCT_CATALOG } from './productCatalog.generated';

// ─────────────────────────────  HELPERS  ─────────────────────────────

function getConfiguredIds() {
    try { return JSON.parse(localStorage.getItem(CONFIGURED_STORAGE_KEY)) || []; }
    catch (e) { return []; }
}
function saveConfiguredIds(ids) {
    try { localStorage.setItem(CONFIGURED_STORAGE_KEY, JSON.stringify(ids)); }
    catch (e) { /* quota */ }
}
function getThemePreference() {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || 'auto'; }
    catch (e) { return 'auto'; }
}
function saveThemePreference(pref) {
    try { localStorage.setItem(THEME_STORAGE_KEY, pref); }
    catch (e) { /* quota */ }
}
function getPortfolioPreference() {
    try { return localStorage.getItem(PORTFOLIO_STORAGE_KEY) === 'true'; }
    catch (e) { return false; }
}
function savePortfolioPreference(show) {
    try { localStorage.setItem(PORTFOLIO_STORAGE_KEY, show ? 'true' : 'false'); }
    catch (e) { /* quota */ }
}

function splunkFetch(url, options = {}) {
    const headers = {
        'X-Splunk-Form-Key': getCSRFToken() || '',
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers,
    };
    return fetch(createURL(url), { credentials: 'include', ...options, headers });
}

function csvToArray(val) {
    if (!val) return [];
    return val.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Load products.conf via Splunk's built-in configs/conf-products endpoint.
 */
async function loadProductsFromConf() {
    const res = await splunkFetch(`${CONF_ENDPOINT}?output_mode=json&count=0`);
    const data = await res.json();
    return (data.entry || []).filter(entry => {
        const d = entry.content?.disabled;
        return d !== true && d !== "true" && d !== "1" && d !== 1;
    }).map(entry => {
        const c = entry.content || {};
        const name = entry.name;
        const laIds    = csvToArray(c.legacy_apps);
        const laLabels = csvToArray(c.legacy_labels);
        const laUids   = csvToArray(c.legacy_uids);
        const laUrls   = csvToArray(c.legacy_urls);
        const laStatuses = csvToArray(c.legacy_statuses);
        const paIds    = csvToArray(c.prereq_apps);
        const paLabels = csvToArray(c.prereq_labels);
        const paUids   = csvToArray(c.prereq_uids);
        const paUrls   = csvToArray(c.prereq_urls);
        const caIds    = csvToArray(c.community_apps);
        const caLabels = csvToArray(c.community_labels);
        const caUids   = csvToArray(c.community_uids);
        const caUrls   = csvToArray(c.community_urls);
        return {
            product_id: name,
            display_name: c.display_name || name,
            description: c.description || '',
            value_proposition: c.value_proposition || '',
            vendor: c.vendor || 'Cisco',
            tagline: c.tagline || '',
            category: c.category || 'security',
            version: c.version || '1.0.0',
            status: c.status || 'active',
            addon: c.addon || '',
            addon_label: c.addon_label || '',
            addon_family: c.addon_family || 'default',
            subcategory: c.subcategory || '',
            ai_enabled: c.ai_enabled === 'true' || c.ai_enabled === '1' || c.ai_enabled === true,
            ai_description: c.ai_description || '',
            cisco_retired: c.cisco_retired === 'true' || c.cisco_retired === '1' || c.cisco_retired === true,
            coverage_gap: c.coverage_gap === 'true' || c.coverage_gap === '1' || c.coverage_gap === true,
            addon_splunkbase_url: c.addon_splunkbase_url || '',
            addon_docs_url: c.addon_docs_url || '',
            addon_troubleshoot_url: c.addon_troubleshoot_url || '',
            addon_install_url: c.addon_install_url || '',
            app_viz: c.app_viz || '',
            app_viz_label: c.app_viz_label || '',
            app_viz_splunkbase_url: c.app_viz_splunkbase_url || '',
            app_viz_docs_url: c.app_viz_docs_url || '',
            app_viz_troubleshoot_url: c.app_viz_troubleshoot_url || '',
            app_viz_install_url: c.app_viz_install_url || '',
            app_viz_2: c.app_viz_2 || '',
            app_viz_2_label: c.app_viz_2_label || '',
            app_viz_2_splunkbase_url: c.app_viz_2_splunkbase_url || '',
            app_viz_2_docs_url: c.app_viz_2_docs_url || '',
            app_viz_2_troubleshoot_url: c.app_viz_2_troubleshoot_url || '',
            app_viz_2_install_url: c.app_viz_2_install_url || '',
            learn_more_url: c.learn_more_url || '',
            legacy_apps: laIds.map((appId, i) => ({
                app_id: appId,
                display_name: laLabels[i] || appId,
                uid: laUids[i] || '',
                addon_splunkbase_url: laUrls[i] || '',
                status: laStatuses[i] || 'active',
            })),
            prereq_apps: paIds.map((appId, i) => ({
                app_id: appId,
                display_name: paLabels[i] || appId,
                uid: paUids[i] || '',
                addon_splunkbase_url: paUrls[i] || '',
            })),
            community_apps: caIds.map((appId, i) => ({
                app_id: appId,
                display_name: caLabels[i] || appId,
                uid: caUids[i] || '',
                url: caUrls[i] || '',
            })),
            sourcetypes: csvToArray(c.sourcetypes),
            dashboard: (c.dashboards || '').trim(),
            custom_dashboard: c.custom_dashboard || '',
            icon_emoji: c.icon_emoji || '',
            icon_svg: c.icon_svg || '',
            aliases: csvToArray(c.aliases),
            keywords: csvToArray(c.keywords),
            alert_actions: [
                c.alert_action_label ? { label: c.alert_action_label, uid: c.alert_action_uid || '', url: c.alert_action_url || '' } : null,
                c.alert_action_2_label ? { label: c.alert_action_2_label, uid: c.alert_action_2_uid || '', url: c.alert_action_2_url || '' } : null,
            ].filter(Boolean),
            soar_connectors: [
                c.soar_connector_label ? { label: c.soar_connector_label, uid: c.soar_connector_uid || '', url: c.soar_connector_url || '' } : null,
                c.soar_connector_2_label ? { label: c.soar_connector_2_label, uid: c.soar_connector_2_uid || '', url: c.soar_connector_2_url || '' } : null,
                c.soar_connector_3_label ? { label: c.soar_connector_3_label, uid: c.soar_connector_3_uid || '', url: c.soar_connector_3_url || '' } : null,
            ].filter(Boolean),
            itsi_content_pack: c.itsi_content_pack_label ? { label: c.itsi_content_pack_label, docs_url: c.itsi_content_pack_docs_url || '' } : null,
            card_banner: c.card_banner || '',
            card_banner_color: c.card_banner_color || '',
            card_banner_size: c.card_banner_size || '',
            card_banner_opacity: c.card_banner_opacity || '',
            card_accent: c.card_accent || '',
            card_bg_color: c.card_bg_color || '',
            is_new: c.is_new === 'true' || c.is_new === '1',
            secure_networking_gtm: c.secure_networking_gtm === 'true' || c.secure_networking_gtm === '1',
            support_level: c.support_level || '',
            sc4s_url: c.sc4s_url || '',
            sc4s_label: c.sc4s_label || '',
            sc4s_supported: c.sc4s_supported === 'true' || c.sc4s_supported === '1' || c.sc4s_supported === true,
            sc4s_search_head_ta: c.sc4s_search_head_ta || '',
            sc4s_search_head_ta_label: c.sc4s_search_head_ta_label || '',
            sc4s_search_head_ta_splunkbase_url: c.sc4s_search_head_ta_splunkbase_url || '',
            sc4s_search_head_ta_splunkbase_id: c.sc4s_search_head_ta_splunkbase_id || '',
            sc4s_search_head_ta_install_url: c.sc4s_search_head_ta_install_url || '',
            sc4s_sourcetypes: (c.sc4s_sourcetypes || '').split(',').map(s => s.trim()).filter(Boolean),
            sc4s_config_notes: (c.sc4s_config_notes || '').split('|').map(s => s.trim()).filter(Boolean),
            best_practices: (c.best_practices || '').split('|').map(s => s.trim()).filter(Boolean),
            sort_order: parseInt(c.sort_order || '100', 10),
        };
    }).sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name))
      .filter(p => CATEGORY_IDS.has(p.category));
}

/**
 * Check a single Splunk app: installed? version? update available?
 */
async function checkAppStatus(appId) {
    if (!appId) return { installed: false, version: null, updateVersion: null, disabled: false };
    try {
        const res = await splunkFetch(`${APPS_LOCAL_ENDPOINT}/${encodeURIComponent(appId)}?output_mode=json`);
        if (!res.ok) return { installed: false, version: null, updateVersion: null, disabled: false };
        const data = await res.json();
        const c = data.entry?.[0]?.content || {};
        return {
            installed: true,
            version: c.version || null,
            updateVersion: c['update.version'] || null,
            disabled: c.disabled === true || c.disabled === 'true',
        };
    } catch (e) {
        return { installed: false, version: null, updateVersion: null, disabled: false };
    }
}

/**
 * Format a large number into a human-friendly abbreviated string.
 * e.g. 1234 → "1.2K", 2500000 → "2.5M", 45 → "45"
 */
function formatCount(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

/**
 * Build the prefix-match patterns for a product's sourcetypes list.
 * Shared by detectAllSourcetypeData and buildSourcetypeSearchUrl.
 */
function buildSourcetypePatterns(sourcetypes) {
    const prefixes = new Set();
    sourcetypes.forEach(st => {
        const parts = st.split(':');
        if (parts.length <= 2) {
            prefixes.add(st);
        } else {
            prefixes.add(parts.slice(0, 2).join(':') + ':');
        }
    });
    const sorted = [...prefixes].sort((a, b) => a.length - b.length);
    return sorted.filter((p, i) => !sorted.slice(0, i).some(shorter => p.startsWith(shorter)));
}

/**
 * Detect sourcetype data for ALL products in a single metadata search.
 *
 * Runs ONE search:
 *   | metadata type=sourcetypes index=*
 *   | where lastTime > relative_time(now(), "-24h")
 *   | table sourcetype totalCount
 *
 * Then matches each product's sourcetype patterns client-side.
 * This replaces the previous per-product approach (52 searches → 1).
 */
async function detectAllSourcetypeData(products) {
    const noData = { hasData: false, eventCount: 0, detail: 'No sourcetypes defined' };
    const withST = products.filter(p => p.sourcetypes && p.sourcetypes.length > 0);
    if (withST.length === 0) return {};
    if (!getCSRFToken()) {
        const r = {};
        withST.forEach(p => { r[p.product_id] = { hasData: false, eventCount: 0, detail: 'CSRF token unavailable' }; });
        return r;
    }
    try {
        const searchStr = '| metadata type=sourcetypes index=* | where lastTime > relative_time(now(), "-24h") | table sourcetype totalCount';
        const res = await splunkFetch(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `search=${encodeURIComponent(searchStr)}&output_mode=json&exec_mode=oneshot&count=0&timeout=120`,
        });
        const data = await res.json();
        const rows = data.results || []; // [{ sourcetype: '...', totalCount: '123' }, ...]

        // Build a quick lookup: sourcetype → totalCount
        const stMap = new Map();
        rows.forEach(r => stMap.set(r.sourcetype, parseInt(r.totalCount, 10) || 0));

        // Match each product's patterns against the result set
        const results = {};
        withST.forEach(p => {
            const patterns = buildSourcetypePatterns(p.sourcetypes);
            let stCount = 0;
            let eventCount = 0;
            stMap.forEach((count, st) => {
                if (patterns.some(pat => pat.endsWith(':') ? st.startsWith(pat) : st === pat || st.startsWith(pat + ':'))) {
                    stCount++;
                    eventCount += count;
                }
            });
            results[p.product_id] = stCount > 0
                ? { hasData: true, eventCount, detail: `${stCount} sourcetype${stCount !== 1 ? 's' : ''} active · ${formatCount(eventCount)} events` }
                : { hasData: false, eventCount: 0, detail: 'No data in the last 24 hours' };
        });

        // Fill in products that have no sourcetypes
        products.forEach(p => {
            if (!results[p.product_id]) results[p.product_id] = noData;
        });
        return results;
    } catch (e) {
        const r = {};
        withST.forEach(p => { r[p.product_id] = { hasData: false, eventCount: 0, detail: 'Could not query sourcetypes' }; });
        return r;
    }
}

/**
 * Build a Splunk search URL that runs:
 *   | metadata type=sourcetypes index=* | where match(sourcetype, "pattern")
 */
function buildSourcetypeSearchUrl(sourcetypes) {
    if (!sourcetypes || sourcetypes.length === 0) return null;
    const filtered = buildSourcetypePatterns(sourcetypes);
    const pattern = filtered.join('|');
    const spl = `| metadata type=sourcetypes index=* | where match(sourcetype, "${pattern}")`;
    return createURL(`/app/search/search?q=${encodeURIComponent(spl)}`);
}

/**
 * Save a custom_dashboard value to local/products.conf for a given product stanza.
 */
async function saveCustomDashboard(productId, value) {
    const url = `/splunkd/__raw/servicesNS/nobody/${APP_ID}/configs/conf-products/${encodeURIComponent(productId)}`;
    const body = `output_mode=json&custom_dashboard=${encodeURIComponent(value || '')}`;
    const res = await splunkFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to save custom dashboard: ${res.status} ${text}`);
    }
    return true;
}

// ─────────────────  RICH TEXT RENDERER  ─────────────────────────

/**
 * Renders a plain-text string with lightweight markup into React elements.
 *
 * Supported markup (usable directly in products.conf fields like `description`):
 *   **bold text**       → <strong>
 *   *italic text*       → <em>
 *   `code`              → <code>
 *   [link text](url)    → <a href>
 *   \n  or  |            → <br/> (line break)
 *   {small}text{/small} → smaller text (11px)
 *   {large}text{/large} → larger text (15px)
 *   {h}text{/h}         → heading-style text (16px bold)
 */
function renderFormattedText(text) {
    if (!text) return null;

    // Split on pipe or literal \n to create paragraphs/line breaks
    const lines = text.replace(/\\n/g, '|').split('|');

    return lines.map((line, lineIdx) => {
        // Tokenize inline markup using regex
        // Order matters: ** before *, and [link](url) before others
        const tokens = [];
        const regex = /\{(small|large|h)\}(.*?)\{\/\1\}|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null) {
            // Push plain text before this match
            if (match.index > lastIndex) {
                tokens.push(<span key={`t${lineIdx}-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>);
            }

            if (match[1]) {
                // {small}, {large}, {h} tags
                const tag = match[1];
                const inner = match[2];
                const cls = tag === 'small' ? 'csc-fmt-small' : tag === 'large' ? 'csc-fmt-large' : 'csc-fmt-heading';
                tokens.push(<span key={`sz${lineIdx}-${match.index}`} className={cls}>{inner}</span>);
            } else if (match[3]) {
                // **bold**
                tokens.push(<strong key={`b${lineIdx}-${match.index}`}>{match[3]}</strong>);
            } else if (match[4]) {
                // *italic*
                tokens.push(<em key={`i${lineIdx}-${match.index}`}>{match[4]}</em>);
            } else if (match[5]) {
                // `code`
                tokens.push(<code key={`c${lineIdx}-${match.index}`} className="csc-fmt-code">{match[5]}</code>);
            } else if (match[6]) {
                // [text](url)
                tokens.push(
                    <a key={`a${lineIdx}-${match.index}`} href={match[7]} target="_blank" rel="noopener noreferrer" className="csc-fmt-link">
                        {match[6]}
                    </a>
                );
            }
            lastIndex = match.index + match[0].length;
        }

        // Remaining plain text
        if (lastIndex < line.length) {
            tokens.push(<span key={`e${lineIdx}-${lastIndex}`}>{line.slice(lastIndex)}</span>);
        }

        return (
            <React.Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {tokens.length > 0 ? tokens : line}
            </React.Fragment>
        );
    });
}

// ──────────────────  BEST PRACTICES for each product  ──────────────────

function getBestPractices(product, platformType) {
    const isCloud = platformType === 'cloud';
    const pn = product.display_name;
    const ta = product.addon_label || product.addon;
    const viz = product.app_viz_label || product.app_viz || null;
    const tips = [];

    // ── Platform / data-collection tip ──────────────────────────────────
    if (product.sc4s_url) {
        // Product has a specific SC4S page — show a targeted recommendation with link
        const sc4sLabel = product.sc4s_label || 'SC4S documentation';
        if (isCloud) {
            tips.push({
                text: `Since you are running Splunk Cloud, we highly recommend using SC4S (Splunk Connect for Syslog) for data collection. While the TA can be installed on an on-prem Heavy Forwarder to listen on a UDP port, this approach is only advisable for very small environments or single-integration use cases.`,
                linkLabel: sc4sLabel,
                linkUrl: product.sc4s_url,
                icon: '🔗',
            });
        } else {
            tips.push({
                text: `For data collection, we highly recommend using SC4S (Splunk Connect for Syslog) to reliably ingest data for ${pn}. While the TA can be installed on a Heavy Forwarder to listen directly on a UDP port, this approach is only advisable for very small environments or single-integration use cases.`,
                linkLabel: sc4sLabel,
                linkUrl: product.sc4s_url,
                icon: '🔗',
            });
        }
    } else if (isCloud) {
        tips.push({ text: `Since you are running Splunk Cloud, data for ${pn} is best ingested using a cloud-compatible input method such as an HTTP Event Collector (HEC) endpoint or the Splunk Cloud Data Manager.` });
    } else {
        tips.push({ text: `On Splunk Enterprise, consider using Splunk Connect for Syslog (SC4S) to reliably ingest data for ${pn}. SC4S handles syslog parsing and routes events to the correct sourcetype automatically.` });
    }

    tips.push({ text: `The required add-on for data ingestion is "${ta}". Make sure it is installed and enabled on your search heads and heavy forwarders.` });

    if (viz) {
        tips.push({ text: `To visualise dashboards and reports, install "${viz}" on your search heads.` });
    }

    if (product.sourcetypes && product.sourcetypes.length > 0) {
        tips.push({ text: `Expected sourcetypes: ${product.sourcetypes.join(', ')}. Verify these appear in your environment after configuring the data input.` });
    }

    if (product.legacy_apps && product.legacy_apps.length > 0) {
        const names = product.legacy_apps.map(la => la.display_name || la.app_id).join(', ');
        tips.push({ text: `⚠ Disable and remove these deprecated apps before using the recommended add-on: ${names}`, icon: '⚠' });
    }

    // ── Custom per-product tips ────────────────────────────────────────
    if (product.best_practices && product.best_practices.length > 0) {
        product.best_practices.forEach(tip => {
            tips.push({ text: tip, icon: '💡', custom: true });
        });
    }

    return tips;
}

// ───────────────────  INTELLIGENCE BADGES COMPONENT  ────────────────

function IntelligenceBadges({ appStatus, vizAppStatus, vizApp2Status, sourcetypeInfo, legacyInstalled, allLegacyApps, sourcetypeSearchUrl, isArchived, onViewLegacy }) {
    const items = [];

    if (isArchived) {
        items.push({ cls: 'archived', label: 'Archived — download from Splunkbase', key: 'archived' });
    }

    if (appStatus) {
        if (appStatus.installed && appStatus.updateVersion) {
            items.push({ cls: 'update', label: `Add-on update v${appStatus.updateVersion}`, key: 'ta-update' });
        } else if (!appStatus.installed) {
            items.push({ cls: 'miss', label: 'Add-on not installed', key: 'ta-missing' });
        }
    }
    if (vizAppStatus) {
        if (vizAppStatus.installed && vizAppStatus.updateVersion) {
            items.push({ cls: 'update', label: `App update v${vizAppStatus.updateVersion}`, key: 'viz-update' });
        } else if (!vizAppStatus.installed) {
            items.push({ cls: 'miss', label: 'App not installed', key: 'viz-missing' });
        }
    }
    if (vizApp2Status) {
        if (vizApp2Status.installed && vizApp2Status.updateVersion) {
            items.push({ cls: 'update', label: `App 2 update v${vizApp2Status.updateVersion}`, key: 'viz2-update' });
        } else if (!vizApp2Status.installed) {
            items.push({ cls: 'miss', label: 'App 2 not installed', key: 'viz2-missing' });
        }
    }
    if (sourcetypeInfo) {
        if (sourcetypeInfo.hasData && appStatus?.installed) {
            items.push({ cls: 'data-ok', label: `✓ Data flowing (${sourcetypeInfo.detail})`, key: 'data-ok', url: sourcetypeSearchUrl });
        } else if (sourcetypeInfo.hasData && !appStatus?.installed) {
            items.push({ cls: 'data-ok', label: `Data found (${sourcetypeInfo.detail})`, key: 'data-no-ta', url: sourcetypeSearchUrl });
        } else if (!sourcetypeInfo.hasData) {
            items.push({ cls: 'data-none', label: sourcetypeInfo.detail || 'No data (24h)', key: 'data-none', url: sourcetypeSearchUrl });
        }
    }
    if (legacyInstalled && legacyInstalled.length > 0) {
        items.push({ cls: 'legacy', label: `${legacyInstalled.length} legacy app${legacyInstalled.length > 1 ? 's' : ''}`, key: 'legacy', legacyApps: legacyInstalled });
    }
    if (items.length === 0) return null;

    const handleLegacyClick = (e) => {
        e.stopPropagation();
        if (onViewLegacy && allLegacyApps) onViewLegacy(allLegacyApps);
    };

    return (
        <div className="csc-intelligence-badges">
            {items.map(b => (
                <span key={b.key} className={`csc-badge-item csc-badge-${b.cls}`}
                      {...(b.key === 'legacy' ? { onClick: handleLegacyClick, style: { cursor: 'pointer' } } : {})}>
                    {b.url ? (
                        <a href={b.url} target="_blank" rel="noopener noreferrer" className="csc-badge-link" onClick={e => e.stopPropagation()}>
                            {b.label}
                        </a>
                    ) : b.label}
                    {b.key === 'legacy' && b.legacyApps && b.legacyApps.length > 0 && (
                        <div className="csc-legacy-tooltip">
                            <div className="csc-legacy-tooltip-inner">
                                <div className="csc-legacy-tooltip-title">Legacy Apps Detected</div>
                                {b.legacyApps.slice(0, 5).map((la, i) => (
                                    <div key={i} className="csc-legacy-tooltip-item">
                                        <span className={`csc-legacy-tooltip-status ${la.status === 'archived' ? 'csc-lt-archived' : 'csc-lt-active'}`}>
                                            {la.status === 'archived' ? '📦' : '⚠️'}
                                        </span>
                                        <strong>{la.display_name}</strong>
                                        <span className="csc-legacy-tooltip-appid">{la.app_id}</span>
                                    </div>
                                ))}
                                {b.legacyApps.length > 5 && (
                                    <div className="csc-legacy-tooltip-more">…and {b.legacyApps.length - 5} more</div>
                                )}
                                <div className="csc-legacy-tooltip-hint">Click badge to view full audit report</div>
                            </div>
                        </div>
                    )}
                </span>
            ))}
        </div>
    );
}

// ────────────────────  SC4S INFO MODAL  ───────────────────────

function SC4SInfoModal({ open, onClose }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '820px', width: '92vw' }}>
            <Modal.Header title="📡 Splunk Connect for Syslog (SC4S)" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon">📡</div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Technical Overview</h3>
                            <p>SC4S is an open-source, containerized solution designed to streamline the ingestion of syslog data into Splunk. Built on the <strong>syslog-ng Open Source Edition (OSE)</strong> engine, SC4S shifts the paradigm from traditional disk-based collection to a high-performance, streaming architecture.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>🔧 What is SC4S?</h4>
                        <p>SC4S is a "turnkey" solution that replaces the traditional method of using a Universal Forwarder (UF) to monitor flat files written by a syslog daemon. Instead, SC4S receives syslog traffic directly, parses it in memory using pre-defined vendor filters, and transmits the events to Splunk via the <strong>HTTP Event Collector (HEC)</strong>.</p>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>⚡ Key Technical Benefits</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon">📋</span>
                                <strong>Prescriptive & Repeatable</strong>
                                <span>Standardized "Splunk-best-practice" approach to syslog, reducing "snowflake" configurations.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon">🚀</span>
                                <strong>Reduced Overhead</strong>
                                <span>Eliminates the need for a Universal Forwarder on the syslog server, simplifying architecture and reducing disk I/O.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon">🐳</span>
                                <strong>Containerized Agility</strong>
                                <span>Deployed via Docker or Podman for easy updates and consistent Dev/Test/Prod behavior.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon">🔍</span>
                                <strong>Optimized Search</strong>
                                <span>Natively balances traffic across all Splunk Indexers via HEC, preventing "hot indexers."</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon">🏷️</span>
                                <strong>Metadata Enrichment</strong>
                                <span>Injects rich metadata (vendor, product, geo info) at the point of ingestion, beyond standard host and sourcetype.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon">📚</span>
                                <strong>Extensive Library</strong>
                                <span>Out-of-the-box support for 100+ common technology platforms (Cisco, Palo Alto, Checkpoint, etc.).</span>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>🏗️ Architecture & Design</h4>
                        <table className="csc-sc4s-info-table">
                            <tbody>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Engine</td>
                                    <td><strong>syslog-ng OSE</strong> — high-performance message routing and template-based parsing</td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Transport</td>
                                    <td><strong>HEC (HTTP Event Collector)</strong> — supports Splunk Cloud & Enterprise equally, no need for port 8089 or 9997</td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Deployment</td>
                                    <td><strong>Containerized application</strong> — Linux host (RHEL/CentOS/Ubuntu) with Docker or Podman, managed by <code>systemd</code> for HA</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>✅ Best Practices & Recommendations</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <span className="csc-sc4s-info-bp-marker">⛔</span>
                                <div>
                                    <strong>Avoid Direct "514" Ingestion</strong>
                                    <p>Sending raw UDP/514 traffic directly to a Splunk Heavy Forwarder or Indexer is a deprecated practice. It lacks buffering, creates load-balancing issues, and often results in malformed data.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">📡</span>
                                <div>
                                    <strong>Use SC4S</strong>
                                    <p>For all enterprise-grade syslog requirements, especially for high-volume sources like Cisco ISE, ASA, and Firepower.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-alt">
                                <span className="csc-sc4s-info-bp-marker">🔀</span>
                                <div>
                                    <strong>Use a TA on a Heavy Forwarder</strong>
                                    <p>Only for "micro" environments or single-integration POCs where the overhead of a container runtime is not feasible.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item">
                                <span className="csc-sc4s-info-bp-marker">⚖️</span>
                                <div>
                                    <strong>Load Balancing</strong>
                                    <p>For HA environments, place a Load Balancer (F5 or HAProxy) in front of multiple SC4S instances to ensure zero data loss during maintenance.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>⚙️ Configuration & Customization</h4>
                        <ul className="csc-sc4s-info-list">
                            <li><strong>Core Requirements:</strong> Dedicated HEC Token, HEC URL (Load Balancer or Indexer Cluster), and a default index.</li>
                            <li><strong>Cisco-Specific Tuning:</strong> Supports flags like <code>SC4S_ENABLE_CISCO_IOS_RAW_MSG=yes</code> to preserve original message format for audit compliance.</li>
                            <li><strong>Custom Parsers:</strong> Developers can create bespoke "app-parsers" to handle proprietary or legacy syslog formats.</li>
                        </ul>
                    </div>

                    <div className="csc-sc4s-info-section csc-sc4s-info-section-notes">
                        <h4>📌 Important Notes</h4>
                        <ul className="csc-sc4s-info-list csc-sc4s-info-list-notes">
                            <li>SC4S is a <strong>container image</strong>, not a monolithic OVA/Virtual Appliance. While it <em>can</em> be packaged as an appliance, its native form is a container.</li>
                            <li>SC4S <em>can</em> buffer to disk (Disk-Assisted Queues) if the HEC endpoint is down, preventing data loss during network outages.</li>
                            <li>SC4S's primary goal is <strong>data integrity and performance</strong>, which indirectly supports license efficiency and search performance.</li>
                        </ul>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://splunk.github.io/splunk-connect-for-syslog/main/" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                            📖 SC4S Official Documentation ↗
                        </a>
                        <a href="https://github.com/splunk/splunk-connect-for-syslog" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                            🐙 GitHub Repository ↗
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  BEST PRACTICES MODAL  ───────────────────────

function BestPracticesModal({ open, onClose, product, platformType }) {
    const returnFocusRef = useRef(null);
    if (!open || !product) return null;
    const tips = getBestPractices(product, platformType);
    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '640px' }}>
            <Modal.Header title={`Best Practices — ${product.display_name}`} />
            <Modal.Body>
                <div style={{ fontSize: '13px', lineHeight: '1.7' }}>
                    {tips.map((tip, i) => (
                        <div key={i} style={{
                            padding: '10px 14px',
                            marginBottom: '8px',
                            background: tip.custom ? 'var(--custom-tip-bg, #e8f5e9)' : 'var(--section-alt-bg, #f7f7f7)',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${tip.custom ? '#43a047' : '#049fd9'}`,
                        }}>
                            {tip.icon && <span style={{ marginRight: '6px' }}>{tip.icon}</span>}
                            {tip.text}
                            {tip.linkUrl && (
                                <div style={{ marginTop: '6px' }}>
                                    <a href={tip.linkUrl} target="_blank" rel="noopener noreferrer"
                                       style={{ color: '#049fd9', fontWeight: 600, textDecoration: 'underline' }}>
                                        {tip.linkLabel || tip.linkUrl} ↗
                                    </a>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  LEGACY AUDIT MODAL  ───────────────────────

function LegacyAuditModal({ open, onClose, legacyApps, onMigrate }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;

    const activeApps = (legacyApps || []).filter(a => a.status !== 'archived');
    const archivedApps = (legacyApps || []).filter(a => a.status === 'archived');

    const renderCard = (app, isArchived) => (
        <div key={app.app_id} className={isArchived ? 'csc-legacy-card csc-legacy-archived' : 'csc-legacy-card csc-legacy-active'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{app.display_name || app.app_id}</strong>
                <span className={isArchived ? 'csc-legacy-status-badge csc-legacy-status-archived' : 'csc-legacy-status-badge csc-legacy-status-active'}>
                    {isArchived ? '📦 Archived' : '⚠️ Active'}
                </span>
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                <code style={{ background: 'var(--legacy-enabled-code-bg, #f5f5f5)', padding: '1px 4px', borderRadius: '3px' }}>{app.app_id}</code>
            </div>
            {app.addon_splunkbase_url && (
                <div style={{ marginTop: '6px' }}>
                    <a href={app.addon_splunkbase_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>
                        {isArchived ? 'View on Splunkbase (archived) →' : 'View on Splunkbase →'}
                    </a>
                </div>
            )}
        </div>
    );

    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '720px' }}>
            <Modal.Header title="Legacy Debt Audit Report" />
            <Modal.Body>
                {!legacyApps || legacyApps.length === 0
                    ? (
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '48px' }}>✅</span>
                            <p style={{ fontSize: '16px', fontWeight: 600, marginTop: '12px' }}>No legacy apps detected!</p>
                        </div>
                    )
                    : (
                        <div>
                            <p style={{ fontSize: '13px', color: 'var(--muted-color, #666)', marginBottom: '16px' }}>
                                The following legacy Cisco apps were detected. Disable and remove them before using the recommended add-on.
                            </p>

                            {/* ── Active Legacy Apps ── */}
                            {activeApps.length > 0 && (
                                <div className="csc-legacy-section">
                                    <div className="csc-legacy-section-header csc-legacy-section-active">
                                        <span>⚠️ Still Active on Splunkbase ({activeApps.length})</span>
                                        <span className="csc-legacy-section-hint">These apps are still downloadable but should be replaced</span>
                                    </div>
                                    {activeApps.map(app => renderCard(app, false))}
                                </div>
                            )}

                            {/* ── Archived Legacy Apps ── */}
                            {archivedApps.length > 0 && (
                                <div className="csc-legacy-section" style={{ marginTop: activeApps.length > 0 ? '20px' : '0' }}>
                                    <div className="csc-legacy-section-header csc-legacy-section-archived">
                                        <span>📦 Archived on Splunkbase ({archivedApps.length})</span>
                                        <span className="csc-legacy-section-hint">No longer available for download — remove if still installed</span>
                                    </div>
                                    {archivedApps.map(app => renderCard(app, true))}
                                </div>
                            )}
                        </div>
                    )
                }
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  FEEDBACK MODAL  ─────────────────────
function FeedbackModal({ open, onClose }) {
    const returnFocusRef = useRef(null);
    const [feedbackType, setFeedbackType] = useState('feature');
    const [rating, setRating] = useState('3');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState(null);
    const [submitErr, setSubmitErr] = useState(null);

    if (!open) return null;

    const handleSubmit = async () => {
        if (!title.trim()) { setSubmitErr('Please provide a title.'); return; }
        if (!description.trim()) { setSubmitErr('Please provide a description.'); return; }
        setSubmitting(true);
        setSubmitErr(null);
        setSubmitMsg(null);
        try {
            const ts = Math.floor(Date.now() / 1000);
            const esc = s => s.replace(/"/g, '\\"');
            const spl = `| makeresults | eval _time=${ts} | eval feedback_type="${esc(feedbackType)}", rating="${rating}", title="${esc(title)}", description="${esc(description)}", app="${APP_ID}", sourcetype="scan:feedback" | collect index=summary source="scan:feedback" sourcetype="stash"`;
            await splunkFetch(SEARCH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `search=${encodeURIComponent(spl)}&output_mode=json&exec_mode=oneshot`,
            });
            setSubmitMsg('Thank you! Your feedback has been submitted.');
            setTimeout(() => {
                setFeedbackType('feature'); setRating('3'); setTitle(''); setDescription(''); setSubmitMsg(null);
            }, 3000);
        } catch (e) {
            console.error('Feedback submit error:', e);
            setSubmitErr('Failed to submit feedback. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const radioStyle = (selected) => ({
        padding: '6px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
        borderRadius: '6px', border: '1px solid', borderColor: selected ? '#049fd9' : '#ccc',
        background: selected ? '#049fd9' : '#fff', color: selected ? '#fff' : '#333',
        transition: 'all .15s',
    });

    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '640px' }}>
            <Modal.Header title="Give Feedback" />
            <Modal.Body>
                <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                    <p style={{ color: 'var(--muted-color, #666)', marginBottom: '20px' }}>
                        We value your feedback! Share thoughts, report issues, or suggest features.
                    </p>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Feedback Type</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {['feature', 'bug', 'improvement', 'general'].map(t => (
                                <span key={t} style={radioStyle(feedbackType === t)} onClick={() => setFeedbackType(t)}>
                                    {t === 'feature' ? 'Feature Request' : t === 'bug' ? 'Bug Report' : t.charAt(0).toUpperCase() + t.slice(1)}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Overall Rating</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {['1','2','3','4','5'].map(r => (
                                <span key={r} style={{ ...radioStyle(rating === r), minWidth: '36px', textAlign: 'center' }} onClick={() => setRating(r)}>
                                    {'⭐'.repeat(Number(r))}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Title</label>
                        <input type="text" value={title}
                            onChange={e => { setTitle(e.target.value); setSubmitErr(null); }}
                            placeholder="e.g., Dashboard loading issue"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--input-border, #ccc)', borderRadius: '6px', boxSizing: 'border-box', background: 'var(--input-bg, #fff)', color: 'var(--page-color, #333)' }}
                        />
                    </div>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Description</label>
                        <textarea value={description}
                            onChange={e => { setDescription(e.target.value); setSubmitErr(null); }}
                            rows={5} placeholder="Please provide as much detail as possible..."
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--input-border, #ccc)', borderRadius: '6px', boxSizing: 'border-box', resize: 'vertical', background: 'var(--input-bg, #fff)', color: 'var(--page-color, #333)' }}
                        />
                    </div>
                    {submitMsg && <Message type="success">{submitMsg}</Message>}
                    {submitErr && <Message type="error">{submitErr}</Message>}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Cancel" onClick={onClose} />
                {submitting
                    ? <WaitSpinner size="medium" />
                    : <Button appearance="primary" label="Submit Feedback" onClick={handleSubmit} />
                }
            </Modal.Footer>
        </Modal>
    );
}

function FeedbackTab({ onClick }) {
    return (
        <button className="scan-feedback-tab" onClick={onClick} title="Give Feedback">
            <span className="scan-feedback-tab-icon">💬</span>
            <span className="scan-feedback-tab-text">Give Feedback</span>
        </button>
    );
}

// ─────────────────────────  INFO TOOLTIP  ─────────────────────────

function InfoTooltip({ placement = 'bottom', width = 500, delay = 400, content, children }) {
    const [visible, setVisible] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const wrapperRef = useRef(null);
    const hoveringTip = useRef(false);
    const timer = useRef(null);

    const show = useCallback(() => {
        if (pinned) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if (!wrapperRef.current) return;
            const r = wrapperRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const gap = 10;
            const pos = {
                top: placement === 'bottom' ? r.bottom + gap + window.scrollY : r.top - gap + window.scrollY,
                left: r.left + window.scrollX,
            };
            pos.left = Math.max(gap, Math.min(pos.left, vw - width - gap + window.scrollX));
            setCoords(pos);
            setVisible(true);
        }, delay);
    }, [pinned, placement, width, delay]);

    const hide = useCallback(() => {
        if (pinned) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if (!hoveringTip.current) setVisible(false);
        }, 400);
    }, [pinned]);

    useEffect(() => {
        return () => clearTimeout(timer.current);
    }, []);

    const tip = (
        <div
            onMouseEnter={() => { hoveringTip.current = true; }}
            onMouseLeave={() => { hoveringTip.current = false; hide(); }}
            style={{
                position: 'absolute', top: coords.top, left: coords.left, width,
                zIndex: 9999, opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease',
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            <div className="scan-tooltip-card">
                <div className="scan-tooltip-header">
                    <span>Splunk Cisco App Navigator</span>
                    <span className={`scan-tooltip-pin${pinned ? ' pinned' : ''}`}
                        title={pinned ? 'Unpin' : 'Pin open'}
                        onClick={e => { e.stopPropagation(); if (pinned) { setPinned(false); setVisible(false); } else setPinned(true); }}>
                        {pinned ? '📌' : '📌'}
                    </span>
                </div>
                <div className="scan-tooltip-body">{content}</div>
            </div>
        </div>
    );

    return (
        <>
            <div ref={wrapperRef} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'inline-block' }}>
                {children}
            </div>
            {visible && ReactDOM.createPortal(tip, document.body)}
        </>
    );
}

// ────────────────────────  PRODUCT CARD  ─────────────────────

function ProductCard({ product, installedApps, appStatuses, sourcetypeData, isConfigured, isComingSoon, platformType, onToggleConfigured, onShowBestPractices, onViewLegacy, onSetCustomDashboard, devMode, onViewConfig }) {
    const {
        product_id, display_name, version, status, description, value_proposition, vendor, tagline,
        icon_emoji, icon_svg, learn_more_url, addon_splunkbase_url, addon_docs_url, addon_troubleshoot_url, addon_install_url,
        addon, addon_label,
        app_viz, app_viz_label, app_viz_splunkbase_url, app_viz_docs_url, app_viz_troubleshoot_url, app_viz_install_url,
        app_viz_2, app_viz_2_label, app_viz_2_splunkbase_url, app_viz_2_docs_url, app_viz_2_troubleshoot_url, app_viz_2_install_url,
        legacy_apps, prereq_apps, soar_connectors, alert_actions, community_apps, itsi_content_pack,
        card_banner, card_banner_color, card_banner_size, card_banner_opacity, card_accent, card_bg_color, is_new, support_level, cisco_retired, coverage_gap,
        sc4s_url, sc4s_supported, sc4s_search_head_ta, sc4s_search_head_ta_label,
        sc4s_search_head_ta_splunkbase_url, sc4s_search_head_ta_install_url, sc4s_sourcetypes, sc4s_config_notes,
    } = product;

    const appStatus = appStatuses[addon] || null;
    const vizAppStatus = app_viz ? (appStatuses[app_viz] || null) : null;
    const vizApp2Status = app_viz_2 ? (appStatuses[app_viz_2] || null) : null;
    const sourcetypeInfo = sourcetypeData[product_id] || null;
    const hasLegacy = legacy_apps && legacy_apps.length > 0;
    const legacyInstalled = hasLegacy ? legacy_apps.filter(la => installedApps[la.app_id]) : [];
    const communityInstalled = (community_apps || []).filter(ca => installedApps[ca.app_id]);

    const sc4sShTaStatus = sc4s_search_head_ta ? (appStatuses[sc4s_search_head_ta] || null) : null;
    const hasDifferentSc4sTa = sc4s_supported && sc4s_search_head_ta && sc4s_search_head_ta !== addon;

    const [depsExpanded, setDepsExpanded] = useState(false);
    const [depTab, setDepTab] = useState('standard');            // 'standard' | 'sc4s'
    const [sc4sInfoOpen, setSc4sInfoOpen] = useState(false);
    const [dataWarnExpanded, setDataWarnExpanded] = useState(false);
    const [stExpanded, setStExpanded] = useState(false);
    const [communityExpanded, setCommunityExpanded] = useState(false);
    const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
    const [launchMenuPos, setLaunchMenuPos] = useState({ top: 0, left: 0 });
    const [customDashModalOpen, setCustomDashModalOpen] = useState(false);
    const [customDashInput, setCustomDashInput] = useState(product.custom_dashboard || '');
    const [customDashSaving, setCustomDashSaving] = useState(false);
    const [customDashMsg, setCustomDashMsg] = useState(null);
    const launchBtnRef = useRef(null);
    const launchMenuRef = useRef(null);

    // Dependency summary
    const depItems = [];
    if (addon) depItems.push({ label: 'Add-on', installed: !!appStatus?.installed });
    if (app_viz) depItems.push({ label: 'Viz App', installed: !!vizAppStatus?.installed });
    if (app_viz_2) depItems.push({ label: 'Viz App 2', installed: !!vizApp2Status?.installed });
    const prereqItems = (prereq_apps || []).map(pa => ({
        label: pa.display_name,
        installed: !!installedApps[pa.app_id],
    }));
    const allDeps = [...depItems, ...prereqItems];
    const depsMissing = allDeps.filter(d => !d.installed).length;
    const hasDeps = allDeps.length > 0 || sc4s_supported;

    // Launch handlers
    const handleLaunchDefault = () => {
        const launchTarget = app_viz || addon;
        if (launchTarget && (vizAppStatus?.installed || appStatus?.installed)) {
            const dash = product.dashboard || '';
            if (dash) {
                const dashApp = app_viz || addon || launchTarget;
                window.open(createURL(`/app/${dashApp}/${dash}`), '_blank');
            } else {
                window.open(createURL(`/app/${launchTarget}/`), '_blank');
            }
        }
    };
    const handleLaunchCustom = () => {
        const cd = product.custom_dashboard || '';
        if (cd) {
            const parts = cd.split('/');
            if (parts.length >= 2) {
                window.open(createURL(`/app/${parts[0]}/${parts.slice(1).join('/')}`), '_blank');
            } else {
                const launchApp = addon || app_viz || 'search';
                window.open(createURL(`/app/${launchApp}/${cd}`), '_blank');
            }
        }
        setLaunchMenuOpen(false);
    };
    const handleLaunchApp = () => {
        if (product.custom_dashboard) { handleLaunchCustom(); } else { handleLaunchDefault(); }
    };
    const handleSaveCustomDashboard = async () => {
        setCustomDashSaving(true);
        setCustomDashMsg(null);
        try {
            await saveCustomDashboard(product_id, customDashInput.trim());
            if (onSetCustomDashboard) onSetCustomDashboard(product_id, customDashInput.trim());
            setCustomDashMsg({ type: 'success', text: customDashInput.trim() ? 'Custom dashboard saved' : 'Custom dashboard cleared' });
            setTimeout(() => { setCustomDashModalOpen(false); setCustomDashMsg(null); }, 1200);
        } catch (e) {
            setCustomDashMsg({ type: 'error', text: e.message || 'Failed to save' });
        } finally {
            setCustomDashSaving(false);
        }
    };

    const isInstalled = appStatus?.installed || vizAppStatus?.installed || vizApp2Status?.installed;
    const hasItsi = !!itsi_content_pack;
    const addonFamily = product.addon_family || 'default';

    // Close launch dropdown on outside click
    useEffect(() => {
        if (!launchMenuOpen) return;
        const handler = (e) => {
            const inWrap = launchBtnRef.current && launchBtnRef.current.contains(e.target);
            const inMenu = launchMenuRef.current && launchMenuRef.current.contains(e.target);
            if (!inWrap && !inMenu) setLaunchMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [launchMenuOpen]);

    // Toggle launch menu & compute fixed position
    const toggleLaunchMenu = useCallback(() => {
        setLaunchMenuOpen(prev => {
            if (!prev && launchBtnRef.current) {
                const rect = launchBtnRef.current.getBoundingClientRect();
                setLaunchMenuPos({ top: rect.bottom + 4, left: rect.right });
            }
            return !prev;
        });
    }, []);

    // Sourcetype search URL for configured products
    const sourcetypeSearchUrl = product.sourcetypes && product.sourcetypes.length > 0
        ? buildSourcetypeSearchUrl(product.sourcetypes)
        : null;

    return (
        <div
            className="csc-card"
            data-addon-family={addonFamily}
        >
            {/* ── NEW! corner ribbon ── */}
            {is_new && (
                <div className="csc-new-ribbon" aria-label="New product">NEW!</div>
            )}
            {/* ── Cisco Retired Product ribbon ── */}
            {cisco_retired && !is_new && (
                <div className="csc-retired-ribbon" aria-label="Cisco retired product">CISCO RETIRED</div>
            )}
            {/* ── GTM Coverage Gap ribbon ── */}
            {coverage_gap && !cisco_retired && !is_new && (
                <div className="csc-coverage-gap-ribbon" aria-label="No Splunk coverage">NO COVERAGE</div>
            )}
            {/* ── Add-on Archived ribbon ── */}
            {status === 'deprecated' && !cisco_retired && !coverage_gap && !is_new && (
                <div className="csc-deprecated-ribbon" aria-label="Add-on archived">⚠ ADD-ON ARCHIVED</div>
            )}
            {/* ── Header: icon + name + tagline + configured badge + info tooltip ── */}
            <div className="csc-card-header">
                <div className="csc-card-icon">
                    <span className="csc-icon-placeholder">
                        {icon_svg ? (
                            <img
                                src={createURL(`/static/app/${APP_ID}/icons/${icon_svg}${document.documentElement.classList.contains('dce-dark') ? '_white' : ''}.svg`)}
                                alt=""
                                className="csc-product-icon-svg"
                                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'inline'; }}
                            />
                        ) : null}
                        <span className="csc-icon-fallback" style={icon_svg ? {display:'none'} : undefined}>
                            {ICON_EMOJI_MAP[icon_emoji] || icon_emoji || (display_name || 'C')[0]}
                        </span>
                    </span>
                </div>
                <div className="csc-card-title-block">
                    <span className="csc-card-name">
                        {display_name}
                        {hasItsi && <span className="csc-itsi-badge"><img src={createURL(`/static/app/${APP_ID}/icon-itsi.svg`)} alt="" className="badge-icon" /> ITSI</span>}
                        {soar_connectors && soar_connectors.length > 0 && <span className="csc-soar-badge" title={`${soar_connectors.length} SOAR connector${soar_connectors.length > 1 ? 's' : ''} available`}><img src={createURL(`/static/app/${APP_ID}/icon-soar.svg`)} alt="" className="badge-icon" /> SOAR</span>}
                        {alert_actions && alert_actions.length > 0 && <span className="csc-alert-badge" title={`${alert_actions.length} alert action${alert_actions.length > 1 ? 's' : ''} available`}>🔔 Alert Action</span>}
                        {product.ai_enabled && (() => {
                            const aiText = product.ai_description || 'This product leverages AI technologies';
                            return (
                                <span className="csc-ai-badge csc-ai-badge-hover" tabIndex={0} aria-label={aiText}>
                                    🤖 AI
                                    <span className="csc-ai-tooltip">{aiText}</span>
                                </span>
                            );
                        })()}
                        {description && (
                            <Tooltip
                                content={
                                    <div className="csc-tooltip-content">
                                        <div className="csc-tooltip-desc">{renderFormattedText(description)}</div>
                                        {value_proposition && (
                                            <div className="csc-tooltip-vp">
                                                <strong>Value:</strong> {renderFormattedText(value_proposition)}
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        )}
                    </span>
                    <span className="csc-card-subtitle">
                        {product.category && <span>{(CATEGORIES.find(c => c.id === product.category) || {}).name || product.category}</span>}
                        {product.subcategory && <span className="csc-card-meta-sep"> · </span>}
                        {product.subcategory && (() => {
                            const subs = SUB_CATEGORIES[product.category];
                            const sub = subs && subs.find(s => s.id === product.subcategory);
                            return <span>{sub ? sub.name : product.subcategory}</span>;
                        })()}
                    </span>
                    {tagline && (
                        <span className="csc-card-tagline">
                            {tagline}
                        </span>
                    )}
                    {product.aliases && product.aliases.length > 0 && (
                        <span className="csc-card-aliases">
                            Formerly: {product.aliases.join(', ')}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Value Proposition ── */}
            {value_proposition && (
                <div className="csc-card-value-prop">
                    {value_proposition}
                </div>
            )}

            {/* ── Intelligence Badges (add-on status, updates, data flowing, legacy) ── */}
            <IntelligenceBadges
                appStatus={appStatus}
                vizAppStatus={vizAppStatus}
                vizApp2Status={vizApp2Status}
                sourcetypeInfo={sourcetypeInfo}
                legacyInstalled={legacyInstalled}
                allLegacyApps={legacy_apps}
                sourcetypeSearchUrl={sourcetypeSearchUrl}
                isArchived={!!(!addon_install_url && addon_splunkbase_url)}
                onViewLegacy={onViewLegacy}
            />



            {/* ── Dependency info: collapsible summary + expandable details ── */}
            {hasDeps && (
                <div className="csc-card-dependency">
                    {/* Summary line — always visible */}
                    <div className="csc-dep-summary" onClick={() => setDepsExpanded((v) => !v)} role="button" tabIndex={0}>
                        <span className="csc-dep-summary-icons">
                            {depItems.map((d) => (
                                <span key={d.label} className={d.installed ? 'csc-dep-chip-ok' : 'csc-dep-chip-miss'}>
                                    {d.installed ? '✓' : '✗'} {d.label}
                                </span>
                            ))}
                            {prereqItems.length > 0 && (() => {
                                const prereqMiss = prereqItems.filter((p) => !p.installed).length;
                                return (
                                    <span className={prereqMiss > 0 ? 'csc-dep-chip-miss' : 'csc-dep-chip-ok'}>
                                        {prereqMiss > 0 ? `✗ ${prereqMiss} prereq` : '✓ Prereqs'}
                                    </span>
                                );
                            })()}
                        </span>
                        <span className="csc-dep-toggle">
                            {depsExpanded ? '− Hide' : '+ Details'}
                        </span>
                    </div>

                    {/* Expanded detail rows */}
                    {depsExpanded && (
                        <div className="csc-dep-expanded">
                            {/* ── Support Level Badge (non-SC4S products only — SC4S products show it inside the tab) ── */}
                            {support_level && !sc4s_supported && (
                                <div className={`csc-support-badge csc-support-${support_level}`}>
                                    {support_level === 'cisco_supported' && '🛡️ Cisco Supported'}
                                    {support_level === 'splunk_supported' && '✦ Splunk Supported'}
                                    {support_level === 'developer_supported' && '👨‍💻 Developer Supported'}
                                    {support_level === 'community_supported' && '🌐 Community Supported'}
                                    {support_level === 'not_supported' && '⊘ Not Supported'}
                                </div>
                            )}

                            {/* ── Tab bar (SC4S products only) ── */}
                            {sc4s_supported && (
                                <>
                                <div className="csc-dep-tabs">
                                    <button
                                        className={`csc-dep-tab ${depTab === 'standard' ? 'csc-dep-tab-active csc-dep-tab-standard' : ''}`}
                                        onClick={() => setDepTab('standard')}
                                        type="button"
                                    >
                                        🟢 Standard
                                    </button>
                                    <button
                                        className={`csc-dep-tab ${depTab === 'sc4s' ? 'csc-dep-tab-active csc-dep-tab-sc4s' : ''}`}
                                        onClick={() => setDepTab('sc4s')}
                                        type="button"
                                    >
                                        📡 SC4S / High-Scale
                                    </button>
                                    <button
                                        className="csc-sc4s-info-trigger"
                                        onClick={(e) => { e.stopPropagation(); setSc4sInfoOpen(true); }}
                                        type="button"
                                        title="What is SC4S? — Learn about Splunk Connect for Syslog"
                                    >
                                        ℹ️
                                    </button>
                                </div>
                                <SC4SInfoModal open={sc4sInfoOpen} onClose={() => setSc4sInfoOpen(false)} />
                                </>
                            )}

                            {/* ── Tab content: Standard (always shown for non-SC4S; tab 1 for SC4S) ── */}
                            {(!sc4s_supported || depTab === 'standard') && (
                                <>
                            {/* Support badge inside Standard tab for SC4S products */}
                            {sc4s_supported && support_level && (
                                <div className={`csc-support-badge csc-support-${support_level}`}>
                                    {support_level === 'cisco_supported' && '🛡️ Cisco Supported'}
                                    {support_level === 'splunk_supported' && '✦ Splunk Supported'}
                                    {support_level === 'developer_supported' && '👨‍💻 Developer Supported'}
                                    {support_level === 'community_supported' && '🌐 Community Supported'}
                                    {support_level === 'not_supported' && '⊘ Not Supported'}
                                </div>
                            )}
                            <hr className="csc-dep-divider" />
                            <span className="csc-dep-label">Required</span>
                            {sc4s_supported && !addon && (
                                <div className="csc-dep-detail csc-no-addon-notice">
                                    <span className="csc-dep-status-missing">⚠️ No add-on available yet</span>
                                    <span className="csc-no-addon-hint">Use the <strong>SC4S / High-Scale</strong> tab to bring in data for this product</span>
                                </div>
                            )}
                            {addon && (
                                <div className="csc-dep-detail">
                                    {appStatus?.installed ? (
                                        <a href={createURL(`/app/${addon}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${addon_label || addon}`}>{addon_label || addon}</a>
                                    ) : (
                                        <span className="csc-dep-name">{addon_label || addon}</span>
                                    )}
                                    {addon_label && addon_label !== addon && <span className="csc-dep-appid" title="Splunk folder name">{addon}</span>}
                                    {(addon_splunkbase_url || addon_docs_url || addon_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {addon_splunkbase_url && (
                                                <a href={addon_splunkbase_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                    Splunkbase ↗
                                                </a>
                                            )}
                                            {addon_docs_url && (
                                                <a href={addon_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Documentation">
                                                    Docs 📖
                                                </a>
                                            )}
                                            {addon_troubleshoot_url && (
                                                <a href={addon_troubleshoot_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Troubleshooting Guide">
                                                    Troubleshoot 🔧
                                                </a>
                                            )}
                                        </span>
                                    )}
                                    {appStatus?.version && (
                                        <span className="csc-dep-version">v{appStatus.version}</span>
                                    )}
                                    {appStatus?.updateVersion && (
                                        <span className="csc-dep-update">⬆ v{appStatus.updateVersion}</span>
                                    )}
                                    {!appStatus?.installed && !isComingSoon && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                            )}
                            {app_viz && (
                                <div className="csc-dep-detail">
                                    {vizAppStatus?.installed ? (
                                        <a href={createURL(`/app/${app_viz}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${app_viz_label || app_viz}`}>{app_viz_label || app_viz}</a>
                                    ) : (
                                        <span className="csc-dep-name">{app_viz_label || app_viz}</span>
                                    )}
                                    {app_viz_label && app_viz_label !== app_viz && <span className="csc-dep-appid" title="Splunk folder name">{app_viz}</span>}
                                    {(app_viz_splunkbase_url || app_viz_docs_url || app_viz_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {app_viz_splunkbase_url && (
                                                <a href={app_viz_splunkbase_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                    Splunkbase ↗
                                                </a>
                                            )}
                                            {app_viz_docs_url && (
                                                <a href={app_viz_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Documentation">
                                                    Docs 📖
                                                </a>
                                            )}
                                            {app_viz_troubleshoot_url && (
                                                <a href={app_viz_troubleshoot_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Troubleshooting Guide">
                                                    Troubleshoot 🔧
                                                </a>
                                            )}
                                        </span>
                                    )}
                                    {vizAppStatus?.version && (
                                        <span className="csc-dep-version">v{vizAppStatus.version}</span>
                                    )}
                                    {vizAppStatus?.updateVersion && (
                                        <span className="csc-dep-update">⬆ v{vizAppStatus.updateVersion}</span>
                                    )}
                                    {!vizAppStatus?.installed && !isComingSoon && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                            )}
                            {app_viz_2 && (
                                <div className="csc-dep-detail">
                                    {vizApp2Status?.installed ? (
                                        <a href={createURL(`/app/${app_viz_2}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${app_viz_2_label || app_viz_2}`}>{app_viz_2_label || app_viz_2}</a>
                                    ) : (
                                        <span className="csc-dep-name">{app_viz_2_label || app_viz_2}</span>
                                    )}
                                    {app_viz_2_label && app_viz_2_label !== app_viz_2 && <span className="csc-dep-appid" title="Splunk folder name">{app_viz_2}</span>}
                                    {(app_viz_2_splunkbase_url || app_viz_2_docs_url || app_viz_2_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {app_viz_2_splunkbase_url && (
                                                <a href={app_viz_2_splunkbase_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                    Splunkbase ↗
                                                </a>
                                            )}
                                            {app_viz_2_docs_url && (
                                                <a href={app_viz_2_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Documentation">
                                                    Docs 📖
                                                </a>
                                            )}
                                            {app_viz_2_troubleshoot_url && (
                                                <a href={app_viz_2_troubleshoot_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Troubleshooting Guide">
                                                    Troubleshoot 🔧
                                                </a>
                                            )}
                                        </span>
                                    )}
                                    {vizApp2Status?.version && (
                                        <span className="csc-dep-version">v{vizApp2Status.version}</span>
                                    )}
                                    {vizApp2Status?.updateVersion && (
                                        <span className="csc-dep-update">⬆ v{vizApp2Status.updateVersion}</span>
                                    )}
                                    {!vizApp2Status?.installed && !isComingSoon && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                            )}
                            {hasItsi && (() => {
                                const itsiLabel = itsi_content_pack.label;
                                const itsiDocsUrl = itsi_content_pack.docs_url;
                                return (
                                    <>
                                        <span className="csc-dep-label csc-dep-label-itsi"><img src={createURL(`/static/app/${APP_ID}/icon-itsi.svg`)} alt="" className="badge-icon" /> ITSI Content Pack</span>
                                        <div className="csc-dep-detail">
                                            <span className="csc-dep-name">{itsiLabel || 'Content Pack'}</span>
                                            {itsiDocsUrl && (
                                                <span className="csc-split-pill">
                                                    <a href={itsiDocsUrl} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Content Pack Documentation">
                                                        Docs 📖
                                                    </a>
                                                </span>
                                            )}
                                            <span className="csc-dep-status-itsi">Install via ITSI → Content Library</span>
                                        </div>
                                    </>
                                );
                            })()}
                            {prereq_apps && prereq_apps.length > 0 && (
                                <>
                                    <hr className="csc-dep-divider" />
                                    <span className="csc-dep-label csc-dep-label-prereq">Prerequisites</span>
                                    {prereq_apps.map((pa) => {
                                        const prereqInstalled = !!installedApps[pa.app_id];
                                        return (
                                            <div className="csc-dep-detail" key={pa.app_id}>
                                                {prereqInstalled ? (
                                                    <a href={createURL(`/app/${pa.app_id}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${pa.display_name}`}>{pa.display_name}</a>
                                                ) : (
                                                    <span className="csc-dep-name">{pa.display_name}</span>
                                                )}
                                                {pa.display_name !== pa.app_id && <span className="csc-dep-appid" title="Splunk folder name">{pa.app_id}</span>}
                                                {pa.addon_splunkbase_url && (
                                                    <span className="csc-split-pill">
                                                        <a href={pa.addon_splunkbase_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                            Splunkbase ↗
                                                        </a>
                                                    </span>
                                                )}
                                                {prereqInstalled && (
                                                    <span className="csc-dep-version">✓ installed</span>
                                                )}
                                                {!prereqInstalled && !isComingSoon && (
                                                    <span className="csc-dep-status-missing">not installed</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                            {/* ── Secondary integrations (collapsible) ── */}
                            {((soar_connectors && soar_connectors.length > 0) || (alert_actions && alert_actions.length > 0) || (community_apps && community_apps.length > 0)) && (() => {
                                const intCount = (soar_connectors?.length || 0) + (alert_actions?.length || 0);
                                // Never suggest third-party alternatives for products that are Cisco or Splunk supported
                                const isOfficiallySupported = support_level === 'cisco_supported' || support_level === 'splunk_supported';
                                const hasCommunity = community_apps && community_apps.length > 0 && !isOfficiallySupported;
                                return (
                                    <>
                                    <hr className="csc-dep-divider" />
                                    {intCount > 0 && (
                                        <details className="csc-dep-details">
                                            <summary className="csc-dep-details-summary">
                                                Integrations ({intCount})
                                            </summary>
                                            <div className="csc-dep-details-body">
                                                {soar_connectors && soar_connectors.length > 0 && (
                                                    <>
                                                        <span className="csc-dep-label csc-dep-label-soar"><img src={createURL(`/static/app/${APP_ID}/icon-soar.svg`)} alt="" className="badge-icon" /> SOAR Connectors</span>
                                                        {soar_connectors.map((sc) => (
                                                            <div className="csc-dep-detail" key={sc.uid || sc.label}>
                                                                <span className="csc-dep-name">{sc.label}</span>
                                                                {sc.url && (
                                                                    <span className="csc-split-pill">
                                                                        <a href={sc.url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View SOAR connector on Splunkbase">
                                                                            Splunkbase ↗
                                                                        </a>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                                {alert_actions && alert_actions.length > 0 && (
                                                    <>
                                                        <span className="csc-dep-label csc-dep-label-alert">🔔 Alert Actions</span>
                                                        {alert_actions.map((aa) => (
                                                            <div className="csc-dep-detail" key={aa.uid || aa.label}>
                                                                <span className="csc-dep-name">{aa.label}</span>
                                                                {aa.url && (
                                                                    <span className="csc-split-pill">
                                                                        <a href={aa.url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View alert action on Splunkbase">
                                                                            Splunkbase ↗
                                                                        </a>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        </details>
                                    )}
                                    {hasCommunity && (
                                        <details className="csc-dep-details">
                                            <summary className="csc-dep-details-summary csc-dep-details-community">
                                                ⚠️ Third-Party Alternatives ({community_apps.length})
                                            </summary>
                                            {/* Only shown for non-Cisco/Splunk-supported products */}
                                            <div className="csc-dep-details-body">
                                                {community_apps.map((ca) => {
                                                    const caInstalled = !!installedApps[ca.app_id];
                                                    return (
                                                        <div className="csc-dep-detail" key={ca.uid || ca.app_id}>
                                                            <span className="csc-dep-name">{ca.display_name}</span>
                                                            {ca.url && (
                                                                <span className="csc-split-pill">
                                                                    <a href={ca.url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                                        Splunkbase ↗
                                                                    </a>
                                                                </span>
                                                            )}
                                                            {caInstalled && (
                                                                <span className="csc-dep-status-community">⚠ installed</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    )}
                                    </>
                                );
                            })()}
                                </>
                            )}

                            {/* ── Tab content: SC4S / High-Scale (tab 2 for SC4S products) ── */}
                            {sc4s_supported && depTab === 'sc4s' && (
                                <>
                                    {/* SC4S is always Splunk Supported */}
                                    <div className="csc-support-badge csc-support-splunk_supported">
                                        ✦ Splunk Supported
                                    </div>
                                    <hr className="csc-dep-divider" />
                                    {sc4s_search_head_ta ? (
                                        <>
                                            <span className="csc-dep-label csc-dep-label-sc4s">Required</span>
                                            <div className="csc-dep-detail">
                                                {sc4sShTaStatus?.installed ? (
                                                    <a href={createURL(`/app/${sc4s_search_head_ta}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${sc4s_search_head_ta_label || sc4s_search_head_ta}`}>{sc4s_search_head_ta_label || sc4s_search_head_ta}</a>
                                                ) : (
                                                    <span className="csc-dep-name">{sc4s_search_head_ta_label || sc4s_search_head_ta}</span>
                                                )}
                                                {sc4s_search_head_ta_label && sc4s_search_head_ta_label !== sc4s_search_head_ta && <span className="csc-dep-appid" title="Splunk folder name">{sc4s_search_head_ta}</span>}
                                                {(sc4s_search_head_ta_splunkbase_url || sc4s_url) && (
                                                    <span className="csc-split-pill">
                                                        {sc4s_search_head_ta_splunkbase_url && (
                                                            <a href={sc4s_search_head_ta_splunkbase_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                                Splunkbase ↗
                                                            </a>
                                                        )}
                                                        {sc4s_url && (
                                                            <a href={sc4s_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg csc-split-pill-sc4s" title="SC4S setup documentation">
                                                                SC4S Docs 📖
                                                            </a>
                                                        )}
                                                    </span>
                                                )}
                                                {sc4sShTaStatus?.version && (
                                                    <span className="csc-dep-version">v{sc4sShTaStatus.version}</span>
                                                )}
                                                {sc4sShTaStatus?.updateVersion && (
                                                    <span className="csc-dep-update">⬆ v{sc4sShTaStatus.updateVersion}</span>
                                                )}
                                                {!sc4sShTaStatus?.installed && (
                                                    <span className="csc-dep-status-missing">not installed</span>
                                                )}
                                            </div>
                                            {hasDifferentSc4sTa && (
                                                <div className="csc-sc4s-note-compact">
                                                    ⚠️ Uses a <em>different</em> TA than standard path
                                                </div>
                                            )}
                                            {sc4s_search_head_ta_install_url && !sc4sShTaStatus?.installed && (
                                                <a href={createURL(sc4s_search_head_ta_install_url)} target="_blank" rel="noopener noreferrer" className="csc-sc4s-install-btn" title="Install add-on from Splunk App Manager">
                                                    Add-on
                                                </a>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <span className="csc-dep-label csc-dep-label-sc4s">Required</span>
                                            <div className="csc-dep-detail">
                                                <span className="csc-dep-name" style={{fontStyle: 'italic', opacity: 0.7}}>None required</span>
                                                {sc4s_url && (
                                                    <span className="csc-split-pill">
                                                        <a href={sc4s_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg csc-split-pill-sc4s" title="SC4S setup documentation">
                                                            SC4S Docs 📖
                                                        </a>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="csc-sc4s-note-compact csc-sc4s-note-compact-same">
                                                ℹ️ No add-on needed on Search Heads — SC4S handles all parsing and indexing
                                            </div>
                                        </>
                                    )}
                                    {/* ── SC4S Sourcetypes (collapsible) ── */}
                                    {sc4s_sourcetypes && sc4s_sourcetypes.length > 0 && (
                                        <>
                                            <hr className="csc-dep-divider" />
                                            <div className="csc-sourcetypes-section" style={{ margin: '0' }}>
                                                <div className="csc-st-summary" onClick={() => setStExpanded(v => !v)} role="button" tabIndex={0}>
                                                    <span className="csc-st-count">
                                                        📡 {sc4s_sourcetypes.length} SC4S sourcetype{sc4s_sourcetypes.length !== 1 ? 's' : ''}
                                                    </span>
                                                    <span className="csc-dep-toggle">
                                                        {stExpanded ? '− Hide' : '+ Show'}
                                                    </span>
                                                </div>
                                                {stExpanded && (
                                                    <div className="csc-sourcetypes-chips">
                                                        {sc4s_sourcetypes.map(st => (
                                                            <span key={st} className="csc-st-chip" title={st}>{st}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                    {sc4s_config_notes && sc4s_config_notes.length > 0 && (
                                        <details className="csc-dep-details">
                                            <summary className="csc-dep-details-summary">
                                                ⚙️ Configuration Notes ({sc4s_config_notes.length})
                                            </summary>
                                            <div className="csc-dep-details-body">
                                                <ul className="csc-sc4s-config-list">
                                                    {sc4s_config_notes.map((note, i) => (
                                                        <li key={i}>{note}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </details>
                                    )}
                                </>
                            )}

                            {/* ── Dashboard App (shared — shown below both tabs, or for non-SC4S products inside the standard flow) ── */}
                            {sc4s_supported && app_viz && (
                                <>
                                    <hr className="csc-dep-divider" />
                                    <span className="csc-dep-label">Dashboard App</span>
                                    <div className="csc-dep-detail">
                                        {vizAppStatus?.installed ? (
                                            <a href={createURL(`/app/${app_viz}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${app_viz_label || app_viz}`}>{app_viz_label || app_viz}</a>
                                        ) : (
                                            <span className="csc-dep-name">{app_viz_label || app_viz}</span>
                                        )}
                                        {app_viz_label && app_viz_label !== app_viz && <span className="csc-dep-appid" title="Splunk folder name">{app_viz}</span>}
                                        {vizAppStatus?.version && (
                                            <span className="csc-dep-version">v{vizAppStatus.version}</span>
                                        )}
                                        {!vizAppStatus?.installed && (
                                            <span className="csc-dep-status-missing">not installed</span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Sourcetype data validation ── */}
            {sourcetypeInfo && !sourcetypeInfo.hasData && appStatus?.installed && (
                <div className="csc-data-warning">
                    <div className="csc-data-warn-summary" onClick={() => setDataWarnExpanded((v) => !v)} role="button" tabIndex={0}>
                        <span>No data detected (24h)</span>
                        <span className="csc-dep-toggle">
                            {dataWarnExpanded ? '− Hide' : '+ Details'}
                        </span>
                    </div>
                    {dataWarnExpanded && (
                        <div className="csc-data-warn-details">
                            <span>This may not be conclusive. Verify your data inputs and check whether the expected sourcetypes exist in your environment.</span>
                            {sourcetypeSearchUrl && (
                                <a href={sourcetypeSearchUrl} target="_blank" rel="noopener noreferrer" className="csc-sourcetype-link">
                                    Click to check sourcetypes in Search →
                                </a>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Sourcetypes (collapsible) ── */}
            {product.sourcetypes && product.sourcetypes.length > 0 && (
                <div className="csc-sourcetypes-section">
                    <div className="csc-st-summary" onClick={() => setStExpanded(v => !v)} role="button" tabIndex={0}>
                        <span className={`csc-st-count ${sourcetypeInfo?.hasData ? 'csc-st-count-active' : ''}`}>
                            {sourcetypeInfo?.hasData ? '●' : '○'} {product.sourcetypes.length} sourcetype{product.sourcetypes.length !== 1 ? 's' : ''}
                        </span>
                        <span className="csc-dep-toggle">
                            {stExpanded ? '− Hide' : '+ Show'}
                        </span>
                    </div>
                    {stExpanded && (
                        <div className="csc-sourcetypes-chips">
                            {product.sourcetypes.map(st => (
                                <span
                                    key={st}
                                    className={`csc-st-chip ${sourcetypeInfo?.hasData ? 'csc-st-chip-active' : ''}`}
                                    title={st}
                                >{st}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Community / third-party shadow app warning (collapsible) ── */}
            {/* Only shown when unofficial third-party apps are already installed — migration warning */}
            {communityInstalled.length > 0 && (
                <div className="csc-community-warning">
                    <div className="csc-community-summary" onClick={() => setCommunityExpanded((v) => !v)} role="button" tabIndex={0}>
                        <span>⚠️ Unofficial add-on installed ({communityInstalled.length})</span>
                        <span className="csc-dep-toggle">
                            {communityExpanded ? '− Hide' : '+ Details'}
                        </span>
                    </div>
                    {communityExpanded && (
                        <div className="csc-community-details">
                            {communityInstalled.map(ca => (
                                <div key={ca.app_id} className="csc-community-warning-app">
                                    <span>{ca.display_name}</span>
                                    {ca.url && (
                                        <a href={ca.url} target="_blank" rel="noopener noreferrer" className="csc-community-warning-link">Splunkbase ↗</a>
                                    )}
                                </div>
                            ))}
                            <span className="csc-community-warning-hint">
                                Not an official Cisco/Splunk add-on. Migrate to <strong>{addon_label || addon}</strong> for full support and compatibility.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ── Footer: clean button row ── */}
            <div className="csc-card-footer">
                {/* Learn More — full text, outline */}
                {learn_more_url && (
                    <a href={learn_more_url} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-outline"
                        title={`Learn more about ${display_name}`}>
                        Learn More
                    </a>
                )}
                {/* Upgrade TA */}
                {!isComingSoon && isConfigured && appStatus?.installed && appStatus?.updateVersion && (addon_install_url || addon_splunkbase_url) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : addon_splunkbase_url} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${addon_label || addon} to v${appStatus.updateVersion}`}>
                        ↑ Add-on
                    </a>
                )}
                {/* Upgrade Viz App */}
                {!isComingSoon && isConfigured && vizAppStatus?.installed && vizAppStatus?.updateVersion && (app_viz_install_url || app_viz_splunkbase_url) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : app_viz_splunkbase_url} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${app_viz_label || app_viz} to v${vizAppStatus.updateVersion}`}>
                        ↑ App
                    </a>
                )}
                {/* Upgrade Viz App 2 */}
                {!isComingSoon && isConfigured && vizApp2Status?.installed && vizApp2Status?.updateVersion && app_viz_2_install_url && (
                    <a href={createURL(app_viz_2_install_url)} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${app_viz_2_label || app_viz_2} to v${vizApp2Status.updateVersion}`}>
                        ↑ App 2
                    </a>
                )}
                {/* Install TA */}
                {!isComingSoon && isConfigured && addon && !appStatus?.installed && (addon_install_url || addon_splunkbase_url) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : addon_splunkbase_url}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!addon_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!addon_install_url
                            ? `Not available in Browse More Apps — download ${addon_label || addon} from Splunkbase`
                            : `Install ${addon_label || addon}`}>
                        {!addon_install_url ? 'Add-on ↗' : 'Add-on'}
                    </a>
                )}
                {/* Install Viz App */}
                {!isComingSoon && isConfigured && app_viz && !vizAppStatus?.installed && (app_viz_install_url || app_viz_splunkbase_url) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : app_viz_splunkbase_url}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!app_viz_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!app_viz_install_url
                            ? `Not available in Browse More Apps — download ${app_viz_label || app_viz} from Splunkbase`
                            : `Install ${app_viz_label || app_viz}`}>
                        {!app_viz_install_url ? 'App ↗' : 'App'}
                    </a>
                )}
                {/* Install Viz App 2 */}
                {!isComingSoon && isConfigured && app_viz_2 && !vizApp2Status?.installed && (app_viz_2_install_url || app_viz_2_splunkbase_url) && (
                    <a href={app_viz_2_install_url ? createURL(app_viz_2_install_url) : app_viz_2_splunkbase_url}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!app_viz_2_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!app_viz_2_install_url
                            ? `Not available in Browse More Apps — download ${app_viz_2_label || app_viz_2} from Splunkbase`
                            : `Install ${app_viz_2_label || app_viz_2}`}>
                        {!app_viz_2_install_url ? 'App 2 ↗' : 'App 2'}
                    </a>
                )}
                {/* Launch — split button when custom dashboard exists */}
                {!isComingSoon && isConfigured && isInstalled && (
                    <div className="csc-launch-wrap" ref={launchBtnRef}>
                        <button className="csc-btn csc-btn-green" onClick={handleLaunchApp}
                            title={product.custom_dashboard
                                ? `Launch custom: ${product.custom_dashboard}`
                                : `Launch ${app_viz_label || addon_label || addon}`}>
                            Launch
                        </button>
                        <button
                            className="csc-btn csc-btn-green csc-launch-caret"
                            onClick={toggleLaunchMenu}
                            title="Launch options"
                        >▾</button>
                        {launchMenuOpen && ReactDOM.createPortal(
                            <div className="csc-launch-menu" ref={launchMenuRef}
                                style={{ top: launchMenuPos.top, left: launchMenuPos.left }}>
                                <button className="csc-launch-menu-item" onClick={() => { handleLaunchDefault(); setLaunchMenuOpen(false); }}>
                                    {product.dashboard
                                        ? product.dashboard.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                                        : (app_viz_label || addon_label || 'Default Dashboard')}
                                </button>
                                {product.custom_dashboard && (
                                    <button className="csc-launch-menu-item" onClick={() => { handleLaunchCustom(); setLaunchMenuOpen(false); }}>
                                        Custom: {product.custom_dashboard.split('/').pop()}
                                    </button>
                                )}
                                <button className="csc-launch-menu-item csc-launch-menu-edit" onClick={() => { setLaunchMenuOpen(false); setCustomDashModalOpen(true); setCustomDashInput(product.custom_dashboard || ''); }}>
                                    {product.custom_dashboard ? 'Edit Custom…' : 'Set Custom…'}
                                </button>
                            </div>,
                            document.body
                        )}
                    </div>
                )}
                {/* Add to My Products */}
                {!isComingSoon && !isConfigured && (
                    <button className="csc-btn csc-btn-green" onClick={() => onToggleConfigured(product_id)}
                        title="Add to My Products">
                        Add
                    </button>
                )}
                {/* Best Practices */}
                {!isComingSoon && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onShowBestPractices(product)}
                        title="Best Practices">
                        ?
                    </button>
                )}
                {/* Remove */}
                {!isComingSoon && isConfigured && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onToggleConfigured(product_id)}
                        title="Remove from My Products">
                        ×
                    </button>
                )}
                {/* Dev Mode — view config */}
                {devMode && onViewConfig && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline csc-btn-devmode"
                        onClick={() => onViewConfig(product_id)}
                        title="View product config (Dev Mode)">
                        &lt;/&gt;
                    </button>
                )}
                {isComingSoon && (
                    <span className="csc-coming-soon-badge">Coming Soon</span>
                )}
            </div>

            {/* ── Custom Dashboard Modal ── */}
            {customDashModalOpen && (
                <Modal open returnFocus={launchBtnRef} onRequestClose={() => { setCustomDashModalOpen(false); setCustomDashMsg(null); }}>
                    <Modal.Header title={`Custom Dashboard — ${display_name}`} />
                    <Modal.Body>
                        <div style={{ padding: '8px 0' }}>
                            <p style={{ fontSize: '13px', color: 'var(--muted-color, #666)', marginBottom: '14px', lineHeight: '1.6' }}>
                                Set a custom dashboard to launch for this product. When set, the Launch button will open your custom dashboard by default.
                                Use the dropdown arrow to switch between the Cisco default and your custom dashboard at any time.
                            </p>
                            <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                                Dashboard path
                            </label>
                            <input
                                type="text"
                                value={customDashInput}
                                onChange={(e) => { setCustomDashInput(e.target.value); setCustomDashMsg(null); }}
                                placeholder="e.g. search/my_duo_dashboard  or  my_dashboard_name"
                                style={{
                                    width: '100%', padding: '8px 12px', fontSize: '13px',
                                    border: '1px solid var(--input-border, #ccc)', borderRadius: '6px',
                                    boxSizing: 'border-box', background: 'var(--input-bg, #fff)',
                                    color: 'var(--page-color, #333)',
                                }}
                            />
                            <p style={{ fontSize: '11px', color: 'var(--faint-color, #888)', marginTop: '6px', lineHeight: '1.5' }}>
                                Format: <code style={{ background: 'var(--code-bg, #e8e8e8)', padding: '1px 4px', borderRadius: '3px' }}>app_name/view_name</code> or just <code style={{ background: 'var(--code-bg, #e8e8e8)', padding: '1px 4px', borderRadius: '3px' }}>view_name</code> (defaults to the product's add-on app).
                                Saved to <code style={{ background: 'var(--code-bg, #e8e8e8)', padding: '1px 4px', borderRadius: '3px' }}>local/products.conf</code> — survives app upgrades. Leave blank to clear.
                            </p>
                            {customDashMsg && (
                                <Message type={customDashMsg.type} style={{ marginTop: '10px' }}>
                                    {customDashMsg.text}
                                </Message>
                            )}
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button appearance="secondary" label="Cancel" onClick={() => { setCustomDashModalOpen(false); setCustomDashMsg(null); }} />
                        {customDashSaving
                            ? <WaitSpinner size="medium" />
                            : <Button appearance="primary" label="Save" onClick={handleSaveCustomDashboard} />
                        }
                    </Modal.Footer>
                </Modal>
            )}

            {/* ── Gradient bottom border ── */}
            <div className={`csc-card-bottom-border ${
                isConfigured ? 'csc-bottom-cisco' : 'csc-bottom-neutral'
            }`} />
        </div>
    );
}

// ─────────────────────  CONFIG VIEWER (Dev Mode)  ─────────────────

/** Convert enriched product object(s) back to Splunk .conf INI format */
function toSplunkConf(data) {
    const products = Array.isArray(data) ? data : [data];
    const sections = [];
    for (const p of products) {
        const lines = [`[${p.product_id}]`];
        // Simple scalar fields — order matches products.conf convention
        const SCALAR_FIELDS = [
            'display_name', 'description', 'value_proposition', 'vendor', 'tagline',
            'category', 'version', 'status',
            'addon', 'addon_label', 'addon_family', 'addon_splunkbase_url',
            'addon_docs_url', 'addon_troubleshoot_url', 'addon_install_url',
            'app_viz', 'app_viz_label', 'app_viz_splunkbase_url', 'app_viz_docs_url',
            'app_viz_troubleshoot_url', 'app_viz_install_url',
            'app_viz_2', 'app_viz_2_label', 'app_viz_2_splunkbase_url',
            'app_viz_2_docs_url', 'app_viz_2_install_url',
            'learn_more_url',
            'support_level', 'icon_emoji', 'sort_order',
            'card_banner', 'card_banner_color', 'card_banner_size', 'card_banner_opacity',
            'card_accent', 'card_bg_color',
            'sc4s_url', 'sc4s_label', 'sc4s_search_head_ta', 'sc4s_search_head_ta_label',
            'sc4s_search_head_ta_splunkbase_url', 'sc4s_search_head_ta_splunkbase_id',
            'sc4s_search_head_ta_install_url',
        ];
        for (const f of SCALAR_FIELDS) {
            const v = p[f];
            if (v !== undefined && v !== null && v !== '' && v !== false) lines.push(`${f} = ${v}`);
        }
        // Boolean fields
        if (p.is_new) lines.push('is_new = true');
        if (p.secure_networking_gtm) lines.push('secure_networking_gtm = true');
        if (p.sc4s_supported) lines.push('sc4s_supported = true');
        // CSV array fields
        if (p.sourcetypes && p.sourcetypes.length) lines.push(`sourcetypes = ${p.sourcetypes.join(',')}`);
        if (p.dashboard) lines.push(`dashboards = ${p.dashboard}`);
        if (p.custom_dashboard) lines.push(`custom_dashboard = ${p.custom_dashboard}`);
        if (p.keywords && p.keywords.length) lines.push(`keywords = ${p.keywords.join(',')}`);
        if (p.aliases && p.aliases.length) lines.push(`aliases = ${p.aliases.join(',')}`);
        // Legacy apps (parallel CSV)
        if (p.legacy_apps && p.legacy_apps.length) {
            lines.push(`legacy_apps = ${p.legacy_apps.map(la => la.app_id).join(',')}`);
            lines.push(`legacy_labels = ${p.legacy_apps.map(la => la.display_name).join(',')}`);
            const uids = p.legacy_apps.map(la => la.uid).join(',');
            if (uids.replace(/,/g, '')) lines.push(`legacy_uids = ${uids}`);
            const urls = p.legacy_apps.map(la => la.addon_splunkbase_url).join(',');
            if (urls.replace(/,/g, '')) lines.push(`legacy_urls = ${urls}`);
            const statuses = p.legacy_apps.map(la => la.status || 'active').join(',');
            lines.push(`legacy_statuses = ${statuses}`);
        }
        // Prereq apps
        if (p.prereq_apps && p.prereq_apps.length) {
            lines.push(`prereq_apps = ${p.prereq_apps.map(pa => pa.app_id).join(',')}`);
            lines.push(`prereq_labels = ${p.prereq_apps.map(pa => pa.display_name).join(',')}`);
            const uids = p.prereq_apps.map(pa => pa.uid).join(',');
            if (uids.replace(/,/g, '')) lines.push(`prereq_uids = ${uids}`);
            const urls = p.prereq_apps.map(pa => pa.addon_splunkbase_url).join(',');
            if (urls.replace(/,/g, '')) lines.push(`prereq_urls = ${urls}`);
        }
        // Community apps
        if (p.community_apps && p.community_apps.length) {
            lines.push(`community_apps = ${p.community_apps.map(ca => ca.app_id).join(',')}`);
            lines.push(`community_labels = ${p.community_apps.map(ca => ca.display_name).join(',')}`);
            const uids = p.community_apps.map(ca => ca.uid).join(',');
            if (uids.replace(/,/g, '')) lines.push(`community_uids = ${uids}`);
            const urls = p.community_apps.map(ca => ca.url).join(',');
            if (urls.replace(/,/g, '')) lines.push(`community_urls = ${urls}`);
        }
        // SOAR connectors
        if (p.soar_connectors) {
            p.soar_connectors.forEach((sc, i) => {
                const sfx = i === 0 ? '' : `_${i + 1}`;
                lines.push(`soar_connector${sfx}_label = ${sc.label}`);
                if (sc.uid) lines.push(`soar_connector${sfx}_uid = ${sc.uid}`);
                if (sc.url) lines.push(`soar_connector${sfx}_url = ${sc.url}`);
            });
        }
        // Alert actions
        if (p.alert_actions) {
            p.alert_actions.forEach((aa, i) => {
                const sfx = i === 0 ? '' : `_${i + 1}`;
                lines.push(`alert_action${sfx}_label = ${aa.label}`);
                if (aa.uid) lines.push(`alert_action${sfx}_uid = ${aa.uid}`);
                if (aa.url) lines.push(`alert_action${sfx}_url = ${aa.url}`);
            });
        }
        // ITSI
        if (p.itsi_content_pack) {
            lines.push(`itsi_content_pack_label = ${p.itsi_content_pack.label}`);
            if (p.itsi_content_pack.docs_url) lines.push(`itsi_content_pack_docs_url = ${p.itsi_content_pack.docs_url}`);
        }
        // SC4S config notes / best practices (pipe-delimited)
        if (p.sc4s_config_notes && p.sc4s_config_notes.length) lines.push(`sc4s_config_notes = ${p.sc4s_config_notes.join('|')}`);
        if (p.best_practices && p.best_practices.length) lines.push(`best_practices = ${p.best_practices.join('|')}`);
        sections.push(lines.join('\n'));
    }
    return sections.join('\n\n');
}

/** Syntax-highlight a JSON string → array of React spans */
function highlightJson(text) {
    // Tokenize JSON for syntax coloring
    const parts = [];
    const regex = /("(?:[^"\\]|\\.)*")\s*(:)|"(?:[^"\\]|\\.)*"|\b(true|false|null)\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}\[\],])/g;
    let last = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
        if (m.index > last) parts.push(<span key={`w${last}`} className="sh-plain">{text.slice(last, m.index)}</span>);
        if (m[1]) {
            // key
            parts.push(<span key={`k${m.index}`} className="sh-key">{m[1]}</span>);
            parts.push(<span key={`c${m.index}`} className="sh-colon">{m[0].slice(m[1].length)}</span>);
        } else if (m[3]) {
            parts.push(<span key={`b${m.index}`} className="sh-bool">{m[0]}</span>);
        } else if (m[4]) {
            parts.push(<span key={`n${m.index}`} className="sh-number">{m[0]}</span>);
        } else if (m[5]) {
            parts.push(<span key={`p${m.index}`} className="sh-punct">{m[0]}</span>);
        } else {
            // string value
            parts.push(<span key={`s${m.index}`} className="sh-string">{m[0]}</span>);
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(<span key={`e${last}`} className="sh-plain">{text.slice(last)}</span>);
    return parts;
}

/** Syntax-highlight a YAML string → array of React spans */
function highlightYaml(text) {
    return text.split('\n').map((line, i) => {
        const parts = [];
        if (/^\s*#/.test(line)) {
            // Comment line
            parts.push(<span key={`c${i}`} className="sh-comment">{line}</span>);
        } else if (/^(\s*-\s+)(.*)/.test(line)) {
            // List item
            const lm = line.match(/^(\s*-\s+)(.*)/);
            parts.push(<span key={`d${i}`} className="sh-punct">{lm[1]}</span>);
            // Check if the value part has a key: value
            const valPart = lm[2];
            const kvMatch = valPart.match(/^([\w._-]+)(:\s*)(.*)/);
            if (kvMatch) {
                parts.push(<span key={`k${i}`} className="sh-key">{kvMatch[1]}</span>);
                parts.push(<span key={`co${i}`} className="sh-colon">{kvMatch[2]}</span>);
                parts.push(highlightYamlValue(kvMatch[3], i));
            } else {
                parts.push(highlightYamlValue(valPart, i));
            }
        } else {
            // Key: value or plain
            const kvMatch = line.match(/^(\s*)([\w._-]+)(:\s*)(.*)?/);
            if (kvMatch) {
                parts.push(<span key={`sp${i}`} className="sh-plain">{kvMatch[1]}</span>);
                parts.push(<span key={`k${i}`} className="sh-key">{kvMatch[2]}</span>);
                parts.push(<span key={`co${i}`} className="sh-colon">{kvMatch[3]}</span>);
                if (kvMatch[4]) parts.push(highlightYamlValue(kvMatch[4], i));
            } else {
                parts.push(<span key={`p${i}`} className="sh-plain">{line}</span>);
            }
        }
        return <React.Fragment key={i}>{parts}{'\n'}</React.Fragment>;
    });
}
function highlightYamlValue(val, lineIdx) {
    if (!val) return null;
    if (val === 'true' || val === 'false') return <span key={`bv${lineIdx}`} className="sh-bool">{val}</span>;
    if (val === 'null') return <span key={`nv${lineIdx}`} className="sh-null">{val}</span>;
    if (/^-?\d+\.?\d*$/.test(val)) return <span key={`nv${lineIdx}`} className="sh-number">{val}</span>;
    if (/^".*"$/.test(val)) return <span key={`sv${lineIdx}`} className="sh-string">{val}</span>;
    if (/^\[\]$|^\{\}$/.test(val)) return <span key={`ev${lineIdx}`} className="sh-punct">{val}</span>;
    return <span key={`sv${lineIdx}`} className="sh-string">{val}</span>;
}

/** Syntax-highlight a Splunk .conf INI string → array of React spans */
function highlightConf(text) {
    return text.split('\n').map((line, i) => {
        const parts = [];
        if (/^\s*#/.test(line)) {
            parts.push(<span key={`c${i}`} className="sh-comment">{line}</span>);
        } else if (/^\[.+\]$/.test(line)) {
            parts.push(<span key={`s${i}`} className="sh-stanza">{line}</span>);
        } else {
            const kvMatch = line.match(/^([\w._-]+)(\s*=\s*)(.*)/);
            if (kvMatch) {
                parts.push(<span key={`k${i}`} className="sh-key">{kvMatch[1]}</span>);
                parts.push(<span key={`eq${i}`} className="sh-colon">{kvMatch[2]}</span>);
                const val = kvMatch[3];
                // Color URLs differently
                if (/^https?:\/\//.test(val) || /^\/manager\//.test(val)) {
                    parts.push(<span key={`u${i}`} className="sh-url">{val}</span>);
                } else if (val === 'true' || val === 'false') {
                    parts.push(<span key={`b${i}`} className="sh-bool">{val}</span>);
                } else if (/^\d+\.?\d*$/.test(val)) {
                    parts.push(<span key={`n${i}`} className="sh-number">{val}</span>);
                } else {
                    parts.push(<span key={`v${i}`} className="sh-string">{val}</span>);
                }
            } else if (line.trim() === '') {
                parts.push(<span key={`e${i}`}>{line}</span>);
            } else {
                parts.push(<span key={`p${i}`} className="sh-plain">{line}</span>);
            }
        }
        return <React.Fragment key={i}>{parts}{'\n'}</React.Fragment>;
    });
}

/** Simple object → YAML serializer (no external dependencies) */
function toYaml(obj, indent = 0) {
    const pad = '  '.repeat(indent);
    if (obj === null || obj === undefined) return `${pad}null`;
    if (typeof obj === 'boolean' || typeof obj === 'number') return `${pad}${obj}`;
    if (typeof obj === 'string') {
        if (obj.includes('\n') || obj.includes(':') || obj.includes('#') || obj.includes('"') || obj.includes("'") || /^[\[\]{}&*!|>'"%@`]/.test(obj) || obj.trim() !== obj || obj === '')
            return `${pad}"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        return `${pad}${obj}`;
    }
    if (Array.isArray(obj)) {
        if (obj.length === 0) return `${pad}[]`;
        return obj.map(item => {
            if (typeof item === 'object' && item !== null) {
                const inner = toYaml(item, indent + 1).trimStart();
                return `${pad}- ${inner}`;
            }
            return `${pad}- ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`;
        }).join('\n');
    }
    if (typeof obj === 'object') {
        const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
        if (entries.length === 0) return `${pad}{}`;
        return entries.map(([k, v]) => {
            if (typeof v === 'object') {
                const inner = toYaml(v, indent + 1);
                return `${pad}${k}:\n${inner}`;
            }
            return `${pad}${k}: ${toYaml(v, 0).trimStart()}`;
        }).join('\n');
    }
    return `${pad}${String(obj)}`;
}

/** Check if a value or any nested value matches a search query */
function deepMatch(value, query) {
    if (!query) return false;
    const q = query.toLowerCase();
    if (value === null || value === undefined) return 'null'.includes(q);
    if (typeof value === 'boolean' || typeof value === 'number') return String(value).toLowerCase().includes(q);
    if (typeof value === 'string') return value.toLowerCase().includes(q);
    if (Array.isArray(value)) return value.some(item => deepMatch(item, query));
    if (typeof value === 'object') {
        return Object.entries(value).some(([k, v]) => k.toLowerCase().includes(q) || deepMatch(v, query));
    }
    return false;
}

/** Highlight matching text with a <mark> tag */
function HighlightText({ text, query }) {
    if (!query || !text) return <>{String(text)}</>;
    const str = String(text);
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{str}</>;
    return (
        <>
            {str.slice(0, idx)}
            <mark className="csc-tree-highlight">{str.slice(idx, idx + query.length)}</mark>
            {str.slice(idx + query.length)}
        </>
    );
}

/** Interactive tree node — recursively renders JSON with expand/collapse */
function JsonTreeNode({ keyName, value, depth, defaultOpen, searchQuery, isArrayItem, arrayIndex }) {
    const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
    const isArray = Array.isArray(value);
    const isExpandable = isObject || isArray;

    // Auto-expand if search matches something inside, or if shallow depth
    const matchesSearch = searchQuery && deepMatch(value, searchQuery);
    const keyMatches = searchQuery && keyName && keyName.toLowerCase().includes(searchQuery.toLowerCase());
    const shouldAutoOpen = defaultOpen || (searchQuery && (matchesSearch || keyMatches));

    const [expanded, setExpanded] = useState(shouldAutoOpen);

    // Re-expand when search changes
    useEffect(() => {
        if (searchQuery && (matchesSearch || keyMatches)) setExpanded(true);
    }, [searchQuery, matchesSearch, keyMatches]);

    const toggle = () => setExpanded(prev => !prev);

    // Render the key label
    const renderKey = () => {
        if (keyName === undefined || keyName === null) return null;
        const displayKey = isArrayItem ? `[${arrayIndex}]` : keyName;
        return (
            <span className="csc-tree-key">
                <HighlightText text={displayKey} query={searchQuery} />
            </span>
        );
    };

    // Leaf node (string, number, boolean, null)
    if (!isExpandable) {
        const valClass = value === null || value === undefined ? 'csc-tree-null'
            : typeof value === 'boolean' ? 'csc-tree-bool'
            : typeof value === 'number' ? 'csc-tree-number'
            : 'csc-tree-string';
        const displayVal = value === null || value === undefined ? 'null'
            : typeof value === 'string' ? `"${value}"`
            : String(value);
        return (
            <div className="csc-tree-row" style={{ paddingLeft: `${depth * 18}px` }}>
                {renderKey()}
                {keyName !== undefined && <span className="csc-tree-colon">: </span>}
                <span className={valClass}>
                    <HighlightText text={displayVal} query={searchQuery} />
                </span>
            </div>
        );
    }

    // Expandable node (object or array)
    const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
    const count = entries.length;
    const preview = isArray ? `Array(${count})` : `{${count} ${count === 1 ? 'key' : 'keys'}}`;

    return (
        <div className="csc-tree-branch">
            <div
                className={`csc-tree-row csc-tree-row-expandable ${expanded ? 'csc-tree-row-open' : ''}`}
                style={{ paddingLeft: `${depth * 18}px` }}
                onClick={toggle}
                role="button"
                tabIndex={0}
            >
                <span className={`csc-tree-arrow ${expanded ? 'csc-tree-arrow-open' : ''}`}>▶</span>
                {renderKey()}
                {keyName !== undefined && <span className="csc-tree-colon">: </span>}
                {!expanded && <span className="csc-tree-preview">{preview}</span>}
            </div>
            {expanded && (
                <div className="csc-tree-children">
                    {entries.map(([k, v]) => (
                        <JsonTreeNode
                            key={k}
                            keyName={isArray ? undefined : k}
                            value={v}
                            depth={depth + 1}
                            defaultOpen={depth < 1}
                            searchQuery={searchQuery}
                            isArrayItem={isArray}
                            arrayIndex={isArray ? k : undefined}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/** Tree view for the "All Products" array — shows product names as top-level expandable items */
function JsonTreeView({ data, searchQuery }) {
    const [globalExpanded, setGlobalExpanded] = useState(null); // null = default, true = all, false = none
    const [generation, setGeneration] = useState(0); // bumped on expand/collapse all to force remount

    const handleExpandAll = () => { setGlobalExpanded(true); setGeneration(g => g + 1); };
    const handleCollapseAll = () => { setGlobalExpanded(false); setGeneration(g => g + 1); };

    if (Array.isArray(data)) {
        // Render each product as a named top-level branch
        const items = searchQuery
            ? data.filter(p => deepMatch(p, searchQuery))
            : data;
        return (
            <div className="csc-tree-root">
                <div className="csc-tree-toolbar">
                    <button className="csc-tree-toolbar-btn" onClick={handleExpandAll} title="Expand all">⊞ Expand All</button>
                    <button className="csc-tree-toolbar-btn" onClick={handleCollapseAll} title="Collapse all">⊟ Collapse All</button>
                    <span className="csc-tree-toolbar-count">
                        {items.length} product{items.length !== 1 ? 's' : ''}{searchQuery ? ` matching "${searchQuery}"` : ''}
                    </span>
                </div>
                <div className="csc-tree-container" key={generation}>
                    {items.map((p, i) => (
                        <JsonTreeNode
                            key={p.product_id || i}
                            keyName={p.display_name || p.product_id || `[${i}]`}
                            value={p}
                            depth={0}
                            defaultOpen={globalExpanded === true}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // Single product
    return (
        <div className="csc-tree-root">
            <div className="csc-tree-toolbar">
                <button className="csc-tree-toolbar-btn" onClick={handleExpandAll} title="Expand all">⊞ Expand All</button>
                <button className="csc-tree-toolbar-btn" onClick={handleCollapseAll} title="Collapse all">⊟ Collapse All</button>
            </div>
            <div className="csc-tree-container" key={generation}>
                <JsonTreeNode
                    keyName={data.display_name || data.product_id}
                    value={data}
                    depth={0}
                    defaultOpen={globalExpanded !== false}
                    searchQuery={searchQuery}
                />
            </div>
        </div>
    );
}

function ConfigViewerModal({ open, onClose, products, initialProductId, installedApps, appStatuses, sourcetypeData }) {
    const returnFocusRef = useRef(null);
    const [selectedProduct, setSelectedProduct] = useState(initialProductId || '__all__');
    const [viewMode, setViewMode] = useState('tree'); // 'tree' | 'json' | 'yaml' | 'conf'
    const [copied, setCopied] = useState(false);
    const [treeSearch, setTreeSearch] = useState('');

    useEffect(() => {
        if (initialProductId) setSelectedProduct(initialProductId);
    }, [initialProductId]);

    if (!open) return null;

    // Build enriched product data (what the card actually sees)
    const enrichProduct = (p) => {
        const appStatus = appStatuses[p.addon] || null;
        const vizStatus = p.app_viz ? (appStatuses[p.app_viz] || null) : null;
        const stData = sourcetypeData[p.product_id] || null;
        return {
            ...p,
            _runtime: {
                addon_installed: !!installedApps[p.addon],
                addon_version: appStatus?.version || null,
                addon_update_available: appStatus?.updateVersion || null,
                app_viz_installed: p.app_viz ? !!installedApps[p.app_viz] : null,
                app_viz_version: vizStatus?.version || null,
                sourcetypes_flowing: stData?.hasData || false,
                sourcetype_count: stData?.count || 0,
                legacy_installed: (p.legacy_apps || []).filter(la => installedApps[la.app_id]).map(la => la.display_name),
                community_installed: (p.community_apps || []).filter(ca => installedApps[ca.app_id]).map(ca => ca.display_name),
            },
        };
    };

    const data = selectedProduct === '__all__'
        ? products.map(enrichProduct)
        : enrichProduct(products.find(p => p.product_id === selectedProduct) || products[0]);

    const rawOutput = viewMode === 'yaml'
        ? (Array.isArray(data)
            ? data.map((d) => `# ── ${d.display_name || d.product_id} ──\n- ${toYaml(d, 1).trimStart()}`).join('\n\n')
            : `# ── ${data.display_name || data.product_id} ──\n${toYaml(data)}`)
        : viewMode === 'conf'
            ? toSplunkConf(data)
            : JSON.stringify(data, null, 2);

    const handleCopy = () => {
        const text = viewMode === 'tree' ? JSON.stringify(data, null, 2) : rawOutput;
        const onSuccess = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };
        // Try modern Clipboard API first, fall back to execCommand for non-HTTPS contexts
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
        } else {
            fallbackCopy(text, onSuccess);
        }
    };

    const fallbackCopy = (text, onSuccess) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            onSuccess();
        } catch (e) {
            console.warn('Copy failed:', e);
        }
        document.body.removeChild(ta);
    };

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '900px', width: '92vw' }}>
            <Modal.Header title="⚙️ Config Viewer — Developer Mode" />
            <Modal.Body>
                <div className="csc-devmode-controls">
                    <select
                        className="csc-devmode-select"
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                    >
                        <option value="__all__">All Products ({products.length})</option>
                        {products.map(p => (
                            <option key={p.product_id} value={p.product_id}>
                                {p.display_name || p.product_id}
                            </option>
                        ))}
                    </select>
                    <div className="csc-devmode-tabs">
                        <button
                            className={`csc-devmode-tab ${viewMode === 'tree' ? 'csc-devmode-tab-active' : ''}`}
                            onClick={() => setViewMode('tree')}
                        >🌳 Tree</button>
                        <button
                            className={`csc-devmode-tab ${viewMode === 'json' ? 'csc-devmode-tab-active' : ''}`}
                            onClick={() => setViewMode('json')}
                        >JSON</button>
                        <button
                            className={`csc-devmode-tab ${viewMode === 'yaml' ? 'csc-devmode-tab-active' : ''}`}
                            onClick={() => setViewMode('yaml')}
                        >YAML</button>
                        <button
                            className={`csc-devmode-tab ${viewMode === 'conf' ? 'csc-devmode-tab-active' : ''}`}
                            onClick={() => setViewMode('conf')}
                        >🔧 Splunk</button>
                    </div>
                    <button className="csc-devmode-copy" onClick={handleCopy}>
                        {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                </div>
                {viewMode === 'tree' && (
                    <div className="csc-devmode-search-wrap">
                        <input
                            type="text"
                            className="csc-devmode-search"
                            placeholder="Search keys or values…"
                            value={treeSearch}
                            onChange={(e) => setTreeSearch(e.target.value)}
                        />
                        {treeSearch && (
                            <button className="csc-devmode-search-clear" onClick={() => setTreeSearch('')}>✕</button>
                        )}
                    </div>
                )}
                {viewMode === 'tree' ? (
                    <div className="csc-devmode-output csc-devmode-tree-output">
                        <JsonTreeView data={data} searchQuery={treeSearch} />
                    </div>
                ) : (
                    <pre className="csc-devmode-output csc-devmode-highlighted">
                        {viewMode === 'json' ? highlightJson(rawOutput)
                            : viewMode === 'yaml' ? highlightYaml(rawOutput)
                            : viewMode === 'conf' ? highlightConf(rawOutput)
                            : rawOutput}
                    </pre>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ─────────────────  TECH STACK MODAL  ─────────────────

/**
 * Latest known versions of Splunk UI packages (from splunkui.splunk.com/Packages — Feb 2026).
 * These are updated periodically; the modal shows a "last checked" date.
 */
const KNOWN_LATEST_VERSIONS = {
    // Splunk UI (from splunkui.splunk.com/Packages)
    '@splunk/react-ui': '5.8.0',
    '@splunk/themes': '1.5.0',
    '@splunk/react-page': '8.2.1',
    '@splunk/splunk-utils': '3.4.0',
    '@splunk/webpack-configs': '7.0.3',
    '@splunk/babel-preset': '4.0.0',
    '@splunk/eslint-config': '5.0.0',
    '@splunk/stylelint-config': '5.0.0',
    '@splunk/react-toast-notifications': '0.12.0',
    '@splunk/search-job': '3.1.0',
    '@splunk/ui-utils': '1.12.0',
    '@splunk/react-time-range': '11.3.0',
    '@splunk/moment': '0.7.0',
    '@splunk/create': '10.1.0',
    '@splunk/react-icons': '5.8.0',
    // React / UI framework (from npmjs.com)
    'react': '18.3.1',
    'react-dom': '18.3.1',
    'styled-components': '6.1.14',
    // Build tools (from npmjs.com)
    '@babel/core': '7.26.9',
    'babel-loader': '9.2.1',
    'webpack': '5.98.0',
    'webpack-cli': '6.0.1',
    'webpack-merge': '6.0.1',
    'copy-webpack-plugin': '13.0.0',
    'eslint': '9.21.0',
};
const LATEST_VERSIONS_CHECKED = '2026-03-01';

/** Compare two semver strings. Returns -1 (behind), 0 (match), 1+ (ahead) */
function compareSemver(current, latest) {
    if (!current || !latest) return 0;
    const a = current.split('.').map(Number);
    const b = latest.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) < (b[i] || 0)) return -1;
        if ((a[i] || 0) > (b[i] || 0)) return 1;
    }
    return 0;
}

function TechStackModal({ open, onClose }) {
    const returnFocusRef = useRef(null);
    const [copied, setCopied] = useState(false);

    // SCAN_DEPENDENCY_VERSIONS is injected by webpack DefinePlugin at build time
    const deps = typeof SCAN_DEPENDENCY_VERSIONS !== 'undefined' ? SCAN_DEPENDENCY_VERSIONS : {};

    // Split into categories
    const splunkDeps = [];
    const reactDeps = [];
    const buildDeps = [];

    Object.entries(deps).forEach(([name, version]) => {
        const entry = { name, current: version };
        entry.latest = KNOWN_LATEST_VERSIONS[name] || null;
        entry.cmp = entry.latest ? compareSemver(version, entry.latest) : 0;
        if (name.startsWith('@splunk/')) {
            splunkDeps.push(entry);
        } else if (['react', 'react-dom', 'styled-components'].includes(name)) {
            reactDeps.push(entry);
        } else {
            buildDeps.push(entry);
        }
    });

    // Sort: outdated first, then alphabetical
    const sortDeps = (arr) => arr.sort((a, b) => (a.cmp || 0) - (b.cmp || 0) || a.name.localeCompare(b.name));
    sortDeps(splunkDeps);
    sortDeps(reactDeps);
    sortDeps(buildDeps);

    const allDeps = [...splunkDeps, ...reactDeps, ...buildDeps];
    const allTracked = allDeps.filter(d => d.latest);
    const allOutdated = allTracked.filter(d => d.cmp < 0).length;
    const allCurrent = allTracked.filter(d => d.cmp >= 0).length;

    const handleCopy = () => {
        const lines = ['# SCAN Tech Stack', ''];
        const addSection = (title, arr) => {
            lines.push(`## ${title}`);
            arr.forEach(d => {
                const status = d.latest ? (d.cmp < 0 ? '❌ OUTDATED' : d.cmp > 0 ? '🟢 AHEAD' : '✅ CURRENT') : '';
                lines.push(`  ${d.name}: ${d.current}${d.latest ? ` → latest ${d.latest} ${status}` : ''}`);
            });
            lines.push('');
        };
        addSection('Splunk UI Packages', splunkDeps);
        addSection('React / UI Framework', reactDeps);
        addSection('Build Tools', buildDeps);
        const text = lines.join('\n');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
        }
    };

    if (!open) return null;

    const renderRow = (d) => {
        const statusIcon = d.latest
            ? (d.cmp < 0 ? '❌' : d.cmp > 0 ? '🟢' : '✅')
            : '—';
        const statusClass = d.latest
            ? (d.cmp < 0 ? 'scan-ts-outdated' : d.cmp > 0 ? 'scan-ts-ahead' : 'scan-ts-current')
            : 'scan-ts-unknown';
        return (
            <tr key={d.name} className={statusClass}>
                <td className="scan-ts-name">{d.name}</td>
                <td className="scan-ts-version">{d.current}</td>
                <td className="scan-ts-latest">{d.latest || '—'}</td>
                <td className="scan-ts-status">{statusIcon}</td>
            </tr>
        );
    };

    const renderSection = (title, emoji, arr) => (
        arr.length > 0 && (
            <div className="scan-ts-section" key={title}>
                <h4 className="scan-ts-section-title">{emoji} {title}</h4>
                <table className="scan-ts-table">
                    <thead>
                        <tr>
                            <th>Package</th>
                            <th>Current</th>
                            <th>Latest</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {arr.map(renderRow)}
                    </tbody>
                </table>
            </div>
        )
    );

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '720px', width: '90vw' }}>
            <Modal.Header title="🛠 Tech Stack — Developer Mode" />
            <Modal.Body>
                <div className="scan-ts-summary">
                    <span className="scan-ts-summary-pill scan-ts-summary-current">✅ {allCurrent} current</span>
                    {allOutdated > 0 && <span className="scan-ts-summary-pill scan-ts-summary-outdated">❌ {allOutdated} outdated</span>}
                    <span className="scan-ts-summary-pill scan-ts-summary-total">📦 {Object.keys(deps).length} total deps</span>
                    <button className="csc-devmode-copy" onClick={handleCopy} style={{ marginLeft: 'auto' }}>
                        {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                </div>
                {renderSection('Splunk UI Packages', '🔷', splunkDeps)}
                {renderSection('React / UI Framework', '⚛️', reactDeps)}
                {renderSection('Build Tools', '🔧', buildDeps)}
                <div className="scan-ts-footer-note">
                    Splunk UI versions from <a href="https://splunkui.splunk.com/Packages" target="_blank" rel="noopener noreferrer">splunkui.splunk.com/Packages</a> · Other versions from <a href="https://www.npmjs.com" target="_blank" rel="noopener noreferrer">npmjs.com</a> · Last checked {LATEST_VERSIONS_CHECKED}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ─────────────────────  SEARCH BAR  ─────────────────

function UniversalFinderBar({ onSearch, resultCount, totalCount, products, externalQuery }) {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);

    // Allow parent to clear the query (e.g. after devmode intercept)
    useEffect(() => {
        if (externalQuery !== undefined && externalQuery !== query) {
            setQuery(externalQuery);
        }
    }, [externalQuery]);

    const keywordMap = useMemo(() => {
        const map = {};
        (products || []).forEach((p) => {
            (p.keywords || []).forEach((kw) => {
                const k = kw.toLowerCase().trim();
                if (!k) return;
                if (!map[k]) map[k] = [];
                if (!map[k].includes(p.product_id)) map[k].push(p.product_id);
            });
        });
        return map;
    }, [products]);

    const suggestions = useMemo(() => {
        if (!query || query.length < 1) return [];
        const q = query.toLowerCase();
        return Object.keys(keywordMap)
            .filter((kw) => kw.startsWith(q) || kw.includes(q))
            .slice(0, 6);
    }, [query, keywordMap]);

    // Reset selected index when suggestions change
    useEffect(() => { setSelectedIdx(-1); }, [suggestions.length, query]);

    const handleChange = (e) => { const v = e.target.value; setQuery(v); onSearch(v); };
    const handleSuggestionClick = (kw) => { setQuery(kw); onSearch(kw); setFocused(false); setSelectedIdx(-1); };
    const handleClear = () => { setQuery(''); onSearch(''); setSelectedIdx(-1); };
    const handleKeyDown = (e) => {
        if (!focused || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const idx = selectedIdx >= 0 ? selectedIdx : 0;
            handleSuggestionClick(suggestions[idx]);
        } else if (e.key === 'Escape') {
            setFocused(false);
            setSelectedIdx(-1);
        }
    };

    return (
        <div className="products-search-bar">
            <div style={{ position: 'relative', flex: 1, maxWidth: '560px' }}>
                <input
                    type="text"
                    className="products-search-input"
                    placeholder='Search: "Firewall", "Duo", "XDR", "ISE", "SD-WAN"…'
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setTimeout(() => setFocused(false), 200)}
                    style={{
                        width: '100%', padding: '10px 36px 10px 14px',
                        border: '1px solid var(--input-border, #ccc)',
                        borderRadius: '6px', fontSize: '14px',
                        background: 'var(--input-bg, #fff)',
                        color: 'var(--page-color, #333)', outline: 'none',
                    }}
                />
                {query && (
                    <button
                        onClick={handleClear}
                        style={{
                            position: 'absolute', right: '8px', top: '50%',
                            transform: 'translateY(-50%)', background: 'none',
                            border: 'none', cursor: 'pointer', fontSize: '16px',
                            color: 'var(--faint-color, #888)', padding: '2px 6px',
                        }}
                        title="Clear search"
                    >✕</button>
                )}
                {focused && suggestions.length > 0 && (
                    <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'var(--card-bg, #fff)',
                        border: '1px solid var(--input-border, #ccc)', borderTop: 'none',
                        borderRadius: '0 0 6px 6px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                        zIndex: 100, maxHeight: '200px', overflowY: 'auto',
                    }}>
                        {suggestions.map((kw, idx) => (
                            <div
                                key={kw}
                                onMouseDown={() => handleSuggestionClick(kw)}
                                onMouseEnter={() => setSelectedIdx(idx)}
                                style={{
                                    padding: '10px 14px', fontSize: '13px', cursor: 'pointer',
                                    borderBottom: '1px solid var(--card-footer-border, #f0f0f0)',
                                    color: 'var(--page-color, #333)',
                                    background: idx === selectedIdx ? 'var(--section-alt-bg, #eee)' : 'transparent',
                                }}
                            >
                                🔍 {kw}
                                <span style={{ fontSize: '11px', color: 'var(--faint-color, #888)', marginLeft: '8px' }}>
                                    ({keywordMap[kw]?.length || 0} product{(keywordMap[kw]?.length || 0) !== 1 ? 's' : ''})
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <span className="search-result-count">
                {resultCount != null && totalCount != null
                    ? query ? `${resultCount} of ${totalCount} products` : `${totalCount} products`
                    : ''}
            </span>
        </div>
    );
}

// ──────────────────────  ADDON  FILTER  ─────────────────────

/**
 * "Powered by" filter pills — auto-derived from the product catalog.
 * Shows each unique addon with a product count.  "Standalone" catches
 * products whose addon field is empty.
 */
function AddonFilterBar({ selectedAddon, onSelectAddon, products }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const groups = useMemo(() => {
        const map = {};          // addon → { label, count }
        let standalone = 0;
        let sc4sOnly = 0;
        (products || []).forEach((p) => {
            if (!p.addon) {
                if (p.sc4s_supported) { sc4sOnly++; }
                else { standalone++; }
                return;
            }
            if (!map[p.addon]) map[p.addon] = { label: p.addon_label || p.addon, count: 0 };
            map[p.addon].count++;
        });
        // Sort by count desc, then alphabetical
        const entries = Object.entries(map)
            .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label));
        if (sc4sOnly > 0) entries.push(['__sc4s__', { label: 'Splunk Connect for Syslog (SC4S)', count: sc4sOnly }]);
        if (standalone > 0) entries.push(['__standalone__', { label: 'Standalone', count: standalone }]);
        return entries;          // [[ addonId, { label, count }], …]
    }, [products]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    if (groups.length <= 1) return null;   // nothing to filter

    const total = (products || []).length;
    const activeLabel = selectedAddon
        ? (groups.find(([id]) => id === selectedAddon)?.[1]?.label || 'Filter')
        : 'All';
    const activeCount = selectedAddon
        ? (groups.find(([id]) => id === selectedAddon)?.[1]?.count || 0)
        : total;

    const handleSelect = (id) => {
        onSelectAddon(selectedAddon === id ? null : id);
        setOpen(false);
    };

    return (
        <div className="addon-dropdown-wrap" ref={ref}>
            <button className="addon-dropdown-trigger" onClick={() => setOpen(!open)}>
                <span className="addon-dropdown-label">Powered by</span>
                <span className="addon-dropdown-value">{activeLabel}</span>
                <span className="addon-pill-count">{activeCount}</span>
                <span className="addon-dropdown-caret">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="addon-dropdown-menu">
                    <button
                        className={`addon-dropdown-item${!selectedAddon ? ' addon-dropdown-item-active' : ''}`}
                        onClick={() => handleSelect(null)}
                    >
                        All <span className="addon-pill-count">{total}</span>
                    </button>
                    {groups.map(([id, g]) => (
                        <button
                            key={id}
                            className={`addon-dropdown-item${selectedAddon === id ? ' addon-dropdown-item-active' : ''}`}
                            onClick={() => handleSelect(id)}
                            title={id === '__standalone__' ? 'Products with their own dedicated add-on' : id === '__sc4s__' ? 'Products powered exclusively by Splunk Connect for Syslog' : g.label}
                        >
                            {g.label} <span className="addon-pill-count">{g.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ──────────────────────  PERSONA QUICK START MODAL  ────────────────────

function PersonaModal({ open, onClose, onSelectPersona, products }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;

    const handleSelect = (preset) => {
        onSelectPersona(preset);
        onClose();
    };

    // Count how many suggested products actually exist in the catalog
    const productIds = new Set(products.map(p => p.product_id));

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '780px', width: '92vw' }}>
            <Modal.Header title="👤 Quick Start — Choose Your Role" />
            <Modal.Body>
                <div className="csc-persona-intro">
                    Select your primary role to personalize your view. We'll filter to the most relevant products
                    and pre-add top recommendations to <strong>My Products</strong>.
                    <span className="csc-persona-intro-hint">You can change this anytime via the 👤 button in the header.</span>
                </div>
                <div className="csc-persona-grid">
                    {PERSONA_PRESETS.map((preset) => {
                        const matchCount = preset.suggested.filter(id => productIds.has(id)).length;
                        return (
                            <button
                                key={preset.id}
                                className="csc-persona-card"
                                onClick={() => handleSelect(preset)}
                                style={{ '--persona-color': preset.color }}
                            >
                                <span className="csc-persona-icon">{preset.icon}</span>
                                <span className="csc-persona-title">{preset.title}</span>
                                <span className="csc-persona-desc">{preset.description}</span>
                                {matchCount > 0 && (
                                    <span className="csc-persona-count">
                                        {matchCount} product{matchCount !== 1 ? 's' : ''} auto-added
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Skip — I'll browse myself" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ──────────────────────  CATEGORY FILTER  ────────────────────

function CategoryFilterBar({ selectedCategory, onSelectCategory, selectedSubCategory, onSelectSubCategory, aiFilter, onToggleAiFilter, categoryCounts, products }) {
    const iconMap = { shield: '🛡️', chart: '📊', globe: '🌐', headset: '🎧', archive: '📦' };
    const btnStyle = (active, variant) => {
        const isAmber = variant === 'soar';
        const isTeal = variant === 'alert';
        const isSecNet = variant === 'secnet';
        const isAi = variant === 'ai';
        let activeColor, activeBg, activeBorder, activeText;
        if (isAmber) {
            activeBg = '#fef3c7'; activeBorder = '#f59e0b'; activeText = '#92400e';
        } else if (isTeal) {
            activeBg = '#dbeafe'; activeBorder = '#3b82f6'; activeText = '#1e40af';
        } else if (isSecNet) {
            activeBg = '#e0f2f1'; activeBorder = '#00897b'; activeText = '#004d40';
        } else if (isAi) {
            activeBg = '#ede9fe'; activeBorder = '#7c3aed'; activeText = '#5b21b6';
        } else {
            activeBg = '#049fd9'; activeBorder = '#049fd9'; activeText = '#fff';
        }
        return {
            display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            padding: '7px 14px', borderRadius: '20px', border: '2px solid',
            borderColor: active ? activeBorder : 'var(--card-border, #ddd)',
            background: active ? activeBg : 'var(--card-bg, #f5f5f5)',
            color: active ? activeText : 'var(--page-color, #333)',
            cursor: 'pointer', fontWeight: 600, fontSize: '13px',
            transition: 'all 0.2s', flexShrink: 0,
        };
    };

    const totalCount = categoryCounts ? Object.keys(categoryCounts).reduce((sum, k) => (k === 'soar' || k === 'alert_actions' || k === 'secure_networking' || k === 'ai_powered') ? sum : sum + categoryCounts[k], 0) : null;
    const soarCount = categoryCounts?.soar || 0;
    const alertCount = categoryCounts?.alert_actions || 0;
    const secNetCount = categoryCounts?.secure_networking || 0;
    const aiPoweredCount = categoryCounts?.ai_powered || 0;

    return (<>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollBehavior: 'smooth', alignItems: 'center' }}>
            <button onClick={() => onSelectCategory(null)} style={btnStyle(!selectedCategory)}>
                📋 All
                {totalCount != null && (
                    <span style={{
                        fontSize: '10px',
                        background: !selectedCategory ? 'rgba(255,255,255,0.3)' : 'var(--version-bg, #e8e8e8)',
                        padding: '1px 6px', borderRadius: '10px',
                    }}>
                        {totalCount}
                    </span>
                )}
            </button>
            {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                    <button key={cat.id} onClick={() => onSelectCategory(cat.id)} title={cat.description} style={btnStyle(active)}>
                        {iconMap[cat.icon] || '📁'} {cat.name}
                        {categoryCounts?.[cat.id] != null && (
                            <span style={{
                                fontSize: '10px',
                                background: active ? 'rgba(255,255,255,0.3)' : 'var(--version-bg, #e8e8e8)',
                                padding: '1px 6px', borderRadius: '10px',
                            }}>
                                {categoryCounts[cat.id]}
                            </span>
                        )}
                    </button>
                );
            })}
            {/* ── Secure Networking GTM cross-cutting filter ── */}
            {secNetCount > 0 && (
                <>
                    <span style={{ width: '1px', height: '24px', background: 'var(--card-border, #ddd)', flexShrink: 0 }} />
                    <button
                        onClick={() => onSelectCategory(selectedCategory === 'secure_networking' ? null : 'secure_networking')}
                        title="Cisco Secure Networking GTM — show products in the Secure Networking go-to-market strategy"
                        style={btnStyle(selectedCategory === 'secure_networking', 'secnet')}
                    >
                        🔐 Secure Networking
                        <span style={{
                            fontSize: '10px',
                            background: selectedCategory === 'secure_networking' ? 'rgba(255,255,255,0.25)' : 'var(--version-bg, #e8e8e8)',
                            padding: '1px 6px', borderRadius: '10px',
                        }}>
                            {secNetCount}
                        </span>
                    </button>
                </>
            )}
            {/* ── SOAR cross-cutting filter ── */}
            {soarCount > 0 && (
                <>
                    <span style={{ width: '1px', height: '24px', background: 'var(--card-border, #ddd)', flexShrink: 0 }} />
                    <button
                        className={selectedCategory === 'soar' ? 'csc-soar-filter-active' : ''}
                        onClick={() => onSelectCategory(selectedCategory === 'soar' ? null : 'soar')}
                        title="Show only products with Splunk SOAR connectors available"
                        style={btnStyle(selectedCategory === 'soar', 'soar')}
                    >
                        ⚡ SOAR
                        <span className={selectedCategory === 'soar' ? 'csc-soar-filter-count' : ''} style={{
                            fontSize: '10px',
                            background: selectedCategory === 'soar' ? 'rgba(146,64,14,0.15)' : 'var(--version-bg, #e8e8e8)',
                            padding: '1px 6px', borderRadius: '10px',
                        }}>
                            {soarCount}
                        </span>
                    </button>
                </>
            )}
            {/* ── Alert Actions cross-cutting filter ── */}
            {alertCount > 0 && (
                <>
                    {soarCount === 0 && <span style={{ width: '1px', height: '24px', background: 'var(--card-border, #ddd)', flexShrink: 0 }} />}
                    <button
                        className={selectedCategory === 'alert_actions' ? 'csc-alert-filter-active' : ''}
                        onClick={() => onSelectCategory(selectedCategory === 'alert_actions' ? null : 'alert_actions')}
                        title="Show only products with custom alert actions available"
                        style={btnStyle(selectedCategory === 'alert_actions', 'alert')}
                    >
                        🔔 Alert Actions
                        <span className={selectedCategory === 'alert_actions' ? 'csc-alert-filter-count' : ''} style={{
                            fontSize: '10px',
                            background: selectedCategory === 'alert_actions' ? 'rgba(30,64,175,0.12)' : 'var(--version-bg, #e8e8e8)',
                            padding: '1px 6px', borderRadius: '10px',
                        }}>
                            {alertCount}
                        </span>
                    </button>
                </>
            )}
            {/* ── AI-Powered cross-cutting filter ── */}
            {aiPoweredCount > 0 && (
                <>
                    <span style={{ width: '1px', height: '24px', background: 'var(--card-border, #ddd)', flexShrink: 0 }} />
                    <button
                        onClick={() => onSelectCategory(selectedCategory === 'ai_powered' ? null : 'ai_powered')}
                        title="Show products that leverage AI/ML technologies"
                        style={btnStyle(selectedCategory === 'ai_powered', 'ai')}
                    >
                        🤖 AI-Powered
                        <span style={{
                            fontSize: '10px',
                            background: selectedCategory === 'ai_powered' ? 'rgba(91,33,182,0.12)' : 'var(--version-bg, #e8e8e8)',
                            padding: '1px 6px', borderRadius: '10px',
                        }}>
                            {aiPoweredCount}
                        </span>
                    </button>
                </>
            )}
        </div>
        {/* ── Sub-category pills ── */}
        {selectedCategory && SUB_CATEGORIES[selectedCategory] && (() => {
            const subs = SUB_CATEGORIES[selectedCategory];
            const base = products || [];
            const catProducts = base.filter(p => p.category === selectedCategory);
            const subCounts = {};
            subs.forEach(s => { subCounts[s.id] = catProducts.filter(p => p.subcategory === s.id).length; });
            const unassigned = catProducts.filter(p => !p.subcategory || !subs.some(s => s.id === p.subcategory)).length;
            const hasAnySubs = subs.some(s => subCounts[s.id] > 0);
            if (!hasAnySubs) return null;
            return (
                <div className="csc-subcategory-bar" style={{ display: 'flex', gap: '6px', marginTop: '8px', paddingLeft: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--faint-color, #888)', fontWeight: 500, marginRight: '4px' }}>Sub:</span>
                    <button onClick={() => onSelectSubCategory(null)} className={`csc-subcategory-pill ${!selectedSubCategory ? 'csc-subcategory-pill-active' : ''}`}>
                        All <span className="csc-subcategory-count">{catProducts.length}</span>
                    </button>
                    {subs.map(sub => {
                        const count = subCounts[sub.id];
                        if (count === 0) return null;
                        const active = selectedSubCategory === sub.id;
                        return (
                            <button key={sub.id} onClick={() => onSelectSubCategory(active ? null : sub.id)}
                                className={`csc-subcategory-pill ${active ? 'csc-subcategory-pill-active' : ''}`}
                                title={`Filter by ${sub.name}`}>
                                {sub.icon} {sub.name} <span className="csc-subcategory-count">{count}</span>
                            </button>
                        );
                    })}
                    {unassigned > 0 && (
                        <button onClick={() => onSelectSubCategory(selectedSubCategory === '__other__' ? null : '__other__')}
                            className={`csc-subcategory-pill ${selectedSubCategory === '__other__' ? 'csc-subcategory-pill-active' : ''}`}>
                            📦 Other <span className="csc-subcategory-count">{unassigned}</span>
                        </button>
                    )}
                    {/* ── AI filter pill (always visible, end of pill row) ── */}
                    {(() => {
                        const aiCount = catProducts.filter(p => p.ai_enabled).length;
                        if (aiCount === 0) return null;
                        return (
                            <>
                                <span style={{ borderLeft: '1.5px solid var(--card-border, #ddd)', height: '18px', margin: '0 4px' }} />
                                <button onClick={() => onToggleAiFilter(!aiFilter)}
                                    className={`csc-subcategory-pill csc-ai-pill ${aiFilter ? 'csc-ai-pill-active' : ''}`}
                                    title="Filter products that leverage AI technologies">
                                    🤖 AI-Powered <span className="csc-subcategory-count">{aiCount}</span>
                                </button>
                            </>
                        );
                    })()}
                </div>
            );
        })()}
        {/* ── AI pill for categories without sub-categories ── */}
        {selectedCategory && !SUB_CATEGORIES[selectedCategory] && (() => {
            const base = products || [];
            const catProducts = base.filter(p => p.category === selectedCategory);
            const aiCount = catProducts.filter(p => p.ai_enabled).length;
            if (aiCount === 0) return null;
            return (
                <div className="csc-subcategory-bar" style={{ display: 'flex', gap: '6px', marginTop: '8px', paddingLeft: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => onToggleAiFilter(!aiFilter)}
                        className={`csc-subcategory-pill csc-ai-pill ${aiFilter ? 'csc-ai-pill-active' : ''}`}
                        title="Filter products that leverage AI technologies">
                        🤖 AI-Powered <span className="csc-subcategory-count">{aiCount}</span>
                    </button>
                </div>
            );
        })()}
    </>);
}

// ─────────────────────────  MAIN PAGE  ───────────────────────

function SCANProductsPage() {
    const [products, setProducts] = useState(PRODUCT_CATALOG.filter(p => CATEGORY_IDS.has(p.category)));
    const [configuredIds, setConfiguredIdsState] = useState(getConfiguredIds);
    const [installedApps, setInstalledApps] = useState({});
    const [appStatuses, setAppStatuses] = useState({});
    const [sourcetypeData, setSourcetypeData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState(null);
    const [aiFilter, setAiFilter] = useState(false);
    const [selectedAddon, setSelectedAddon] = useState(null);
    const [legacyModalOpen, setLegacyModalOpen] = useState(false);
    const [legacyModalApps, setLegacyModalApps] = useState([]);
    const [bpModalOpen, setBpModalOpen] = useState(false);
    const [bpProduct, setBpProduct] = useState(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [removeAllModalOpen, setRemoveAllModalOpen] = useState(false);
    const removeAllReturnRef = useRef(null);
    const [appVersion, setAppVersion] = useState('');
    const [appUpdateVersion, setAppUpdateVersion] = useState('');
    const [platformType, setPlatformType] = useState('');
    const [themeOverride, setThemeOverride] = useState(getThemePreference); // 'auto' | 'light' | 'dark'
    const [splunkTheme, setSplunkTheme] = useState(null);                  // true = dark, false = light, null = unknown
    const [showFullPortfolio, setShowFullPortfolio] = useState(getPortfolioPreference); // false = supported only
    const [devMode, setDevMode] = useState(() => {
        try { return localStorage.getItem(DEVMODE_STORAGE_KEY) === 'true'; } catch { return false; }
    });
    const [devToast, setDevToast] = useState(null);
    const [configViewerOpen, setConfigViewerOpen] = useState(false);
    const [configViewerProductId, setConfigViewerProductId] = useState(null);
    const [techStackOpen, setTechStackOpen] = useState(false);
    const [searchBarQuery, setSearchBarQuery] = useState('');
    const [personaModalOpen, setPersonaModalOpen] = useState(() => {
        try { return localStorage.getItem(PERSONA_STORAGE_KEY) !== 'true'; } catch { return false; }
    });

    // ── Theme detection — read Splunk's preference and store it ──
    useEffect(() => {
        /**
         * Detects the Splunk user's theme preference (read-only).
         * We NEVER write data-theme on <html> — that belongs to Splunk.
         * Our own dark class (dce-dark) is applied separately.
         */
        let cancelled = false;

        const isDarkDOM = () => {
            const html = document.documentElement;
            const body = document.body;
            const htmlTheme = html.getAttribute('data-theme');
            const bodyTheme = body?.getAttribute('data-theme');
            if (htmlTheme === 'dark' || bodyTheme === 'dark') return true;
            if (htmlTheme === 'light' || bodyTheme === 'light') return false;
            if (body?.classList?.contains('dark') || body?.classList?.contains('theme-dark')) return true;
            if (html.classList.contains('theme-dark')) return true;
            return null;
        };

        const fetchSplunkTheme = async () => {
            try {
                const res = await fetch(
                    createURL('/splunkd/__raw/servicesNS/-/-/data/user-prefs/general?output_mode=json'),
                    { credentials: 'include' }
                );
                if (!res.ok) return null;
                const data = await res.json();
                const theme = data?.entry?.[0]?.content?.theme;
                if (theme === 'dark') return true;
                if (theme === 'light') return false;
                return null;
            } catch {
                return null;
            }
        };

        // Synchronous DOM check first
        const domResult = isDarkDOM();
        if (domResult !== null) {
            if (!cancelled) setSplunkTheme(domResult);
        } else {
            if (!cancelled) setSplunkTheme(false); // default light
            fetchSplunkTheme().then((isDark) => {
                if (!cancelled && isDark !== null) setSplunkTheme(isDark);
            });
        }

        // Watch for Splunk toggling theme dynamically
        const observer = new MutationObserver(() => {
            const result = isDarkDOM();
            if (!cancelled && result !== null) setSplunkTheme(result);
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        if (document.body) {
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        }

        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, []);

    // ── Apply resolved theme (override > Splunk default) ──
    useEffect(() => {
        const isDark = themeOverride === 'dark' ? true
            : themeOverride === 'light' ? false
            : !!splunkTheme; // 'auto' → follow Splunk
        const html = document.documentElement;
        if (isDark) {
            html.classList.add('dce-dark');
        } else {
            html.classList.remove('dce-dark');
        }
    }, [themeOverride, splunkTheme]);

    const handleThemeCycle = useCallback(() => {
        setThemeOverride((prev) => {
            // Cycle: auto → light → dark → auto
            const next = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
            saveThemePreference(next);
            return next;
        });
    }, []);

    // Toggle configured (localStorage)
    const handleToggleConfigured = useCallback((productId) => {
        setConfiguredIdsState((prev) => {
            const next = prev.includes(productId)
                ? prev.filter((id) => id !== productId)
                : [...prev, productId];
            saveConfiguredIds(next);
            return next;
        });
    }, []);

    const handleRemoveAllConfigured = useCallback(() => {
        saveConfiguredIds([]);
        setConfiguredIdsState([]);
        setRemoveAllModalOpen(false);
    }, []);

    const handleShowBestPractices = useCallback((product) => {
        setBpProduct(product);
        setBpModalOpen(true);
    }, []);

    const handleViewLegacy = useCallback((legacyApps) => {
        setLegacyModalApps(legacyApps);
        setLegacyModalOpen(true);
    }, []);

    // Called when a card saves a custom_dashboard — update the product in state
    const handleSetCustomDashboard = useCallback((productId, value) => {
        setProducts((prev) => prev.map((p) =>
            p.product_id === productId ? { ...p, custom_dashboard: value } : p
        ));
    }, []);

    // ── Developer mode search intercept ──
    const handleSearchInput = useCallback((value) => {
        if (value.toLowerCase().trim() === 'devmode') {
            setDevMode(prev => {
                const next = !prev;
                try { localStorage.setItem(DEVMODE_STORAGE_KEY, String(next)); } catch {}
                setDevToast(next ? '🛠 Developer Mode ON' : '🛠 Developer Mode OFF');
                setTimeout(() => setDevToast(null), 2500);
                return next;
            });
            // Clear the search bar and query
            setSearchQuery('');
            setSearchBarQuery('');
            return;
        }
        setSearchQuery(value);
    }, []);

    // ── Persona selection handler ──
    const handleSelectPersona = useCallback((preset) => {
        // Set category filter
        if (preset.category) {
            setSelectedCategory(preset.category);
        }
        // Batch-add suggested products (merge with existing, don't duplicate)
        if (preset.suggested.length > 0) {
            setConfiguredIdsState((prev) => {
                const existing = new Set(prev);
                const validIds = new Set(products.map(p => p.product_id));
                const toAdd = preset.suggested.filter(id => !existing.has(id) && validIds.has(id));
                if (toAdd.length === 0) return prev;
                const next = [...prev, ...toAdd];
                saveConfiguredIds(next);
                return next;
            });
        }
        // Mark persona modal as shown
        try { localStorage.setItem(PERSONA_STORAGE_KEY, 'true'); } catch { /* */ }
    }, [products]);

    const handleDismissPersona = useCallback(() => {
        setPersonaModalOpen(false);
        try { localStorage.setItem(PERSONA_STORAGE_KEY, 'true'); } catch { /* */ }
    }, []);

    // ── Config viewer handlers ──
    const handleOpenConfigViewer = useCallback((productId) => {
        setConfigViewerProductId(productId || null);
        setConfigViewerOpen(true);
    }, []);

    // ── Data loading ──
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Try live conf-products
            try {
                const confProducts = await loadProductsFromConf();
                if (confProducts.length > 0) setProducts(confProducts);
            } catch (e) {
                console.warn('conf-products unavailable, using static catalog:', e);
            }

            // 2. Installed apps lookup
            try {
                const appsRes = await splunkFetch(`${APPS_LOCAL_ENDPOINT}?output_mode=json&count=0`);
                const appsData = await appsRes.json();
                const lookup = {};
                (appsData.entry || []).forEach((entry) => {
                    lookup[entry.name] = {
                        version: entry.content?.version,
                        label: entry.content?.label,
                        disabled: entry.content?.disabled,
                    };
                });
                setInstalledApps(lookup);
            } catch (e) {
                console.warn('Could not fetch installed apps:', e);
            }

            // 2b. Platform detection via server/info
            try {
                const infoRes = await splunkFetch(`${SERVER_INFO_ENDPOINT}?output_mode=json`);
                const infoData = await infoRes.json();
                const serverContent = infoData.entry?.[0]?.content || {};
                const instanceType = serverContent.instance_type || '';
                const productType = serverContent.product_type || '';
                const serverRoles = serverContent.server_roles || [];
                if (instanceType === 'cloud' || productType === 'cloud' || serverRoles.includes('search_head_cloud_member')) {
                    setPlatformType('cloud');
                } else {
                    setPlatformType('enterprise');
                }
            } catch (e) {
                console.warn('Could not fetch server info for platform detection:', e);
                setPlatformType('enterprise');
            }

            // 3. App version + update check
            try {
                const vRes = await splunkFetch(`${APPS_LOCAL_ENDPOINT}/${APP_ID}?output_mode=json`);
                const vData = await vRes.json();
                const vContent = vData.entry?.[0]?.content || {};
                setAppVersion(vContent.version || '');
                setAppUpdateVersion(vContent['update.version'] || '');
            } catch (e) { /* ok */ }
        } catch (err) {
            console.error('Failed to load SCAN data:', err);
            setError(err.message || 'Failed to load product catalog');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Per-app version checks (runs after products load) ──
    useEffect(() => {
        if (loading || products.length === 0 || Object.keys(installedApps).length === 0) return;
        // Collect unique app IDs that need checking — only for apps we know are installed
        const appIds = new Set();
        products.forEach((p) => {
            if (p.addon && installedApps[p.addon]) appIds.add(p.addon);
            if (p.app_viz && installedApps[p.app_viz]) appIds.add(p.app_viz);
            if (p.app_viz_2 && installedApps[p.app_viz_2]) appIds.add(p.app_viz_2);
            if (p.sc4s_search_head_ta && installedApps[p.sc4s_search_head_ta]) appIds.add(p.sc4s_search_head_ta);
        });
        const checkAll = async () => {
            const statuses = {};
            // Pre-fill not-installed status for apps not in installedApps
            products.forEach((p) => {
                [p.addon, p.app_viz, p.app_viz_2, p.sc4s_search_head_ta].forEach((aid) => {
                    if (aid && !appIds.has(aid) && !statuses[aid]) {
                        statuses[aid] = { installed: false, version: null, updateVersion: null, disabled: false };
                    }
                });
            });
            await Promise.allSettled(
                [...appIds].map(async (aid) => {
                    statuses[aid] = await checkAppStatus(aid);
                })
            );
            setAppStatuses(statuses);
        };
        checkAll();
    }, [products, loading, installedApps]);

    // ── Sourcetype detection — single batched metadata search for all products ──
    useEffect(() => {
        if (loading || products.length === 0) return;
        const detect = async () => {
            const results = await detectAllSourcetypeData(products);
            setSourcetypeData((prev) => ({ ...prev, ...results }));
        };
        detect();
    }, [products, loading]);

    // ── Portfolio toggle handler ──
    const handlePortfolioToggle = useCallback(() => {
        setShowFullPortfolio((prev) => {
            const next = !prev;
            savePortfolioPreference(next);
            return next;
        });
    }, []);

    // ── Filtering ──
    const filteredProducts = useMemo(() => {
        let filtered = products;
        // Support-level filter: default shows only Cisco/Splunk supported products
        if (!showFullPortfolio) {
            filtered = filtered.filter((p) => SUPPORTED_LEVELS.has(p.support_level));
        }
        if (selectedCategory === 'soar') {
            filtered = filtered.filter((p) => p.soar_connectors && p.soar_connectors.length > 0);
        } else if (selectedCategory === 'alert_actions') {
            filtered = filtered.filter((p) => p.alert_actions && p.alert_actions.length > 0);
        } else if (selectedCategory === 'secure_networking') {
            filtered = filtered.filter((p) => p.secure_networking_gtm);
        } else if (selectedCategory === 'ai_powered') {
            filtered = filtered.filter((p) => p.ai_enabled);
        } else if (selectedCategory) {
            filtered = filtered.filter((p) => p.category === selectedCategory);
        }
        if (selectedSubCategory) {
            if (selectedSubCategory === '__other__') {
                const subs = SUB_CATEGORIES[selectedCategory] || [];
                const knownSubcats = new Set(subs.map(s => s.id));
                filtered = filtered.filter((p) => !p.subcategory || !knownSubcats.has(p.subcategory));
            } else {
                filtered = filtered.filter((p) => p.subcategory === selectedSubCategory);
            }
        }
        if (aiFilter) {
            filtered = filtered.filter((p) => p.ai_enabled);
        }
        if (selectedAddon) {
            if (selectedAddon === '__standalone__') {
                filtered = filtered.filter((p) => !p.addon && !p.sc4s_supported);
            } else if (selectedAddon === '__sc4s__') {
                filtered = filtered.filter((p) => !p.addon && p.sc4s_supported);
            } else {
                filtered = filtered.filter((p) => p.addon === selectedAddon);
            }
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            filtered = filtered.filter((p) => {
                const kws = (p.keywords || []).map((k) => k.toLowerCase());
                if (kws.some((k) => k.includes(q) || q.includes(k))) return true;
                const als = (p.aliases || []).map((a) => a.toLowerCase());
                if (als.some((a) => a.includes(q) || q.includes(a))) return true;
                return `${p.display_name} ${p.tagline} ${p.description} ${p.vendor} ${p.product_id}`.toLowerCase().includes(q);
            });
        }
        return filtered;
    }, [products, selectedCategory, selectedSubCategory, aiFilter, selectedAddon, searchQuery, showFullPortfolio]);

    const configuredProducts = filteredProducts.filter((p) => p.status !== 'under_development' && !p.cisco_retired && !p.coverage_gap && configuredIds.includes(p.product_id));
    const availableProducts = filteredProducts.filter((p) => p.status !== 'under_development' && !p.cisco_retired && !p.coverage_gap && p.support_level !== 'not_supported' && !configuredIds.includes(p.product_id));
    const unsupportedProducts = filteredProducts.filter((p) => p.status !== 'under_development' && !p.cisco_retired && !p.coverage_gap && p.support_level === 'not_supported' && !configuredIds.includes(p.product_id));
    const comingSoonProducts = filteredProducts.filter((p) => p.status === 'under_development');
    const retiredProducts = filteredProducts.filter((p) => p.cisco_retired);
    const gtmGapProducts = filteredProducts.filter((p) => p.coverage_gap);

    const categoryCounts = useMemo(() => {
        const base = showFullPortfolio ? products : products.filter((p) => SUPPORTED_LEVELS.has(p.support_level));
        const counts = {};
        CATEGORIES.forEach((c) => { counts[c.id] = base.filter((p) => p.category === c.id).length; });
        counts.soar = base.filter((p) => p.soar_connectors && p.soar_connectors.length > 0).length;
        counts.alert_actions = base.filter((p) => p.alert_actions && p.alert_actions.length > 0).length;
        counts.secure_networking = base.filter((p) => p.secure_networking_gtm).length;
        counts.ai_powered = base.filter((p) => p.ai_enabled).length;
        return counts;
    }, [products, showFullPortfolio]);

    // ── Render ──
    if (loading) {
        return (
            <div className="products-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <WaitSpinner size="large" />
                    <p style={{ marginTop: '16px', color: 'var(--faint-color, #888)' }}>Loading Splunk Cisco App Navigator…</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`products-page ${devMode ? 'scan-devmode-active' : ''}`}>
            {/* Dev Mode Banner */}
            {devMode && (
                <div className="scan-devmode-banner">
                    <span className="scan-devmode-banner-pulse" />
                    <span className="scan-devmode-banner-text">⚡ DEVELOPER MODE ⚡</span>
                    <span className="scan-devmode-banner-pulse" />
                </div>
            )}
            {/* Header */}
            <div className="products-page-header">
                <div className="header-left">
                    <h1 className="page-title">Splunk Cisco App Navigator</h1>
                    <p className="products-page-subtitle">
                        The Front Door to the Cisco–Splunk Ecosystem
                    </p>
                </div>
                <div className="header-right">
                    <img
                        className="scan-hero-logo"
                        src={createURL(`/static/app/${APP_ID}/cisco-hero-logo.svg`)}
                        alt="Cisco"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>
            </div>

            {/* ── Utility Strip: info · platform · version · theme ── */}
            <div className="scan-utility-strip">
                <div className="scan-utility-left">
                    <InfoTooltip
                        placement="bottom"
                        width={580}
                        delay={300}
                        content={
                            <span>
                                Browse the catalog below, add products to your workspace, and
                                use this app as your launchpad to <b>view dashboards</b>, <b>manage
                                add-ons</b>, and <b>stay current</b> across every Cisco product in your
                                Splunk environment.
                                <ul>
                                    <li>Click <b>Add to My Products</b> on any card to start tracking it.</li>
                                    <li>Use the <b>Powered-by</b> pills and <b>search bar</b> to filter the catalog.</li>
                                    <li>Hit the <b>Open Dashboard</b> button to jump straight into analytics.</li>
                                </ul>
                            </span>
                        }
                    >
                        <span className="scan-info-pill">
                            <span className="scan-info-pill-icon">&#9432;</span>
                            How do I get started?
                        </span>
                    </InfoTooltip>
                    <button
                        className={`scan-util-pill scan-util-portfolio ${showFullPortfolio ? 'scan-util-portfolio-on' : ''}`}
                        onClick={handlePortfolioToggle}
                        title={showFullPortfolio ? 'Showing all products — click to show supported only' : 'Showing supported products only — click to show all'}
                    >
                        {showFullPortfolio ? '📂' : '✅'}
                        <span className="scan-util-portfolio-label">
                            {showFullPortfolio ? 'All Products' : 'Supported Only'}
                        </span>
                    </button>
                </div>
                <div className="scan-utility-right">
                    {platformType && (
                        <span className="scan-util-pill scan-util-platform" title={platformType === 'cloud' ? 'Splunk Cloud' : 'Splunk Enterprise'}>
                            <img
                                className="scan-util-icon"
                                src={createURL(`/static/app/${APP_ID}/${platformType === 'cloud' ? 'icon-cloud.svg' : 'icon-enterprise.svg'}`)}
                                alt=""
                            />
                            {platformType === 'cloud' ? 'Splunk Cloud' : 'Splunk Enterprise'}
                        </span>
                    )}
                    {appVersion && <span className="scan-util-pill scan-util-version">v{appVersion}</span>}
                    {appUpdateVersion && (
                        <a
                            href={createURL('/manager/splunk-cisco-app-navigator/appsremote?order=relevance&query=%22Splunk+Cisco+App+Navigator%22&offset=0&support=splunk&support=cisco&type=app')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="scan-util-pill scan-util-update"
                            title={`Upgrade from v${appVersion} to v${appUpdateVersion}`}
                        >
                            🆕 v{appUpdateVersion} available
                        </a>
                    )}
                    <button
                        className="scan-util-pill scan-util-theme"
                        onClick={handleThemeCycle}
                        title={`Theme: ${themeOverride === 'auto' ? 'Auto (Splunk)' : themeOverride === 'light' ? 'Light' : 'Dark'} — click to cycle`}
                    >
                        {themeOverride === 'auto' ? '🔄' : themeOverride === 'light' ? '☀️' : '🌙'}
                        <span className="scan-util-theme-label">
                            {themeOverride === 'auto' ? 'Auto' : themeOverride === 'light' ? 'Light' : 'Dark'}
                        </span>
                    </button>
                    <button
                        className="scan-util-pill scan-util-persona"
                        onClick={() => setPersonaModalOpen(true)}
                        title="Quick Start — Choose or change your role"
                    >
                        👤 Role
                    </button>
                    {devMode && (
                        <button
                            className="scan-util-pill scan-util-devmode"
                            onClick={() => handleOpenConfigViewer(null)}
                            title="Config Viewer — Developer Mode"
                        >
                            &lt;/&gt;
                        </button>
                    )}
                    {devMode && (
                        <button
                            className="scan-util-pill scan-util-devmode scan-util-techstack"
                            onClick={() => setTechStackOpen(true)}
                            title="Tech Stack — React &amp; Splunk UI versions"
                        >
                            📦 Stack
                        </button>
                    )}
                </div>
            </div>

            {/* Developer mode toast */}
            {devToast && (
                <div className="csc-devmode-toast">{devToast}</div>
            )}

            {error && (
                <Message appearance="fill" type="warning" style={{ marginBottom: '16px' }}>
                    {error} — showing built-in product catalog.
                </Message>
            )}

            <UniversalFinderBar
                onSearch={handleSearchInput}
                resultCount={filteredProducts.length}
                totalCount={showFullPortfolio ? products.length : products.filter((p) => SUPPORTED_LEVELS.has(p.support_level)).length}
                products={products}
                externalQuery={searchBarQuery}
            />
            <div style={{ marginBottom: '20px' }}>
                <CategoryFilterBar
                    selectedCategory={selectedCategory}
                    onSelectCategory={(cat) => { setSelectedCategory(cat); setSelectedSubCategory(null); setAiFilter(false); }}
                    selectedSubCategory={selectedSubCategory}
                    onSelectSubCategory={setSelectedSubCategory}
                    aiFilter={aiFilter}
                    onToggleAiFilter={setAiFilter}
                    categoryCounts={categoryCounts}
                    products={showFullPortfolio ? products : products.filter((p) => SUPPORTED_LEVELS.has(p.support_level))}
                />
            </div>

            <AddonFilterBar
                selectedAddon={selectedAddon}
                onSelectAddon={setSelectedAddon}
                products={showFullPortfolio ? products : products.filter((p) => SUPPORTED_LEVELS.has(p.support_level))}
            />

            {/* Section 1: Configured */}
            <div id="configured_products">
            <CollapsiblePanel title={`Configured Products (${configuredProducts.length})`} defaultOpen panelId="configured_products">
                {configuredProducts.length > 0 && (
                    <div className="csc-section-toolbar">
                        <button
                            className="csc-btn csc-btn-remove-all"
                            onClick={() => setRemoveAllModalOpen(true)}
                            title="Remove all products from your configured list"
                        >
                            🗑 Remove All
                        </button>
                    </div>
                )}
                {configuredProducts.length > 0 ? (
                    <div className="csc-card-grid">
                        {configuredProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured isComingSoon={false}
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-section">
                        No products configured yet. Browse the catalog below and click <strong>Add to My Products</strong> to get started.
                    </div>
                )}
            </CollapsiblePanel>
            </div>

            {/* Section 2: Available */}
            <div id="available_products">
            <CollapsiblePanel title={`Available Products (${availableProducts.length})`} defaultOpen panelId="available_products">
                {availableProducts.length > 0 ? (
                    <div className="csc-card-grid">
                        {availableProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured={false} isComingSoon={false}
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-section">
                        {searchQuery || selectedCategory ? 'No products match your search criteria.' : 'All products are configured! 🎉'}
                    </div>
                )}
            </CollapsiblePanel>
            </div>

            {/* Section 3: Unsupported */}
            {unsupportedProducts.length > 0 && (
                <div id="unsupported_products">
                <CollapsiblePanel title={`Unsupported Products (${unsupportedProducts.length})`} defaultOpen={false} panelId="unsupported_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--warning-bg, #fff3e0)', borderLeft: '4px solid #bf360c', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        ⊘ These products have a <strong>Not Supported</strong> support level — there is no official Cisco or Splunk support commitment. They may still function correctly but use at your own discretion.
                    </div>
                    <div className="csc-card-grid">
                        {unsupportedProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured={false} isComingSoon={false}
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}

            {/* Section 4: Coming Soon */}
            <div id="coming_soon_products">
            <CollapsiblePanel title={`Coming Soon (${comingSoonProducts.length})`} defaultOpen panelId="coming_soon_products">
                {comingSoonProducts.length > 0 ? (
                    <div className="csc-card-grid">
                        {comingSoonProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured={false} isComingSoon
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-section">No upcoming products at this time.</div>
                )}
            </CollapsiblePanel>
            </div>

            {/* Section 5: Retired Products (Cisco EOL) */}
            {retiredProducts.length > 0 && (
                <div id="retired_products">
                <CollapsiblePanel title={`Retired Products (${retiredProducts.length})`} defaultOpen={false} panelId="retired_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--retired-info-bg, #fce4ec)', borderLeft: '4px solid #c62828', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        🏛️ These Cisco products have reached <strong>end-of-life / end-of-sale</strong> and have been superseded by newer offerings. Their Splunk add-ons may still function if already installed.
                    </div>
                    <div className="csc-card-grid">
                        {retiredProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured={configuredIds.includes(p.product_id)} isComingSoon={false}
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}

            {/* Section 6: GTM Roadmap — Coverage Gaps */}
            {gtmGapProducts.length > 0 && (
                <div id="gtm_coverage_gaps">
                <CollapsiblePanel title={`GTM Roadmap — Coverage Gaps (${gtmGapProducts.length})`} defaultOpen={false} panelId="gtm_coverage_gaps">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--gtm-gap-info-bg, #eceff1)', borderLeft: '4px solid #607d8b', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        🗺️ These Cisco products are on the <strong>Secure Networking GTM roadmap</strong> but have <strong>zero Splunk integration</strong> today — no add-on, no app, no community support. They represent opportunities for future TA/app development.
                    </div>
                    <div className="csc-card-grid">
                        {gtmGapProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured={false} isComingSoon={false}
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}


            {/* Modals */}
            <BestPracticesModal
                open={bpModalOpen}
                onClose={() => setBpModalOpen(false)}
                product={bpProduct}
                platformType={platformType}
            />
            <LegacyAuditModal
                open={legacyModalOpen}
                onClose={() => setLegacyModalOpen(false)}
                legacyApps={legacyModalApps}
            />
            {devMode && (
                <ConfigViewerModal
                    open={configViewerOpen}
                    onClose={() => setConfigViewerOpen(false)}
                    products={products}
                    initialProductId={configViewerProductId}
                    installedApps={installedApps}
                    appStatuses={appStatuses}
                    sourcetypeData={sourcetypeData}
                />
            )}
            {devMode && (
                <TechStackModal
                    open={techStackOpen}
                    onClose={() => setTechStackOpen(false)}
                />
            )}
            <PersonaModal
                open={personaModalOpen}
                onClose={handleDismissPersona}
                onSelectPersona={handleSelectPersona}
                products={products}
            />
            <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

            {/* Remove All Confirmation Modal */}
            {removeAllModalOpen && (
                <Modal open returnFocus={removeAllReturnRef} onRequestClose={() => setRemoveAllModalOpen(false)} style={{ maxWidth: '520px' }}>
                    <Modal.Header
                        title="Remove All Configured Products"
                    />
                    <Modal.Body>
                        <div style={{ fontSize: '14px', lineHeight: '1.7' }}>
                            <div style={{
                                padding: '12px 16px',
                                background: '#fff3cd',
                                border: '1px solid #ffe082',
                                borderRadius: '6px',
                                marginBottom: '14px',
                                color: '#6d4c00',
                            }}>
                                ⚠️ <strong>Warning:</strong> This action will remove <strong>all {configuredProducts.length} product{configuredProducts.length !== 1 ? 's' : ''}</strong> from your configured list.
                            </div>
                            <p style={{ margin: 0 }}>
                                All products will be moved back to their original sections
                                (<em>Available Products</em>, <em>Unsupported Products</em>, or <em>Coming Soon</em>). No data
                                will be lost — you can re-add products at any time.
                            </p>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button appearance="secondary" label="Cancel" onClick={() => setRemoveAllModalOpen(false)} />
                        <Button appearance="destructive" label="Yes, Remove All" onClick={handleRemoveAllConfigured} />
                    </Modal.Footer>
                </Modal>
            )}

            <FeedbackTab onClick={() => setFeedbackOpen(true)} />

            {/* Footer */}
            <div style={{
                marginTop: '30px', padding: '16px 20px', textAlign: 'center',
                fontSize: '12px', color: 'var(--faint-color, #888)',
                borderTop: '1px solid var(--card-border, #e0e0e0)',
            }}>
                Splunk Cisco App Navigator {appVersion && `v${appVersion}`} — The Front Door to the Cisco-Splunk Ecosystem
            </div>
        </div>
    );
}

export default SCANProductsPage;
