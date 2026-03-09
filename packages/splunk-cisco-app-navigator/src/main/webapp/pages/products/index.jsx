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
import Plus from '@splunk/react-icons/Plus';
import Close from '@splunk/react-icons/Cross';
import QuestionCircle from '@splunk/react-icons/QuestionCircle';
import InfoCircle from '@splunk/react-icons/InformationCircle';
import ChevronDown from '@splunk/react-icons/ChevronDown';
import ChevronUp from '@splunk/react-icons/ChevronUp';
import CylinderMagnifier from '@splunk/react-icons/CylinderMagnifier';
import CylinderIndex from '@splunk/react-icons/CylinderIndex';
import ForwarderHeavy from '@splunk/react-icons/ForwarderHeavy';
import External from '@splunk/react-icons/ArrowSquareTopRight';
import Code from '@splunk/react-icons/Script';
import Search from '@splunk/react-icons/Magnifier';
import Button from '@splunk/react-ui/Button';
import CollapsiblePanel from '@splunk/react-ui/CollapsiblePanel';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import Message from '@splunk/react-ui/Message';
import Modal from '@splunk/react-ui/Modal';
import Card from '@splunk/react-ui/Card';
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

/** Toggle to show/hide value proposition text on the card face (always visible in ⓘ tooltip) */
const SHOW_VALUE_PROP_ON_CARD = false;

/** Persona presets — each maps a role to a category filter + suggested product IDs */
const PERSONA_PRESETS = [
    {
        id: 'security',
        icon: '',
        title: 'Security Analyst',
        description: 'Firewalls, threat detection, identity, XDR, and endpoint protection',
        category: 'security',
        color: '#0A60FF',
        suggested: [
            'cisco_secure_firewall', 'cisco_secure_endpoint', 'cisco_xdr',
            'cisco_duo', 'cisco_umbrella', 'cisco_ise', 'cisco_secure_network_analytics',
            'cisco_secure_access', 'cisco_talos',
        ],
    },
    {
        id: 'networking',
        icon: '',
        title: 'Network Engineer',
        description: 'Campus, SD-WAN, switches, routers, Meraki, and data center networking',
        category: 'networking',
        color: '#0A60FF',
        suggested: [
            'cisco_catalyst_center', 'cisco_catalyst_sdwan', 'cisco_meraki',
            'cisco_nexus', 'cisco_aci', 'cisco_ise', 'cisco_wlc',
            'cisco_access_points', 'cisco_catalyst_switches',
        ],
    },
    {
        id: 'collaboration',
        icon: '',
        title: 'Collaboration Admin',
        description: 'Webex, CUCM, video conferencing, and meeting infrastructure',
        category: 'collaboration',
        color: '#FF9000',
        suggested: [
            'cisco_webex', 'cisco_cucm', 'cisco_meeting_server',
            'cisco_meeting_management', 'cisco_tvcs',
        ],
    },
    {
        id: 'observability',
        icon: '',
        title: 'Observability Engineer',
        description: 'APM, monitoring, ThousandEyes, and full-stack telemetry',
        category: 'observability',
        color: '#0A60FF',
        suggested: [
            'cisco_thousandeyes', 'cisco_appdynamics',
        ],
    },
    {
        id: 'explorer',
        icon: '',
        title: 'Explorer',
        description: 'Browse the full Cisco portfolio — all categories, all products',
        category: null,
        color: '#02C8FF',
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
        { id: 'cloud_security', name: 'Cloud Security', icon: '' },
        { id: 'network_security', name: 'Network Security', icon: '' },
        { id: 'identity_access', name: 'Identity & Access', icon: '' },
        { id: 'email_security', name: 'Email Security', icon: '' },
        { id: 'endpoint_security', name: 'Endpoint Security', icon: '' },
        { id: 'workload_security', name: 'Workload Security', icon: '' },
        { id: 'application_security', name: 'Application Security', icon: '' },
        { id: 'threat_response', name: 'Threat Intel & Response', icon: '' },
    ],
    networking: [
        { id: 'campus_wireless', name: 'Campus & Wireless', icon: '' },
        { id: 'routing_wan', name: 'Routing & WAN', icon: '' },
        { id: 'data_center_net', name: 'Data Center', icon: '' },
        { id: 'compute_infra', name: 'Compute & Infra', icon: '' },
    ],
};

// Icon mapping removed — all products now use icon_svg with letter fallback.

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
 * Generate Splunkbase app URL from UID.
 * e.g. 7404 → "https://splunkbase.splunk.com/app/7404"
 */
function generateSplunkbaseUrl(uid) {
    if (!uid) return '';
    return `https://splunkbase.splunk.com/app/${uid}`;
}

/**
 * Extract the numeric UID from a Splunkbase URL.
 * e.g. "https://splunkbase.splunk.com/app/7404" → "7404"
 */
function extractSplunkbaseUid(url) {
    if (!url) return null;
    const m = url.match(/\/app\/(\d+)/);
    return m ? m[1] : null;
}

/**
 * Collect all Splunkbase UIDs associated with a product.
 * Looks at addon, app_viz, app_viz_2 UID fields.
 */
function getProductUids(product) {
    const uids = new Set();
    if (product.addon_splunkbase_uid) uids.add(String(product.addon_splunkbase_uid));
    if (product.app_viz_splunkbase_uid) uids.add(String(product.app_viz_splunkbase_uid));
    if (product.app_viz_2_splunkbase_uid) uids.add(String(product.app_viz_2_splunkbase_uid));
    return [...uids];
}

/**
 * Extract ALL Splunkbase UIDs from a product, including legacy/prereq/community apps.
 * Uses both URL-based UIDs and app folder name lookups via appidToUidMap.
 */
function getAllProductUids(product, appidToUidMap) {
    const uids = new Set();
    const mainUids = getProductUids(product);
    mainUids.forEach(uid => uids.add(uid));
    
    // Add legacy and community UIDs directly
    (product.legacy_uids || []).forEach(uid => { if (uid) uids.add(String(uid)); });
    (product.community_uids || []).forEach(uid => { if (uid) uids.add(String(uid)); });

    // Also resolve addon/viz app folder names to UIDs via the lookup map
    const appFolders = [];
    if (product.addon) appFolders.push(product.addon);
    if (product.app_viz) appFolders.push(product.app_viz);
    if (product.app_viz_2) appFolders.push(product.app_viz_2);
    if (appidToUidMap) {
        appFolders.forEach(folder => {
            const uid = appidToUidMap[folder];
            if (uid) uids.add(String(uid));
        });
    }
    
    return [...uids];
}

/**
 * Sort version strings in descending order (latest first).
 * Handles formats like "10.1", "9.4", "8.2" etc.
 */
function sortVersionsDesc(versions) {
    return [...versions].sort((a, b) => {
        const ap = a.split('.').map(Number);
        const bp = b.split('.').map(Number);
        for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
            const diff = (bp[i] || 0) - (ap[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });
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
        const laUids   = csvToArray(c.legacy_uids);
        const caUids   = csvToArray(c.community_uids);
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
            addon_splunkbase_uid: c.addon_splunkbase_uid || extractSplunkbaseUid(c.addon_splunkbase_url) || '',
            addon_docs_url: c.addon_docs_url || '',
            addon_troubleshoot_url: c.addon_troubleshoot_url || '',
            addon_install_url: c.addon_install_url || '',
            app_viz: c.app_viz || '',
            app_viz_label: c.app_viz_label || '',
            app_viz_splunkbase_uid: c.app_viz_splunkbase_uid || extractSplunkbaseUid(c.app_viz_splunkbase_url) || '',
            app_viz_docs_url: c.app_viz_docs_url || '',
            app_viz_troubleshoot_url: c.app_viz_troubleshoot_url || '',
            app_viz_install_url: c.app_viz_install_url || '',
            app_viz_2: c.app_viz_2 || '',
            app_viz_2_label: c.app_viz_2_label || '',
            app_viz_2_splunkbase_uid: c.app_viz_2_splunkbase_uid || extractSplunkbaseUid(c.app_viz_2_splunkbase_url) || '',
            app_viz_2_docs_url: c.app_viz_2_docs_url || '',
            app_viz_2_troubleshoot_url: c.app_viz_2_troubleshoot_url || '',
            app_viz_2_install_url: c.app_viz_2_install_url || '',
            learn_more_url: c.learn_more_url || '',
            legacy_uids: laUids.filter(Boolean),
            community_uids: caUids.filter(Boolean),
            sourcetypes: csvToArray(c.sourcetypes),
            dashboard: (c.dashboards || '').trim(),
            custom_dashboard: c.custom_dashboard || '',
            icon_emoji: c.icon_emoji || '',
            icon_svg: c.icon_svg || '',
            aliases: csvToArray(c.aliases),
            keywords: csvToArray(c.keywords),
            alert_action_uids: csvToArray(c.alert_action_uids),
            soar_connector_uids: csvToArray(c.soar_connector_uids),
            itsi_content_pack: c.itsi_content_pack_label ? { label: c.itsi_content_pack_label, docs_url: c.itsi_content_pack_docs_url || '' } : null,
            is_new: c.is_new === 'true' || c.is_new === '1',
            secure_networking_gtm: c.secure_networking_gtm === 'true' || c.secure_networking_gtm === '1',
            support_level: c.support_level || '',
            sc4s_url: c.sc4s_url || '',
            sc4s_label: c.sc4s_label || '',
            sc4s_supported: c.sc4s_supported === 'true' || c.sc4s_supported === '1' || c.sc4s_supported === true,
            sc4s_search_head_ta: c.sc4s_search_head_ta || '',
            sc4s_search_head_ta_label: c.sc4s_search_head_ta_label || '',
            sc4s_search_head_ta_splunkbase_id: c.sc4s_search_head_ta_splunkbase_id || '',
            sc4s_search_head_ta_install_url: c.sc4s_search_head_ta_install_url || '',
            sc4s_sourcetypes: (c.sc4s_sourcetypes || '').split(',').map(s => s.trim()).filter(Boolean),
            sc4s_config_notes: (c.sc4s_config_notes || '').split('|').map(s => s.trim()).filter(Boolean),
            netflow_supported: c.netflow_supported === 'true' || c.netflow_supported === '1' || c.netflow_supported === true,
            netflow_addon: c.netflow_addon || '',
            netflow_addon_label: c.netflow_addon_label || '',
            netflow_addon_splunkbase_id: c.netflow_addon_splunkbase_id || '',
            netflow_addon_install_url: c.netflow_addon_install_url || '',
            netflow_addon_docs_url: c.netflow_addon_docs_url || '',
            stream_docs_url: c.stream_docs_url || '',
            netflow_sourcetypes: (c.netflow_sourcetypes || '').split(',').map(s => s.trim()).filter(Boolean),
            netflow_config_notes: (c.netflow_config_notes || '').split('|').map(s => s.trim()).filter(Boolean),
            best_practices: (c.best_practices || '').split('|').map(s => s.trim()).filter(Boolean),
            sort_order: parseInt(c.sort_order || '100', 10),
            es_compatible: c.es_compatible === 'true' || c.es_compatible === '1' || c.es_compatible === true,
            es_cim_data_models: csvToArray(c.es_cim_data_models),
            escu_analytic_stories: csvToArray(c.escu_analytic_stories),
            escu_detection_count: parseInt(c.escu_detection_count || '0', 10),
            escu_detections: csvToArray(c.escu_detections),
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
    // Use exact sourcetype names. Only roll up to a prefix when 3+
    // sourcetypes share the same two-segment prefix (e.g. cisco:esa:*).
    const prefixGroups = new Map();
    const exact = new Set();
    sourcetypes.forEach(st => {
        const parts = st.split(':');
        if (parts.length <= 2) {
            exact.add(st);
        } else {
            const prefix = parts.slice(0, 2).join(':') + ':';
            if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
            prefixGroups.get(prefix).push(st);
        }
    });
    // Only collapse to prefix if 3+ sourcetypes share it; otherwise keep exact
    prefixGroups.forEach((members, prefix) => {
        if (members.length >= 3) {
            exact.add(prefix);
        } else {
            members.forEach(st => exact.add(st));
        }
    });
    const sorted = [...exact].sort((a, b) => a.length - b.length);
    return sorted.filter((p, i) => !sorted.slice(0, i).some(shorter =>
        shorter.endsWith(':') ? p.startsWith(shorter) : p === shorter
    ));
}

/**
 * Detect sourcetype data for ALL products in a single metadata search.
 *
 * Runs ONE search:
 *   | metadata type=sourcetypes
 *   | where lastTime > relative_time(now(), "-7d")
 *   | table sourcetype totalCount
 *
 * No index= filter so it covers ALL indexes (including restricted ones).
 * Then matches each product's sourcetype patterns client-side.
 * This replaces the previous per-product approach (52 searches → 1).
 */
async function detectAllSourcetypeData(products) {
    const noData = { hasData: false, eventCount: 0, detail: 'No sourcetypes defined' };
    const withST = products.filter(p => p.sourcetypes && p.sourcetypes.length > 0);
    if (withST.length === 0) { /* console.log('[SCAN] Detection skipped — no products have sourcetypes'); */ return {}; }
    const csrf = getCSRFToken();
    if (!csrf) {
        console.warn('[SCAN] Detection skipped — CSRF token unavailable');
        const r = {};
        withST.forEach(p => { r[p.product_id] = { hasData: false, eventCount: 0, detail: 'CSRF token unavailable' }; });
        return r;
    }
    // console.log(`[SCAN] Starting sourcetype detection for ${withST.length} products with sourcetypes...`);
    try {
        const searchStr = '| metadata type=sourcetypes | where lastTime > relative_time(now(), "-7d") | table sourcetype totalCount';
        // console.log(`[SCAN] Search: ${searchStr}`);
        const res = await splunkFetch(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `search=${encodeURIComponent(searchStr)}&output_mode=json&exec_mode=oneshot&count=0&timeout=120`,
        });
        // console.log(`[SCAN] Response status: ${res.status} ${res.statusText}`);
        if (!res.ok) {
            const errText = await res.text();
            console.error(`[SCAN] Search failed (HTTP ${res.status}):`, errText.substring(0, 500));
            const r = {};
            withST.forEach(p => { r[p.product_id] = { hasData: false, eventCount: 0, detail: `Search error (HTTP ${res.status})` }; });
            return r;
        }
        const rawText = await res.text();
        let data;
        try { data = JSON.parse(rawText); } catch (parseErr) {
            console.error('[SCAN] Failed to parse JSON response:', rawText.substring(0, 500));
            const r = {};
            withST.forEach(p => { r[p.product_id] = { hasData: false, eventCount: 0, detail: 'Invalid response from Splunk' }; });
            return r;
        }
        // console.log(`[SCAN] Response keys: ${Object.keys(data).join(', ')}`);
        const rows = data.results || [];
        // console.log(`[SCAN] Sourcetype metadata returned ${rows.length} active sourcetypes from Splunk`);
        if (rows.length > 0) {
            // console.log(`[SCAN] Sample row: ${JSON.stringify(rows[0])}`);
        }

        // Build a quick lookup: sourcetype → totalCount
        const stMap = new Map();
        rows.forEach(r => stMap.set(r.sourcetype, parseInt(r.totalCount, 10) || 0));

        // Match each product's patterns against the result set
        const results = {};
        withST.forEach(p => {
            const patterns = buildSourcetypePatterns(p.sourcetypes);
            let stCount = 0;
            let eventCount = 0;
            const matchedSTs = [];
            stMap.forEach((count, st) => {
                if (patterns.some(pat => pat.endsWith(':') ? st.startsWith(pat) : st === pat || st.startsWith(pat + ':'))) {
                    stCount++;
                    eventCount += count;
                    matchedSTs.push(st);
                }
            });
            if (stCount > 0) {
                // console.log(`[SCAN] ${p.product_id}: ${stCount} sourcetype(s) matched — ${matchedSTs.join(', ')}`);
            }
            results[p.product_id] = stCount > 0
                ? { hasData: true, eventCount, detail: `${stCount} sourcetype${stCount !== 1 ? 's' : ''} active · ${formatCount(eventCount)} events` }
                : { hasData: false, eventCount: 0, detail: 'No data in the last 7 days' };
        });

        const detected = Object.values(results).filter(r => r.hasData).length;
        // console.log(`[SCAN] Detection complete: ${detected} product(s) with active data out of ${withST.length} checked`);

        // Fill in products that have no sourcetypes
        products.forEach(p => {
            if (!results[p.product_id]) results[p.product_id] = noData;
        });
        return results;
    } catch (e) {
        console.error('[SCAN] Sourcetype detection failed:', e);
        const r = {};
        withST.forEach(p => { r[p.product_id] = { hasData: false, eventCount: 0, detail: 'Could not query sourcetypes' }; });
        return r;
    }
}

/**
 * Detect add-on deployment status on the indexer tier.
 * Runs: | rest splunk_server=* apps/local — then subtracts the local SH.
 * Returns { appid: { version, disabled, indexerCount } } for each app
 * found on the indexer tier.
 *
 * "One indexer = all indexers" — we assume the same app set is on every
 * indexer, so we only report the latest version and whether ANY indexer
 * has the app disabled.
 */
async function detectIndexerTierApps() {
    const csrf = getCSRFToken();
    if (!csrf) return null; // can't run without CSRF
    try {
        const spl = [
            '| rest splunk_server=* /servicesNS/-/-/apps/local f=title f=version f=disabled count=0',
            '| search NOT [| rest splunk_server=local /services/server/info f=splunk_server | fields splunk_server]',
            '| eval is_disabled=if(disabled=="1" OR disabled="true", 1, 0)',
            '| stats latest(version) as idx_version max(is_disabled) as any_disabled dc(splunk_server) as idx_count by title',
            '| fields title idx_version any_disabled idx_count',
        ].join(' ');
        const res = await splunkFetch(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `search=${encodeURIComponent(spl)}&output_mode=json&exec_mode=oneshot&count=0&timeout=120`,
        });
        if (!res.ok) {
            console.warn('[SCAN] Indexer tier detection failed (HTTP ' + res.status + ')');
            return null;
        }
        const data = await res.json();
        const rows = data.results || [];
        if (rows.length === 0) return {}; // no peer indexers found — standalone
        const lookup = {};
        rows.forEach(r => {
            lookup[r.title] = {
                version: r.idx_version || null,
                disabled: parseInt(r.any_disabled, 10) >= 1,
                indexerCount: parseInt(r.idx_count, 10) || 0,
            };
        });
        return lookup;
    } catch (e) {
        console.warn('[SCAN] Indexer tier detection error:', e);
        return null;
    }
}

/**
 * Build a Splunk search URL that runs:
 *   | metadata type=sourcetypes | where match(sourcetype, "pattern")
 */
function buildSourcetypeSearchUrl(sourcetypes) {
    if (!sourcetypes || sourcetypes.length === 0) return null;
    const filtered = buildSourcetypePatterns(sourcetypes);
    const pattern = filtered.join('|');
    const spl = `| metadata type=sourcetypes | where match(sourcetype, "${pattern}")`;
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

function getBestPractices(product, platformType, splunkbaseData) {
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

    if (product.legacy_uids && product.legacy_uids.length > 0) {
        const names = product.legacy_uids.map(uid => {
            const sb = splunkbaseData && splunkbaseData[uid];
            return sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`;
        }).join(', ');
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

function IntelligenceBadges({ appStatus, vizAppStatus, vizApp2Status, sourcetypeInfo, legacyInstalled, allLegacyUids, splunkbaseData, sourcetypeSearchUrl, isArchived, onViewLegacy }) {
    const items = [];

    if (isArchived) {
        items.push({ cls: 'archived', label: 'Archived — download from Splunkbase', key: 'archived' });
    }

    if (appStatus && appStatus.installed && appStatus.updateVersion) {
        items.push({ cls: 'update', label: `Add-on update v${appStatus.updateVersion}`, key: 'ta-update' });
    }
    if (vizAppStatus && vizAppStatus.installed && vizAppStatus.updateVersion) {
        items.push({ cls: 'update', label: `App update v${vizAppStatus.updateVersion}`, key: 'viz-update' });
    }
    if (vizApp2Status && vizApp2Status.installed && vizApp2Status.updateVersion) {
        items.push({ cls: 'update', label: `App 2 update v${vizApp2Status.updateVersion}`, key: 'viz2-update' });
    }
    if (sourcetypeInfo) {
        if (sourcetypeInfo.hasData && appStatus?.installed) {
            items.push({ cls: 'data-ok', label: `✓ Data flowing (${sourcetypeInfo.detail})`, key: 'data-ok', url: sourcetypeSearchUrl });
        } else if (sourcetypeInfo.hasData && !appStatus?.installed) {
            items.push({ cls: 'data-ok', label: `Data found (${sourcetypeInfo.detail})`, key: 'data-no-ta', url: sourcetypeSearchUrl });
        } else if (!sourcetypeInfo.hasData) {
            items.push({ cls: 'data-none', label: sourcetypeInfo.detail || 'No data (7d)', key: 'data-none', url: sourcetypeSearchUrl });
        }
    }
    if (legacyInstalled && legacyInstalled.length > 0) {
        items.push({ cls: 'legacy', label: `${legacyInstalled.length} legacy app${legacyInstalled.length > 1 ? 's' : ''}`, key: 'legacy', legacyApps: legacyInstalled });
    }
    if (items.length === 0) return null;

    const handleLegacyClick = (e) => {
        e.stopPropagation();
        if (onViewLegacy && allLegacyUids) onViewLegacy(allLegacyUids);
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
                                {b.legacyApps.slice(0, 5).map((uid, i) => {
                                    const sb = splunkbaseData && splunkbaseData[uid];
                                    const title = sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`;
                                    const appid = sb?.appid || '';
                                    const sbStatus = sb?.status || 'unknown';
                                    return (
                                    <div key={i} className="csc-legacy-tooltip-item">
                                        <span className={`csc-legacy-tooltip-status ${sbStatus === 'archived' ? 'csc-lt-archived' : 'csc-lt-active'}`}>
                                            {sbStatus === 'archived' ? '' : ''}
                                        </span>
                                        <strong>{title}</strong>
                                        {appid && <span className="csc-legacy-tooltip-appid">{appid}</span>}
                                    </div>
                                    );
                                })}
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
            <Modal.Header title="Splunk Connect for Syslog (SC4S)" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
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
                        <h4>Key Technical Benefits</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Prescriptive & Repeatable</strong>
                                <span>Standardized "Splunk-best-practice" approach to syslog, reducing "snowflake" configurations.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Reduced Overhead</strong>
                                <span>Eliminates the need for a Universal Forwarder on the syslog server, simplifying architecture and reducing disk I/O.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Containerized Agility</strong>
                                <span>Deployed via Docker or Podman for easy updates and consistent Dev/Test/Prod behavior.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Optimized Search</strong>
                                <span>Natively balances traffic across all Splunk Indexers via HEC, preventing "hot indexers."</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Metadata Enrichment</strong>
                                <span>Injects rich metadata (vendor, product, geo info) at the point of ingestion, beyond standard host and sourcetype.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Extensive Library</strong>
                                <span>Out-of-the-box support for 100+ common technology platforms (Cisco, Palo Alto, Checkpoint, etc.).</span>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>Architecture & Design</h4>
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
                        <h4>Best Practices & Recommendations</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Avoid Direct "514" Ingestion</strong>
                                    <p>Sending raw UDP/514 traffic directly to a Splunk Heavy Forwarder or Indexer is a deprecated practice. It lacks buffering, creates load-balancing issues, and often results in malformed data.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Use SC4S</strong>
                                    <p>For all enterprise-grade syslog requirements, especially for high-volume sources like Cisco ISE, ASA, and Firepower.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-alt">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Use a TA on a Heavy Forwarder</strong>
                                    <p>Only for "micro" environments or single-integration POCs where the overhead of a container runtime is not feasible.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Load Balancing</strong>
                                    <p>For HA environments, place a Load Balancer (F5 or HAProxy) in front of multiple SC4S instances to ensure zero data loss during maintenance.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>Configuration & Customization</h4>
                        <ul className="csc-sc4s-info-list">
                            <li><strong>Core Requirements:</strong> Dedicated HEC Token, HEC URL (Load Balancer or Indexer Cluster), and a default index.</li>
                            <li><strong>Cisco-Specific Tuning:</strong> Supports flags like <code>SC4S_ENABLE_CISCO_IOS_RAW_MSG=yes</code> to preserve original message format for audit compliance.</li>
                            <li><strong>Custom Parsers:</strong> Developers can create bespoke "app-parsers" to handle proprietary or legacy syslog formats.</li>
                        </ul>
                    </div>

                    <div className="csc-sc4s-info-section csc-sc4s-info-section-notes">
                        <h4>Important Notes</h4>
                        <ul className="csc-sc4s-info-list csc-sc4s-info-list-notes">
                            <li>SC4S is a <strong>container image</strong>, not a monolithic OVA/Virtual Appliance. While it <em>can</em> be packaged as an appliance, its native form is a container.</li>
                            <li>SC4S <em>can</em> buffer to disk (Disk-Assisted Queues) if the HEC endpoint is down, preventing data loss during network outages.</li>
                            <li>SC4S's primary goal is <strong>data integrity and performance</strong>, which indirectly supports license efficiency and search performance.</li>
                        </ul>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://splunk.github.io/splunk-connect-for-syslog/main/" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                             SC4S Official Documentation
                        </a>
                        <a href="https://github.com/splunk/splunk-connect-for-syslog" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                             GitHub Repository
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

// ────────────────────  NETFLOW / STREAM INFO MODAL  ───────────────────────

function NetFlowInfoModal({ open, onClose }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '860px', width: '92vw' }}>
            <Modal.Header title="NetFlow / Splunk Stream" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Technical Overview</h3>
                            <p>The NetFlow / Splunk Stream solution provides network traffic visibility from Cisco devices using <strong>4 complementary packages</strong> — <strong>3 from Splunk</strong> (the Stream platform) and <strong>1 from Cisco</strong> (enhanced Netflow). Together they collect, parse, enrich, and visualize NetFlow v9, IPFIX, and wire data from your Cisco infrastructure.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>The 4-Package Ecosystem</h4>
                        <p style={{ marginBottom: '12px', fontSize: '13px' }}>All 4 packages work together. The 3 Splunk packages form the core Stream platform; the Cisco package adds IOS-XE-specific enhancements.</p>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Splunk Add-on for Stream Forwarders</strong>
                                <span style={{ fontSize: '11px', fontStyle: 'italic' }}><a href="https://splunkbase.splunk.com/app/5238" target="_blank" rel="noopener noreferrer">Splunkbase 5238</a> &middot; Splunk</span>
                                <span>The <strong>collection agent</strong>. Receives NetFlow/IPFIX exports from Cisco devices on configured UDP ports. Install on any <strong>Heavy Forwarder or Universal Forwarder</strong> that receives network flow traffic.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Splunk App for Stream</strong>
                                <span style={{ fontSize: '11px', fontStyle: 'italic' }}><a href="https://splunkbase.splunk.com/app/1809" target="_blank" rel="noopener noreferrer">Splunkbase 1809</a> &middot; Splunk</span>
                                <span>The <strong>management UI</strong>. Provides dashboards, stream configurations, and forwarder management. Install on <strong>Search Heads</strong>.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Splunk Add-on for Stream Wire Data</strong>
                                <span style={{ fontSize: '11px', fontStyle: 'italic' }}><a href="https://splunkbase.splunk.com/app/5234" target="_blank" rel="noopener noreferrer">Splunkbase 5234</a> &middot; Splunk</span>
                                <span><strong>Knowledge objects &amp; CIM mappings</strong> for parsing and normalizing Stream data. Install on <strong>Search Heads</strong> (for search-time parsing) and <strong>Indexers</strong> (for field extractions at index time).</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Cisco Catalyst Enhanced Netflow Add-on</strong>
                                <span style={{ fontSize: '11px', fontStyle: 'italic' }}><a href="https://splunkbase.splunk.com/app/6872" target="_blank" rel="noopener noreferrer">Splunkbase 6872</a> &middot; Cisco</span>
                                <span>Extends Stream with <strong>Cisco-specific IPFIX templates</strong> and field extractions for IOS-XE devices. Decodes proprietary information elements for Application Visibility, Performance Routing, and SD-WAN metrics. Install on <strong>Search Heads</strong>.</span>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>🎯 When Do You Need Each Package?</h4>
                        <table className="csc-sc4s-info-table">
                            <thead>
                                <tr>
                                    <th className="csc-sc4s-info-table-label" style={{ width: '28%' }}>Cisco Platform</th>
                                    <th className="csc-sc4s-info-table-label" style={{ width: '42%' }}>3 Splunk Stream Packages</th>
                                    <th className="csc-sc4s-info-table-label" style={{ width: '30%' }}>Cisco Enhanced Netflow</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">IOS-XE Devices</td>
                                    <td>✅ Required — core Stream platform</td>
                                    <td><strong>✅ Required</strong> — decodes Cisco IPFIX templates</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0 }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>Catalyst Center, Catalyst SD-WAN, ISR, ASR, WLC, Catalyst Switches, Meraki</em></td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">NX-OS Devices</td>
                                    <td>✅ Required — core Stream platform</td>
                                    <td>⬜ Not needed — NX-OS uses standard NetFlow v9</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0 }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>Nexus switches (standard NetFlow v9 templates)</em></td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">ACI Fabric</td>
                                    <td>✅ Required — captures SPAN/ERSPAN traffic</td>
                                    <td>⬜ Not needed — ACI uses SPAN/ERSPAN, not NetFlow</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0 }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>ACI leaf/spine switches (mirrored traffic via ERSPAN)</em></td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">IOS-XR Devices</td>
                                    <td>✅ Required — core Stream platform</td>
                                    <td><strong>✅ Recommended</strong> — enhances IPFIX decoding</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0 }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>CRS carrier routers (IPFIX-capable)</em></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={{ marginTop: '14px', padding: '12px 16px', background: 'var(--bg-primary, #f2f5f7)', borderRadius: '8px', border: '1px solid var(--border-light, #E1E6EB)', borderLeft: '3px solid var(--border-medium, #CED4DB)' }}>
                            <strong style={{ fontSize: '13px' }}>💡 Nexus Dashboard — Proprietary Flow Monitoring</strong>
                            <p style={{ margin: '6px 0 0', fontSize: '12.5px', lineHeight: 1.5 }}>
                                For <strong>ACI and Nexus switches</strong>, Cisco also offers <strong>Nexus Dashboard Insights (NDI)</strong> — a proprietary flow monitoring and analytics technology built into the fabric itself.
                                NDI provides deep fabric-level flow telemetry, anomaly detection, and advisory intelligence <em>without</em> requiring Splunk Stream.
                                This data can be ingested into Splunk via the <strong>Cisco DC Networking TA</strong> (sourcetype <code>cisco:dc:nd:flows</code>).
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                                <em>Stream-based collection (above) and Nexus Dashboard are complementary — Stream captures raw NetFlow/SPAN at the packet level, while NDI provides Cisco-native application-level flow analytics and fabric assurance.</em>
                            </p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>🏗️ Deployment Architecture</h4>
                        <table className="csc-sc4s-info-table">
                            <thead>
                                <tr>
                                    <th className="csc-sc4s-info-table-label" style={{ width: '22%' }}>Splunk Tier</th>
                                    <th className="csc-sc4s-info-table-label">What to Install</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Forwarders</td>
                                    <td><strong>Add-on for Stream Forwarders</strong> (5238) — collects NetFlow/IPFIX/SPAN on configured UDP ports</td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Indexers</td>
                                    <td><strong>Add-on for Stream Wire Data</strong> (5234) — index-time field extractions and CIM mappings</td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Search Heads</td>
                                    <td><strong>App for Stream</strong> (1809) + <strong>Add-on for Stream Wire Data</strong> (5234) + <strong>Cisco Enhanced Netflow Add-on</strong> (6872, IOS-XE only)</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>Key Technical Benefits</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Deep Cisco Visibility</strong>
                                <span>The Cisco Enhanced Netflow Add-on decodes proprietary IPFIX information elements for Application Visibility, Performance Routing, SD-WAN, and media metrics from IOS-XE devices.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Flow Aggregation</strong>
                                <span>Stream's built-in aggregation reduces indexed volume while maintaining full network visibility — critical for high-volume environments with thousands of flows per second.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Multi-Protocol</strong>
                                <span>Supports NetFlow v5, v9, IPFIX, sFlow, jFlow, and SPAN/ERSPAN — covering IOS-XE, NX-OS, IOS-XR, and ACI platforms.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>CIM-Compliant</strong>
                                <span>The Wire Data Add-on maps Stream data to the Splunk Common Information Model, enabling cross-product correlation in ES, ITSI, and custom dashboards.</span>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>✅ Best Practices</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">📊</span>
                                <div>
                                    <strong>Install All 3 Stream Packages</strong>
                                    <p>All three Splunk Stream packages are required: the Forwarder TA on forwarders, the App on search heads, and the Wire Data TA on both search heads and indexers. Missing any one will result in incomplete data parsing.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Add Cisco Enhanced Netflow for IOS-XE</strong>
                                    <p>If your Cisco devices run IOS-XE (Catalyst, SD-WAN/cEdge, ISR, ASR, WLC), install the Cisco Enhanced Netflow Add-on on search heads. It is <em>not</em> needed for NX-OS (Nexus) or ACI.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Use IPFIX over NetFlow v5</strong>
                                    <p>IPFIX (based on NetFlow v9) provides richer metadata including application visibility and media flow data. Critical for Cisco Catalyst, SD-WAN, and ISR platforms.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Aggregation for Volume Control</strong>
                                    <p>Use Stream's built-in aggregation to reduce NetFlow data volume before indexing. Especially important for high-volume environments with thousands of active flows per second.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://help.splunk.com/en/splunk-cloud-platform/collect-stream-data/install-and-configure-splunk-stream/8.1/introduction/about-splunk-stream" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                            Splunk Stream Documentation
                        </a>
                        <a href="https://www.cisco.com/c/en/us/solutions/collateral/enterprise-networks/sd-wan/sd-wan-splunk-integration-ug.html" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                            Cisco Enhanced Netflow Guide
                        </a>
                        <a href="https://splunkbase.splunk.com/app/6872" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                            Enhanced Netflow on Splunkbase
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

// ────────────────────  HEAVY FORWARDER INFO MODAL  ────────────────────────────

function HFInfoModal({ open, onClose, isCloud }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '720px', width: '92vw' }}>
            <Modal.Header title="Heavy Forwarder Deployment" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>What is a Heavy Forwarder?</h3>
                            <p>A <strong>Heavy Forwarder (HF)</strong> is a full Splunk Enterprise instance configured to forward data to indexers rather than indexing it locally. It provides capabilities that Universal Forwarders cannot — such as receiving <strong>syslog (TCP/UDP)</strong>, running <strong>HEC (HTTP Event Collector)</strong> endpoints, and performing <strong>data routing, filtering, and masking</strong> before forwarding.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>When Do You Need a Heavy Forwarder?</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Syslog Collection</strong>
                                <span>When Cisco devices send syslog over TCP/UDP, a Heavy Forwarder can act as the syslog receiver with the appropriate Splunk Add-on installed.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>API / HEC Inputs</strong>
                                <span>Some Cisco add-ons require modular inputs or scripted inputs that pull data from APIs. These run on the Heavy Forwarder, not the Search Head.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Data Routing & Filtering</strong>
                                <span>Heavy Forwarders can route data to specific indexes, filter out unwanted events, and mask sensitive fields before forwarding to indexers.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Splunk Cloud Deployments</strong>
                                <span>In Splunk Cloud, you cannot enable TCP/UDP inputs directly. A Heavy Forwarder bridges your on-prem data sources to your Cloud environment.</span>
                            </div>
                        </div>
                    </div>

                    {isCloud && (
                        <div className="csc-sc4s-info-section">
                            <h4>☁️ Splunk Cloud Note</h4>
                            <div className="csc-sc4s-info-bp">
                                <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                    <span className="csc-sc4s-info-bp-marker"></span>
                                    <div>
                                        <strong>Restricted Permissions</strong>
                                        <p>In Splunk Cloud, certain permissions are restricted, such as enabling TCP/UDP streams directly. Contact Splunk Cloud Support to request the necessary permissions, or set up the add-on locally using a Heavy Forwarder and configure a secure connection to your Splunk Cloud instance.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="csc-sc4s-info-section">
                        <h4>Why Can't SCAN Detect It?</h4>
                        <p>Heavy Forwarders are standalone Splunk instances in your network — they do not register as search peers on the Search Head. SCAN can only detect apps installed on the Search Head cluster and indexer tier, not on independent Heavy Forwarders.</p>
                    </div>

                    <div className="csc-sc4s-info-section csc-sc4s-info-section-notes">
                        <h4>Best Practices</h4>
                        <ul className="csc-sc4s-info-list csc-sc4s-info-list-notes">
                            <li><strong>Install the same version</strong> of the add-on on the Heavy Forwarder as on the Search Head to ensure consistent parsing.</li>
                            <li>For syslog-heavy environments, consider <strong>SC4S</strong> as a lighter alternative to a Heavy Forwarder.</li>
                            <li>Use <strong>outputs.conf</strong> to configure load-balanced forwarding to your indexer cluster.</li>
                        </ul>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/SplunkCloud/latest/Forwarding/Deployaheavyforwarder" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                            Deploy a Heavy Forwarder — Splunk Docs
                        </a>
                        <a href="https://help.splunk.com/en/data-management/transform-and-route-data/perform-basic-data-processing/process-data-with-forwarders/types-of-forwarders" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                            Types of Forwarders — Splunk Docs
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

// ────────────────────  MAGIC SIX (PROPS.CONF) MODAL  ────────────────────────

/**
 * The "Magic Six" (a.k.a. "Super Six") props.conf settings that every
 * well-tuned sourcetype should have explicitly defined:
 *   1. SHOULD_LINEMERGE   — disable expensive line-merging heuristics
 *   2. TIME_FORMAT        — explicit strptime avoids datetime.xml guessing
 *   3. LINE_BREAKER       — event-boundary regex
 *   4. TRUNCATE           — max event size (default 10 000)
 *   5. TIME_PREFIX        — anchor for timestamp extraction
 *   6. MAX_TIMESTAMP_LOOKAHEAD — cap character scan window
 */
const MAGIC_SIX = [
    {
        key: 'SHOULD_LINEMERGE', defaultVal: 'true', recommended: 'false', difficulty: 'Easy',
        nickname: 'The Glue Gun',
        desc: 'Disables expensive line-merging heuristics in the aggregator pipeline.',
        detail: 'When true (the default), Splunk activates the line-merge phase, running four regexes '
            + '(BREAK_ONLY_BEFORE, MUST_NOT_BREAK_BEFORE, MUST_BREAK_AFTER, MUST_NOT_BREAK_AFTER) on every single line '
            + 'boundary to decide whether adjacent lines should be "glued" into one event. This is the most CPU-intensive '
            + 'phase of the parsing pipeline. Setting it to false tells Splunk: "each chunk from LINE_BREAKER is already a '
            + 'complete event — skip the glue gun entirely." For structured, single-line data (JSON, CSV, syslog) this is '
            + 'the single biggest performance win. Only leave true for genuinely multi-line formats like Java stack traces.',
        gotcha: 'Almost always should be false. The only exception is truly multi-line events (stack traces, multi-line XML).',
        isBad: v => /^(true|t|1)$/i.test(v),
    },
    {
        key: 'TIME_FORMAT', defaultVal: 'datetime.xml', recommended: '(explicit strptime)', difficulty: 'Medium',
        nickname: 'The Janitor\'s Keyring',
        desc: 'Explicit strptime format — prevents datetime.xml pattern guessing.',
        detail: 'Without an explicit TIME_FORMAT, Splunk loads datetime.xml — a file containing 30+ timestamp patterns — '
            + 'and tries every single one sequentially against each event, like a janitor trying every key on a giant keyring '
            + 'to open one door. This is O(n) per event. An explicit strptime format (e.g. %Y-%m-%dT%H:%M:%S.%6N) makes it '
            + 'O(1). Beyond performance, auto-detection can produce false matches: serial numbers, IP octets, or build '
            + 'numbers that look like dates. An explicit format eliminates ambiguity and ensures consistent, correct timestamps.',
        gotcha: 'datetime.xml is tried top-to-bottom; the first match wins — which may not be correct. Always specify explicitly.',
        isBad: () => false,
    },
    {
        key: 'LINE_BREAKER', defaultVal: '([\\r\\n]+)', recommended: '(explicit regex)', difficulty: 'Medium–Extreme',
        nickname: 'The Hole Punch',
        desc: 'Regex defining event boundaries. The capture group is removed from data.',
        detail: 'LINE_BREAKER determines where one event ends and the next begins in raw data. The text matching the CAPTURE '
            + 'GROUP is removed ("punched out") from the stream — everything else becomes event text. The default ([\\r\\n]+) '
            + 'means "each newline sequence = new event boundary; remove the newlines." For multi-line events, you craft a '
            + 'regex where the capture group spans the boundary between events. This can be extremely complex — hence the '
            + '"Medium to Extreme" difficulty rating. When LINE_BREAKER is used as an event breaker for multi-line data, '
            + 'TRUNCATE must be raised because events may exceed 10,000 characters. Getting this wrong can merge events, '
            + 'split events mid-line, or lose data in the punched-out capture group.',
        gotcha: 'Only the capture group is removed. If your regex has no capture group, Splunk falls back to default behavior.',
        isBad: () => false,
    },
    {
        key: 'TRUNCATE', defaultVal: '10000', recommended: '(non-default, e.g. 9999)', difficulty: 'Easy',
        nickname: 'The Bouncer',
        desc: 'Max characters per event — events exceeding this are silently truncated.',
        detail: 'TRUNCATE acts as a bouncer at the door: any event longer than this value (in characters) is silently cut off '
            + 'with no warning in the UI. The default of 10,000 characters is often too low for XML documents, JSON blobs, '
            + 'full packet captures, or multi-line stack traces. In Splunk PS engagements, setting TRUNCATE to a non-default '
            + 'value like 9999 is a deliberate convention — it signals "a human reviewed this sourcetype and confirmed that '
            + '~10K is appropriate." This distinguishes intentional configuration from untouched defaults. When LINE_BREAKER '
            + 'is used as an event breaker for multi-line data, TRUNCATE must be raised (e.g. 99999 or 999999) or events will '
            + 'be silently truncated. Setting to 0 disables truncation entirely — not recommended for production.',
        gotcha: 'A value of 10000 is the default — it tells you nobody looked at it. PS convention: use 9999 as a "reviewed" signal.',
        isBad: v => v === '0' || v === '10000',
    },
    {
        key: 'TIME_PREFIX', defaultVal: '(none)', recommended: '(explicit regex)', difficulty: 'Medium',
        nickname: 'The Spotlight',
        desc: 'Regex anchoring where Splunk should start looking for the timestamp.',
        detail: 'Without TIME_PREFIX, Splunk starts scanning for a timestamp from the very beginning of each event. This can '
            + 'cause false matches: serial numbers, IP address octets, port numbers, or build IDs that happen to look like '
            + 'dates. TIME_PREFIX shines a "spotlight" — it tells Splunk exactly where in the event text the timestamp begins. '
            + 'Extraction starts immediately AFTER the TIME_PREFIX match. For syslog (where the timestamp is first), this may '
            + 'be empty or "^". For structured logs like JSON {"timestamp":"2024-03-08T..."}, use "timestamp"\\s*:\\s*" to skip '
            + 'past the field name. Combined with MAX_TIMESTAMP_LOOKAHEAD, this creates a precise extraction window that '
            + 'eliminates false matches and speeds up both index-time and search-time timestamp parsing.',
        gotcha: 'Without this, any number sequence at the start of an event may be misidentified as a timestamp.',
        isBad: () => false,
    },
    {
        key: 'MAX_TIMESTAMP_LOOKAHEAD', defaultVal: '128', recommended: '(tuned to timestamp length)', difficulty: 'Easy',
        nickname: 'The Fence',
        desc: 'Characters to scan for timestamp after TIME_PREFIX — limits the search window.',
        detail: 'MAX_TIMESTAMP_LOOKAHEAD sets a fence: after TIME_PREFIX matches, Splunk will only scan this many characters '
            + 'forward looking for the timestamp pattern. The default of 128 is generous — most timestamps are 19–30 characters '
            + '(e.g. "2024-03-08T14:30:00.123456" = 26 chars). Tightening this value reduces the chance of false matches later '
            + 'in the event text and marginally speeds up parsing. However, if set too low, it can truncate sub-second precision '
            + 'at search time — the index-time timestamp may be correct, but search-time re-extraction sees a shorter window. '
            + 'While the least impactful of the six, it completes the precision chain: TIME_PREFIX positions the spotlight, '
            + 'MAX_TIMESTAMP_LOOKAHEAD builds the fence, and TIME_FORMAT defines exactly what to extract within that window.',
        gotcha: 'Setting too low (e.g. 10) may truncate microsecond precision at search time even if index time was correct.',
        isBad: () => false,
    },
];

function MagicSixModal({ open, onClose, sourcetypes, productName, addonApp }) {
    const returnFocusRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null); // { sourcetype: { setting: value } }
    const [searchSpl, setSearchSpl] = useState(null);

    useEffect(() => {
        if (!open || !sourcetypes || sourcetypes.length === 0) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setResults(null);

        (async () => {
            try {
                // Build the IN() list for sourcetypes (exact names only; wildcards use match())
                const exactSts = sourcetypes.filter(st => !st.includes('*'));
                const wildcardPatterns = sourcetypes.filter(st => st.includes('*')).map(st => st.replace(/\*/g, '.*'));

                const filterParts = [];
                if (exactSts.length > 0) {
                    filterParts.push(`title IN (${exactSts.map(st => `"${st}"`).join(', ')})`);
                }
                wildcardPatterns.forEach(p => {
                    filterParts.push(`match(title, "^${p}$")`);
                });

                // System-wide lookup: don't scope to a single app because props.conf
                // stanzas merge across apps by priority.  A sourcetype can have
                // SHOULD_LINEMERGE from one app and TIME_FORMAT from another.
                // We aggregate across ALL apps so we never flag false-positive gaps.
                const titleFilter = filterParts.join(' OR ');

                // REST best practices:
                //   1. f= limits returned fields (bandwidth + performance)
                //   2. | search filters by sourcetypes immediately
                //   3. Exclude local SH — we want indexer-tier props.conf
                //   4. | stats values(*) as * by title — dedup across cluster AND apps
                //   5. values(eai:acl.app) tracks which app(s) define each setting
                const m6Fields = MAGIC_SIX.map(m => `f=${m.key}`).join(' ');
                const spl = [
                    `| rest splunk_server=* /servicesNS/-/-/configs/conf-props f=eai:* ${m6Fields} count=0`,
                    `| search (${titleFilter})`,
                    `| fields splunk_server eai:acl.app title ${MAGIC_SIX.map(m => m.key).join(' ')}`,
                    '| search NOT [| rest splunk_server=local /services/server/info f=splunk_server | fields splunk_server]',
                    '| stats values(*) as * values(eai:acl.app) as defining_apps by title',
                ].join(' ');
                setSearchSpl(spl);

                const csrf = getCSRFToken();
                if (!csrf) throw new Error('No CSRF token');
                const res = await splunkFetch(SEARCH_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `search=${encodeURIComponent(spl)}&output_mode=json&exec_mode=oneshot&count=0&timeout=60`,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const rows = data.results || [];

                // Build lookup: { sourcetype: { SHOULD_LINEMERGE: val, ..., defining_apps: [...] } }
                const lookup = {};
                rows.forEach(r => {
                    const st = r.title;
                    lookup[st] = {};
                    MAGIC_SIX.forEach(m => {
                        lookup[st][m.key] = r[m.key] !== undefined ? r[m.key] : null;
                    });
                    const da = r.defining_apps;
                    lookup[st].defining_apps = Array.isArray(da) ? da : (da ? [da] : []);
                });

                // Add entries for sourcetypes that had no stanza found
                sourcetypes.forEach(st => {
                    if (!st.includes('*') && !lookup[st]) {
                        lookup[st] = {};
                        MAGIC_SIX.forEach(m => { lookup[st][m.key] = null; });
                    }
                });

                if (!cancelled) setResults(lookup);
            } catch (e) {
                if (!cancelled) setError(e.message || 'Failed to load props.conf data');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [open, sourcetypes]);

    if (!open) return null;

    const sortedSts = results ? Object.keys(results).sort() : [];
    const allConfigured = sortedSts.length > 0 && sortedSts.every(st => {
        const r = results[st];
        return MAGIC_SIX.every(m => r[m.key] !== null && r[m.key] !== undefined && r[m.key] !== '');
    });
    const anyBad = sortedSts.length > 0 && sortedSts.some(st => {
        const r = results[st];
        return MAGIC_SIX.some(m => {
            const v = r[m.key];
            return v !== null && v !== undefined && v !== '' && m.isBad(String(v));
        });
    });

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '960px', width: '95vw' }}>
            <Modal.Header title={`Props.conf Audit — ${productName || 'Product'}`} />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon">⚙️</div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>The Magic Six — Props.conf Health Check</h3>
                            <p>Every well-tuned sourcetype should explicitly define these six <code>props.conf</code> settings.
                            Missing settings force Splunk to fall back to expensive heuristics at index time, impacting ingestion performance.</p>
                        </div>
                    </div>

                    {loading && (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary, #536070)' }}>
                            Loading props.conf settings…
                        </div>
                    )}
                    {error && (
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div><strong>Error:</strong> {error}</div>
                            </div>
                        </div>
                    )}

                    {results && sortedSts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary, #536070)' }}>
                            No props.conf stanzas found for this product's sourcetypes.
                            This is expected if no add-on is installed.
                        </div>
                    )}

                    {results && sortedSts.length > 0 && (
                        <div className="scan-magic6-results">
                            {allConfigured && !anyBad && (
                                <div className="scan-magic6-allgood">
                                    ✅ All Magic Six settings are explicitly configured — excellent!
                                </div>
                            )}
                            {anyBad && (
                                <div className="scan-magic6-allgood" style={{ borderLeftColor: 'var(--color-warning, #FF9000)' }}>
                                    ⚠️ Some settings use non-recommended values — review highlighted cells below.
                                </div>
                            )}
                            <div className="scan-magic6-table-wrap">
                                <table className="scan-magic6-table">
                                    <thead>
                                        <tr>
                                            <th className="scan-magic6-th-st">Sourcetype</th>
                                            {MAGIC_SIX.map(m => (
                                                <th key={m.key} className="scan-magic6-th-setting" title={`"${m.nickname}" — ${m.detail}`}>
                                                    {m.key.replace(/_/g, '_\u200B')}
                                                </th>
                                            ))}
                                            <th className="scan-magic6-th-setting" title="App(s) where this sourcetype's props.conf stanza is defined">Defining App</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedSts.map(st => {
                                            const r = results[st];
                                            return (
                                                <tr key={st}>
                                                    <td className="scan-magic6-td-st" title={st}>{st}</td>
                                                    {MAGIC_SIX.map(m => {
                                                        const val = r[m.key];
                                                        const isDefined = val !== null && val !== undefined && val !== '';
                                                        const bad = isDefined && m.isBad(String(val));
                                                        const cellClass = isDefined
                                                            ? (bad ? 'scan-magic6-bad' : 'scan-magic6-ok')
                                                            : 'scan-magic6-miss';
                                                        const tip = isDefined
                                                            ? `${m.key} = ${val}${bad ? ' ⚠ Not recommended' : ''}`
                                                            : `${m.key} not explicitly set — using default: ${m.defaultVal}`;
                                                        return (
                                                            <td key={m.key} className={`scan-magic6-td ${cellClass}`} title={tip}>
                                                                {isDefined ? (
                                                                    <span className="scan-magic6-val">{val}</span>
                                                                ) : (
                                                                    <span className="scan-magic6-na">—</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="scan-magic6-td" title={(r.defining_apps || []).join(', ')}>
                                                        {(r.defining_apps || []).join(', ') || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="csc-sc4s-info-section" style={{ marginTop: 16 }}>
                        <h4>What Are the Magic Six?</h4>
                        <div className="csc-sc4s-info-grid">
                            {MAGIC_SIX.map(m => (
                                <InfoTooltip
                                    key={m.key}
                                    title={`${m.key} — "${m.nickname}"`}
                                    persistent
                                    width={480}
                                    placement="right"
                                    content={
                                        <div style={{ fontSize: '13px', lineHeight: 1.65 }}>
                                            <p style={{ margin: '0 0 10px' }}>{m.detail}</p>
                                            {m.gotcha && (
                                                <p style={{ margin: '0 0 8px', padding: '8px 12px', background: 'rgba(255,144,0,0.05)', borderLeft: '2px solid #FF9000', borderRadius: '4px', fontSize: '12px' }}>
                                                    <strong>⚠ Gotcha:</strong> {m.gotcha}
                                                </p>
                                            )}
                                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary, #536070)', marginTop: 6 }}>
                                                <span>Default: <code style={{ background: '#F2F5F7', color: '#314257', padding: '1px 5px', borderRadius: '4px' }}>{m.defaultVal}</code></span>
                                                <span>✓ Recommended: <code style={{ background: '#F2F5F7', color: '#314257', padding: '1px 5px', borderRadius: '4px' }}>{m.recommended}</code></span>
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className="csc-sc4s-info-card" style={{ cursor: 'help' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong><code>{m.key}</code></strong>
                                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'var(--bg-primary, #f2f5f7)', color: m.difficulty === 'Easy' ? '#3D851C' : m.difficulty === 'Medium' ? '#C07600' : '#D91821', fontWeight: 600 }}>{m.difficulty}</span>
                                        </div>
                                        <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary, #536070)', fontWeight: 600 }}>"{m.nickname}"</span>
                                        <span>{m.desc}</span>
                                        {m.gotcha && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #536070)' }}>⚠ {m.gotcha}</span>
                                        )}
                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #667180)' }}>Default: <code>{m.defaultVal}</code></span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary, #536070)' }}>✓ Recommended: <code>{m.recommended}</code></span>
                                    </div>
                                </InfoTooltip>
                            ))}
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section csc-sc4s-info-section-notes">
                        <h4>Why Does This Matter?</h4>
                        <p style={{ marginBottom: 14, fontSize: '13px', lineHeight: 1.6 }}>
                            Without explicit props.conf settings, you are asking Splunk to <em>guess</em> how to onboard your data.
                            Don't let Splunk guess — give it a recipe. A well-defined recipe means Splunk spends its CPU on
                            answering your searches, not on figuring out where one event ends and the next begins.
                        </p>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <span className="csc-sc4s-info-bp-marker">📊</span>
                                <div>
                                    <strong>Up to 60% CPU Reduction — Measured</strong>
                                    <p>Splunk Professional Services has documented that providing explicit Magic Six values can
                                    <strong> reduce the CPU and wall-clock cost of ingesting a data set by as much as 60%</strong>.
                                    The two biggest contributors are SHOULD_LINEMERGE (disabling the aggregator's 4-regex heuristic cycle)
                                    and TIME_FORMAT (eliminating the datetime.xml keyring scan). These savings are cumulative — each
                                    setting you define removes an entire phase of guesswork from the indexing pipeline.</p>
                                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: 6 }}>
                                        Source: <em>"The Importance of Being Earnest/Propped"</em> — Splunk Professional Services
                                    </p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <span className="csc-sc4s-info-bp-marker">⚡</span>
                                <div>
                                    <strong>The SHOULD_LINEMERGE Cost — 4 Regexes × Every Line Boundary</strong>
                                    <p>When SHOULD_LINEMERGE = true (the default), the aggregator processor runs <strong>four separate
                                    regex evaluations</strong> (BREAK_ONLY_BEFORE, MUST_NOT_BREAK_BEFORE, MUST_BREAK_AFTER,
                                    MUST_NOT_BREAK_AFTER) on <strong>every single line boundary</strong> to decide whether to "glue"
                                    adjacent lines into one event.</p>
                                    <p style={{ marginTop: 6 }}>For a data source ingesting <strong>1 million events per day</strong> with
                                    an average of 5 lines each, that's <strong>5 million line boundaries × 4 regexes = 20 million
                                    unnecessary regex operations per day</strong> — all to decide something you already know: "each
                                    line is its own event." Setting SHOULD_LINEMERGE = false eliminates the entire aggregation phase.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <span className="csc-sc4s-info-bp-marker">🔑</span>
                                <div>
                                    <strong>The datetime.xml Tax — 30+ Patterns Tested Per Event</strong>
                                    <p>Without an explicit TIME_FORMAT, Splunk loads datetime.xml — a file containing <strong>30+
                                    timestamp patterns</strong> — and tries each one sequentially against every event, like a janitor
                                    trying every key on a giant keyring to open one door. With 1 million events, that's potentially
                                    <strong>30 million pattern tests per day</strong>. An explicit strptime format makes it a single
                                    O(1) operation per event. Worse, auto-detection can produce <em>wrong timestamps</em> — serial
                                    numbers, IP octets, or build IDs that look like dates — causing events to appear at incorrect times.</p>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '16px', padding: '14px 16px', background: 'var(--bg-primary, #f2f5f7)', borderRadius: '8px', border: '1px solid var(--border-light, #E1E6EB)', borderLeft: '3px solid var(--border-medium, #CED4DB)' }}>
                            <strong style={{ fontSize: '13px' }}>💡 The Recipe Principle</strong>
                            <p style={{ margin: '8px 0 0', fontSize: '12.5px', lineHeight: 1.6 }}>
                                Think of it this way: every sourcetype that arrives at your indexers without explicit Magic Six settings
                                is like handing raw ingredients to a chef with no recipe. The chef has to taste, smell, and test every
                                combination before cooking — wasting time and likely getting the dish wrong. With a recipe (explicit
                                props.conf), the chef goes straight to cooking.
                            </p>
                            <p style={{ margin: '8px 0 0', fontSize: '12.5px', lineHeight: 1.6 }}>
                                The impact compounds: <strong>faster indexing = more headroom for searches</strong>. Your indexers have
                                a finite CPU budget. Every cycle spent on heuristic guesswork during ingestion is a cycle stolen from
                                search processing. When you optimize props.conf, you're not just making ingestion faster — you're making
                                your entire Splunk deployment faster because the indexers aren't burning CPU trying to figure out
                                data they've already been told how to handle.
                            </p>
                        </div>

                        <div style={{ marginTop: '16px', padding: '14px 16px', background: 'rgba(255,144,0,0.05)', borderRadius: '8px', border: '1px solid var(--border-light, #E1E6EB)', borderLeft: '2px solid #FF9000' }}>
                            <strong style={{ fontSize: '13px' }}>⚠️ The Cascade: Missing One Setting Amplifies Others</strong>
                            <p style={{ margin: '8px 0 0', fontSize: '12.5px', lineHeight: 1.6 }}>
                                These six settings are interconnected. Without TIME_PREFIX, Splunk scans the entire event for timestamps — but
                                that scan uses TIME_FORMAT (or datetime.xml), which is bounded by MAX_TIMESTAMP_LOOKAHEAD. Without
                                LINE_BREAKER, events aren't properly split — so SHOULD_LINEMERGE kicks in to try to reassemble them,
                                triggering 4 regexes per boundary. And without TRUNCATE tuning, multi-line events silently lose data.
                                Each missing setting doesn't just add cost — it amplifies the cost of every other missing setting.
                            </p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/Splunk/latest/Admin/Propsconf" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                            props.conf Reference — Splunk Docs
                        </a>
                        <a href="https://lantern.splunk.com/Platform_Data_Management/Optimize_Data/Configuring_new_source_types" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                            Configuring New Sourcetypes — Splunk Lantern
                        </a>
                        <a href="https://help.splunk.com/en/splunk-enterprise/get-data-in/get-started-with-getting-data-in/10.2/configure-timestamps/configure-timestamp-recognition" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                            Configure Timestamp Recognition
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                {searchSpl && (
                    <Button
                        appearance="secondary"
                        label="Open in Search"
                        onClick={() => window.open(createURL(`/app/${APP_ID}/search?q=${encodeURIComponent(searchSpl)}`), '_blank')}
                        style={{ marginRight: 'auto' }}
                    />
                )}
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  SOAR INFO MODAL  ────────────────────────────

function SOARInfoModal({ open, onClose, soarConnectorUids, splunkbaseData, productName }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    const connectors = (soarConnectorUids || []).map(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return { uid, label: sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}` };
    });
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '820px', width: '92vw' }}>
            <Modal.Header title="Splunk SOAR Integration" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Security Orchestration, Automation & Response</h3>
                            <p>Splunk SOAR (formerly Phantom) enables organizations to <strong>automate security workflows</strong>, orchestrate actions across tools, and respond to threats in seconds rather than hours. SOAR connectors bridge Splunk SOAR with {productName ? <strong>{productName}</strong> : 'Cisco products'}, enabling automated investigation, containment, and remediation playbooks.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>🔧 What is Splunk SOAR?</h4>
                        <p>Splunk SOAR is a security orchestration and automation platform that connects to 300+ tools and 2,800+ automated actions. It enables security teams to build <strong>playbooks</strong> that automate repetitive tasks — from enriching alerts to blocking malicious IPs — and provides a centralized case management and collaboration workspace.</p>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>Key Capabilities</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Automated Playbooks</strong>
                                <span>Build visual, code-free playbooks that trigger on Splunk alerts or external events. Automate triage, enrichment, containment, and remediation workflows.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Bi-Directional Actions</strong>
                                <span>SOAR connectors support both <em>investigative</em> actions (pull data from Cisco) and <em>response</em> actions (push changes to Cisco devices like blocking IPs, quarantining hosts, or updating policies).</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Case Management</strong>
                                <span>Centralized workspace for security analysts to collaborate on incidents with full audit trails, evidence collection, and SLA tracking.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Threat Intelligence</strong>
                                <span>Integrate with Cisco Talos and other threat intel feeds to automatically enrich IOCs, score risk, and prioritize investigations.</span>
                            </div>
                        </div>
                    </div>

                    {connectors.length > 0 && (
                        <div className="csc-sc4s-info-section">
                            <h4>📦 {productName ? `${productName} — ` : ''}Available Connectors ({connectors.length})</h4>
                            <table className="csc-sc4s-info-table">
                                <thead>
                                    <tr>
                                        <th className="csc-sc4s-info-table-label">Connector</th>
                                        <th className="csc-sc4s-info-table-label" style={{ width: '160px', textAlign: 'center' }}>Splunkbase</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {connectors.map((sc) => (
                                        <tr key={sc.uid || sc.label}>
                                            <td className="csc-sc4s-info-table-label">{sc.label}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                {sc.uid ? (
                                                    <a href={generateSplunkbaseUrl(sc.uid)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, textDecoration: 'none' }}>
                                                        View on Splunkbase
                                                    </a>
                                                ) : (
                                                    <span style={{ color: '#999', fontSize: '12px' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="csc-sc4s-info-section">
                        <h4>✅ Best Practices</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">🔌</span>
                                <div>
                                    <strong>Install Connectors from Splunkbase</strong>
                                    <p>SOAR connectors are installed within SOAR's "Apps" menu, not via Splunk Enterprise. Download from Splunkbase and import into your SOAR instance.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">🔑</span>
                                <div>
                                    <strong>Use Service Accounts</strong>
                                    <p>Configure SOAR connectors with dedicated service accounts (not personal credentials) with least-privilege access for each Cisco product integration.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">📋</span>
                                <div>
                                    <strong>Start with Investigation Playbooks</strong>
                                    <p>Before enabling automated response actions, start with investigative playbooks that enrich and triage. Graduate to automated containment once confidence is established.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/SOARonprem/latest/User/Overview" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                             Splunk SOAR Documentation
                        </a>
                        <a href="https://splunkbase.splunk.com/apps?page=1&keyword=cisco&built_by=splunk&built_by=cisco&product=soar" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                             Browse All SOAR Connectors
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

// ────────────────────  ITSI INFO MODAL  ─────────────────────────────

function ITSIInfoModal({ open, onClose, itsiContentPack, productName }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    const pack = itsiContentPack || {};
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '820px', width: '92vw' }}>
            <Modal.Header title="ITSI Content Pack" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>IT Service Intelligence Content Pack</h3>
                            <p>Splunk ITSI Content Packs provide <strong>pre-built service templates, KPIs, glass tables, and deep dives</strong> that accelerate time-to-value for monitoring Cisco infrastructure. The content pack for {productName ? <strong>{productName}</strong> : 'this product'} delivers curated KPI definitions and service trees aligned to Cisco best practices.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>🔧 What is ITSI?</h4>
                        <p>Splunk IT Service Intelligence (ITSI) is a monitoring and analytics solution that provides end-to-end visibility into the health and performance of critical IT services. ITSI uses <strong>machine learning</strong> to detect anomalies, predict outages, and correlate events across your entire infrastructure — from network devices to applications to cloud services.</p>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>Key Capabilities</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Service Trees</strong>
                                <span>Hierarchical service dependency maps showing how Cisco infrastructure components relate to business services, enabling root cause analysis.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Pre-Built KPIs</strong>
                                <span>Curated Key Performance Indicators tuned for Cisco devices — including availability, latency, throughput, error rates, and protocol-specific health metrics.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Glass Tables</strong>
                                <span>Visual, real-time dashboards showing service health at a glance. Content Packs include pre-configured glass tables for common Cisco monitoring scenarios.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>ML-Powered Alerting</strong>
                                <span>Adaptive thresholds powered by machine learning — ITSI learns normal behavior and alerts on deviations, reducing false positives and alert fatigue.</span>
                            </div>
                        </div>
                    </div>

                    {pack.label && (
                        <div className="csc-sc4s-info-section">
                            <h4>📦 {productName ? `${productName} — ` : ''}Content Pack</h4>
                            <table className="csc-sc4s-info-table">
                                <tbody>
                                    <tr>
                                        <td className="csc-sc4s-info-table-label" style={{ width: '140px' }}>Content Pack</td>
                                        <td><strong>{pack.label}</strong></td>
                                    </tr>
                                    <tr>
                                        <td className="csc-sc4s-info-table-label">Installation</td>
                                        <td>ITSI → <strong>Configuration</strong> → <strong>Content Library</strong> → Import</td>
                                    </tr>
                                    {pack.docs_url && (
                                        <tr>
                                            <td className="csc-sc4s-info-table-label">Documentation</td>
                                            <td>
                                                <a href={pack.docs_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                                                    View Documentation
                                                </a>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="csc-sc4s-info-section">
                        <h4>✅ Best Practices</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">📊</span>
                                <div>
                                    <strong>Install the TA First</strong>
                                    <p>Content Packs depend on the Technology Add-on (TA) for data collection and CIM-compliant field extractions. Ensure the TA is installed and data is flowing before importing the content pack.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">🔑</span>
                                <div>
                                    <strong>Use the Content Library</strong>
                                    <p>Import content packs via ITSI's Content Library (Configuration → Content Library), not by installing them as Splunk apps. This ensures proper service template creation.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">📋</span>
                                <div>
                                    <strong>Customize Thresholds</strong>
                                    <p>Content Pack KPIs come with default thresholds. After initial deployment, tune thresholds to match your environment's baseline using ITSI's adaptive thresholding capabilities.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/ITSI/latest/Configure/ContentPackOverview" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                             ITSI Content Pack Documentation
                        </a>
                        {pack.docs_url && (
                            <a href={pack.docs_url} target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                                 {pack.label || 'Content Pack'} Documentation
                            </a>
                        )}
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  ES INFO MODAL  ──────────────────────────────

const CIM_MODEL_LABELS = {
    Alerts: '🔔 Alerts',
    Authentication: '🔑 Authentication',
    Certificates: '📜 Certificates',
    Change: '🔄 Change',
    DLP: '🛡️ DLP',
    Email: '📧 Email',
    Endpoint: '💻 Endpoint',
    Intrusion_Detection: '🚨 Intrusion Detection',
    Malware: '🦠 Malware',
    Network_Resolution: '🌐 Network Resolution (DNS)',
    Network_Sessions: '📡 Network Sessions',
    Network_Traffic: '🔀 Network Traffic',
    Threat_Intelligence: '🧠 Threat Intelligence',
    Vulnerabilities: '🔓 Vulnerabilities',
    Web: '🌍 Web',
};

function ESInfoModal({ open, onClose, productName, cimDataModels, escuStories, escuDetectionCount, escuDetections }) {
    const returnFocusRef = useRef(null);
    const [showDetections, setShowDetections] = useState(false);
    if (!open) return null;
    const models = cimDataModels || [];
    const stories = escuStories || [];
    const detections = escuDetections || [];
    const detCount = escuDetectionCount || 0;
    const hasEscu = detCount > 0;

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '860px', width: '92vw' }}>
            <Modal.Header title="Enterprise Security Compatibility" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Splunk Enterprise Security</h3>
                            <p>
                                {productName ? <strong>{productName}</strong> : 'This product'} maps its data to the
                                {' '}<strong>Splunk Common Information Model (CIM)</strong> via the add-on's
                                {' '}<code>tags.conf</code> and <code>eventtypes.conf</code>, enabling seamless
                                integration with ES correlation searches, dashboards, and adaptive response actions.
                                {hasEscu && <>{' '}Additionally, <strong>{detCount} pre-built ESCU detections</strong> are available for this product.</>}
                            </p>
                        </div>
                    </div>

                    {/* CIM Data Models */}
                    {models.length > 0 && (
                        <div className="csc-sc4s-info-section">
                            <h4>📊 CIM Data Models</h4>
                            <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                The add-on tags events into these CIM data models, making them immediately usable by ES:
                            </p>
                            <div className="csc-es-cim-pills">
                                {models.map(m => (
                                    <span key={m} className="csc-es-cim-pill">{CIM_MODEL_LABELS[m] || m}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ESCU Analytic Stories */}
                    {stories.length > 0 && (
                        <div className="csc-sc4s-info-section">
                            <h4>📖 ESCU Analytic Stories</h4>
                            <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                Enterprise Security Content Update ships these analytic stories with curated detection rules:
                            </p>
                            <div className="csc-es-stories">
                                {stories.map(s => (
                                    <div key={s} className="csc-es-story-item">
                                        <span className="csc-es-story-icon">📕</span>
                                        <span>{s}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Detection Count + Expandable List */}
                    {hasEscu && (
                        <div className="csc-sc4s-info-section">
                            <h4>🔍 ESCU Detections ({detCount})</h4>
                            <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                Pre-built detection searches that run as correlation searches in ES:
                            </p>
                            {detections.length > 5 && !showDetections ? (
                                <>
                                    <ul className="csc-es-detection-list">
                                        {detections.slice(0, 5).map(d => <li key={d}>{d}</li>)}
                                    </ul>
                                    <button className="csc-es-show-all-btn" onClick={() => setShowDetections(true)}>
                                        Show all {detCount} detections ▾
                                    </button>
                                </>
                            ) : (
                                <ul className="csc-es-detection-list">
                                    {detections.map(d => <li key={d}>{d}</li>)}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* How it works */}
                    <div className="csc-sc4s-info-section">
                        <h4>🔧 How It Works</h4>
                        <div className="csc-sc4s-info-grid">
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>CIM Compliance</strong>
                                <span>The add-on's <code>tags.conf</code> maps sourcetypes to CIM data models. ES accelerates these models for real-time search.</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Correlation Searches</strong>
                                <span>ES correlation searches query CIM-accelerated data models. CIM-compliant data is automatically included — no custom SPL needed.</span>
                            </div>
                            {hasEscu && (
                                <div className="csc-sc4s-info-card">
                                    <span className="csc-sc4s-info-card-icon"></span>
                                    <strong>ESCU Detections</strong>
                                    <span>Install the Enterprise Security Content Update (ESCU) app from Splunkbase to get {detCount} pre-built detections for this product.</span>
                                </div>
                            )}
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Notable Events</strong>
                                <span>When detections fire, they create Notable Events in the ES Incident Review dashboard for analyst triage and response.</span>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>✅ Best Practices</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">📊</span>
                                <div>
                                    <strong>Accelerate CIM Data Models</strong>
                                    <p>In ES, go to Settings → Data Models and ensure the relevant CIM models are accelerated. ES relies on accelerated data models for performant correlation searches.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker">🔌</span>
                                <div>
                                    <strong>Install the Add-on First</strong>
                                    <p>The Technology Add-on (TA) provides the CIM field extractions and tag mappings. Install it on search heads (and indexers if needed) before configuring ES.</p>
                                </div>
                            </div>
                            {hasEscu && (
                                <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                    <span className="csc-sc4s-info-bp-marker">📦</span>
                                    <div>
                                        <strong>Keep ESCU Updated</strong>
                                        <p>Splunk releases monthly ESCU updates with new detections. Keep the Enterprise Security Content Update app current to get the latest Cisco-specific detection rules.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/ES/latest" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link">
                             ES Documentation
                        </a>
                        {hasEscu && (
                            <a href="https://splunkbase.splunk.com/app/3449" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                                 ESCU on Splunkbase
                            </a>
                        )}
                        <a href="https://docs.splunk.com/Documentation/CIM/latest/User/Overview" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link csc-sc4s-info-link-gh">
                             CIM Reference
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

function BestPracticesModal({ open, onClose, product, platformType, splunkbaseData }) {
    const returnFocusRef = useRef(null);
    if (!open || !product) return null;
    const tips = getBestPractices(product, platformType, splunkbaseData);
    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '640px', width: '92vw' }}>
            <Modal.Header title={`Best Practices — ${product.display_name}`} />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ fontSize: '13px', lineHeight: '1.7' }}>
                    {tips.map((tip, i) => (
                        <div key={i} style={{
                            padding: '10px 14px',
                            marginBottom: '8px',
                            background: 'var(--bg-primary, #f2f5f7)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light, #E1E6EB)',
                            borderLeft: '3px solid var(--border-medium, #CED4DB)',
                        }}>
                            {tip.icon && <span style={{ marginRight: '6px' }}>{tip.icon}</span>}
                            {tip.text}
                            {tip.linkUrl && (
                                <div style={{ marginTop: '6px' }}>
                                    <a href={tip.linkUrl} target="_blank" rel="noopener noreferrer"
                                       style={{ fontWeight: 600, textDecoration: 'underline' }}>
                                        {tip.linkLabel || tip.linkUrl}
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

function LegacyAuditModal({ open, onClose, legacyUids, installedApps, indexerApps, splunkbaseData, onMigrate }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;

    // Resolve each UID to an enriched object via splunkbaseData
    const allApps = (legacyUids || []).map(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return {
            uid,
            app_id: sb?.appid || '',
            display_name: sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`,
            status: sb?.status || 'unknown',
        };
    });
    const activeApps = allApps.filter(a => a.status !== 'archived');
    const archivedApps = allApps.filter(a => a.status === 'archived');
    const shInstalledCount = allApps.filter(a => a.app_id && installedApps && installedApps[a.app_id]).length;
    const idxInstalledCount = indexerApps ? allApps.filter(a => a.app_id && indexerApps[a.app_id]).length : 0;
    const hasIndexerData = indexerApps && Object.keys(indexerApps).length > 0;

    const renderCard = (app, isArchived) => {
        const isOnSh = installedApps && installedApps[app.app_id];
        const idxInfo = hasIndexerData && indexerApps[app.app_id];
        const isOnIdx = !!idxInfo;
        const isInstalled = isOnSh || isOnIdx;
        return (
            <div key={app.uid} className={`csc-legacy-card ${isArchived ? 'csc-legacy-archived' : 'csc-legacy-active'}`}
                 style={isInstalled ? { borderLeft: '4px solid var(--border-medium, #CED4DB)' } : {}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <strong>{app.display_name || app.app_id}</strong>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {isOnSh && (
                            <span className="csc-legacy-status-badge" style={{ background: 'var(--bg-primary, #f2f5f7)', fontWeight: 600, fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                                SH Installed
                            </span>
                        )}
                        {isOnIdx && (
                            <span className="csc-legacy-status-badge" style={{ background: 'var(--bg-primary, #f2f5f7)', fontWeight: 600, fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                                Indexer Tier ({idxInfo.idx_count || '?'})
                            </span>
                        )}
                        <span className={isArchived ? 'csc-legacy-status-badge csc-legacy-status-archived' : 'csc-legacy-status-badge csc-legacy-status-active'}>
                            {isArchived ? 'Archived' : 'Active'}
                        </span>
                    </div>
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    <code style={{ background: 'var(--code-bg, #f5f5f5)', padding: '1px 4px', borderRadius: '3px' }}>{app.app_id}</code>
                    {isInstalled && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 500 }}>
                            ← {isArchived ? 'remove this archived app' : 'remove this app'}
                        </span>
                    )}
                </div>
                {app.uid && (
                    <div style={{ marginTop: '6px' }}>
                        <a href={generateSplunkbaseUrl(app.uid)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>
                            {isArchived ? 'View on Splunkbase (archived) →' : 'View on Splunkbase →'}
                        </a>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '820px', width: '92vw' }}>
            <Modal.Header title="Legacy Debt Audit Report" />
            <Modal.Body>
                <div className="csc-sc4s-info">
                {allApps.length === 0
                    ? (
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '48px' }}>✅</span>
                            <p style={{ fontSize: '16px', fontWeight: 600, marginTop: '12px' }}>No legacy apps detected!</p>
                        </div>
                    )
                    : (
                        <div>
                            {/* ── Summary bar ── */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '13px', padding: '4px 12px', borderRadius: '12px',
                                    background: 'var(--bg-primary, #f2f5f7)',
                                    border: '1px solid var(--border-light, #E1E6EB)',
                                    fontWeight: 600
                                }}>
                                    SH: {shInstalledCount > 0 ? `${shInstalledCount} installed` : 'Clean'}
                                </span>
                                {hasIndexerData && (
                                    <span style={{
                                        fontSize: '13px', padding: '4px 12px', borderRadius: '12px',
                                        background: 'var(--bg-primary, #f2f5f7)',
                                        border: '1px solid var(--border-light, #E1E6EB)',
                                        fontWeight: 600
                                    }}>
                                        Indexers: {idxInstalledCount > 0 ? `${idxInstalledCount} deployed` : 'Clean'}
                                    </span>
                                )}
                                <span style={{
                                    fontSize: '13px', padding: '4px 12px', borderRadius: '12px',
                                    background: 'var(--status-neutral-bg, #f5f5f5)',
                                    color: 'var(--muted-color, #666)'
                                }}>
                                    {allApps.length} legacy app{allApps.length !== 1 ? 's' : ''} cataloged
                                </span>
                            </div>

                            <p style={{ fontSize: '13px', color: 'var(--muted-color, #666)', marginBottom: '16px' }}>
                                Legacy Cisco apps that should be replaced by the recommended add-on.
                                Detected across <strong>Search Head</strong>{hasIndexerData && <span> and <strong>Indexer Tier</strong></span>}.
                            </p>

                            {/* ── Active Legacy Apps ── */}
                            <div className="csc-legacy-section">
                                <div className="csc-legacy-section-header csc-legacy-section-active">
                                    <span>Still Active on Splunkbase ({activeApps.length})</span>
                                    <span className="csc-legacy-section-hint">These apps are still downloadable but should be replaced</span>
                                </div>
                                {activeApps.length > 0
                                    ? activeApps.map(app => renderCard(app, false))
                                    : <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--muted-color, #888)' }}>No active legacy apps found.</div>
                                }
                            </div>

                            {/* ── Archived Legacy Apps — CRITICAL ── */}
                            <div className="csc-legacy-section" style={{ marginTop: '20px' }}>
                                <div className="csc-legacy-section-header csc-legacy-section-archived">
                                    <span>⚠️ Archived on Splunkbase ({archivedApps.length})</span>
                                    <span className="csc-legacy-section-hint">No longer available for download — dangerous to leave installed</span>
                                </div>
                                {archivedApps.length > 0
                                    ? archivedApps.map(app => renderCard(app, true))
                                    : <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--muted-color, #888)' }}>No archived legacy apps found.</div>
                                }
                            </div>
                        </div>
                    )
                }
                </div>
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
        borderRadius: '6px', border: '1px solid', borderColor: selected ? 'var(--border-medium, #CED4DB)' : 'var(--border-light, #E1E6EB)',
        background: selected ? 'var(--bg-primary, #f2f5f7)' : 'var(--bg-surface, #fff)', color: 'var(--text-primary, #314257)',
        transition: 'all .15s',
    });

    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '640px', width: '92vw' }}>
            <Modal.Header title="Give Feedback" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ fontSize: '13px', lineHeight: '1.6' }}>
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

function InfoTooltip({ placement = 'bottom', width = 500, delay = 400, content, children, title: headerTitle, persistent = false }) {
    const [visible, setVisible] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const wrapperRef = useRef(null);
    const tooltipRef = useRef(null);
    const hoveringTip = useRef(false);
    const timer = useRef(null);

    // Drag listeners
    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e) => {
            setCoords({ top: e.clientY - dragOffset.y, left: e.clientX - dragOffset.x });
        };
        const onUp = () => setIsDragging(false);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [isDragging, dragOffset]);

    const show = useCallback(() => {
        if (pinned) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if (!wrapperRef.current) return;
            const r = wrapperRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 10;
            let pos;
            if (placement === 'right') {
                pos = {
                    top: r.top + window.scrollY,
                    left: r.right + gap + window.scrollX,
                };
                if (pos.left + width + gap > vw + window.scrollX) {
                    pos.left = r.left - width - gap + window.scrollX;
                }
                pos.left = Math.max(gap, pos.left);
            } else {
                pos = {
                    top: placement === 'bottom' ? r.bottom + gap + window.scrollY : r.top - gap + window.scrollY,
                    left: r.left + window.scrollX,
                };
                pos.left = Math.max(gap, Math.min(pos.left, vw - width - gap + window.scrollX));
            }
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

    const handleDragStart = useCallback((e) => {
        if (!pinned || !tooltipRef.current) return;
        const rect = tooltipRef.current.getBoundingClientRect();
        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setIsDragging(true);
        e.preventDefault();
        e.stopPropagation();
    }, [pinned]);

    useEffect(() => {
        return () => clearTimeout(timer.current);
    }, []);

    const displayTitle = headerTitle || 'Splunk Cisco App Navigator';

    const tip = (
        <div
            ref={tooltipRef}
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
                    <span>{displayTitle}</span>
                    {persistent && (
                        <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span
                                className={`scan-tooltip-pin ${pinned ? 'pinned' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setPinned(p => !p); }}
                                title={pinned ? 'Unpin' : 'Pin to keep open'}
                            >
                                📌
                            </span>
                            {pinned && (
                                <span
                                    className="scan-tooltip-drag"
                                    onMouseDown={handleDragStart}
                                    title="Drag to move"
                                    style={{ cursor: isDragging ? 'grabbing' : 'grab', fontSize: '18px', color: '#b0b0b0', userSelect: 'none' }}
                                >
                                    ⠿
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <div className="scan-tooltip-body">
                    {content}
                </div>
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

// CardInfoPopover removed — now using InfoTooltip portal popup instead

// ────────────────────────  PRODUCT CARD  ─────────────────────

function ProductCard({ product, installedApps, appStatuses, indexerApps, sourcetypeData, splunkbaseData, appidToUidMap, isConfigured, isComingSoon, platformType, onToggleConfigured, onShowBestPractices, onViewLegacy, onSetCustomDashboard, devMode, onViewConfig }) {
    const {
        product_id, display_name, version, status, description, value_proposition, vendor, tagline,
        icon_svg, learn_more_url, addon_docs_url, addon_troubleshoot_url, addon_install_url,
        addon, addon_label,
        app_viz, app_viz_label, app_viz_docs_url, app_viz_troubleshoot_url, app_viz_install_url,
        app_viz_2, app_viz_2_label, app_viz_2_docs_url, app_viz_2_troubleshoot_url, app_viz_2_install_url,
        legacy_uids, soar_connector_uids, alert_action_uids, community_uids, itsi_content_pack,
        is_new, support_level, cisco_retired, coverage_gap,
        sc4s_url, sc4s_supported, sc4s_search_head_ta, sc4s_search_head_ta_label,
        sc4s_search_head_ta_splunkbase_id, sc4s_search_head_ta_install_url, sc4s_sourcetypes, sc4s_config_notes,
        netflow_supported, netflow_addon, netflow_addon_label,
        netflow_addon_splunkbase_id, netflow_addon_install_url, netflow_addon_docs_url,
        stream_docs_url, netflow_sourcetypes, netflow_config_notes,
        es_compatible, es_cim_data_models, escu_analytic_stories, escu_detection_count, escu_detections,
    } = product;

    const appStatus = appStatuses[addon] || null;
    const vizAppStatus = app_viz ? (appStatuses[app_viz] || null) : null;
    const vizApp2Status = app_viz_2 ? (appStatuses[app_viz_2] || null) : null;
    const sourcetypeInfo = sourcetypeData[product_id] || null;

    // ── Indexer tier add-on detection ──
    // indexerApps is null (not loaded), {} (no peers/standalone), or { appid: { version, disabled, indexerCount } }
    const idxStatus = (indexerApps && addon) ? (indexerApps[addon] || null) : null;
    const hasIndexerPeers = indexerApps !== null && Object.keys(indexerApps).length > 0;
    // Determine indexer tier state for this product's addon
    let idxTierState = null; // null = not applicable (no addon, no peers, or not loaded)
    if (addon && hasIndexerPeers) {
        if (!idxStatus) {
            idxTierState = 'missing';       // addon not found on any indexer
        } else if (idxStatus.disabled) {
            idxTierState = 'disabled';      // addon found but disabled on indexer tier
        } else if (appStatus?.version && idxStatus.version && appStatus.version !== idxStatus.version) {
            idxTierState = 'mismatch';      // version differs between SH and indexer
        } else {
            idxTierState = 'deployed';      // addon is on indexer tier, correct version
        }
    }

    const hasLegacy = legacy_uids && legacy_uids.length > 0;
    // Resolve legacy UIDs to enriched objects via splunkbaseData for install detection
    const legacyInstalled = hasLegacy ? legacy_uids.filter(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return sb && sb.appid && installedApps[sb.appid];
    }) : [];
    const communityInstalled = (community_uids || []).filter(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return sb && sb.appid && installedApps[sb.appid];
    });

    const sc4sShTaStatus = sc4s_search_head_ta ? (appStatuses[sc4s_search_head_ta] || null) : null;
    const hasDifferentSc4sTa = sc4s_supported && sc4s_search_head_ta && sc4s_search_head_ta !== addon;

    const netflowAddonStatus = netflow_addon ? (appStatuses[netflow_addon] || null) : null;

    // Hardcoded Stream app definitions for the NetFlow section
    const streamPrereqs = netflow_supported ? [
        { app_id: 'Splunk_TA_stream', display_name: 'Splunk Add-on for Stream Forwarders', uid: '5238' },
        { app_id: 'Splunk_TA_stream_wire_data', display_name: 'Splunk Add-on for Stream Wire Data', uid: '5234' },
    ] : [];
    const streamVizApp = netflow_supported
        ? { app_id: 'splunk_app_stream', display_name: 'Splunk App for Stream', uid: '1809' }
        : null;

    const [depsExpanded, setDepsExpanded] = useState(false);
    const [sc4sInfoOpen, setSc4sInfoOpen] = useState(false);
    const [netflowInfoOpen, setNetflowInfoOpen] = useState(false);
    const [hfInfoOpen, setHfInfoOpen] = useState(false);
    const [magicSixOpen, setMagicSixOpen] = useState(false);
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
    if (sc4s_supported && !addon) depItems.push({ label: 'SC4S', installed: true, sc4sOnly: true });
    if (sc4s_supported && addon) depItems.push({ label: 'SC4S', installed: true });
    if (netflow_supported) depItems.push({ label: 'NetFlow', installed: !!netflowAddonStatus?.installed });
    const allDeps = [...depItems];
    const depsMissing = allDeps.filter(d => !d.installed).length;
    const hasDeps = allDeps.length > 0;

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
        let cd = (product.custom_dashboard || '').trim();
        if (!cd) { setLaunchMenuOpen(false); return; }
        // If the user pasted a full URL, open it directly
        if (/^https?:\/\//i.test(cd)) {
            window.open(cd, '_blank');
        // If it already starts with /en- or /app/, it's an absolute Splunk path
        } else if (cd.startsWith('/')) {
            window.open(createURL(cd), '_blank');
        } else {
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
    const hasSoar = soar_connector_uids && soar_connector_uids.length > 0;
    const hasEs = !!es_compatible;
    const [soarInfoOpen, setSoarInfoOpen] = useState(false);
    const [itsiInfoOpen, setItsiInfoOpen] = useState(false);
    const [esInfoOpen, setEsInfoOpen] = useState(false);
    const addonFamily = product.addon_family || 'default';

    // Derive Splunkbase UIDs at runtime from appidToUidMap (CSV lookup) or static catalog fields
    const addon_splunkbase_uid = product.addon_splunkbase_uid || (addon && appidToUidMap && appidToUidMap[addon]) || '';
    const app_viz_splunkbase_uid = product.app_viz_splunkbase_uid || (app_viz && appidToUidMap && appidToUidMap[app_viz]) || '';
    const app_viz_2_splunkbase_uid = product.app_viz_2_splunkbase_uid || (app_viz_2 && appidToUidMap && appidToUidMap[app_viz_2]) || '';

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
                            {(display_name || 'C')[0]}
                        </span>
                    </span>
                </div>
                <div className="csc-card-title-block">
                    <div className="csc-title-row">
                        <div className="csc-title-content">
                            <span className="csc-card-name">
                                {display_name}
                                {description && (
                                    <InfoTooltip
                                        placement="right"
                                        width={420}
                                        delay={300}
                                        persistent
                                        title={display_name}
                                        content={
                                            <div>
                                                <div className="csc-info-popover-section">
                                                    <div className="csc-info-popover-label">Description</div>
                                                    <div className="csc-info-popover-text">{renderFormattedText(description)}</div>
                                                </div>
                                                {value_proposition && (
                                                    <div className="csc-info-popover-section csc-info-popover-value">
                                                        <div className="csc-info-popover-label">Value</div>
                                                        <div className="csc-info-popover-text">{renderFormattedText(value_proposition)}</div>
                                                    </div>
                                                )}
                                                {product.aliases && product.aliases.length > 0 && (
                                                    <div className="csc-info-popover-section csc-info-popover-aliases">
                                                        <div className="csc-info-popover-label">Former Names</div>
                                                        <div className="csc-info-popover-text">{product.aliases.join(', ')}</div>
                                                    </div>
                                                )}
                                            </div>
                                        }
                                    >
                                        <span className="csc-info-trigger" title="Hover for product details"><InfoCircle size={15} /></span>
                                    </InfoTooltip>
                                )}
                            </span>
                        </div>
                        <div className="csc-header-badges">
                            {sc4s_url && (
                                <button className="csc-badge-btn csc-badge-sc4s" title="Supported by Splunk Connect for Syslog (SC4S) — Click for Info" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSc4sInfoOpen(true); }}>SC4S</button>
                            )}
                            {netflow_supported && (
                                <button className="csc-badge-btn csc-badge-netflow" title="Supports NetFlow / IPFIX — Click for Info" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setNetflowInfoOpen(true); }}>NetFlow</button>
                            )}
                            {hasSoar && (
                                <button className="csc-badge-btn csc-badge-soar" title={`${soar_connector_uids.length} SOAR Connector${soar_connector_uids.length !== 1 ? 's' : ''} — Click for Info`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSoarInfoOpen(true); }}>SOAR</button>
                            )}
                            {hasItsi && (
                                <button className="csc-badge-btn csc-badge-itsi" title="ITSI Content Pack available — Click for Info" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setItsiInfoOpen(true); }}>ITSI</button>
                            )}
                            {hasEs && (
                                <button className="csc-badge-btn csc-badge-es" title={`ES Compatible${escu_detection_count ? ` — ${escu_detection_count} ESCU Detections` : ''} — Click for Info`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEsInfoOpen(true); }}>ES</button>
                            )}
                        </div>
                    </div>
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
                </div>
            </div>

            {/* ── Value Proposition (toggle via SHOW_VALUE_PROP_ON_CARD) ── */}
            {SHOW_VALUE_PROP_ON_CARD && value_proposition && (
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
                allLegacyUids={legacy_uids}
                splunkbaseData={splunkbaseData}
                sourcetypeSearchUrl={sourcetypeSearchUrl}
                isArchived={!!(!addon_install_url && addon_splunkbase_uid)}
                onViewLegacy={onViewLegacy}
            />



            {/* ── Dependency info: collapsible summary + expandable details ── */}
            {hasDeps && (
                <div className="csc-card-dependency">
                    {/* Summary line — always visible */}
                    <div className="csc-dep-summary" onClick={() => setDepsExpanded((v) => !v)} role="button" tabIndex={0}>
                        <span className="csc-dep-summary-icons">
                            {depItems.map((d) => (
                                <span key={d.label} className={d.sc4sOnly ? 'csc-dep-chip-sc4s' : d.installed ? 'csc-dep-chip-ok' : 'csc-dep-chip-miss'}>
                                    {d.sc4sOnly ? '📡' : d.installed ? '✓' : '✗'} {d.label}
                                </span>
                            ))}
                        </span>
                        <span className="csc-dep-toggle">
                            {depsExpanded ? '− Hide' : '+ Details'}
                        </span>
                    </div>

                    {/* Expanded deployment guide */}
                    {depsExpanded && (
                        <div className="csc-dep-expanded">
                            {/* ── Support Level Badge ── */}
                            {support_level && (
                                <div className={`csc-support-badge csc-support-${support_level}`}>
                                    {support_level === 'cisco_supported' && 'Cisco Supported'}
                                    {support_level === 'splunk_supported' && 'Splunk Supported'}
                                    {support_level === 'developer_supported' && 'Developer Supported'}
                                    {support_level === 'community_supported' && 'Community Supported'}
                                    {support_level === 'not_supported' && 'Not Supported'}
                                </div>
                            )}
                            <hr className="csc-dep-divider" />

                            {/* ── Primary Add-on ── */}
                            {addon && (
                                <>
                                <span className="csc-dep-label">Add-on</span>
                                <div className="csc-dep-detail">
                                    {appStatus?.installed ? (
                                        <a href={createURL(`/app/${addon}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${addon_label || addon}`}>{addon_label || addon}</a>
                                    ) : (
                                        <span className="csc-dep-name">{addon_label || addon}</span>
                                    )}
                                    {addon_label && addon_label !== addon && <span className="csc-dep-appid" title="Splunk folder name">{addon}</span>}
                                    {(addon_splunkbase_uid || addon_docs_url || addon_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {addon_splunkbase_uid && (
                                                <a href={generateSplunkbaseUrl(addon_splunkbase_uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                    Splunkbase
                                                </a>
                                            )}
                                            {addon_docs_url && (
                                                <a href={addon_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Documentation">
                                                    Docs
                                                </a>
                                            )}
                                            {addon_troubleshoot_url && (
                                                <a href={addon_troubleshoot_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Troubleshooting Guide">
                                                    Troubleshoot
                                                </a>
                                            )}
                                        </span>
                                    )}
                                    {appStatus?.version && (
                                        <span className="csc-dep-version">v{appStatus.version}</span>
                                    )}
                                    {appStatus?.updateVersion && (
                                        <span className="csc-dep-update">v{appStatus.updateVersion}</span>
                                    )}
                                    {!appStatus?.installed && !isComingSoon && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                                {/* Tier deployment chips for add-on */}
                                <div className="scan-tier-chips">
                                    <span className={`scan-tier-chip ${appStatus?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title={appStatus?.installed ? `Search Head: v${appStatus.version || ''}` : 'Not installed on Search Head'}>
                                        <CylinderMagnifier size={12} /> Search Head {appStatus?.installed ? '✓' : '✗'}
                                    </span>
                                    {hasIndexerPeers ? (
                                        <span className={`scan-tier-chip ${
                                            idxTierState === 'deployed' ? 'scan-tier-ok' :
                                            idxTierState === 'disabled' ? 'scan-tier-alert' :
                                            idxTierState === 'mismatch' ? 'scan-tier-warn' :
                                            'scan-tier-miss'
                                        }`} title={
                                            idxTierState === 'deployed' ? `Deployed: v${idxStatus?.version || ''} — Click to audit props.conf Magic Six` :
                                            idxTierState === 'disabled' ? 'DISABLED on indexer tier — props.conf/transforms.conf will not apply — Click to audit' :
                                            idxTierState === 'mismatch' ? `Version mismatch: Indexer v${idxStatus?.version} ≠ SH v${appStatus?.version} — Click to audit` :
                                            'Not deployed — index-time parsing will not work — Click to audit props.conf'
                                        } onClick={product.sourcetypes && product.sourcetypes.length > 0 ? (e) => { e.stopPropagation(); e.preventDefault(); setMagicSixOpen(true); } : undefined} style={product.sourcetypes && product.sourcetypes.length > 0 ? { cursor: 'pointer' } : undefined}>
                                            <CylinderIndex size={12} /> Indexers {
                                                idxTierState === 'deployed' ? '✓' :
                                                idxTierState === 'disabled' ? '⊘' :
                                                idxTierState === 'mismatch' ? '≠' : '✗'
                                            }
                                        </span>
                                    ) : (
                                        <span className="scan-tier-chip scan-tier-na" title={product.sourcetypes && product.sourcetypes.length > 0 ? 'No indexer peers detected — standalone deployment — Click to audit props.conf' : 'No indexer peers detected — standalone deployment'} onClick={product.sourcetypes && product.sourcetypes.length > 0 ? (e) => { e.stopPropagation(); e.preventDefault(); setMagicSixOpen(true); } : undefined} style={product.sourcetypes && product.sourcetypes.length > 0 ? { cursor: 'pointer' } : undefined}>
                                            <CylinderIndex size={12} /> Indexers —
                                        </span>
                                    )}
                                    <span className="scan-tier-chip scan-tier-info" title="Deploy to Heavy Forwarders if using syslog or HEC inputs — Click for details" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setHfInfoOpen(true); }} style={{ cursor: 'pointer' }}>
                                        <ForwarderHeavy size={12} /> Heavy Forwarder ℹ
                                    </span>
                                </div>

                                </>
                            )}
                            {!addon && sc4s_supported && (
                                <>
                                <span className="csc-dep-label">Ingestion Path</span>
                                <div className="csc-dep-detail scan-sc4s-primary-notice">
                                    <span className="scan-sc4s-primary-badge">SC4S Primary</span>
                                    <span className="scan-sc4s-primary-hint">No Splunk add-on required — data is ingested via SC4S (Splunk Connect for Syslog)</span>
                                </div>
                                {sc4s_sourcetypes && sc4s_sourcetypes.length > 0 && (
                                    <div className="scan-sc4s-primary-sts">
                                        <span className="csc-dep-label" style={{ fontSize: '10px' }}>SC4S Sourcetypes</span>
                                        <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>{sc4s_sourcetypes.join(', ')}</span>
                                    </div>
                                )}
                                </>
                            )}

                            {/* ── Dashboard / Viz App ── */}
                            {app_viz && (
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
                                    {(app_viz_splunkbase_uid || app_viz_docs_url || app_viz_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {app_viz_splunkbase_uid && (
                                                <a href={generateSplunkbaseUrl(app_viz_splunkbase_uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                    Splunkbase
                                                </a>
                                            )}
                                            {app_viz_docs_url && (
                                                <a href={app_viz_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Documentation">
                                                    Docs
                                                </a>
                                            )}
                                            {app_viz_troubleshoot_url && (
                                                <a href={app_viz_troubleshoot_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Troubleshooting Guide">
                                                    Troubleshoot
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
                                <div className="scan-tier-chips">
                                    <span className={`scan-tier-chip ${vizAppStatus?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title="Search Head only">
                                        <CylinderMagnifier size={12} /> SH {vizAppStatus?.installed ? '✓' : '✗'}
                                    </span>
                                </div>
                                </>
                            )}

                            {/* ── Secondary Dashboard App (app_viz_2) ── */}
                            {app_viz_2 && (
                                <>
                                <hr className="csc-dep-divider" />
                                <span className="csc-dep-label">Dashboard App 2</span>
                                <div className="csc-dep-detail">
                                    {vizApp2Status?.installed ? (
                                        <a href={createURL(`/app/${app_viz_2}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${app_viz_2_label || app_viz_2}`}>{app_viz_2_label || app_viz_2}</a>
                                    ) : (
                                        <span className="csc-dep-name">{app_viz_2_label || app_viz_2}</span>
                                    )}
                                    {app_viz_2_label && app_viz_2_label !== app_viz_2 && <span className="csc-dep-appid" title="Splunk folder name">{app_viz_2}</span>}
                                    {(app_viz_2_splunkbase_uid || app_viz_2_docs_url || app_viz_2_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {app_viz_2_splunkbase_uid && (
                                                <a href={generateSplunkbaseUrl(app_viz_2_splunkbase_uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                    Splunkbase
                                                </a>
                                            )}
                                            {app_viz_2_docs_url && (
                                                <a href={app_viz_2_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Documentation">
                                                    Docs
                                                </a>
                                            )}
                                            {app_viz_2_troubleshoot_url && (
                                                <a href={app_viz_2_troubleshoot_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Troubleshooting Guide">
                                                    Troubleshoot
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
                                <div className="scan-tier-chips">
                                    <span className={`scan-tier-chip ${vizApp2Status?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title="Search Head only">
                                        <CylinderMagnifier size={12} /> SH {vizApp2Status?.installed ? '✓' : '✗'}
                                    </span>
                                </div>
                                </>
                            )}

                            {/* ── SC4S Compatibility (inline note, not a tab) ── */}
                            {sc4s_supported && (
                                <>
                                <hr className="csc-dep-divider" />
                                <div className="scan-sc4s-inline">
                                    <span className="scan-sc4s-inline-label">SC4S Compatible</span>
                                    {sc4s_url && (
                                        <a href={sc4s_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg csc-split-pill-sc4s" title="SC4S setup documentation">
                                            SC4S Docs
                                        </a>
                                    )}
                                </div>
                                {hasDifferentSc4sTa && sc4s_search_head_ta && (
                                    <div className="scan-sc4s-ta-note">
                                        <span className="csc-dep-detail">
                                            SC4S path uses <strong>{sc4s_search_head_ta_label || sc4s_search_head_ta}</strong> instead of {addon_label || addon}
                                            {sc4s_search_head_ta_splunkbase_id && (
                                                <a href={generateSplunkbaseUrl(sc4s_search_head_ta_splunkbase_id)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase" style={{marginLeft: 6}}>
                                                    Splunkbase
                                                </a>
                                            )}
                                            {sc4sShTaStatus?.installed && (
                                                <span className="csc-dep-version" style={{marginLeft: 4}}>v{sc4sShTaStatus.version}</span>
                                            )}
                                            {sc4sShTaStatus && !sc4sShTaStatus.installed && (
                                                <span className="csc-dep-status-missing" style={{marginLeft: 4}}>not installed</span>
                                            )}
                                        </span>
                                    </div>
                                )}
                                {sc4s_config_notes && sc4s_config_notes.length > 0 && (
                                    <details className="csc-dep-details">
                                        <summary className="csc-dep-details-summary">
                                            SC4S Config Notes ({sc4s_config_notes.length})
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

                            {/* ── NetFlow (collapsible optional section, not a tab) ── */}
                            {netflow_supported && (
                                <>
                                <hr className="csc-dep-divider" />
                                <details className="csc-dep-details scan-netflow-section">
                                    <summary className="csc-dep-details-summary scan-netflow-summary">
                                        NetFlow / IPFIX {netflow_addon && netflowAddonStatus?.installed ? '✓' : ''}
                                    </summary>
                                    <div className="csc-dep-details-body">
                                        {netflow_addon && (
                                            <div className="csc-dep-detail">
                                                <span className="csc-dep-name">{netflow_addon_label || netflow_addon}</span>
                                                {netflow_addon_label && netflow_addon_label !== netflow_addon && <span className="csc-dep-appid">{netflow_addon}</span>}
                                                {(netflow_addon_splunkbase_id || netflow_addon_docs_url) && (
                                                    <span className="csc-split-pill">
                                                        {netflow_addon_splunkbase_id && (
                                                            <a href={generateSplunkbaseUrl(netflow_addon_splunkbase_id)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                                Splunkbase
                                                            </a>
                                                        )}
                                                        {netflow_addon_docs_url && (
                                                            <a href={netflow_addon_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="NetFlow documentation">
                                                                Docs
                                                            </a>
                                                        )}
                                                    </span>
                                                )}
                                                {netflowAddonStatus?.version && <span className="csc-dep-version">v{netflowAddonStatus.version}</span>}
                                                {!netflowAddonStatus?.installed && <span className="csc-dep-status-missing">not installed</span>}
                                            </div>
                                        )}
                                        {streamPrereqs.length > 0 && (
                                            <>
                                                <span className="csc-dep-label" style={{marginTop: 6}}>Stream Prerequisites</span>
                                                {streamPrereqs.map((pa) => {
                                                    const paStatus = appStatuses[pa.app_id] || null;
                                                    return (
                                                        <div className="csc-dep-detail" key={pa.app_id}>
                                                            {paStatus?.installed ? (
                                                                <a href={createURL(`/app/${pa.app_id}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${pa.display_name}`}>{pa.display_name}</a>
                                                            ) : (
                                                                <span className="csc-dep-name">{pa.display_name}</span>
                                                            )}
                                                            {pa.uid && (
                                                                <span className="csc-split-pill">
                                                                    <a href={generateSplunkbaseUrl(pa.uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                                        Splunkbase
                                                                    </a>
                                                                </span>
                                                            )}
                                                            {paStatus?.version && <span className="csc-dep-version">v{paStatus.version}</span>}
                                                            {!paStatus?.installed && <span className="csc-dep-status-missing">not installed</span>}
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}
                                        {streamVizApp && (() => {
                                            const svStatus = appStatuses[streamVizApp.app_id] || null;
                                            return (
                                                <>
                                                    <span className="csc-dep-label" style={{marginTop: 6}}>NetFlow Dashboard</span>
                                                    <div className="csc-dep-detail">
                                                        {svStatus?.installed ? (
                                                            <a href={createURL(`/app/${streamVizApp.app_id}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`Open ${streamVizApp.display_name}`}>{streamVizApp.display_name}</a>
                                                        ) : (
                                                            <span className="csc-dep-name">{streamVizApp.display_name}</span>
                                                        )}
                                                        <span className="csc-dep-appid">{streamVizApp.app_id}</span>
                                                        <span className="csc-split-pill">
                                                            {streamVizApp.uid && (
                                                                <a href={generateSplunkbaseUrl(streamVizApp.uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                                    Splunkbase
                                                                </a>
                                                            )}
                                                            {stream_docs_url && (
                                                                <a href={stream_docs_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Stream documentation">
                                                                    Docs
                                                                </a>
                                                            )}
                                                        </span>
                                                        {svStatus?.version && <span className="csc-dep-version">v{svStatus.version}</span>}
                                                        {!svStatus?.installed && <span className="csc-dep-status-missing">not installed</span>}
                                                    </div>
                                                </>
                                            );
                                        })()}
                                        {netflow_config_notes && netflow_config_notes.length > 0 && (
                                            <details className="csc-dep-details" style={{marginTop: 6}}>
                                                <summary className="csc-dep-details-summary">
                                                    Configuration Notes ({netflow_config_notes.length})
                                                </summary>
                                                <div className="csc-dep-details-body">
                                                    <ul className="csc-sc4s-config-list">
                                                        {netflow_config_notes.map((note, i) => (
                                                            <li key={i}>{note}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                </details>
                                </>
                            )}

                            {/* ── Legacy Apps (shown only if installed) ── */}
                            {legacyInstalled.length > 0 && (
                                <>
                                <hr className="csc-dep-divider" />
                                <details className="csc-dep-details scan-legacy-section">
                                    <summary className="csc-dep-details-summary scan-legacy-summary">
                                        Legacy ({legacyInstalled.length} installed)
                                    </summary>
                                    <div className="csc-dep-details-body">
                                        <div className="scan-legacy-note">
                                            {addon_label || addon ? (
                                                <>{addon_label || addon} supersedes these add-ons. Safe to keep alongside.</>
                                            ) : (
                                                <>These legacy add-ons are installed but have been superseded.</>
                                            )}
                                        </div>
                                        {legacyInstalled.map(uid => {
                                            const sb = splunkbaseData && splunkbaseData[uid];
                                            if (!sb) return null;
                                            const legStatus = installedApps[sb.appid];
                                            return (
                                                <div className="csc-dep-detail" key={uid}>
                                                    <span className="csc-dep-name">{sb.title || sb.appid}</span>
                                                    <span className="csc-dep-appid">{sb.appid}</span>
                                                    <span className="csc-split-pill">
                                                        <a href={generateSplunkbaseUrl(uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">
                                                            Splunkbase
                                                        </a>
                                                    </span>
                                                    {legStatus?.version && <span className="csc-dep-version">v{legStatus.version}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                                </>
                            )}

                            {/* ── Splunkbase Compatibility (collapsible) ── */}
                            {splunkbaseData && (() => {
                                const uids = [addon_splunkbase_uid, app_viz_splunkbase_uid, app_viz_2_splunkbase_uid].filter(Boolean);
                                const compatEntries = uids.map(uid => {
                                    const entry = splunkbaseData[uid];
                                    return entry ? { ...entry, uid } : null;
                                }).filter(Boolean);
                                if (compatEntries.length === 0) return null;
                                return (
                                    <>
                                    <hr className="csc-dep-divider" />
                                    <details className="csc-dep-details">
                                        <summary className="csc-dep-details-summary">
                                            Compatibility ({compatEntries.length})
                                        </summary>
                                        <div className="csc-dep-details-body">
                                            {compatEntries.map((entry, idx) => {
                                                const versions = sortVersionsDesc(
                                                    entry.version_compatibility.split(/[|,]/).map(v => v.trim()).filter(Boolean)
                                                );
                                                const platforms = entry.product_compatibility
                                                    .split(/[|,]/).map(v => v.trim()).filter(Boolean);
                                                return (
                                                    <div key={entry.uid || idx} className="csc-compat-entry">
                                                        {compatEntries.length > 1 && entry.title && (
                                                            <span className="csc-dep-label">{entry.title}</span>
                                                        )}
                                                        {entry.app_version && (
                                                            <div className="csc-compat-row">
                                                                <span className="csc-compat-label">Latest Version</span>
                                                                <span className="csc-compat-value">v{entry.app_version}</span>
                                                            </div>
                                                        )}
                                                        {platforms.length > 0 && (
                                                            <div className="csc-compat-row">
                                                                <span className="csc-compat-label">Platform</span>
                                                                <span className="csc-compat-value">{platforms.join(', ')}</span>
                                                            </div>
                                                        )}
                                                        {versions.length > 0 && (
                                                            <div className="csc-compat-row">
                                                                <span className="csc-compat-label">Splunk Versions</span>
                                                                <span className="csc-compat-value">{versions.join(', ')}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </details>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* ── Sourcetype data validation ── */}
            {sourcetypeInfo && !sourcetypeInfo.hasData && appStatus?.installed && (
                <div className="csc-data-warning">
                    <div className="csc-data-warn-summary" onClick={() => setDataWarnExpanded((v) => !v)} role="button" tabIndex={0}>
                        <span>No data detected (7d)</span>
                        <span className="csc-dep-toggle">
                            {dataWarnExpanded ? 'Hide' : 'Details'} <ChevronDown style={{marginLeft: 4, transform: dataWarnExpanded ? 'rotate(180deg)' : 'rotate(0deg)', verticalAlign: -3}} />
                        </span>
                    </div>
                    {dataWarnExpanded && (
                        <div className="csc-data-warn-details">
                            <span>This may not be conclusive. Verify your data inputs and check whether the expected sourcetypes exist in your environment.</span>
                            {sourcetypeSearchUrl && (
                                <a href={sourcetypeSearchUrl} target="_blank" rel="noopener noreferrer" className="csc-sourcetype-link">
                                    Click to check sourcetypes in Search
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
                            {stExpanded ? 'Hide' : 'Show'} <ChevronDown style={{marginLeft: 4, transform: stExpanded ? 'rotate(180deg)' : 'rotate(0deg)', verticalAlign: -3}} />
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
                        <span>Unofficial add-on installed ({communityInstalled.length})</span>
                        <span className="csc-dep-toggle">
                            {communityExpanded ? 'Hide' : 'Details'} <ChevronDown style={{marginLeft: 4, transform: communityExpanded ? 'rotate(180deg)' : 'rotate(0deg)', verticalAlign: -3}} />
                        </span>
                    </div>
                    {communityExpanded && (
                        <div className="csc-community-details">
                            {communityInstalled.map(uid => {
                                const sb = splunkbaseData && splunkbaseData[uid];
                                const title = sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`;
                                return (
                                <div key={uid} className="csc-community-warning-app">
                                    <span>{title}</span>
                                    <a href={generateSplunkbaseUrl(uid)} target="_blank" rel="noopener noreferrer" className="csc-community-warning-link">Splunkbase</a>
                                </div>
                                );
                            })}
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
                {!isComingSoon && isConfigured && appStatus?.installed && appStatus?.updateVersion && (addon_install_url || addon_splunkbase_uid) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : generateSplunkbaseUrl(addon_splunkbase_uid)} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${addon_label || addon} to v${appStatus.updateVersion}`}>
                        ↑ Add-on
                    </a>
                )}
                {/* Upgrade Viz App */}
                {!isComingSoon && isConfigured && vizAppStatus?.installed && vizAppStatus?.updateVersion && (app_viz_install_url || app_viz_splunkbase_uid) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : generateSplunkbaseUrl(app_viz_splunkbase_uid)} target="_blank" rel="noopener noreferrer"
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
                {!isComingSoon && isConfigured && addon && !appStatus?.installed && (addon_install_url || addon_splunkbase_uid) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : generateSplunkbaseUrl(addon_splunkbase_uid)}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!addon_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!addon_install_url
                            ? `Not available in Browse More Apps — download ${addon_label || addon} from Splunkbase`
                            : `Install ${addon_label || addon}`}>
                        'Add-on'
                    </a>
                )}
                {/* Install Viz App */}
                {!isComingSoon && isConfigured && app_viz && !vizAppStatus?.installed && (app_viz_install_url || app_viz_splunkbase_uid) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : generateSplunkbaseUrl(app_viz_splunkbase_uid)}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!app_viz_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!app_viz_install_url
                            ? `Not available in Browse More Apps — download ${app_viz_label || app_viz} from Splunkbase`
                            : `Install ${app_viz_label || app_viz}`}>
                        'App'
                    </a>
                )}
                {/* Install Viz App 2 */}
                {!isComingSoon && isConfigured && app_viz_2 && !vizApp2Status?.installed && (app_viz_2_install_url || app_viz_2_splunkbase_uid) && (
                    <a href={app_viz_2_install_url ? createURL(app_viz_2_install_url) : generateSplunkbaseUrl(app_viz_2_splunkbase_uid)}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!app_viz_2_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!app_viz_2_install_url
                            ? `Not available in Browse More Apps — download ${app_viz_2_label || app_viz_2} from Splunkbase`
                            : `Install ${app_viz_2_label || app_viz_2}`}>
                        'App 2'
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
                        ><ChevronDown size={14} /></button>
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
                {!isComingSoon && !isConfigured && !coverage_gap && (
                    <button className="csc-btn csc-btn-green" onClick={() => onToggleConfigured(product_id)}
                        title="Add to My Products">
                        <Plus style={{marginRight: 4}} /> Add
                    </button>
                )}
                {/* Best Practices */}
                {!isComingSoon && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onShowBestPractices(product)}
                        title="Best Practices">
                        <QuestionCircle size={16} />
                    </button>
                )}
                {/* Remove */}
                {!isComingSoon && isConfigured && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onToggleConfigured(product_id)}
                        title="Remove from My Products">
                        <Close size={16} />
                    </button>
                )}
                {/* Dev Mode — view config */}
                {devMode && onViewConfig && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline csc-btn-devmode"
                        onClick={() => onViewConfig(product_id)}
                        title="View product config (Dev Mode)">
                        <Code size={16} />
                    </button>
                )}
                {isComingSoon && (
                    <span className="csc-coming-soon-badge">Coming Soon</span>
                )}
            </div>

            {/* ── Custom Dashboard Modal ── */}
            {customDashModalOpen && (
                <Modal open returnFocus={launchBtnRef} onRequestClose={() => { setCustomDashModalOpen(false); setCustomDashMsg(null); }} style={{ maxWidth: '640px', width: '92vw' }}>
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

            {/* ── SC4S / NetFlow / HF / SOAR / ITSI Modals (rendered outside details so they can open from header) ── */}
            {sc4s_url && <SC4SInfoModal open={sc4sInfoOpen} onClose={() => setSc4sInfoOpen(false)} />}
            {netflow_supported && <NetFlowInfoModal open={netflowInfoOpen} onClose={() => setNetflowInfoOpen(false)} />}
            <HFInfoModal open={hfInfoOpen} onClose={() => setHfInfoOpen(false)} isCloud={platformType === 'cloud'} />
            <MagicSixModal open={magicSixOpen} onClose={() => setMagicSixOpen(false)} sourcetypes={product.sourcetypes} productName={display_name} addonApp={addon} />
            {hasSoar && <SOARInfoModal open={soarInfoOpen} onClose={() => setSoarInfoOpen(false)} soarConnectorUids={soar_connector_uids} splunkbaseData={splunkbaseData} productName={display_name} />}
            {hasItsi && <ITSIInfoModal open={itsiInfoOpen} onClose={() => setItsiInfoOpen(false)} itsiContentPack={itsi_content_pack} productName={display_name} />}
            {hasEs && <ESInfoModal open={esInfoOpen} onClose={() => setEsInfoOpen(false)} productName={display_name} cimDataModels={es_cim_data_models} escuStories={escu_analytic_stories} escuDetectionCount={escu_detection_count} escuDetections={escu_detections} />}

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
            'addon', 'addon_label', 'addon_family', 'addon_splunkbase_uid',
            'addon_docs_url', 'addon_troubleshoot_url', 'addon_install_url',
            'app_viz', 'app_viz_label', 'app_viz_splunkbase_uid', 'app_viz_docs_url',
            'app_viz_troubleshoot_url', 'app_viz_install_url',
            'app_viz_2', 'app_viz_2_label', 'app_viz_2_splunkbase_uid',
            'app_viz_2_docs_url', 'app_viz_2_install_url',
            'learn_more_url',
            'support_level', 'icon_emoji', 'sort_order',
            'sc4s_url', 'sc4s_label', 'sc4s_search_head_ta', 'sc4s_search_head_ta_label',
            'sc4s_search_head_ta_splunkbase_id',
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
        // Legacy UIDs
        if (p.legacy_uids && p.legacy_uids.length) {
            lines.push(`legacy_uids = ${p.legacy_uids.join(',')}`);
        }
        // Prereq apps — removed (Stream prereqs are now in the NetFlow tab, canary prereqs removed)
        // Community UIDs
        if (p.community_uids && p.community_uids.length) {
            lines.push(`community_uids = ${p.community_uids.join(',')}`);
        }
        // SOAR connector UIDs (comma-separated)
        if (p.soar_connector_uids && p.soar_connector_uids.length) {
            lines.push(`soar_connector_uids = ${p.soar_connector_uids.join(',')}`);
        }
        // Alert action UIDs (comma-separated)
        if (p.alert_action_uids && p.alert_action_uids.length) {
            lines.push(`alert_action_uids = ${p.alert_action_uids.join(',')}`);
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

function ConfigViewerModal({ open, onClose, products, initialProductId, installedApps, appStatuses, sourcetypeData, splunkbaseData }) {
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
                legacy_installed: (p.legacy_uids || []).filter(uid => {
                    const sb = splunkbaseData && splunkbaseData[uid];
                    return sb && sb.appid && installedApps[sb.appid];
                }).map(uid => {
                    const sb = splunkbaseData && splunkbaseData[uid];
                    return sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`;
                }),
                community_installed: (p.community_uids || []).filter(uid => {
                    const sb = splunkbaseData && splunkbaseData[uid];
                    return sb && sb.appid && installedApps[sb.appid];
                }).map(uid => {
                    const sb = splunkbaseData && splunkbaseData[uid];
                    return sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`;
                }),
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
                            <button className="csc-devmode-search-clear" onClick={() => setTreeSearch('')}><Close size={16} /></button>
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
    // Python libraries (from PyPI / GitHub)
    'splunklib (Splunk SDK)': '2.1.1',
    'requests': '2.32.5',
};

/**
 * Python libraries bundled with / used by SCAN.
 * These are NOT in package.json so they are listed separately.
 */
const PYTHON_LIBRARY_VERSIONS = {
    'splunklib (Splunk SDK)': '2.1.1',   // bundled in bin/splunklib/
    'requests': '2.31.0',               // ships with Splunk Python
};

const LATEST_VERSIONS_CHECKED = '2026-03-05';

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

    // Python libraries (not in package.json — hardcoded)
    const pythonDeps = [];
    Object.entries(PYTHON_LIBRARY_VERSIONS).forEach(([name, version]) => {
        const entry = { name, current: version };
        entry.latest = KNOWN_LATEST_VERSIONS[name] || null;
        entry.cmp = entry.latest ? compareSemver(version, entry.latest) : 0;
        pythonDeps.push(entry);
    });

    // Sort: outdated first, then alphabetical
    const sortDeps = (arr) => arr.sort((a, b) => (a.cmp || 0) - (b.cmp || 0) || a.name.localeCompare(b.name));
    sortDeps(splunkDeps);
    sortDeps(reactDeps);
    sortDeps(buildDeps);
    sortDeps(pythonDeps);

    const allDeps = [...splunkDeps, ...reactDeps, ...buildDeps, ...pythonDeps];
    const allTracked = allDeps.filter(d => d.latest);
    const allOutdated = allTracked.filter(d => d.cmp < 0).length;
    const allCurrent = allTracked.filter(d => d.cmp >= 0).length;

    const handleCopy = () => {
        const lines = ['# SCAN Tech Stack', ''];
        const addSection = (title, arr) => {
            lines.push(`## ${title}`);
            arr.forEach(d => {
                const status = d.latest ? (d.cmp < 0 ? 'OUTDATED' : d.cmp > 0 ? 'AHEAD' : 'CURRENT') : '';
                lines.push(`  ${d.name}: ${d.current}${d.latest ? ` → latest ${d.latest} ${status}` : ''}`);
            });
            lines.push('');
        };
        addSection('Splunk UI Packages', splunkDeps);
        addSection('React / UI Framework', reactDeps);
        addSection('Build Tools', buildDeps);
        addSection('Python Libraries', pythonDeps);
        const text = lines.join('\n');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
        }
    };

    if (!open) return null;

    const renderRow = (d) => {
        const statusIcon = d.latest
            ? (d.cmp < 0 ? 'Outdated' : d.cmp > 0 ? 'Ahead' : 'Current')
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
                <h4 className="scan-ts-section-title">{title}</h4>
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
            <Modal.Header title="Tech Stack — Developer Mode" />
            <Modal.Body>
                <div className="scan-ts-summary">
                    <span className="scan-ts-summary-pill scan-ts-summary-current">{allCurrent} current</span>
                    {allOutdated > 0 && <span className="scan-ts-summary-pill scan-ts-summary-outdated">{allOutdated} outdated</span>}
                    <span className="scan-ts-summary-pill scan-ts-summary-total">{allDeps.length} total deps</span>
                    <button className="csc-devmode-copy" onClick={handleCopy} style={{ marginLeft: 'auto' }}>
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                {renderSection('Splunk UI Packages', '', splunkDeps)}
                {renderSection('React / UI Framework', '', reactDeps)}
                {renderSection('Build Tools', '', buildDeps)}
                {renderSection('Python Libraries', '', pythonDeps)}
                <div className="scan-ts-footer-note">
                    Splunk UI versions from <a href="https://splunkui.splunk.com/Packages" target="_blank" rel="noopener noreferrer">splunkui.splunk.com/Packages</a> · JS from <a href="https://www.npmjs.com" target="_blank" rel="noopener noreferrer">npmjs.com</a> · Python from <a href="https://pypi.org" target="_blank" rel="noopener noreferrer">PyPI</a> · Last checked {LATEST_VERSIONS_CHECKED}
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
                <div style={{
                    position: 'absolute', left: '12px', top: '50%',
                    transform: 'translateY(-50%)', pointerEvents: 'none',
                    color: 'var(--faint-color, #888)', display: 'flex'
                }}>
                    <Search size={16} />
                </div>
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
                        width: '100%', padding: '10px 36px 10px 36px',
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
                            border: 'none', cursor: 'pointer',
                            color: 'var(--faint-color, #888)', padding: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        title="Clear search"
                    ><Close size={16} /></button>
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
                                {kw}
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
                    ? resultCount < totalCount ? `${resultCount} of ${totalCount} products` : `${totalCount} products`
                    : ''}
            </span>
        </div>
    );
}

// ──────────────────────  FILTER DRAWER  ─────────────────────

/**
 * Slide-out sidebar panel (right edge) that houses ALL advanced filters.
 * Replaces the inline Advanced panel in CategoryFilterBar.
 * Sections: Cross-Cutting, Support Level, Visibility, Onboarding, Compatibility, Powered By.
 */
function FilterDrawer({
    open, onClose,
    selectedCategory, onSelectCategory,
    supportLevelFilter, onSelectSupportLevel,
    showRetired, onToggleShowRetired,
    showDeprecated, onToggleShowDeprecated,
    showComingSoon, onToggleShowComingSoon,
    showGtmRoadmap, onToggleShowGtmRoadmap,
    streamFilter, onToggleStreamFilter,
    sc4sFilter, onToggleSc4sFilter,
    platformFilter, onSelectPlatform,
    versionFilter, onSelectVersion,
    splunkbaseData,
    csvSyncStatus, csvSyncMessage, onSyncSplunkbase,
    selectedAddon, onSelectAddon,
    products, allProducts, preAddonProducts, categoryCounts,
    showFullPortfolio, versionFilterMode, onToggleVersionFilterMode,
    platformFilterMode, onTogglePlatformFilterMode,
    appidToUidMap,
}) {
    /* ── Helper: apply platform/version compat filters ── */
    const applyCompatFilters = (list) => {
        let result = list;
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (platformFilterMode === 'include') {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            } else {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true;
                    return !uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            }
        }
        if (versionFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (versionFilterMode === 'include') {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.version_compatibility) return false;
                        const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                        return versionFilter.some(vf => versions.includes(vf));
                    });
                });
            } else {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    return !uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.version_compatibility) return false;
                        const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                        return versionFilter.some(vf => versions.includes(vf));
                    });
                });
            }
        }
        return result;
    };

    /* ── Counter logic (replicated from old Advanced panel) ── */
    const rawBase = applyCompatFilters(allProducts || products);
    const portfolioBase = showFullPortfolio
        ? rawBase
        : rawBase.filter(p => SUPPORTED_LEVELS.has(p.support_level) && p.status !== 'under_development');

    let catBase = portfolioBase;
    if (selectedCategory === 'soar') catBase = catBase.filter(p => p.soar_connector_uids && p.soar_connector_uids.length > 0);
    else if (selectedCategory === 'alert_actions') catBase = catBase.filter(p => p.alert_action_uids && p.alert_action_uids.length > 0);
    else if (selectedCategory === 'secure_networking') catBase = catBase.filter(p => p.secure_networking_gtm);
    else if (selectedCategory === 'ai_powered') catBase = catBase.filter(p => p.ai_enabled);
    else if (selectedCategory) catBase = catBase.filter(p => p.category === selectedCategory);

    /* Support counts */
    let supportCountBase = catBase;
    if (!showRetired) supportCountBase = supportCountBase.filter(p => p.status !== 'retired');
    if (!showDeprecated) supportCountBase = supportCountBase.filter(p => p.status !== 'deprecated');
    if (!showComingSoon) supportCountBase = supportCountBase.filter(p => p.status !== 'under_development');
    if (!showGtmRoadmap) supportCountBase = supportCountBase.filter(p => !p.coverage_gap);
    if (streamFilter) supportCountBase = supportCountBase.filter(p => p.netflow_supported);
    if (sc4sFilter) supportCountBase = supportCountBase.filter(p => p.sc4s_supported);
    const supportCounts = {
        cisco_supported: supportCountBase.filter(p => p.support_level === 'cisco_supported').length,
        splunk_supported: supportCountBase.filter(p => p.support_level === 'splunk_supported').length,
        developer_supported: supportCountBase.filter(p => p.support_level === 'developer_supported').length,
        not_supported: supportCountBase.filter(p => p.support_level === 'not_supported').length,
    };
    const supportTotal = supportCountBase.length;

    /* Visibility counts */
    let visCountBase = catBase;
    if (supportLevelFilter.length > 0) visCountBase = visCountBase.filter(p => supportLevelFilter.includes(p.support_level));
    if (streamFilter) visCountBase = visCountBase.filter(p => p.netflow_supported);
    if (sc4sFilter) visCountBase = visCountBase.filter(p => p.sc4s_supported);
    const retiredCount = visCountBase.filter(p => p.status === 'retired').length;
    const deprecatedCount = visCountBase.filter(p => p.status === 'deprecated').length;
    const comingSoonCount = visCountBase.filter(p => p.status === 'under_development').length;
    const gtmRoadmapCount = visCountBase.filter(p => p.coverage_gap).length;

    /* Onboarding counts */
    let onboardingBase = catBase;
    if (supportLevelFilter.length > 0) onboardingBase = onboardingBase.filter(p => supportLevelFilter.includes(p.support_level));
    if (!showRetired) onboardingBase = onboardingBase.filter(p => p.status !== 'retired');
    if (!showDeprecated) onboardingBase = onboardingBase.filter(p => p.status !== 'deprecated');
    if (!showComingSoon) onboardingBase = onboardingBase.filter(p => p.status !== 'under_development');
    if (!showGtmRoadmap) onboardingBase = onboardingBase.filter(p => !p.coverage_gap);
    const streamCount = (sc4sFilter ? onboardingBase.filter(p => p.sc4s_supported) : onboardingBase).filter(p => p.netflow_supported).length;
    const sc4sCount = (streamFilter ? onboardingBase.filter(p => p.netflow_supported) : onboardingBase).filter(p => p.sc4s_supported).length;

    /* Cross-cutting counts */
    const soarCount = categoryCounts?.soar || 0;
    const alertCount = categoryCounts?.alert_actions || 0;
    const secNetCount = categoryCounts?.secure_networking || 0;
    const aiPoweredCount = categoryCounts?.ai_powered || 0;

    /* Compatibility version list */
    const versionList = (() => {
        if (!splunkbaseData || Object.keys(splunkbaseData).length === 0) return [];
        const productUidSet = new Set();
        (allProducts || []).forEach(p => { 
            getAllProductUids(p, appidToUidMap).forEach(uid => productUidSet.add(uid)); 
        });
        const cardVersions = new Set();
        productUidSet.forEach(uid => {
            const entry = splunkbaseData[uid];
            if (entry && entry.version_compatibility) {
                entry.version_compatibility.split(/[|,]/).map(v => v.trim()).filter(Boolean).forEach(v => {
                    const major = parseFloat(v);
                    if (!isNaN(major)) cardVersions.add(v);
                });
            }
        });
        return sortVersionsDesc([...cardVersions]);
    })();

    /* Addon (Powered By) groups — derived from preAddonProducts for faceted counts */
    const addonSource = preAddonProducts || products;
    const addonGroups = useMemo(() => {
        const map = {};
        let standalone = 0;
        let sc4sOnly = 0;
        (addonSource || []).forEach((p) => {
            if (!p.addon) {
                if (p.sc4s_supported) { sc4sOnly++; } else { standalone++; }
                return;
            }
            if (!map[p.addon]) map[p.addon] = { label: p.addon_label || p.addon, count: 0 };
            map[p.addon].count++;
        });
        const entries = Object.entries(map)
            .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label));
        if (sc4sOnly > 0) entries.push(['__sc4s__', { label: 'SC4S Only', count: sc4sOnly }]);
        if (standalone > 0) entries.push(['__standalone__', { label: 'Standalone', count: standalone }]);
        return entries;
    }, [addonSource]);

    const isCrossCutting = (cat) => ['soar', 'alert_actions', 'secure_networking', 'ai_powered'].includes(cat);
    const addonTotal = (addonSource || []).length;

    return (
        <>
            {open && <div className="scan-drawer-overlay" onClick={onClose} />}
            <div className={`scan-drawer ${open ? 'scan-drawer-open' : ''}`}>
                <div className="scan-drawer-header">
                    <span className="scan-drawer-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                        Filters
                    </span>
                    <button className="scan-drawer-close" onClick={onClose} title="Close filters">✕</button>
                </div>
                <div className="scan-drawer-body">

                    {/* ── Cross-Cutting Filters ── */}
                    <div className="scan-drawer-section">
                        <div className="scan-drawer-section-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                            Cross-Cutting
                        </div>
                        <div className="scan-drawer-pill-grid">
                            {secNetCount > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'secure_networking' ? 'scan-drawer-pill-secnet-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'secure_networking' ? null : 'secure_networking'); }}
                                    title="Cisco Secure Networking GTM"
                                >
                                    Secure Networking
                                    <span className="scan-drawer-pill-count">{secNetCount}</span>
                                </button>
                            )}
                            {soarCount > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'soar' ? 'scan-drawer-pill-soar-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'soar' ? null : 'soar'); }}
                                    title="Products with Splunk SOAR connectors"
                                >
                                    SOAR
                                    <span className="scan-drawer-pill-count">{soarCount}</span>
                                </button>
                            )}
                            {alertCount > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'alert_actions' ? 'scan-drawer-pill-alert-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'alert_actions' ? null : 'alert_actions'); }}
                                    title="Products with custom alert actions"
                                >
                                    Alert Actions
                                    <span className="scan-drawer-pill-count">{alertCount}</span>
                                </button>
                            )}
                            {aiPoweredCount > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'ai_powered' ? 'scan-drawer-pill-ai-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'ai_powered' ? null : 'ai_powered'); }}
                                    title="Products leveraging AI/ML technologies"
                                >
                                    AI-Powered
                                    <span className="scan-drawer-pill-count">{aiPoweredCount}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="scan-drawer-divider" />

                    {/* ── Support Level ── */}
                    <div className="scan-drawer-section">
                        <div className="scan-drawer-section-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            Support Level
                        </div>
                        <div className="scan-drawer-pill-grid">
                            <button
                                className={`scan-drawer-pill ${supportLevelFilter.length === 0 ? 'scan-drawer-pill-active' : ''}`}
                                onClick={() => onSelectSupportLevel(null)}
                            >
                                All <span className="scan-drawer-pill-count">{supportTotal}</span>
                            </button>
                            <button
                                className={`scan-drawer-pill ${supportLevelFilter.includes('cisco_supported') ? 'scan-drawer-pill-cisco-active' : ''}`}
                                onClick={() => onSelectSupportLevel('cisco_supported')}
                                title="Toggle Cisco-supported products"
                            >
                                Cisco <span className="scan-drawer-pill-count">{supportCounts.cisco_supported}</span>
                            </button>
                            <button
                                className={`scan-drawer-pill ${supportLevelFilter.includes('splunk_supported') ? 'scan-drawer-pill-splunk-active' : ''}`}
                                onClick={() => onSelectSupportLevel('splunk_supported')}
                                title="Toggle Splunk-supported products"
                            >
                                Splunk <span className="scan-drawer-pill-count">{supportCounts.splunk_supported}</span>
                            </button>
                            <button
                                className={`scan-drawer-pill ${supportLevelFilter.includes('developer_supported') ? 'scan-drawer-pill-dev-active' : ''}`}
                                onClick={() => onSelectSupportLevel('developer_supported')}
                                title="Toggle Developer-supported products"
                            >
                                Developer <span className="scan-drawer-pill-count">{supportCounts.developer_supported}</span>
                            </button>
                            <button
                                className={`scan-drawer-pill ${supportLevelFilter.includes('not_supported') ? 'scan-drawer-pill-unsupported-active' : ''}`}
                                onClick={() => onSelectSupportLevel('not_supported')}
                                title="Toggle unsupported products"
                            >
                                Unsupported <span className="scan-drawer-pill-count">{supportCounts.not_supported}</span>
                            </button>
                        </div>
                    </div>
                    <div className="scan-drawer-divider" />

                    {/* ── Visibility ── */}
                    <div className="scan-drawer-section">
                        <div className="scan-drawer-section-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            Visibility
                        </div>
                        <div className="scan-drawer-vis-list">
                            <button
                                className={`scan-drawer-vis-item ${showRetired ? 'scan-drawer-vis-on' : 'scan-drawer-vis-off'}`}
                                onClick={() => onToggleShowRetired(!showRetired)}
                                title={showRetired ? 'Retired products are shown — click to hide' : 'Retired products are hidden — click to show'}
                            >
                                <div className="scan-drawer-vis-left">
                                    <div className="scan-drawer-vis-icon" style={{ background: '#92400e' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
                                    </div>
                                    <span className="scan-drawer-vis-label">Retired</span>
                                </div>
                                <span className="scan-drawer-vis-count">{retiredCount}</span>
                            </button>
                            <button
                                className={`scan-drawer-vis-item ${showDeprecated ? 'scan-drawer-vis-on' : 'scan-drawer-vis-off'}`}
                                onClick={() => onToggleShowDeprecated(!showDeprecated)}
                                title={showDeprecated ? 'Deprecated products are shown — click to hide' : 'Deprecated products are hidden — click to show'}
                            >
                                <div className="scan-drawer-vis-left">
                                    <div className="scan-drawer-vis-icon" style={{ background: '#d97706' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    </div>
                                    <span className="scan-drawer-vis-label">Deprecated</span>
                                </div>
                                <span className="scan-drawer-vis-count">{deprecatedCount}</span>
                            </button>
                            <button
                                className={`scan-drawer-vis-item ${showComingSoon ? 'scan-drawer-vis-on' : 'scan-drawer-vis-off'}`}
                                onClick={() => onToggleShowComingSoon(!showComingSoon)}
                                title={showComingSoon ? 'Coming Soon products are shown — click to hide' : 'Coming Soon products are hidden — click to show'}
                            >
                                <div className="scan-drawer-vis-left">
                                    <div className="scan-drawer-vis-icon" style={{ background: '#dbeafe' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/></svg>
                                    </div>
                                    <span className="scan-drawer-vis-label">Coming Soon</span>
                                </div>
                                <span className="scan-drawer-vis-count">{comingSoonCount}</span>
                            </button>
                            {gtmRoadmapCount > 0 && (
                                <button
                                    className={`scan-drawer-vis-item ${showGtmRoadmap ? 'scan-drawer-vis-on' : 'scan-drawer-vis-off'}`}
                                    onClick={() => onToggleShowGtmRoadmap(!showGtmRoadmap)}
                                    title={showGtmRoadmap ? 'GTM Roadmap products are shown — click to hide' : 'GTM Roadmap products are hidden — click to show'}
                                >
                                    <div className="scan-drawer-vis-left">
                                        <div className="scan-drawer-vis-icon" style={{ background: '#fee2e2' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                                        </div>
                                        <span className="scan-drawer-vis-label">GTM Roadmap</span>
                                    </div>
                                    <span className="scan-drawer-vis-count">{gtmRoadmapCount}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="scan-drawer-divider" />

                    {/* ── Onboarding ── */}
                    {(streamCount > 0 || sc4sCount > 0) && (
                        <>
                            <div className="scan-drawer-section">
                                <div className="scan-drawer-section-title">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                    Onboarding Path
                                </div>
                                <div className="scan-drawer-pill-grid">
                                    {sc4sCount > 0 && (
                                        <button
                                            className={`scan-drawer-pill ${sc4sFilter ? 'scan-drawer-pill-sc4s-active' : ''}`}
                                            onClick={() => onToggleSc4sFilter(!sc4sFilter)}
                                            title={sc4sFilter ? 'Showing SC4S products — click to clear' : 'Show only SC4S-supported products'}
                                        >
                                            SC4S <span className="scan-drawer-pill-count">{sc4sCount}</span>
                                        </button>
                                    )}
                                    {streamCount > 0 && (
                                        <button
                                            className={`scan-drawer-pill ${streamFilter ? 'scan-drawer-pill-stream-active' : ''}`}
                                            onClick={() => onToggleStreamFilter(!streamFilter)}
                                            title={streamFilter ? 'Showing NetFlow products — click to clear' : 'Show only NetFlow-supported products'}
                                        >
                                            NetFlow <span className="scan-drawer-pill-count">{streamCount}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="scan-drawer-divider" />
                        </>
                    )}

                    {/* ── Compatibility ── */}
                    {splunkbaseData && Object.keys(splunkbaseData).length > 0 && (
                        <>
                            <div className="scan-drawer-section">
                                <div className="scan-drawer-section-title">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                    Compatibility
                                </div>
                                <div className="scan-drawer-platform-list">
                                    <div className="scan-drawer-version-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                            <span className="scan-drawer-version-label">Platform</span>
                                            {platformFilter.length > 0 && (
                                                <button
                                                    onClick={() => onTogglePlatformFilterMode()}
                                                    title="Toggle between showing products WITH or WITHOUT selected platforms"
                                                    style={{
                                                        background: platformFilterMode === 'exclude' ? 'var(--warning-color, #f7931e)' : 'var(--button-bg, #e8e8e8)',
                                                        border: '1px solid ' + (platformFilterMode === 'exclude' ? 'var(--warning-border, #d4791b)' : 'var(--button-border, #999)'),
                                                        borderRadius: '4px',
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: '500',
                                                        cursor: 'pointer',
                                                        color: 'var(--page-color, #333)',
                                                        whiteSpace: 'nowrap',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {platformFilterMode === 'include' ? '✓ Include' : '✗ Exclude'}
                                                </button>
                                            )}
                                        </div>
                                        {platformFilter.length > 0 && (
                                            <button
                                                className="scan-drawer-version-clear"
                                                onClick={() => onSelectPlatform(null)}
                                                title="Clear all platform filters"
                                            >Clear ({platformFilter.length})</button>
                                        )}
                                    </div>
                                    {['Splunk Cloud', 'Splunk Enterprise'].map(pl => (
                                        <label key={pl} className={`scan-drawer-version-item ${platformFilter.includes(pl) ? 'scan-drawer-version-item-active' : ''}`}>
                                            <input type="checkbox" checked={platformFilter.includes(pl)} onChange={() => onSelectPlatform(pl)} />
                                            <span className="scan-drawer-version-text">{pl}</span>
                                        </label>
                                    ))}
                                </div>
                                {versionList.length > 0 && (() => {
                                    const vGroups = {};
                                    versionList.forEach(v => { const m = v.split('.')[0]; if (!vGroups[m]) vGroups[m] = []; vGroups[m].push(v); });
                                    const gKeys = Object.keys(vGroups).sort((a, b) => parseInt(b) - parseInt(a));
                                    return (
                                        <div className="scan-drawer-version-list">
                                            <div className="scan-drawer-version-header">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                                    <span className="scan-drawer-version-label">Splunk Version</span>
                                                    {versionFilter.length > 0 && (
                                                        <button
                                                            onClick={() => onToggleVersionFilterMode()}
                                                            title="Toggle between showing products WITH or WITHOUT selected versions"
                                                            style={{
                                                                background: versionFilterMode === 'exclude' ? 'var(--warning-color, #f7931e)' : 'var(--button-bg, #e8e8e8)',
                                                                border: '1px solid ' + (versionFilterMode === 'exclude' ? 'var(--warning-border, #d4791b)' : 'var(--button-border, #999)'),
                                                                borderRadius: '4px',
                                                                padding: '4px 8px',
                                                                fontSize: '11px',
                                                                fontWeight: '500',
                                                                cursor: 'pointer',
                                                                color: 'var(--page-color, #333)',
                                                                whiteSpace: 'nowrap',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            {versionFilterMode === 'include' ? '✓ Include' : '✗ Exclude'}
                                                        </button>
                                                    )}
                                                </div>
                                                {versionFilter.length > 0 && (
                                                    <button
                                                        className="scan-drawer-version-clear"
                                                        onClick={() => onSelectVersion(null)}
                                                        title="Clear all version filters"
                                                    >Clear ({versionFilter.length})</button>
                                                )}
                                            </div>
                                            {gKeys.map((major, gi) => (
                                                <div key={major} className="scan-drawer-version-group">
                                                    <div className="scan-drawer-version-group-label">{major}.x</div>
                                                    {vGroups[major].map(v => (
                                                        <label key={v} className={`scan-drawer-version-item ${versionFilter.includes(v) ? 'scan-drawer-version-item-active' : ''}`}>
                                                            <input type="checkbox" checked={versionFilter.includes(v)} onChange={() => onSelectVersion(v)} />
                                                            <span className="scan-drawer-version-text"><span className="scan-drawer-version-prefix">Splunk</span> {v}</span>
                                                        </label>
                                                    ))}
                                                    {gi < gKeys.length - 1 && <div className="scan-drawer-version-group-divider" />}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="scan-drawer-divider" />
                        </>
                    )}

                    {/* ── Powered By (Addon Filter) ── */}
                    {addonGroups.length > 1 && (
                        <div className="scan-drawer-section">
                            <div className="scan-drawer-section-title">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                Powered By
                            </div>
                            <div className="scan-drawer-addon-list">
                                <button
                                    className={`scan-drawer-addon-item scan-drawer-addon-all ${!selectedAddon ? 'scan-drawer-addon-item-active' : ''}`}
                                    onClick={() => onSelectAddon(null)}
                                >
                                    <span className="scan-drawer-addon-name">All</span>
                                    <span className="scan-drawer-addon-count">{addonTotal}</span>
                                </button>
                                <div className="scan-drawer-addon-divider" />
                                {addonGroups.map(([id, g]) => (
                                    <button
                                        key={id}
                                        className={`scan-drawer-addon-item ${selectedAddon === id ? 'scan-drawer-addon-item-active' : ''}`}
                                        onClick={() => onSelectAddon(selectedAddon === id ? null : id)}
                                        title={g.label}
                                    >
                                        <span className="scan-drawer-addon-name">{g.label}</span>
                                        <span className="scan-drawer-addon-count">{g.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// ──────────────────────  ACTIVE FILTER CHIPS  ─────────────────

/**
 * Compact bar below category pills showing active advanced filters as
 * removable chips. Only renders when at least one filter is active.
 */
function ActiveFilterChips({
    selectedCategory, onSelectCategory,
    supportLevelFilter, onSelectSupportLevel,
    showRetired, onToggleShowRetired,
    showDeprecated, onToggleShowDeprecated,
    showComingSoon, onToggleShowComingSoon,
    showGtmRoadmap, onToggleShowGtmRoadmap,
    streamFilter, onToggleStreamFilter,
    sc4sFilter, onToggleSc4sFilter,
    platformFilter, onSelectPlatform,
    versionFilter, onSelectVersion,
    selectedAddon, onSelectAddon,
    addonLabel,
}) {
    const chips = [];

    // Cross-cutting category filters
    const crossCutLabels = { soar: 'SOAR', alert_actions: 'Alert Actions', secure_networking: 'Secure Networking GTM', ai_powered: 'AI-Powered' };
    if (selectedCategory && crossCutLabels[selectedCategory]) {
        chips.push({ label: crossCutLabels[selectedCategory], onRemove: () => onSelectCategory(null) });
    }
    if (supportLevelFilter.length > 0) {
        const labels = { cisco_supported: 'Cisco', splunk_supported: 'Splunk', developer_supported: 'Developer', not_supported: 'Unsupported' };
        supportLevelFilter.forEach(level => {
            chips.push({ label: labels[level] || level, onRemove: () => onSelectSupportLevel(level) });
        });
    }
    if (!showRetired) chips.push({ label: 'Hide Retired', onRemove: () => onToggleShowRetired(true) });
    if (!showDeprecated) chips.push({ label: 'Hide Deprecated', onRemove: () => onToggleShowDeprecated(true) });
    if (!showComingSoon) chips.push({ label: 'Hide Coming Soon', onRemove: () => onToggleShowComingSoon(true) });
    if (!showGtmRoadmap) chips.push({ label: 'Hide GTM Roadmap', onRemove: () => onToggleShowGtmRoadmap(true) });
    if (streamFilter) chips.push({ label: 'NetFlow', onRemove: () => onToggleStreamFilter(false) });
    if (sc4sFilter) chips.push({ label: 'SC4S', onRemove: () => onToggleSc4sFilter(false) });
    if (platformFilter.length > 0) {
        platformFilter.forEach(p => {
            chips.push({ label: p, onRemove: () => onSelectPlatform(p) });
        });
    }
    if (versionFilter.length > 0) {
        versionFilter.forEach(v => {
            chips.push({ label: `Splunk ${v}`, onRemove: () => onSelectVersion(v) });
        });
    }
    if (selectedAddon) chips.push({ label: `Powered By: ${addonLabel || selectedAddon}`, onRemove: () => onSelectAddon(null) });

    if (chips.length === 0) return null;

    const clearAll = () => {
        if (crossCutLabels[selectedCategory]) onSelectCategory(null);
        onSelectSupportLevel(null);
        onToggleShowRetired(true);
        onToggleShowDeprecated(true);
        onToggleShowComingSoon(true);
        onToggleShowGtmRoadmap(true);
        onToggleStreamFilter(false);
        onToggleSc4sFilter(false);
        onSelectPlatform(null);
        onSelectVersion(null);
        onSelectAddon(null);
    };

    return (
        <div className="scan-active-chips">
            <span className="scan-active-chips-label">Active:</span>
            {chips.map((chip, i) => (
                <span key={i} className="scan-active-chip">
                    {chip.label}
                    <button className="scan-active-chip-close" onClick={chip.onRemove} title={`Remove ${chip.label} filter`}>×</button>
                </span>
            ))}
            {chips.length > 1 && (
                <button className="scan-active-chips-clear" onClick={clearAll}>Clear all</button>
            )}
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

function CategoryFilterBar({
    selectedCategory, onSelectCategory,
    selectedSubCategory, onSelectSubCategory,
    aiFilter, onToggleAiFilter,
    categoryCounts, products,
    onOpenFilterDrawer, activeFilterCount,
    platformFilter, versionFilter, splunkbaseData, versionFilterMode, platformFilterMode,
    appidToUidMap,
}) {
    // ── Helper: apply platform/version compat filters to a product list ──
    const applyCompatFilters = (list) => {
        let result = list;
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (platformFilterMode === 'include') {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            } else {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true;
                    return !uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            }
        }
        if (versionFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (versionFilterMode === 'include') {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.version_compatibility) return false;
                        const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                        return versionFilter.some(vf => versions.includes(vf));
                    });
                });
            } else {
                result = result.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    return !uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.version_compatibility) return false;
                        const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                        return versionFilter.some(vf => versions.includes(vf));
                    });
                });
            }
        }
        return result;
    };

    // Cisco official category SVG icons
    const catIconMap = { security: 'cat-security', observability: 'cat-observability', networking: 'cat-networking', collaboration: 'cat-collaboration' };
    const renderCatIcon = (catId, active) => {
        const svgName = catIconMap[catId];
        if (!svgName) return null;
        return React.createElement('img', {
            src: createURL(`/static/app/${APP_ID}/icons/${svgName}.svg`),
            alt: '',
            className: 'csc-filter-pill-icon',
            style: { width: '18px', height: '18px', filter: active ? 'brightness(0) saturate(100%) invert(15%) sepia(70%) saturate(6000%) hue-rotate(200deg)' : 'none', transition: 'filter 0.2s' },
        });
    };
    const btnStyle = (active) => ({
        display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
        padding: '7px 14px', borderRadius: '9999px', border: '1px solid',
        borderColor: active ? '#02C8FF' : '#E5E7EB',
        background: active ? '#02C8FF' : '#FFFFFF',
        color: active ? '#fff' : 'var(--page-color, #333)',
        boxShadow: 'none',
        cursor: 'pointer', fontWeight: 600, fontSize: '13px',
        transition: 'all 0.2s', flexShrink: 0,
    });

    const isCrossCutting = ['soar', 'alert_actions', 'secure_networking', 'ai_powered'].includes(selectedCategory);
    const totalCount = categoryCounts ? Object.keys(categoryCounts).reduce((sum, k) => (['soar', 'alert_actions', 'secure_networking', 'ai_powered'].includes(k)) ? sum : sum + categoryCounts[k], 0) : null;

    return (<>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollBehavior: 'smooth', alignItems: 'center' }}>
            <button onClick={() => onSelectCategory(null)} style={btnStyle(!selectedCategory)}>
                All
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
                        {cat.name}
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
            {/* ── Filters drawer trigger ── */}
            <span style={{ width: '2px', height: '28px', background: 'var(--pill-divider, #b0b0b0)', flexShrink: 0, margin: '0 4px', borderRadius: '1px' }} />
            <button
                className={`scan-filter-trigger ${activeFilterCount > 0 ? 'scan-filter-trigger-active' : ''}`}
                onClick={onOpenFilterDrawer}
                title="Open filter panel"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                Filters
                {activeFilterCount > 0 && (
                    <span className="scan-filter-trigger-badge">{activeFilterCount}</span>
                )}
            </button>
        </div>
        {/* ── Sub-category pills ── */}
        {selectedCategory && !isCrossCutting && SUB_CATEGORIES[selectedCategory] && (() => {
            const subs = SUB_CATEGORIES[selectedCategory];
            const base = applyCompatFilters(products || []);
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
                                {sub.name} <span className="csc-subcategory-count">{count}</span>
                            </button>
                        );
                    })}
                    {unassigned > 0 && (
                        <button onClick={() => onSelectSubCategory(selectedSubCategory === '__other__' ? null : '__other__')}
                            className={`csc-subcategory-pill ${selectedSubCategory === '__other__' ? 'csc-subcategory-pill-active' : ''}`}>
                            Other <span className="csc-subcategory-count">{unassigned}</span>
                        </button>
                    )}
                    {/* ── AI filter pill ── */}
                    {(() => {
                        const aiCount = catProducts.filter(p => p.ai_enabled).length;
                        if (aiCount === 0) return null;
                        return (
                            <>
                                <span style={{ borderLeft: '1.5px solid var(--card-border, #ddd)', height: '18px', margin: '0 4px' }} />
                                <button onClick={() => onToggleAiFilter(!aiFilter)}
                                    className={`csc-subcategory-pill csc-ai-pill ${aiFilter ? 'csc-ai-pill-active' : ''}`}
                                    title="Filter products that leverage AI technologies">
                                    <img src={createURL(`/static/app/${APP_ID}/icons/cat-ai.svg`)} alt="" style={{ width: '14px', height: '14px', verticalAlign: '-2px' }} /> AI-Powered <span className="csc-subcategory-count">{aiCount}</span>
                                </button>
                            </>
                        );
                    })()}
                </div>
            );
        })()}
        {/* ── AI pill for categories without sub-categories ── */}
        {selectedCategory && !isCrossCutting && !SUB_CATEGORIES[selectedCategory] && (() => {
            const base = applyCompatFilters(products || []);
            const catProducts = base.filter(p => p.category === selectedCategory);
            const aiCount = catProducts.filter(p => p.ai_enabled).length;
            if (aiCount === 0) return null;
            return (
                <div className="csc-subcategory-bar" style={{ display: 'flex', gap: '6px', marginTop: '8px', paddingLeft: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => onToggleAiFilter(!aiFilter)}
                        className={`csc-subcategory-pill csc-ai-pill ${aiFilter ? 'csc-ai-pill-active' : ''}`}
                        title="Filter products that leverage AI technologies">
                        <img src={createURL(`/static/app/${APP_ID}/icons/cat-ai.svg`)} alt="" style={{ width: '14px', height: '14px', verticalAlign: '-2px' }} /> AI-Powered <span className="csc-subcategory-count">{aiCount}</span>
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
    const [indexerApps, setIndexerApps] = useState(null);        // null (not loaded) | {} (no peers) | { appid: { version, disabled, indexerCount } }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState(null);
    const [aiFilter, setAiFilter] = useState(false);
    const [streamFilter, setStreamFilter] = useState(false);
    const [sc4sFilter, setSc4sFilter] = useState(false);
    const [selectedAddon, setSelectedAddon] = useState(null);
    const [legacyModalOpen, setLegacyModalOpen] = useState(false);
    const [legacyModalApps, setLegacyModalApps] = useState([]);
    const [bpModalOpen, setBpModalOpen] = useState(false);
    const [bpProduct, setBpProduct] = useState(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [removeAllModalOpen, setRemoveAllModalOpen] = useState(false);
    const removeAllReturnRef = useRef(null);
    const [cardLegendOpen, setCardLegendOpen] = useState(false);
    const guideReturnRef = useRef(null);
    const [appVersion, setAppVersion] = useState('');
    const [appUpdateVersion, setAppUpdateVersion] = useState('');
    const [platformType, setPlatformType] = useState('');
    const [splunkVersion, setSplunkVersion] = useState('');          // e.g. '9.3.2' or '10.2.2510.6'
    const [cloudSimulation, setCloudSimulation] = useState(false);   // DevMode: simulate Splunk Cloud
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
    const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [supportLevelFilter, setSupportLevelFilter] = useState([]);
    const [showRetired, setShowRetired] = useState(true);
    const [showDeprecated, setShowDeprecated] = useState(true);
    const [showComingSoon, setShowComingSoon] = useState(true);
    const [showGtmRoadmap, setShowGtmRoadmap] = useState(true);
    const [personaModalOpen, setPersonaModalOpen] = useState(() => {
        try { return localStorage.getItem(PERSONA_STORAGE_KEY) !== 'true'; } catch { return false; }
    });
    const [splunkbaseData, setSplunkbaseData] = useState({});    // uid → { version_compatibility, product_compatibility, app_version, title, appid }
    const [appidToUidMap, setAppidToUidMap] = useState({});      // appid (folder name) → uid (for legacy/prereq/community app lookups)
    const [splunkbaseLoaded, setSplunkbaseLoaded] = useState(false);
    const [csvSyncStatus, setCsvSyncStatus] = useState(null);    // null | 'syncing' | 'success' | 'error'
    const [csvSyncMessage, setCsvSyncMessage] = useState('');
    const [platformFilter, setPlatformFilter] = useState([]);    // [] | ['Splunk Cloud'] | ...

    /** Toggle a platform in/out of the multi-select filter. Pass null to clear all. */
    const handlePlatformToggle = (platform) => {
        if (platform === null) {
            setPlatformFilter([]);
        } else {
            setPlatformFilter(prev => prev.includes(platform)
                ? prev.filter(p => p !== platform)
                : [...prev, platform]
            );
        }
    };
    const [versionFilter, setVersionFilter] = useState([]);        // [] | ['10.2', '10.1', ...]
    const [versionFilterMode, setVersionFilterMode] = useState('include'); // 'include' | 'exclude'
    const [platformFilterMode, setPlatformFilterMode] = useState('include'); // 'include' | 'exclude'

    /** Toggle a version in/out of the multi-select filter. Pass null to clear all. */
    const handleVersionToggle = (version) => {
        if (version === null) {
            setVersionFilter([]);
        } else {
            setVersionFilter(prev => prev.includes(version)
                ? prev.filter(v => v !== version)
                : [...prev, version]
            );
        }
    };

    /** Toggle between include/exclude mode for version filter */
    const handleVersionFilterModeToggle = () => {
        setVersionFilterMode(prev => prev === 'include' ? 'exclude' : 'include');
    };

    /** Toggle between include/exclude mode for platform filter */
    const handlePlatformFilterModeToggle = () => {
        setPlatformFilterMode(prev => prev === 'include' ? 'exclude' : 'include');
    };

    // ── Cloud Simulation: when devMode + cloudSimulation, override effective platform/version ──
    const SIMULATED_CLOUD_VERSION = '10.2.2510.6';
    const effectivePlatformType = (devMode && cloudSimulation) ? 'cloud' : platformType;
    const effectiveSplunkVersion = (devMode && cloudSimulation) ? SIMULATED_CLOUD_VERSION : splunkVersion;

    /** Toggle a support level in/out of the multi-select filter. Pass null or [] to clear all. */
    const handleSupportLevelToggle = (level) => {
        if (!level || (Array.isArray(level) && level.length === 0)) {
            setSupportLevelFilter([]);
        } else {
            setSupportLevelFilter(prev => prev.includes(level)
                ? prev.filter(l => l !== level)
                : [...prev, level]
            );
        }
    };

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
                setSplunkVersion(serverContent.version || '');
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
            if (p.netflow_addon && installedApps[p.netflow_addon]) appIds.add(p.netflow_addon);
        });
        const checkAll = async () => {
            const statuses = {};
            // Pre-fill not-installed status for apps not in installedApps
            products.forEach((p) => {
                [p.addon, p.app_viz, p.app_viz_2, p.sc4s_search_head_ta, p.netflow_addon].forEach((aid) => {
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

    // ── Indexer tier detection — check add-on deployment across peer indexers ──
    useEffect(() => {
        if (loading) return;
        const detect = async () => {
            const result = await detectIndexerTierApps();
            if (result !== null) setIndexerApps(result);
        };
        detect();
    }, [loading]);

    // ── Load Splunkbase CSV data via inputlookup ──
    useEffect(() => {
        if (loading) return;
        const loadSplunkbaseData = async () => {
            try {
                const searchStr = '| inputlookup scan_splunkbase_apps | table uid appid version_compatibility product_compatibility app_version title archive_status';
                // console.log('[SCAN] Loading Splunkbase data:', searchStr);
                // Use app-namespaced endpoint so transforms.conf stanza is resolved
                const sbEndpoint = `/splunkd/__raw/servicesNS/-/${APP_ID}/search/jobs`;
                const res = await splunkFetch(sbEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `search=${encodeURIComponent(searchStr)}&output_mode=json&exec_mode=oneshot&count=0&timeout=60`,
                });
                // console.log('[SCAN] Splunkbase lookup response status:', res.status);
                if (!res.ok) { console.warn('[SCAN] Splunkbase lookup not available (not yet synced?)', res.status, res.statusText); return; }
                const data = await res.json();
                const rows = data.results || [];
                // console.log('[SCAN] Splunkbase lookup raw rows:', rows.length, 'sample:', rows.slice(0, 3));
                const lookup = {};
                const appidMap = {};
                rows.forEach(r => {
                    if (r.uid) {
                        lookup[String(r.uid)] = {
                            version_compatibility: r.version_compatibility || '',
                            product_compatibility: r.product_compatibility || '',
                            app_version: r.app_version || '',
                            title: r.title || '',
                            appid: r.appid || '',
                            status: (r.archive_status || '').startsWith('archived') ? 'archived' : (r.archive_status || 'live'),
                        };
                        if (r.appid) appidMap[r.appid] = String(r.uid);
                    }
                });
                setSplunkbaseData(lookup);
                setAppidToUidMap(appidMap);
                setSplunkbaseLoaded(true);
                // console.log(`[SCAN] Loaded ${Object.keys(lookup).length} Splunkbase entries, sample keys:`, Object.keys(lookup).slice(0, 10));
            } catch (e) {
                console.error('[SCAN] Could not load Splunkbase data:', e);
            }
        };
        loadSplunkbaseData();
    }, [loading]);

    // ── Splunkbase CSV sync handler ──
    const handleSyncSplunkbase = useCallback(async () => {
        setCsvSyncStatus('syncing');
        setCsvSyncMessage('Downloading from S3...');
        try {
            const searchStr = '| downloadsplunkbasecsv input_csv=splunkbase_assets/splunkbase_apps.csv.gz output_csv=scan_splunkbase_apps.csv.gz';
            // Use app-namespaced endpoint so the custom command is always found
            const syncEndpoint = `/splunkd/__raw/servicesNS/-/${APP_ID}/search/jobs`;
            const res = await splunkFetch(syncEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `search=${encodeURIComponent(searchStr)}&output_mode=json&exec_mode=oneshot&count=0&timeout=180`,
            });
            if (!res.ok) {
                setCsvSyncStatus('error');
                setCsvSyncMessage(`HTTP ${res.status}`);
                return;
            }
            const data = await res.json();
            const results = data.results || [];
            if (results.length > 0 && (results[0].status === 'success' || results[0].status_code === '200' || results[0].bytes_written)) {
                setCsvSyncStatus('success');
                setCsvSyncMessage(results[0].message || `Downloaded ${results[0].csv_name || 'CSV'} (${results[0].bytes_written || '?'} bytes)`);
                // Reload the Splunkbase data
                const reloadSearch = '| inputlookup scan_splunkbase_apps | table uid appid version_compatibility product_compatibility app_version title archive_status';
                const rRes = await splunkFetch(`/splunkd/__raw/servicesNS/-/${APP_ID}/search/jobs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `search=${encodeURIComponent(reloadSearch)}&output_mode=json&exec_mode=oneshot&count=0&timeout=60`,
                });
                if (rRes.ok) {
                    const rData = await rRes.json();
                    const rows = rData.results || [];
                    const lookup = {};
                    const appidMap = {};
                    rows.forEach(r => {
                        if (r.uid) {
                            lookup[String(r.uid)] = { version_compatibility: r.version_compatibility || '', product_compatibility: r.product_compatibility || '', app_version: r.app_version || '', title: r.title || '', appid: r.appid || '', status: (r.archive_status || '').startsWith('archived') ? 'archived' : (r.archive_status || 'live') };
                            if (r.appid) appidMap[r.appid] = String(r.uid);
                        }
                    });
                    setSplunkbaseData(lookup);
                    setAppidToUidMap(appidMap);
                    setSplunkbaseLoaded(true);
                    // console.log(`[SCAN] Reloaded ${Object.keys(lookup).length} Splunkbase entries after sync`);
                }
            } else {
                setCsvSyncStatus('error');
                setCsvSyncMessage(results[0]?.message || 'Download failed');
            }
        } catch (e) {
            console.error('[SCAN] Splunkbase sync failed:', e);
            setCsvSyncStatus('error');
            setCsvSyncMessage(e.message || 'Unknown error');
        }
    }, []);

    // ── Portfolio toggle handler ──
    const handlePortfolioToggle = useCallback(() => {
        setShowFullPortfolio((prev) => {
            const next = !prev;
            savePortfolioPreference(next);
            return next;
        });
        // Clear the support-level pill — the portfolio toggle is the canonical
        // "supported vs all" control, so a specific support-level filter would
        // silently override it and confuse the user.
        setSupportLevelFilter([]);
    }, []);

    // ── Base product list (support-level + portfolio + status visibility) ──
    const portfolioProducts = useMemo(() => {
        let base = products;
        if (supportLevelFilter.length > 0) {
            base = base.filter((p) => supportLevelFilter.includes(p.support_level));
        } else if (!showFullPortfolio) {
            base = base.filter((p) => SUPPORTED_LEVELS.has(p.support_level) && p.status !== 'under_development');
        }
        if (!showRetired) {
            base = base.filter((p) => p.status !== 'retired');
        }
        if (!showDeprecated) {
            base = base.filter((p) => p.status !== 'deprecated');
        }
        if (!showComingSoon) {
            base = base.filter((p) => p.status !== 'under_development');
        }
        if (!showGtmRoadmap) {
            base = base.filter((p) => !p.coverage_gap);
        }
        return base;
    }, [products, supportLevelFilter, showFullPortfolio, showRetired, showDeprecated, showComingSoon, showGtmRoadmap]);

    // ── Filtering (two-stage: preAddon for faceted dropdown, then full) ──
    const preAddonProducts = useMemo(() => {
        let filtered = portfolioProducts;
        if (selectedCategory === 'soar') {
            filtered = filtered.filter((p) => p.soar_connector_uids && p.soar_connector_uids.length > 0);
        } else if (selectedCategory === 'alert_actions') {
            filtered = filtered.filter((p) => p.alert_action_uids && p.alert_action_uids.length > 0);
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
        if (streamFilter) {
            filtered = filtered.filter((p) => p.netflow_supported);
        }
        if (sc4sFilter) {
            filtered = filtered.filter((p) => p.sc4s_supported);
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
        // ── Splunkbase platform filter ──
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (platformFilterMode === 'include') {
                filtered = filtered.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return false;
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            } else {
                // Exclude mode: show products that do NOT support the selected platform(s)
                filtered = filtered.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true; // no Splunkbase data = keep (can't verify)
                    return !uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            }
        }
        // ── Splunkbase version compatibility filter (multi-select) ──
        if (versionFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (versionFilterMode === 'include') {
                filtered = filtered.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return false;
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.version_compatibility) return false;
                        const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                        return versionFilter.some(vf => versions.includes(vf));
                    });
                });
            } else {
                // Exclude mode: show products that do NOT support the selected version(s)
                filtered = filtered.filter((p) => {
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true; // no Splunkbase data = keep (can't verify)
                    return !uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.version_compatibility) return false;
                        const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                        return versionFilter.some(vf => versions.includes(vf));
                    });
                });
            }
        }
        return filtered;
    }, [portfolioProducts, selectedCategory, selectedSubCategory, aiFilter, streamFilter, sc4sFilter, searchQuery, platformFilter, versionFilter, splunkbaseData, appidToUidMap, versionFilterMode, platformFilterMode]);

    const filteredProducts = useMemo(() => {
        if (!selectedAddon) return preAddonProducts;
        if (selectedAddon === '__standalone__') {
            return preAddonProducts.filter((p) => !p.addon && !p.sc4s_supported);
        } else if (selectedAddon === '__sc4s__') {
            return preAddonProducts.filter((p) => !p.addon && p.sc4s_supported);
        }
        return preAddonProducts.filter((p) => p.addon === selectedAddon);
    }, [preAddonProducts, selectedAddon]);

    /* Active filter count for the "Filters" button badge */
    const crossCutLabels = { soar: 1, alert_actions: 1, secure_networking: 1, ai_powered: 1 };
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategory && crossCutLabels[selectedCategory]) count++;
        if (supportLevelFilter.length > 0) count++;
        if (!showRetired) count++;
        if (!showDeprecated) count++;
        if (!showComingSoon) count++;
        if (!showGtmRoadmap) count++;
        if (streamFilter) count++;
        if (sc4sFilter) count++;
        if (platformFilter.length > 0) count++;
        if (versionFilter.length > 0) count++;
        if (selectedAddon) count++;
        return count;
    }, [selectedCategory, supportLevelFilter, showRetired, showDeprecated, showComingSoon, showGtmRoadmap, streamFilter, sc4sFilter, platformFilter, versionFilter, selectedAddon]);

    /* Addon label for active chip display */
    const activeAddonLabel = useMemo(() => {
        if (!selectedAddon || !preAddonProducts) return '';
        // Derive label from a product that has this addon
        if (selectedAddon === '__standalone__') return 'Standalone';
        if (selectedAddon === '__sc4s__') return 'SC4S Only';
        const match = preAddonProducts.find(p => p.addon === selectedAddon);
        return match ? (match.addon_label || match.addon) : selectedAddon;
    }, [selectedAddon, preAddonProducts]);

    const configuredProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && !p.coverage_gap && configuredIds.includes(p.product_id));
    const detectedProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && !p.coverage_gap && p.support_level !== 'not_supported' && !configuredIds.includes(p.product_id) && sourcetypeData[p.product_id] && sourcetypeData[p.product_id].hasData);
    const detectedIds = new Set(detectedProducts.map((p) => p.product_id));
    const availableProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && !p.coverage_gap && p.support_level !== 'not_supported' && !configuredIds.includes(p.product_id) && !detectedIds.has(p.product_id));
    const unsupportedProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && !p.coverage_gap && p.support_level === 'not_supported' && !configuredIds.includes(p.product_id));
    const comingSoonProducts = filteredProducts.filter((p) => p.status === 'under_development');
    const deprecatedProducts = filteredProducts.filter((p) => p.status === 'deprecated');
    const retiredProducts = filteredProducts.filter((p) => p.status === 'retired');
    const gtmGapProducts = filteredProducts.filter((p) => p.coverage_gap);

    const categoryCounts = useMemo(() => {
        let base = portfolioProducts;
        // Apply cross-cutting filters so category counts reflect the active filter state
        if (streamFilter) base = base.filter((p) => p.netflow_supported);
        if (sc4sFilter) base = base.filter((p) => p.sc4s_supported);
        if (aiFilter) base = base.filter((p) => p.ai_enabled);
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            base = base.filter((p) => {
                const kws = (p.keywords || []).map((k) => k.toLowerCase());
                if (kws.some((k) => k.includes(q) || q.includes(k))) return true;
                const als = (p.aliases || []).map((a) => a.toLowerCase());
                if (als.some((a) => a.includes(q) || q.includes(a))) return true;
                return `${p.display_name} ${p.tagline} ${p.description} ${p.vendor} ${p.product_id}`.toLowerCase().includes(q);
            });
        }
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            base = base.filter((p) => {
                const uids = getAllProductUids(p, appidToUidMap);
                return uids.some(uid => {
                    const entry = splunkbaseData[uid];
                    if (!entry || !entry.product_compatibility) return false;
                    const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                    return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                });
            });
        }
        if (versionFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            base = base.filter((p) => {
                const uids = getAllProductUids(p, appidToUidMap);
                return uids.some(uid => {
                    const entry = splunkbaseData[uid];
                    if (!entry || !entry.version_compatibility) return false;
                    const versions = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
                    return versionFilter.some(vf => versions.includes(vf));
                });
            });
        }
        // Apply addon filter so category counts reflect the selected addon
        if (selectedAddon) {
            if (selectedAddon === '__standalone__') {
                base = base.filter(p => !p.addon && !p.sc4s_supported);
            } else if (selectedAddon === '__sc4s__') {
                base = base.filter(p => !p.addon && p.sc4s_supported);
            } else {
                base = base.filter(p => p.addon === selectedAddon);
            }
        }
        const counts = {};
        CATEGORIES.forEach((c) => { counts[c.id] = base.filter((p) => p.category === c.id).length; });
        counts.soar = base.filter((p) => p.soar_connector_uids && p.soar_connector_uids.length > 0).length;
        counts.alert_actions = base.filter((p) => p.alert_action_uids && p.alert_action_uids.length > 0).length;
        counts.secure_networking = base.filter((p) => p.secure_networking_gtm).length;
        counts.ai_powered = base.filter((p) => p.ai_enabled).length;
        return counts;
    }, [portfolioProducts, streamFilter, sc4sFilter, aiFilter, searchQuery, platformFilter, versionFilter, splunkbaseData, selectedAddon, appidToUidMap]);

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
                    <span className="scan-devmode-banner-text">DEVELOPER MODE</span>
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
                        persistent
                        title="Getting Started with SCAN"
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
                        <span className="scan-util-portfolio-label">
                            {showFullPortfolio ? 'All Products' : 'Supported Only'}
                        </span>
                    </button>
                </div>
                <div className="scan-utility-right">
                    {/* ── Group 1: Platform & Splunk Version ── */}
                    {(effectivePlatformType || effectiveSplunkVersion) && (
                        <span className={`scan-util-pill scan-util-platform ${devMode && cloudSimulation ? 'scan-util-cloud-sim' : ''}`} title={
                            devMode && cloudSimulation
                                ? `☁️ Cloud Simulation — Splunk Cloud v${SIMULATED_CLOUD_VERSION}`
                                : effectivePlatformType === 'cloud' ? `Splunk Cloud${effectiveSplunkVersion ? ' v' + effectiveSplunkVersion : ''}` : `Splunk Enterprise${effectiveSplunkVersion ? ' v' + effectiveSplunkVersion : ''}`
                        }>
                            <img
                                className="scan-util-icon"
                                src={createURL(`/static/app/${APP_ID}/${effectivePlatformType === 'cloud' ? 'icon-cloud.svg' : 'icon-enterprise.svg'}`)}
                                alt=""
                            />
                            {effectivePlatformType === 'cloud' ? 'Cloud' : 'Enterprise'}
                            {effectiveSplunkVersion && <span className="scan-util-splunk-ver">{effectiveSplunkVersion}</span>}
                        </span>
                    )}
                    {/* ── Group 2: SCAN App Version & Update ── */}
                    <span className="scan-util-sep" />
                    {appVersion && (
                        <span className="scan-util-pill scan-util-version" title={`Splunk Cisco App Navigator v${appVersion}`}>
                            SCAN v{appVersion}
                        </span>
                    )}
                    {appUpdateVersion && (
                        <a
                            href={createURL('/manager/splunk-cisco-app-navigator/appsremote?order=relevance&query=%22Splunk+Cisco+App+Navigator%22&offset=0&support=splunk&support=cisco&type=app')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="scan-util-pill scan-util-update"
                            title={`Upgrade from v${appVersion} to v${appUpdateVersion} — click to open Splunkbase`}
                        >
                            ⬆ v{appUpdateVersion}
                        </a>
                    )}
                    {/* ── Group 3: Actions ── */}
                    <span className="scan-util-sep" />
                    <button
                        className="scan-util-pill scan-util-theme"
                        onClick={handleThemeCycle}
                        title={`Theme: ${themeOverride === 'auto' ? 'Auto (Splunk)' : themeOverride === 'light' ? 'Light' : 'Dark'} — click to cycle`}
                    >
                        <span className="scan-util-theme-label">
                            {themeOverride === 'auto' ? '◐' : themeOverride === 'light' ? '☀' : '☾'}
                        </span>
                    </button>
                    <button
                        className={`scan-util-pill scan-util-sync ${csvSyncStatus === 'success' ? 'scan-sync-ok' : csvSyncStatus === 'error' ? 'scan-sync-err' : csvSyncStatus === 'syncing' ? 'scan-sync-busy' : ''}`}
                        onClick={handleSyncSplunkbase}
                        disabled={csvSyncStatus === 'syncing'}
                        title={csvSyncStatus === 'success' ? `✓ ${csvSyncMessage}` : csvSyncStatus === 'error' ? `✗ ${csvSyncMessage}` : csvSyncStatus === 'syncing' ? 'Downloading…' : 'Sync Splunkbase catalog from S3'}
                        style={{ cursor: csvSyncStatus === 'syncing' ? 'wait' : 'pointer' }}
                    >
                        Sync
                    </button>
                    <button
                        className="scan-util-pill"
                        ref={guideReturnRef}
                        onClick={() => setCardLegendOpen(true)}
                        title="How to use Splunk Cisco App Navigator"
                    >
                        Guide
                    </button>
                    <button
                        className="scan-util-pill scan-util-persona"
                        onClick={() => setPersonaModalOpen(true)}
                        title="Quick Start — Choose or change your role"
                    >
                        Role
                    </button>
                    {/* ── Group 4: DevMode tools ── */}
                    {devMode && (
                        <>
                        <span className="scan-util-sep" />
                        <button
                            className={`scan-util-pill scan-util-devmode scan-util-cloud-toggle ${cloudSimulation ? 'scan-util-cloud-active' : ''}`}
                            onClick={() => {
                                setCloudSimulation(prev => {
                                    const next = !prev;
                                    setDevToast(next ? '☁️ Cloud Simulation ON — v' + SIMULATED_CLOUD_VERSION : '🏢 Cloud Simulation OFF — using real platform');
                                    setTimeout(() => setDevToast(null), 2500);
                                    return next;
                                });
                            }}
                            title={cloudSimulation ? `Cloud Simulation ON — Simulating Splunk Cloud v${SIMULATED_CLOUD_VERSION} — click to disable` : 'Simulate Splunk Cloud environment — click to enable'}
                        >
                            {cloudSimulation ? '☁️ Cloud' : '☁️'}
                        </button>
                        <button
                            className="scan-util-pill scan-util-devmode"
                            onClick={() => handleOpenConfigViewer(null)}
                            title="Config Viewer — Developer Mode"
                        >
                            &lt;/&gt;
                        </button>
                        <button
                            className="scan-util-pill scan-util-devmode scan-util-techstack"
                            onClick={() => setTechStackOpen(true)}
                            title="Tech Stack — React &amp; Splunk UI versions"
                        >
                            Stack
                        </button>
                        </>
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
                totalCount={portfolioProducts.length}
                products={portfolioProducts}
                externalQuery={searchBarQuery}
            />
            <div style={{ marginBottom: '20px' }}>
                <CategoryFilterBar
                    selectedCategory={selectedCategory}
                    onSelectCategory={(cat) => {
                        setSelectedCategory(cat);
                        setSelectedSubCategory(null);
                        setAiFilter(false);
                        if (!cat) {
                            setSelectedAddon(null);
                            setSearchQuery('');
                            setSearchBarQuery('');
                        }
                    }}
                    selectedSubCategory={selectedSubCategory}
                    onSelectSubCategory={setSelectedSubCategory}
                    aiFilter={aiFilter}
                    onToggleAiFilter={setAiFilter}
                    categoryCounts={categoryCounts}
                    products={portfolioProducts}
                    onOpenFilterDrawer={() => setFilterDrawerOpen(true)}
                    activeFilterCount={activeFilterCount}
                    platformFilter={platformFilter}
                    versionFilter={versionFilter}
                    splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap}
                    versionFilterMode={versionFilterMode}
                    platformFilterMode={platformFilterMode}
                />
                <ActiveFilterChips
                    selectedCategory={selectedCategory}
                    onSelectCategory={(cat) => {
                        setSelectedCategory(cat);
                        setSelectedSubCategory(null);
                        setAiFilter(false);
                    }}
                    supportLevelFilter={supportLevelFilter}
                    onSelectSupportLevel={handleSupportLevelToggle}
                    showRetired={showRetired}
                    onToggleShowRetired={setShowRetired}
                    showDeprecated={showDeprecated}
                    onToggleShowDeprecated={setShowDeprecated}
                    showComingSoon={showComingSoon}
                    onToggleShowComingSoon={setShowComingSoon}
                    showGtmRoadmap={showGtmRoadmap}
                    onToggleShowGtmRoadmap={setShowGtmRoadmap}
                    streamFilter={streamFilter}
                    onToggleStreamFilter={setStreamFilter}
                    sc4sFilter={sc4sFilter}
                    onToggleSc4sFilter={setSc4sFilter}
                    platformFilter={platformFilter}
                    onSelectPlatform={handlePlatformToggle}
                    versionFilter={versionFilter}
                    onSelectVersion={handleVersionToggle}
                    selectedAddon={selectedAddon}
                    onSelectAddon={setSelectedAddon}
                    addonLabel={activeAddonLabel}
                />
            </div>

            <FilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    setSelectedSubCategory(null);
                    setAiFilter(false);
                }}
                supportLevelFilter={supportLevelFilter}
                onSelectSupportLevel={(level) => {
                    handleSupportLevelToggle(level);
                    if (level && typeof level === 'string' && !SUPPORTED_LEVELS.has(level) && !showFullPortfolio) {
                        setShowFullPortfolio(true);
                        savePortfolioPreference(true);
                    }
                }}
                showRetired={showRetired}
                onToggleShowRetired={setShowRetired}
                showDeprecated={showDeprecated}
                onToggleShowDeprecated={setShowDeprecated}
                showComingSoon={showComingSoon}
                onToggleShowComingSoon={setShowComingSoon}
                showGtmRoadmap={showGtmRoadmap}
                onToggleShowGtmRoadmap={setShowGtmRoadmap}
                streamFilter={streamFilter}
                onToggleStreamFilter={setStreamFilter}
                sc4sFilter={sc4sFilter}
                onToggleSc4sFilter={setSc4sFilter}
                platformFilter={platformFilter}
                onSelectPlatform={handlePlatformToggle}
                versionFilter={versionFilter}
                onSelectVersion={handleVersionToggle}
                splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap}
                csvSyncStatus={csvSyncStatus}
                csvSyncMessage={csvSyncMessage}
                onSyncSplunkbase={handleSyncSplunkbase}
                selectedAddon={selectedAddon}
                onSelectAddon={setSelectedAddon}
                products={portfolioProducts}
                allProducts={products}
                preAddonProducts={preAddonProducts}
                categoryCounts={categoryCounts}
                showFullPortfolio={showFullPortfolio}
                versionFilterMode={versionFilterMode}
                onToggleVersionFilterMode={handleVersionFilterModeToggle}
                platformFilterMode={platformFilterMode}
                onTogglePlatformFilterMode={handlePlatformFilterModeToggle}
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
                            Remove All
                        </button>
                    </div>
                )}
                {configuredProducts.length > 0 ? (
                    <div className="csc-card-grid">
                        {configuredProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured isComingSoon={false}
                                platformType={effectivePlatformType}
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

            {/* Section 1b: Data Detected — products with flowing sourcetypes not yet configured */}
            {detectedProducts.length > 0 && (
                <div id="detected_products">
                <CollapsiblePanel title={`Data Detected (${detectedProducts.length})`} defaultOpen panelId="detected_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-info-bg, #f0f9ff)', borderLeft: '4px solid var(--color-primary-hover, #02C8FF)', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        These products have <strong>active sourcetype data flowing</strong> into your Splunk environment but haven't been added to your configured list yet. Click <strong>Add to My Products</strong> to start managing them.
                    </div>
                    <div className="csc-card-grid">
                        {detectedProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} isComingSoon={false}
                                platformType={effectivePlatformType}
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

            {/* Section 2: Available */}
            <div id="available_products">
            <CollapsiblePanel title={`Available Products (${availableProducts.length})`} defaultOpen panelId="available_products">
                {availableProducts.length > 0 ? (
                    <div className="csc-card-grid">
                        {availableProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} isComingSoon={false}
                                platformType={effectivePlatformType}
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
                        These products have a <strong>Not Supported</strong> support level — there is no official Cisco or Splunk support commitment. They may still function correctly but use at your own discretion.
                    </div>
                    <div className="csc-card-grid">
                        {unsupportedProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} isComingSoon={false}
                                platformType={effectivePlatformType}
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
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} isComingSoon
                                platformType={effectivePlatformType}
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

            {/* Section 5: Deprecated Products */}
            {deprecatedProducts.length > 0 && (
                <div id="deprecated_products">
                <CollapsiblePanel title={`Deprecated Products (${deprecatedProducts.length})`} defaultOpen={false} panelId="deprecated_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--warning-bg, #fff3e0)', borderLeft: '4px solid #FF9000', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        These Splunk add-ons or apps have been <strong>deprecated</strong> — the Cisco product may still be active but the integration is being sunset or replaced by a newer add-on.
                    </div>
                    <div className="csc-card-grid">
                        {deprecatedProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={configuredIds.includes(p.product_id)} isComingSoon={false}
                                platformType={effectivePlatformType}
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

            {/* Section 6: Retired Products (Cisco EOL) */}
            {retiredProducts.length > 0 && (
                <div id="retired_products">
                <CollapsiblePanel title={`Retired Products (${retiredProducts.length})`} defaultOpen={false} panelId="retired_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-neutral-bg, #fce4ec)', borderLeft: '4px solid var(--color-error, #c62828)', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        These Cisco products have reached <strong>end-of-life / end-of-sale</strong> and have been superseded by newer offerings. Their Splunk add-ons may still function if already installed.
                    </div>
                    <div className="csc-card-grid">
                        {retiredProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={configuredIds.includes(p.product_id)} isComingSoon={false}
                                platformType={effectivePlatformType}
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
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-neutral-bg, #eceff1)', borderLeft: '4px solid var(--text-tertiary, #607d8b)', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        These Cisco products are on the <strong>Secure Networking GTM roadmap</strong> but have <strong>zero Splunk integration</strong> today — no add-on, no app, no community support. They represent opportunities for future TA/app development.
                    </div>
                    <div className="csc-card-grid">
                        {gtmGapProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} isComingSoon={false}
                                platformType={effectivePlatformType}
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
                platformType={effectivePlatformType}
                splunkbaseData={splunkbaseData}
            />
            <LegacyAuditModal
                open={legacyModalOpen}
                onClose={() => setLegacyModalOpen(false)}
                legacyUids={legacyModalApps}
                installedApps={installedApps}
                indexerApps={indexerApps}
                splunkbaseData={splunkbaseData}
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
                    splunkbaseData={splunkbaseData}
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

            {/* Usage Guide Modal */}
            {cardLegendOpen && (
                <Modal open returnFocus={guideReturnRef} onRequestClose={() => setCardLegendOpen(false)} style={{ maxWidth: '640px', width: '92vw' }}>
                    <Modal.Header title="How to Use SCAN" />
                    <Modal.Body>
                        <div className="csc-sc4s-info" style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--page-color, #333)' }}>

                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Browse &amp; Search</div>
                                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                    <li>Use <strong>category tabs</strong> (Security, Networking, etc.) and <strong>subcategory pills</strong> to filter.</li>
                                    <li>Cross-cutting pills — <strong>SOAR</strong>, <strong>AI-Powered</strong>, <strong>Alert Actions</strong>, <strong>Secure Networking</strong> — filter across all categories.</li>
                                    <li>The <strong>search bar</strong> matches product names, keywords, aliases, and sourcetypes.</li>
                                </ul>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Filter &amp; Refine</div>
                                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                    <li>Click <strong>Filters</strong> to open the sidebar drawer with support level, visibility, SC4S / NetFlow, and add-on family filters.</li>
                                    <li>Use <strong>Platform</strong> and <strong>Version</strong> checkboxes to filter by Splunkbase compatibility.</li>
                                    <li>Toggle <strong>Include / Exclude</strong> on version filter to find products <em>not yet compatible</em> with a version.</li>
                                    <li>Use <strong>✅ Supported Only / 📂 All Products</strong> to toggle the full portfolio.</li>
                                </ul>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Product Cards</div>
                                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                    <li><strong>Add to My Products</strong> pins a card to the <em>Configured</em> section at the top.</li>
                                    <li>Intelligence badges show <strong>install status</strong>, <strong>updates available</strong>, <strong>data flowing</strong> (last 7 days), and <strong>legacy apps</strong> detected.</li>
                                    <li>Header badges (<strong>SC4S</strong>, <strong>NetFlow</strong>, <strong>SOAR</strong>, <strong>ITSI</strong>) open info panels on click.</li>
                                    <li>Hover the <strong>ⓘ</strong> icon for description, value proposition, and former names.</li>
                                </ul>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Deployment Details</div>
                                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                    <li>Click <strong>+ Details</strong> to expand the deployment guide showing add-on, dashboard app, and tier chips.</li>
                                    <li>Tier chips show deployment status: <strong>Search Head</strong>, <strong>Indexers</strong> (✓ deployed, ≠ mismatch, ✗ missing, ⊘ disabled), and <strong>Heavy Forwarder</strong> info.</li>
                                    <li>Each component links to <strong>Splunkbase</strong>, <strong>Docs</strong>, and <strong>Troubleshoot</strong> pages.</li>
                                    <li><strong>SC4S</strong> and <strong>NetFlow</strong> sections appear inline when applicable.</li>
                                </ul>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Actions &amp; Launch</div>
                                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                    <li>Click <strong>Launch ▾</strong> to open an installed app's dashboard directly.</li>
                                    <li>Click <strong>? Best Practices</strong> for platform-specific tips and SC4S links.</li>
                                    <li>Use <strong>Sync Catalog</strong> in the toolbar to refresh Splunkbase compatibility data.</li>
                                </ul>
                            </div>

                            <div style={{ marginBottom: '4px' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Personalization</div>
                                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                    <li>Click <strong>Role</strong> to pick a persona (SOC Analyst, Network Engineer, etc.) for a curated quick-start.</li>
                                    <li>Cycle through <strong>Light / Dark / Auto</strong> themes with the theme button.</li>
                                </ul>
                            </div>

                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button appearance="secondary" label="Close" onClick={() => setCardLegendOpen(false)} />
                    </Modal.Footer>
                </Modal>
            )}

            {/* Remove All Confirmation Modal */}
            {removeAllModalOpen && (
                <Modal open returnFocus={removeAllReturnRef} onRequestClose={() => setRemoveAllModalOpen(false)} style={{ maxWidth: '520px', width: '92vw' }}>
                    <Modal.Header
                        title="Remove All Configured Products"
                    />
                    <Modal.Body>
                        <div style={{ fontSize: '13px', lineHeight: '1.7' }}>
                            <div style={{
                                padding: '12px 16px',
                                background: '#fff3cd',
                                border: '1px solid #ffe082',
                                borderRadius: '6px',
                                marginBottom: '14px',
                                color: '#6d4c00',
                            }}>
                                <strong>Warning:</strong> This action will remove <strong>all {configuredProducts.length} product{configuredProducts.length !== 1 ? 's' : ''}</strong> from your configured list.
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
