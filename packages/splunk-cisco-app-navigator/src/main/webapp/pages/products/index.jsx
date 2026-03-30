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
 * Nine sections (some gated behind devMode / gtmMode):
 *   1. Configured Products       — products the admin has added to their workspace
 *   2. Available Products        — active products ready to configure
 *   3. Integration Needed        — not_supported products; no Splunk TA exists (dev/GTM only)
 *   4. Coming Soon               — status = under_development (dev/GTM only)
 *   5. Deprecated Products       — add-on sunset or replaced by a newer TA
 *   6. Retired Products          — Cisco product itself is end-of-life
 *   7. GTM Roadmap — Coverage Gaps — coverage_gap products without any integration (dev/GTM only)
 *   8. Custom Products           — customer-created cards from local/products.conf
 *   9. Catalog Vault             — disabled/archived products (vault toggle in FilterDrawer)
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
import Clipboard from '@splunk/react-icons/Clipboard';
import Code from '@splunk/react-icons/Script';
import Search from '@splunk/react-icons/Magnifier';
import Pencil from '@splunk/react-icons/Pencil';
import CloneIcon from '@splunk/react-icons/LayersDoubleTransparent';
import TrashCan from '@splunk/react-icons/TrashCanCross';
import ShieldIcon from '@splunk/react-icons/Shield';
import PulseIcon from '@splunk/react-icons/Pulse';
import LayoutIcon from '@splunk/react-icons/Layout';
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
const CONF_RELOAD_ENDPOINT = `/splunkd/__raw/servicesNS/nobody/${APP_ID}/configs/conf-products/_reload`;
const APPS_LOCAL_ENDPOINT = '/splunkd/__raw/services/apps/local';
const SERVER_INFO_ENDPOINT = '/splunkd/__raw/services/server/info';
const SEARCH_ENDPOINT = '/splunkd/__raw/services/search/jobs';
const CONFIGURED_STORAGE_KEY = 'scan_configured_products';
const THEME_STORAGE_KEY = 'scan_theme_preference'; // 'light' | 'dark' | 'auto'
const PORTFOLIO_STORAGE_KEY = 'scan_show_full_portfolio'; // 'true' | 'false'
const DEVMODE_STORAGE_KEY = 'scan_devmode'; // 'true' | absent
const PERSONA_STORAGE_KEY = 'scan_persona_shown'; // 'true' once persona modal dismissed
const FILTERS_STORAGE_KEY = 'scan_filter_state';
const PANELS_STORAGE_KEY = 'scan_panel_state';

const DEFAULT_PANEL_STATE = {
    configured_products: true,
    detected_products: true,
    available_products: true,
    unsupported_products: false,
    coming_soon_products: true,
    deprecated_products: false,
    retired_products: false,
    gtm_coverage_gaps: false,
    custom_products: true,
    vault_products: true,
};
const SUPPORTED_LEVELS = new Set(['cisco_supported', 'splunk_supported']);

/** Toggle to show/hide value proposition text on the card face (always visible in ⓘ tooltip) */
const SHOW_VALUE_PROP_ON_CARD = false;

/** Persona presets — each maps a role to a category filter + suggested product IDs */
const PERSONA_PRESETS = [
    {
        id: 'security',
        icon: 'cat-security',
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
        icon: 'cat-networking',
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
        icon: 'cat-collaboration',
        title: 'Collaboration Admin',
        description: 'Webex, CUCM, video conferencing, and meeting infrastructure',
        category: 'collaboration',
        color: '#0A60FF',
        suggested: [
            'cisco_webex', 'cisco_cucm', 'cisco_meeting_server',
            'cisco_meeting_management', 'cisco_tvcs',
        ],
    },
    {
        id: 'observability',
        icon: 'cat-observability',
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
        icon: null,
        title: 'Explorer',
        description: 'Browse the full Cisco portfolio — all categories, all products',
        category: null,
        color: '#0A60FF',
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
    observability: [
        { id: 'digital_experience', name: 'Digital Experience', icon: '' },
        { id: 'application_monitoring', name: 'Application Monitoring', icon: '' },
        { id: 'infrastructure_monitoring', name: 'Infrastructure Monitoring', icon: '' },
    ],
    collaboration: [
        { id: 'meetings_calling', name: 'Meetings & Calling', icon: '' },
        { id: 'voice_telephony', name: 'Voice & Telephony', icon: '' },
        { id: 'contact_center', name: 'Contact Center', icon: '' },
    ],
};

// Cisco Secure Networking GTM pillars (per https://www.cisco.com/c/en/us/solutions/collateral/transform-infrastructure/secure-networking-so.html).
// Used on GTM Roadmap cards to show how a product maps to the GTM strategy.
const GTM_PILLAR_LABELS = {
    1: 'Pillar 1: Secure Campus & Branch',
    2: 'Pillar 2: Secure WAN Edge',
    3: 'Pillar 3: Data Center & Cloud',
    4: 'Pillar 4: End-to-End Visibility & Assurance',
    5: 'Pillar 5: Industrial / OT',
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

function getSavedFilters() {
    try {
        const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (_e) { return {}; }
}
function saveFilters(state) {
    try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state)); }
    catch (_e) { /* quota */ }
}
const _savedFilters = getSavedFilters();

function getSavedPanelState() {
    try {
        const raw = localStorage.getItem(PANELS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (_e) { return {}; }
}
function savePanelState(state) {
    try { localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(state)); }
    catch (_e) { /* quota */ }
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
 * Word-boundary keyword match: returns true when the query appears as a
 * complete word (or multi-word phrase) within the keyword string, avoiding
 * false positives like "enterprise" matching a query of "ise".
 */
function keywordMatchesQuery(keyword, query) {
    if (keyword === query) return true;
    const re = new RegExp(`(?:^|[\\s,\\-_/])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,\\-_/])`, 'i');
    return re.test(keyword);
}

/**
 * Universal product search: checks display_name, tagline, vendor, product_id,
 * aliases, keywords, and sourcetypes against a lowercase query string.
 */
function productMatchesSearch(p, q) {
    const nameField = `${p.display_name} ${p.vendor} ${p.product_id}`.toLowerCase();
    if (nameField.includes(q)) return true;
    const als = (p.aliases || []).map(a => a.toLowerCase());
    if (als.some(a => a.includes(q) || q.includes(a))) return true;
    const kws = (p.keywords || []).map(k => k.toLowerCase());
    if (kws.some(k => k === q || keywordMatchesQuery(k, q))) return true;
    const sts = (p.sourcetypes || []).map(s => s.toLowerCase());
    if (sts.some(s => s === q || s.includes(q))) return true;
    return false;
}

const SC4S_SPLUNKBASE_UID = '4740';
const CISCO_PRODUCT_DIRECTORY_URL = 'https://www.cisco.com/site/us/en/products/index.html';

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
    
    // Add legacy, legacy viz, and community UIDs directly
    (product.legacy_uids || []).forEach(uid => { if (uid) uids.add(String(uid)); });
    (product.legacy_viz_uids || []).forEach(uid => { if (uid) uids.add(String(uid)); });
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
 * Check if a product's apps support the given Splunk version(s).
 *
 * Addon-first rule: if a product has an add-on, the ADD-ON must support the
 * version for the product to pass. A viz-app-only match is not enough because
 * without the add-on you can't ingest data, extract fields, or map to CIM.
 * Products without add-ons (SC4S-only, standalone dashboards) pass if ANY
 * of their apps support the version.
 */
/**
 * SC4S-supported products are compatible with both Splunk Cloud and
 * Splunk Enterprise on every version.  Returns true when the product's
 * sc4s_supported flag satisfies at least one of the requested platform
 * filter values, allowing the caller to skip Splunkbase lookups.
 */
function sc4sCoversFilter(product, platformFilter) {
    if (!product.sc4s_supported) return false;
    return platformFilter.some(pf => {
        const lc = pf.toLowerCase();
        return lc.includes('cloud') || lc.includes('enterprise');
    });
}

function productSupportsVersions(product, versions, splunkbaseData, appidToUidMap) {
    if (product.sc4s_supported) return true;
    const uidSupports = (uid) => {
        const entry = splunkbaseData[uid];
        if (!entry || !entry.version_compatibility) return false;
        const supported = entry.version_compatibility.split(/[|,]/).map(v => v.trim());
        return versions.some(vf => supported.includes(vf));
    };
    // If product has an addon, the addon MUST support the version
    const addonUid = product.addon_splunkbase_uid ? String(product.addon_splunkbase_uid)
        : (appidToUidMap && product.addon ? appidToUidMap[product.addon] : null);
    if (addonUid) return uidSupports(addonUid);
    // No addon — check all other UIDs (viz apps, community apps, etc.)
    const uids = getAllProductUids(product, appidToUidMap);
    if (uids.length === 0) return true; // no Splunkbase apps = pass through (e.g. SC4S-only)
    return uids.some(uid => uidSupports(uid));
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
 * Normalizes field names: products.conf uses addon_uid / app_viz_uid; we expose
 * addon_splunkbase_uid / app_viz_splunkbase_uid for UI and saved searches so
 * catalog, REST, and generated fallback stay consistent.
 */
async function loadProductsFromConf() {
    const res = await splunkFetch(`${CONF_ENDPOINT}?output_mode=json&count=0`);
    const data = await res.json();
    return (data.entry || []).map(entry => {
        const c = entry.content || {};
        const d = c.disabled;
        const isDisabled = d === true || d === "true" || d === "1" || d === 1;
        const name = entry.name;
        const laUids   = csvToArray(c.legacy_uids);
        const lvUids   = csvToArray(c.legacy_viz_uids);
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
            gap_type: c.gap_type || '',
            addon_splunkbase_uid: c.addon_uid || c.addon_splunkbase_uid || extractSplunkbaseUid(c.addon_splunkbase_url) || '',
            addon_docs_url: c.addon_docs_url || '',
            addon_troubleshoot_url: c.addon_troubleshoot_url || '',
            addon_install_url: c.addon_install_url || '',
            app_viz: c.app_viz || '',
            app_viz_label: c.app_viz_label || '',
            app_viz_splunkbase_uid: c.app_viz_uid || c.app_viz_splunkbase_uid || extractSplunkbaseUid(c.app_viz_splunkbase_url) || '',
            app_viz_docs_url: c.app_viz_docs_url || '',
            app_viz_troubleshoot_url: c.app_viz_troubleshoot_url || '',
            app_viz_install_url: c.app_viz_install_url || '',
            app_viz_2: c.app_viz_2 || '',
            app_viz_2_label: c.app_viz_2_label || '',
            app_viz_2_splunkbase_uid: c.app_viz_2_uid || c.app_viz_2_splunkbase_uid || extractSplunkbaseUid(c.app_viz_2_splunkbase_url) || '',
            app_viz_2_docs_url: c.app_viz_2_docs_url || '',
            app_viz_2_troubleshoot_url: c.app_viz_2_troubleshoot_url || '',
            app_viz_2_install_url: c.app_viz_2_install_url || '',
            learn_more_url: c.learn_more_url || '',
            legacy_uids: laUids.filter(Boolean),
            legacy_viz_uids: lvUids.filter(Boolean),
            community_uids: caUids.filter(Boolean),
            sourcetypes: csvToArray(c.sourcetypes),
            dashboards: csvToArray(c.dashboards),
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
            sse_content: c.sse_content === 'true' || c.sse_content === '1' || c.sse_content === true,
            sse_use_cases: csvToArray(c.sse_use_cases),
            sse_use_case_count: parseInt(c.sse_use_case_count || '0', 10),
            sse_data_sources: csvToArray(c.sse_data_sources),
            ite_learn_content: c.ite_learn_content === 'true' || c.ite_learn_content === '1' || c.ite_learn_content === true,
            ite_learn_procedures: csvToArray(c.ite_learn_procedures),
            ite_learn_procedure_count: parseInt(c.ite_learn_procedure_count || '0', 10),
            custom: c.custom === 'true' || c.custom === '1' || c.custom === true,
            catalog_disabled: isDisabled,
        };
    }).sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name))
      .filter(p => CATEGORY_IDS.has(p.category));
}

/**
 * Check a single Splunk app: installed? version? update available?
 */
async function checkAppStatus(appId) {
    if (!appId) return { installed: false, version: null, updateVersion: null, disabled: false, visible: false };
    try {
        const res = await splunkFetch(`${APPS_LOCAL_ENDPOINT}/${encodeURIComponent(appId)}?output_mode=json`);
        if (!res.ok) return { installed: false, version: null, updateVersion: null, disabled: false, visible: false };
        const data = await res.json();
        const c = data.entry?.[0]?.content || {};
        return {
            installed: true,
            version: c.version || null,
            updateVersion: c['update.version'] || null,
            disabled: c.disabled === true || c.disabled === 'true',
            visible: c.visible === true || c.visible === 'true',
        };
    } catch (e) {
        return { installed: false, version: null, updateVersion: null, disabled: false, visible: false };
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
 * Collect every Splunkbase UID referenced by any product in the catalog.
 * Returns a de-duplicated sorted array of UID strings suitable for an
 * | inputlookup ... | search uid IN (...) filter.
 */
function collectReferencedUids(productList) {
    const uids = new Set();
    for (const p of productList) {
        if (p.addon_splunkbase_uid) uids.add(String(p.addon_splunkbase_uid));
        if (p.app_viz_splunkbase_uid) uids.add(String(p.app_viz_splunkbase_uid));
        if (p.app_viz_2_splunkbase_uid) uids.add(String(p.app_viz_2_splunkbase_uid));
        if (p.sc4s_search_head_ta_splunkbase_id) uids.add(String(p.sc4s_search_head_ta_splunkbase_id));
        if (p.netflow_addon_splunkbase_id) uids.add(String(p.netflow_addon_splunkbase_id));
        (p.legacy_uids || []).forEach(u => { if (u) uids.add(String(u)); });
        (p.legacy_viz_uids || []).forEach(u => { if (u) uids.add(String(u)); });
        (p.community_uids || []).forEach(u => { if (u) uids.add(String(u)); });
        (p.alert_action_uids || []).forEach(u => { if (u) uids.add(String(u)); });
        (p.soar_connector_uids || []).forEach(u => { if (u) uids.add(String(u)); });
    }
    uids.delete('');
    return [...uids].sort();
}

/**
 * Build a scoped inputlookup SPL string that only returns rows matching
 * the UIDs referenced by the current product catalog.  Uses the where
 * clause so filtering happens during the CSV read — rows that don't
 * match never enter the search pipeline.
 */
function buildSplunkbaseLookupSPL(productList) {
    const uids = collectReferencedUids(productList);
    if (uids.length === 0) return null;
    const whereClause = uids.map(u => `uid=${u}`).join(' OR ');
    return `| inputlookup scan_splunkbase_apps where ${whereClause} | fields uid appid version_compatibility product_compatibility app_version title archive_status`;
}

/**
 * Build the prefix-match patterns for a product's sourcetypes list.
 * Shared by detectAllSourcetypeData and buildSourcetypeSearchUrl.
 */
function buildSourcetypePatterns(sourcetypes) {
    // Strict exact-match only — no prefix collapsing or wildcard rollup.
    // Each sourcetype listed in products.conf is matched individually.
    return [...new Set(sourcetypes)];
}

/**
 * Detect sourcetype data for ALL products in a single metadata search.
 *
 * Runs ONE search:
 *   | metadata type=sourcetypes
 *   | where lastTime > relative_time(now(), "-7d")
 *   | fields sourcetype totalCount
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
        const searchStr = '| metadata type=sourcetypes index=* | where lastTime > relative_time(now(), "-7d") | fields sourcetype totalCount';
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
                if (patterns.some(pat => st === pat)) {
                    stCount++;
                    eventCount += count;
                    matchedSTs.push(st);
                }
            });
            if (stCount > 0) {
                // console.log(`[SCAN] ${p.product_id}: ${stCount} sourcetype(s) matched — ${matchedSTs.join(', ')}`);
            }
            const totalSTs = p.sourcetypes.length;
            results[p.product_id] = stCount > 0
                ? { hasData: true, eventCount, matchedSTs, totalSourcetypes: totalSTs, detail: `${stCount} of ${totalSTs} sourcetype${totalSTs !== 1 ? 's' : ''} · ~${formatCount(eventCount)} events · last 7d` }
                : { hasData: false, eventCount: 0, matchedSTs: [], totalSourcetypes: totalSTs, detail: 'No data in the last 7 days' };
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
    if (!csrf) return null;
    try {
        // The subsearch filters to servers that are BOTH "indexer" AND "search_peer".
        // On standalone the local server has "indexer" but NOT "search_peer", so the
        // subsearch returns nothing → the outer query returns nothing → {} (standalone).
        // On distributed, indexers have both roles → full detection runs correctly.
        const spl = [
            '| rest splunk_server=* /servicesNS/-/-/apps/local f=title f=version f=disabled count=0',
            '| search [| rest splunk_server=* /services/server/info f=server_roles | where match(server_roles, "indexer") AND match(server_roles, "search_peer") | fields splunk_server]',
            '| eval is_disabled=if(disabled=="1" OR disabled="true", 1, 0)',
            '| stats latest(version) as idx_version max(is_disabled) as any_disabled dc(splunk_server) as idx_count by title',
            '| fields title idx_version any_disabled idx_count',
        ].join(' ');

        // Dispatch as background (normal) search — splunk_server=* should not block the foreground
        const dispatchRes = await splunkFetch(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `search=${encodeURIComponent(spl)}&output_mode=json&exec_mode=normal&count=0&timeout=120`,
        });
        if (!dispatchRes.ok) {
            console.warn('[SCAN] Indexer tier detection dispatch failed (HTTP ' + dispatchRes.status + ')');
            return null;
        }
        const dispatchData = await dispatchRes.json();
        const sid = dispatchData.sid;
        if (!sid) { console.warn('[SCAN] Indexer tier detection: no SID returned'); return null; }

        // Poll for completion
        const statusUrl = `${SEARCH_ENDPOINT}/${encodeURIComponent(sid)}?output_mode=json`;
        const resultsUrl = `${SEARCH_ENDPOINT}/${encodeURIComponent(sid)}/results?output_mode=json&count=0`;
        const maxWait = 120000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await splunkFetch(statusUrl);
            if (!statusRes.ok) break;
            const statusData = await statusRes.json();
            const state = statusData.entry?.[0]?.content?.dispatchState;
            if (state === 'DONE' || state === 'FINALIZED') break;
            if (state === 'FAILED') { console.warn('[SCAN] Indexer tier detection search failed'); return null; }
        }

        const res = await splunkFetch(resultsUrl);
        if (!res.ok) { console.warn('[SCAN] Indexer tier detection results failed (HTTP ' + res.status + ')'); return null; }
        const data = await res.json();
        const rows = data.results || [];
        if (rows.length === 0) return {};
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
    // Anchor regex to exact-match each sourcetype (no substring/prefix matching)
    const escaped = filtered.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = '^(' + escaped.join('|') + ')$';
    const spl = `| metadata type=sourcetypes index=* | where match(sourcetype, "${pattern}") | convert ctime(*Time) | table sourcetype recentTime firstTime lastTime totalCount | eventstats sum(totalCount) as GrandTotal | sort - totalCount`;
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

/**
 * Slugify a display name into a safe product_id for custom cards.
 * "Cisco Secure Firewall" → "custom_cisco_secure_firewall"
 */
function slugifyProductId(displayName) {
    const slug = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    return `custom_${slug}`;
}

/**
 * Create a new custom product stanza in local/products.conf.
 */
async function createCustomProduct(productId, fields) {
    const url = `/splunkd/__raw/servicesNS/nobody/${APP_ID}/configs/conf-products`;
    const params = new URLSearchParams({ output_mode: 'json', name: productId });
    Object.entries(fields).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const res = await splunkFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create custom product: ${res.status} ${text}`);
    }
    return true;
}

/**
 * Update an existing custom product stanza in local/products.conf.
 */
async function updateCustomProduct(productId, fields) {
    const url = `/splunkd/__raw/servicesNS/nobody/${APP_ID}/configs/conf-products/${encodeURIComponent(productId)}`;
    const params = new URLSearchParams({ output_mode: 'json' });
    Object.entries(fields).forEach(([k, v]) => {
        params.append(k, v !== undefined && v !== null ? String(v) : '');
    });
    const res = await splunkFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to update custom product: ${res.status} ${text}`);
    }
    return true;
}

/**
 * Delete a custom product stanza from local/products.conf.
 */
async function deleteCustomProduct(productId) {
    const url = `/splunkd/__raw/servicesNS/nobody/${APP_ID}/configs/conf-products/${encodeURIComponent(productId)}`;
    const res = await splunkFetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete custom product: ${res.status} ${text}`);
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
                icon: '',
            });
        } else {
            tips.push({
                text: `For data collection, we highly recommend using SC4S (Splunk Connect for Syslog) to reliably ingest data for ${pn}. While the TA can be installed on a Heavy Forwarder to listen directly on a UDP port, this approach is only advisable for very small environments or single-integration use cases.`,
                linkLabel: sc4sLabel,
                linkUrl: product.sc4s_url,
                icon: '',
            });
        }
    } else if (isCloud) {
        tips.push({ text: `Since you are running Splunk Cloud, data for ${pn} is best ingested using a cloud-compatible input method such as an HTTP Event Collector (HEC) endpoint or the Splunk Cloud Data Manager.` });
    } else {
        tips.push({ text: `On Splunk Enterprise, consider using Splunk Connect for Syslog (SC4S) to reliably ingest data for ${pn}. SC4S handles syslog parsing and routes events to the correct sourcetype automatically.` });
    }

    if (ta) {
        tips.push({ text: `The required add-on for data ingestion is "${ta}". Make sure it is installed and enabled on your search heads and heavy forwarders.` });
    }

    if (viz) {
        tips.push({ text: `To visualise dashboards and reports, install "${viz}" on your search heads.` });
    }

    if (product.sourcetypes && product.sourcetypes.length > 0) {
        tips.push({ text: `Expected sourcetypes: ${product.sourcetypes.join(', ')}. Verify these appear in your environment after configuring the data input.` });
    }

    const allLegacy = [...(product.legacy_uids || []), ...(product.legacy_viz_uids || [])];
    if (allLegacy.length > 0) {
        const names = allLegacy.map(uid => {
            const sb = splunkbaseData && splunkbaseData[uid];
            return sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}`;
        }).join(', ');
        tips.push({ text: `Disable and remove these deprecated apps before using the recommended add-on: ${names}`, icon: '' });
    }

    // ── Custom per-product tips ────────────────────────────────────────
    if (product.best_practices && product.best_practices.length > 0) {
        product.best_practices.forEach(tip => {
            tips.push({ text: tip, icon: '', custom: true });
        });
    }

    return tips;
}

// ───────────────────  INTELLIGENCE BADGES COMPONENT  ────────────────

function IntelligenceBadges({ appStatus, vizAppStatus, vizApp2Status, sourcetypeInfo, sourcetypeSearchUrl, isArchived, isRoadmapCard }) {
    const items = [];

    if (isArchived) {
        items.push({ cls: 'archived', label: 'Archived — download from Splunkbase', key: 'archived' });
    }

    if (sourcetypeInfo) {
        const dataTooltip = 'Approximate count based on index metadata from the last 7 days. Click to open in Search for exact figures.';
        if (sourcetypeInfo.hasData && appStatus?.installed) {
            items.push({ cls: 'data-ok', label: `✓ Data flowing — ${sourcetypeInfo.detail}`, key: 'data-ok', url: sourcetypeSearchUrl, tooltip: dataTooltip });
        } else if (sourcetypeInfo.hasData && !appStatus?.installed) {
            items.push({ cls: 'data-ok', label: `Data found — ${sourcetypeInfo.detail}`, key: 'data-no-ta', url: sourcetypeSearchUrl, tooltip: dataTooltip });
        } else if (!sourcetypeInfo.hasData && !isRoadmapCard) {
            // Roadmap/coverage_gap products have no add-on yet — don't show "No sourcetypes defined"
            items.push({ cls: 'data-none', label: sourcetypeInfo.detail || 'No data (7d)', key: 'data-none', url: sourcetypeSearchUrl });
        }
    }
    if (items.length === 0) return null;

    return (
        <div className="csc-intelligence-badges">
            {items.map(b => (
                <span key={b.key} className={`csc-badge-item csc-badge-${b.cls}`} title={b.tooltip || ''}>
                    {b.url ? (
                        <a href={b.url} target="_blank" rel="noopener noreferrer" className="csc-badge-link" onClick={e => e.stopPropagation()}>
                            {b.label}
                        </a>
                    ) : b.label}
                </span>
            ))}
        </div>
    );
}

// ────────────────────  MODAL COPY BUTTON  ────────────────────
// Copies the full rendered modal body as rich HTML by cloning the DOM.

function CopyModalButton() {
    const [copied, setCopied] = useState(false);
    const btnRef = useRef(null);
    const handleClick = useCallback(() => {
        const modal = btnRef.current?.closest('[data-test="modal"]');
        const body = modal?.querySelector('.csc-sc4s-info');
        if (!body) return;
        // Expand any collapsed sections before cloning (e.g. "Show all N detections")
        body.querySelectorAll('.csc-es-show-all-btn').forEach(btn => btn.click());
        // Allow React to re-render expanded content, then proceed
        setTimeout(() => {
            _doCopy(body);
        }, 150);
    }, []);
    const _doCopy = useCallback((body) => {
        const clone = body.cloneNode(true);
        // Phase 1: structural cleanup (while classes still exist)
        clone.querySelectorAll('button, input, select, .scan-modal-resize-handle, .csc-sc4s-info-footer, .csc-sc4s-info-card-icon').forEach(el => el.remove());
        // Remove install status blocks by class before classes are stripped
        clone.querySelectorAll('[class*="scan-m8-"]').forEach(el => {
            let target = el.closest('[class*="csc-sc4s-info-section"]') ? el.closest('div[style]') : el.closest('div');
            if (target && /install\s*status|not on this SH/i.test(target.textContent)) target.remove();
        });
        // Convert info-card grids into clean separated blocks
        clone.querySelectorAll('.csc-sc4s-info-grid').forEach(grid => {
            const frag = document.createElement('div');
            grid.querySelectorAll('.csc-sc4s-info-card').forEach(card => {
                const block = document.createElement('div');
                block.style.cssText = 'margin:0 0 12px;padding:8px 12px;border-left:3px solid #003366;background:#f8f5f2;';
                const title = card.querySelector('strong');
                if (title) {
                    const h = document.createElement('p');
                    h.style.cssText = 'margin:0 0 3px;font-weight:700;font-size:13px;color:#003366;';
                    h.textContent = title.textContent;
                    block.appendChild(h);
                }
                card.querySelectorAll(':scope > span').forEach(sp => {
                    if (sp.classList.contains('csc-sc4s-info-card-icon')) return;
                    const p = document.createElement('p');
                    p.style.cssText = 'margin:0 0 3px;font-size:12px;line-height:1.5;color:#333;';
                    p.innerHTML = sp.innerHTML;
                    block.appendChild(p);
                });
                frag.appendChild(block);
            });
            grid.replaceWith(frag);
        });
        // Convert CIM pill badges into a comma-separated paragraph
        clone.querySelectorAll('.csc-es-cim-pills').forEach(container => {
            const names = [];
            container.querySelectorAll('.csc-es-cim-pill').forEach(pill => names.push(pill.textContent.trim()));
            if (names.length) {
                const p = document.createElement('p');
                p.textContent = names.join(', ');
                container.replaceWith(p);
            }
        });
        // Convert ESCU story items into a bullet list
        clone.querySelectorAll('.csc-es-stories').forEach(container => {
            const ul = document.createElement('ul');
            container.querySelectorAll('.csc-es-story-item').forEach(item => {
                item.querySelectorAll('.csc-es-story-icon').forEach(ic => ic.remove());
                const li = document.createElement('li');
                li.textContent = item.textContent.trim();
                ul.appendChild(li);
            });
            container.replaceWith(ul);
        });
        // Convert best-practices items into clean blocks
        clone.querySelectorAll('.csc-sc4s-info-bp-item').forEach(item => {
            item.querySelectorAll('.csc-sc4s-info-bp-icon').forEach(ic => ic.remove());
        });
        // Expand any <details> elements so their content is visible
        clone.querySelectorAll('details').forEach(el => el.setAttribute('open', ''));
        // Strip <summary> click targets (already expanded)
        clone.querySelectorAll('summary').forEach(el => el.remove());
        // Strip any remaining hidden/collapsed elements
        clone.querySelectorAll('[hidden], [aria-hidden="true"]').forEach(el => el.remove());
        // Remove empty wrapper divs to reduce HTML bulk (helps prevent clipboard truncation)
        let changed = true;
        while (changed) {
            changed = false;
            clone.querySelectorAll('div, span').forEach(el => {
                if (!el.children.length && !el.textContent.trim()) {
                    el.remove(); changed = true;
                }
            });
        }
        // Unwrap unnecessary single-child wrapper divs/spans to reduce nesting depth
        let unwrapped = true;
        while (unwrapped) {
            unwrapped = false;
            clone.querySelectorAll('div, span').forEach(el => {
                const hasOnlyOneChild = el.childNodes.length === 1 && el.firstElementChild;
                const parent = el.parentNode;
                if (hasOnlyOneChild && parent && el !== clone) {
                    parent.replaceChild(el.firstElementChild, el);
                    unwrapped = true;
                }
            });
        }
        // Phase 2: nuke ALL inline styles and classes — clean slate
        clone.querySelectorAll('*').forEach(el => {
            el.removeAttribute('style');
            el.removeAttribute('class');
            el.removeAttribute('data-test');
            el.removeAttribute('data-reactid');
            el.removeAttribute('role');
            el.removeAttribute('tabindex');
        });
        // Phase 3: apply clean document-only styles
        clone.querySelectorAll('h3').forEach(el => { el.style.cssText = 'margin:16px 0 6px;color:#003366;font-size:16px;font-weight:700;border-bottom:1px solid #003366;padding-bottom:4px;'; });
        clone.querySelectorAll('h4').forEach(el => { el.style.cssText = 'margin:12px 0 4px;color:#003366;font-size:14px;font-weight:700;'; });
        clone.querySelectorAll('a').forEach(el => { el.style.cssText = 'color:#0066cc;text-decoration:underline;'; });
        clone.querySelectorAll('p').forEach(el => { if (!el.style.cssText) el.style.cssText = 'margin:0 0 8px;font-size:13px;line-height:1.5;'; });
        clone.querySelectorAll('ul').forEach(el => { el.style.cssText = 'margin:4px 0 10px;padding-left:24px;'; });
        clone.querySelectorAll('li').forEach(el => { el.style.cssText = 'margin:0 0 4px;font-size:13px;line-height:1.5;'; });
        clone.querySelectorAll('strong').forEach(el => { el.style.cssText = 'font-weight:700;color:#1a1a1a;'; });
        clone.querySelectorAll('em, i').forEach(el => { el.style.cssText = 'font-style:italic;color:#555;'; });
        clone.querySelectorAll('code').forEach(el => { el.style.cssText = 'background:#f4f4f4;border:1px solid #ddd;border-radius:3px;padding:1px 5px;font-family:Menlo,Consolas,monospace;font-size:12px;color:#333;'; });
        clone.querySelectorAll('table').forEach(el => { el.style.cssText = 'border-collapse:collapse;width:100%;margin:10px 0;'; });
        clone.querySelectorAll('th').forEach(el => { el.style.cssText = 'padding:8px 10px;border:1px solid #ccc;text-align:left;font-size:13px;font-weight:700;color:#003366;background:#f3f0ec;'; });
        clone.querySelectorAll('td').forEach(el => { el.style.cssText = 'padding:6px 10px;border:1px solid #e0e0e0;text-align:left;font-size:13px;vertical-align:top;'; });
        const wrap = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.6;background:#ffffff;max-width:700px;">${clone.innerHTML}<hr style="border:none;border-top:1px solid #ccc;margin:16px 0 6px;" /><p style="margin:0;font-size:11px;color:#888;">Generated by Splunk Cisco App Navigator (SCAN)</p></div>`;
        const text = (clone.innerText || clone.textContent || '').trim() + '\n\nGenerated by Splunk Cisco App Navigator (SCAN)';
        copyRichToClipboard(wrap, text, () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []); // end _doCopy
    return (
        <button
            ref={btnRef}
            className={`csc-btn csc-btn-icon csc-btn-outline csc-modal-copy-btn ${copied ? 'csc-btn-copied' : ''}`}
            onClick={handleClick}
            title={copied ? 'Copied to clipboard!' : 'Copy full modal content to clipboard'}
            style={{ marginRight: 'auto' }}
        >
            {copied
                ? <span style={{ fontSize: '13px', fontWeight: 600 }}>✓ Copied</span>
                : <><Clipboard size={14} /><span style={{ marginLeft: '4px', fontSize: '12px' }}>Copy</span></>}
        </button>
    );
}

// ────────────────────  SC4S INFO MODAL  ───────────────────────

function SC4SInfoModal({ open, onClose, productContext }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    const pc = productContext || null;
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '820px', width: '92vw' }}>
            <Modal.Header title="Splunk Connect for Syslog (SC4S)" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ '--info-accent': '#00897b' }}>
                    {pc && (
                        <div className="scan-modal-product-context">
                            <h4>For {pc.displayName}</h4>
                            {pc.hasAddon && (
                                <p className="scan-modal-pc-note">SC4S is an <strong>optional alternative path</strong> — the add-on is the primary data source for this product.</p>
                            )}
                            {pc.sc4sSourcetypes && pc.sc4sSourcetypes.length > 0 && (
                                <div className="scan-modal-pc-row">
                                    <span className="scan-modal-pc-label">SC4S Sourcetypes</span>
                                    <span className="scan-modal-pc-value">{pc.sc4sSourcetypes.join(', ')}</span>
                                </div>
                            )}
                            {pc.companionTa && (
                                <div className="scan-modal-pc-row">
                                    <span className="scan-modal-pc-label">Companion TA</span>
                                    <span className="scan-modal-pc-value">
                                        {pc.companionTa.label || pc.companionTa.name}
                                        {pc.companionTa.installed && <span className="csc-dep-version" style={{marginLeft: 6}}>v{pc.companionTa.version}</span>}
                                        {!pc.companionTa.installed && <span className="csc-dep-status-missing" style={{marginLeft: 6}}>not installed</span>}
                                        {pc.companionTa.splunkbaseId && (
                                            <a href={generateSplunkbaseUrl(pc.companionTa.splunkbaseId)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" style={{marginLeft: 6}} title="View on Splunkbase">Splunkbase</a>
                                        )}
                                    </span>
                                </div>
                            )}
                            {pc.sc4sConfigNotes && pc.sc4sConfigNotes.length > 0 && (
                                <ul className="scan-modal-pc-notes">
                                    {pc.sc4sConfigNotes.map((note, i) => <li key={i}>{note}</li>)}
                                </ul>
                            )}
                            {pc.sc4sUrl && (
                                <a href={pc.sc4sUrl} target="_blank" rel="noopener noreferrer" className="scan-modal-pc-link">
                                    SC4S Docs for {pc.displayName} ›
                                </a>
                            )}
                        </div>
                    )}
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Technical Overview</h3>
                            <p>SC4S is an open-source, containerized solution designed to streamline the ingestion of syslog data into Splunk. Built on the <strong>syslog-ng Open Source Edition (OSE)</strong> engine, SC4S shifts the paradigm from traditional disk-based collection to a high-performance, streaming architecture.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>What is SC4S?</h4>
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
                        <a href="https://splunkbase.splunk.com/app/4740" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                             Splunkbase
                        </a>
                        <a href="https://splunk.github.io/splunk-connect-for-syslog/main/" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                             SC4S Official Documentation
                        </a>
                        <a href="https://github.com/splunk/splunk-connect-for-syslog" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                             GitHub Repository
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  NETFLOW / STREAM INFO MODAL  ───────────────────────

function NetFlowInfoModal({ open, onClose, installedApps, productContext }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    const pc = productContext || null;

    const streamTAs = [
        { id: 'splunk_app_stream', label: 'Splunk App for Stream', uid: '1809', vendor: 'Splunk' },
        { id: 'Splunk_TA_stream_wire_data', label: 'Splunk Add-on for Stream Wire Data', uid: '5234', vendor: 'Splunk' },
        { id: 'Splunk_TA_stream', label: 'Splunk Add-on for Stream Forwarders', uid: '5238', vendor: 'Splunk', forwarderOnly: true },
        { id: 'splunk_app_stream_ipfix_cisco_hsl', label: 'Cisco Catalyst Enhanced Netflow Add-on', uid: '6872', vendor: 'Cisco' },
    ];

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '860px', width: '92vw' }}>
            <Modal.Header title="NetFlow / Splunk Stream" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ '--info-accent': '#1565c0' }}>
                    {pc && (
                        <div className="scan-modal-product-context">
                            <h4>For {pc.displayName}</h4>
                            {pc.netflowAddon && (
                                <div className="scan-modal-pc-row">
                                    <span className="scan-modal-pc-label">Cisco NetFlow Add-on</span>
                                    <span className="scan-modal-pc-value">
                                        {pc.netflowAddonLabel || pc.netflowAddon}
                                        {pc.netflowAddonStatus?.installed && <span className="csc-dep-version" style={{marginLeft: 6}}>v{pc.netflowAddonStatus.version}</span>}
                                        {pc.netflowAddonStatus && !pc.netflowAddonStatus.installed && <span className="csc-dep-status-missing" style={{marginLeft: 6}}>not installed</span>}
                                        {pc.netflowAddonSplunkbaseId && (
                                            <a href={generateSplunkbaseUrl(pc.netflowAddonSplunkbaseId)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" style={{marginLeft: 6}} title="View on Splunkbase">Splunkbase</a>
                                        )}
                                    </span>
                                </div>
                            )}
                            {pc.netflowConfigNotes && pc.netflowConfigNotes.length > 0 && (
                                <ul className="scan-modal-pc-notes">
                                    {pc.netflowConfigNotes.map((note, i) => <li key={i}>{note}</li>)}
                                </ul>
                            )}
                            {pc.netflowAddonDocsUrl && (
                                <a href={pc.netflowAddonDocsUrl} target="_blank" rel="noopener noreferrer" className="scan-modal-pc-link">
                                    NetFlow Docs for {pc.displayName} ›
                                </a>
                            )}
                        </div>
                    )}
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Technical Overview</h3>
                            <p>The NetFlow / Splunk Stream solution provides network traffic visibility from Cisco devices using <strong>4 complementary packages</strong> — <strong>3 from Splunk</strong> (the Stream platform) and <strong>1 from Cisco</strong> (enhanced Netflow). Together they collect, parse, enrich, and visualize NetFlow v9, v10 (IPFIX), and wire data from your Cisco infrastructure.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>The 4-Package Ecosystem</h4>
                        <p style={{ marginBottom: '12px', fontSize: '13px' }}>All 4 packages work together. The 3 Splunk packages form the core Stream platform; the Cisco package adds IOS-XE-specific enhancements.</p>

                        {/* TA Install Status — all 4 packages */}
                        {installedApps && (
                            <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'var(--bg-primary, #f4f4f4)', borderRadius: '8px', border: '1px solid var(--border-light, #e3ddd8)' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px', color: 'var(--faint-color, #888)' }}>Search Head Install Status</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {streamTAs.map(ta => {
                                        const info = installedApps[ta.id];
                                        return (
                                            <div key={ta.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                                {ta.forwarderOnly ? (
                                                    <>
                                                        <span className="scan-m8-faint" style={{ fontWeight: 700, width: '14px' }}>⬦</span>
                                                        <span style={{ flex: 1 }}>{ta.label} <span className="scan-m8-faint" style={{ fontSize: '10px' }}>({ta.vendor})</span></span>
                                                        <span className="csc-dep-status-forwarder" style={{ fontSize: '10px' }}>forwarder-only</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className={info ? 'scan-m8-ok' : 'scan-m8-faint'} style={{ fontWeight: 700, width: '14px' }}>{info ? '✓' : '—'}</span>
                                                        <span style={{ flex: 1 }}>{ta.label} <span className="scan-m8-faint" style={{ fontSize: '10px' }}>({ta.vendor})</span></span>
                                                        {info && <span className="scan-m8-subtle" style={{ fontSize: '10px' }}>v{info.version}</span>}
                                                        {!info && <span className="scan-m8-faint" style={{ fontSize: '10px', fontStyle: 'italic' }}>not on this SH</span>}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

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
                                <span>Companion add-on to App for Stream and Add-on for Stream Forwarders. Contains <strong>knowledge objects and CIM mappings</strong> for data generated by the Add-on for Stream Forwarders (5238). Installed on <strong>Indexers and Search Heads</strong> — required on both for full parsing and normalized fields (search-time on Search Heads, index-time on Indexers).</span>
                            </div>
                            <div className="csc-sc4s-info-card">
                                <span className="csc-sc4s-info-card-icon"></span>
                                <strong>Cisco Catalyst Enhanced Netflow Add-on</strong>
                                <span style={{ fontSize: '11px', fontStyle: 'italic' }}><a href="https://splunkbase.splunk.com/app/6872" target="_blank" rel="noopener noreferrer">Splunkbase 6872</a> &middot; Cisco</span>
                                <span>Provides <strong>Netflow element mapping</strong> for Cisco Netflow data (v9 and v10/IPFIX) from <strong>Cisco Catalyst SD-WAN</strong> devices (supported product per Splunkbase). Extends Stream with Cisco-specific IPFIX templates and field extractions. For Stream deployments, install on <strong>Search Heads</strong>.</span>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>When Do You Need Each Package?</h4>
                        <table className="csc-sc4s-info-table">
                            <thead>
                                <tr>
                                    <th className="csc-sc4s-info-table-label scan-nf-th" style={{ width: '28%' }}>Cisco Platform</th>
                                    <th className="csc-sc4s-info-table-label scan-nf-th" style={{ width: '42%' }}>3 Splunk Stream Packages</th>
                                    <th className="csc-sc4s-info-table-label scan-nf-th" style={{ width: '30%' }}>Cisco Enhanced Netflow</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="csc-sc4s-info-table-label scan-nf-td-border">IOS-XE Devices</td>
                                    <td><span className="scan-nf-badge-req">Required</span> core Stream platform</td>
                                    <td><span className="scan-nf-badge-req">Required</span> decodes Cisco IPFIX templates</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0, borderLeft: '3px solid transparent' }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>Catalyst SD-WAN, ISR, ASR, WLC, Catalyst Switches</em></td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label scan-nf-td-border">NX-OS &amp; ACI Fabric</td>
                                    <td><span className="scan-nf-badge-req">Required</span> core Stream platform</td>
                                    <td><span className="scan-nf-badge-na">Not needed</span> standard NetFlow v9</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0, borderLeft: '3px solid transparent' }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>Nexus switches (standalone NX-OS) and ACI leaf/spine fabric (NetFlow v9 via APIC policy, ACI 4.1+)</em></td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label scan-nf-td-border-xr">IOS-XR Devices</td>
                                    <td><span className="scan-nf-badge-req">Required</span> core Stream platform</td>
                                    <td><span className="scan-nf-badge-opt">Optional</span> may enhance IPFIX decoding</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0, borderLeft: '3px solid transparent' }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>CRS carrier routers, ASR 9000 (IPFIX-capable)</em></td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label scan-nf-td-border-meraki">Meraki</td>
                                    <td><span className="scan-nf-badge-req">Required</span> core Stream platform</td>
                                    <td><span className="scan-nf-badge-na">Not needed</span> standard NetFlow v9</td>
                                </tr>
                                <tr style={{ fontSize: '12px' }}>
                                    <td style={{ paddingLeft: '20px', border: 'none', paddingTop: 0, borderLeft: '3px solid transparent' }}></td>
                                    <td colSpan="2" style={{ border: 'none', paddingTop: 0 }}><em>Cloud-managed — exports standard NetFlow v9 (not Cisco IPFIX)</em></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style={{ marginTop: '14px', padding: '12px 16px', background: 'var(--bg-primary, #f4f4f4)', borderRadius: '8px', border: '1px solid var(--border-light, #e3ddd8)', borderLeft: '3px solid var(--border-medium, #d2cbc5)' }}>
                            <strong style={{ fontSize: '13px' }}>Nexus Dashboard — Proprietary Flow Monitoring</strong>
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
                        <h4>Deployment Architecture</h4>
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
                                    <td><strong>Add-on for Stream Wire Data</strong> (5234) — required for index-time field extractions and CIM mappings</td>
                                </tr>
                                <tr>
                                    <td className="csc-sc4s-info-table-label">Search Heads</td>
                                    <td><strong>App for Stream</strong> (1809) + <strong>Add-on for Stream Wire Data</strong> (5234, required for search-time parsing and normalized fields) + <strong>Cisco Catalyst Enhanced Netflow Add-on</strong> (6872, for Cisco Catalyst SD-WAN)</td>
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
                                <span>The Cisco Catalyst Enhanced Netflow Add-on decodes proprietary IPFIX information elements for Application Visibility, Performance Routing, SD-WAN, and media metrics from Cisco Catalyst SD-WAN devices (supported product per Splunkbase).</span>
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
                        <h4>Best Practices</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Install All 3 Stream Packages</strong>
                                    <p>All three Splunk Stream packages are required: Add-on for Stream Forwarders (5238) on forwarders; App for Stream (1809) on search heads; Add-on for Stream Wire Data (5234) on <strong>indexers and search heads</strong> — 5234 on search heads is required for search-time parsing and normalized fields. Missing any one will result in incomplete or unnormalized data.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Add Cisco Enhanced Netflow for Catalyst SD-WAN</strong>
                                    <p>The Cisco Catalyst Enhanced Netflow Add-on (6872) supports <strong>Cisco Catalyst SD-WAN</strong> per Splunkbase. Install it on search heads for Stream deployments. It is <em>not</em> needed for NX-OS (Nexus), ACI, or Meraki.</p>
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
                        <a href="https://help.splunk.com/en/splunk-cloud-platform/collect-stream-data/install-and-configure-splunk-stream/8.1/introduction/about-splunk-stream" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Splunk Stream Documentation
                        </a>
                        <a href="https://www.cisco.com/c/en/us/solutions/collateral/enterprise-networks/sd-wan/sd-wan-splunk-integration-ug.html" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Cisco Enhanced Netflow Guide
                        </a>
                        <a href="https://splunkbase.splunk.com/app/6872" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Enhanced Netflow on Splunkbase
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
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
                <div className="csc-sc4s-info" style={{ '--info-accent': '#0A60FF' }}>
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
                            <h4>Splunk Cloud Note</h4>
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
                        <a href="https://docs.splunk.com/Documentation/SplunkCloud/latest/Forwarding/Deployaheavyforwarder" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Deploy a Heavy Forwarder — Splunk Docs
                        </a>
                        <a href="https://help.splunk.com/en/data-management/transform-and-route-data/perform-basic-data-processing/process-data-with-forwarders/types-of-forwarders" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Types of Forwarders — Splunk Docs
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  MAGIC EIGHT (PROPS.CONF) MODAL  ──────────────────────

/**
 * The "Magic Eight" props.conf settings that every well-tuned sourcetype
 * should have explicitly defined:
 *   1. SHOULD_LINEMERGE        — disable expensive line-merging heuristics
 *   2. TIME_FORMAT             — explicit strptime avoids datetime.xml guessing
 *   3. LINE_BREAKER            — event-boundary regex
 *   4. TRUNCATE                — max event size (default 10 000)
 *   5. TIME_PREFIX             — anchor for timestamp extraction
 *   6. MAX_TIMESTAMP_LOOKAHEAD — cap character scan window
 *   7. ANNOTATE_PUNCT          — disable unused punct:: field generation
 *   8. LEARN_SOURCETYPE        — disable sourcetype classification heuristic
 *
 * Sources:
 *   - Splunk PS: "The Importance of Being Earnest/Propped" (~60% CPU reduction)
 *   - Splunk Lantern: "Configuring new source types" (Great Eight + ANNOTATE_PUNCT)
 *   - Splunk Community Best Practice: props.conf sourcetype definition
 */
const MAGIC_EIGHT = [
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
    {
        key: 'ANNOTATE_PUNCT', defaultVal: 'true', recommended: 'false', difficulty: 'Easy',
        nickname: 'The Tattoo Artist',
        desc: 'Disables the punct:: indexed field — rarely used but generated for every event.',
        detail: 'By default, Splunk generates a punct:: field for every event — a string of punctuation characters '
            + 'extracted from _raw. This runs a regex on every event at index time AND stores the result in the tsidx '
            + '(indexed data). The punct field is occasionally useful for finding outlier patterns in data, but in practice '
            + 'it is rarely searched on. Disabling it with ANNOTATE_PUNCT = false removes both the CPU cost of the regex '
            + 'and the disk cost of storing the field. If you ever need punct at search time, you can regenerate it with: '
            + '| eval punct = replace(replace(_raw, "\\w", ""), "\\s", "_"). The Splunk Lantern "Configuring new source types" '
            + 'guide and the Splunk Product Best Practices team both recommend disabling this for optimized sourcetypes.',
        gotcha: 'Once disabled, the punct:: field is not available for that sourcetype until re-enabled or regenerated at search time.',
        isBad: v => /^(true|t|1)$/i.test(v),
    },
    {
        key: 'LEARN_SOURCETYPE', defaultVal: 'true', recommended: 'false', difficulty: 'Easy',
        nickname: 'The Second Guesser',
        desc: 'Disables sourcetype classification heuristic when sourcetypes are already assigned.',
        detail: 'When LEARN_SOURCETYPE = true (the default), Splunk runs its automatic sourcetype classification '
            + 'heuristic on every incoming event — even when the sourcetype is already explicitly assigned via inputs.conf, '
            + 'SC4S, or HEC. This is pure waste in environments where sourcetypes are always explicitly set (which includes '
            + 'all Cisco TAs and SC4S deployments). Setting LEARN_SOURCETYPE = false tells Splunk: "trust the assigned '
            + 'sourcetype — don\'t run classification." This is a zero-risk optimization because the classification result '
            + 'is never used when an explicit sourcetype is already assigned. The heuristic consumes CPU per-event for '
            + 'pattern matching that is immediately discarded.',
        gotcha: 'Only set to false when sourcetypes are always explicitly assigned (inputs.conf, SC4S, HEC). This is true for all Cisco TAs.',
        isBad: v => /^(true|t|1)$/i.test(v),
    },
];

function MagicEightModal({ open, onClose, sourcetypes, productName, addonApp, addonLabel, appViz, appViz2, installedApps, indexerApps }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null); // { sourcetype: { setting: value } }
    const [searchSpl, setSearchSpl] = useState(null);
    const [sortColumn, setSortColumn] = useState('sourcetype');
    const [sortDirection, setSortDirection] = useState('asc');

    // Portal-based resizable modal (bypasses @splunk/react-ui Modal + react-spring)
    const INIT_W = 960, INIT_H = 640;
    const MIN_W = 600, MAX_W = Math.round(window.innerWidth * 0.96);
    const MIN_H = 400, MAX_H = Math.round(window.innerHeight * 0.92);
    const [size, setSize] = useState({ w: INIT_W, h: INIT_H });
    const [pos, setPos] = useState({ x: Math.round((window.innerWidth - INIT_W) / 2), y: Math.max(24, Math.round((window.innerHeight - INIT_H) / 2)) });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
    const resizeRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

    // Drag-to-move (header)
    const onDragStart = useCallback((e) => {
        if (e.target.closest('button')) return; // don't drag on close button
        e.preventDefault();
        dragRef.current = { x: e.clientX, y: e.clientY, startX: pos.x, startY: pos.y };
        setIsDragging(true);
    }, [pos]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e) => {
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            setPos({ x: dragRef.current.startX + dx, y: dragRef.current.startY + dy });
        };
        const onUp = () => setIsDragging(false);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, [isDragging]);

    // Resize (SE corner handle)
    const onResizeStart = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
        setIsResizing(true);
    }, [size]);

    useEffect(() => {
        if (!isResizing) return;
        const onMove = (e) => {
            const dx = e.clientX - resizeRef.current.x;
            const dy = e.clientY - resizeRef.current.y;
            setSize({
                w: Math.min(MAX_W, Math.max(MIN_W, resizeRef.current.w + dx)),
                h: Math.min(MAX_H, Math.max(MIN_H, resizeRef.current.h + dy)),
            });
        };
        const onUp = () => setIsResizing(false);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    // ESC key to close
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);


    // Build tier version rows for addon + app_viz + app_viz_2
    const tierRows = useMemo(() => {
        if (!installedApps) return [];
        const apps = [];
        if (addonApp) apps.push({ id: addonApp, label: addonLabel || addonApp, role: 'Add-on' });
        if (appViz) apps.push({ id: appViz, label: appViz, role: 'App' });
        if (appViz2) apps.push({ id: appViz2, label: appViz2, role: 'App' });
        return apps.map(a => {
            const sh = installedApps[a.id];
            const isAddon = a.role === 'Add-on';
            const idx = (isAddon && indexerApps) ? indexerApps[a.id] : undefined;
            const shVer = sh ? sh.version : null;
            const idxVer = idx ? idx.version : null;
            const idxDisabled = idx ? idx.disabled : false;
            let state = 'na';
            if (!sh) {
                state = 'not_installed';
            } else if (!isAddon) {
                state = 'sh_only';
            } else if (!indexerApps) {
                state = 'loading';
            } else if (Object.keys(indexerApps).length === 0) {
                state = 'standalone';
            } else if (!idx) {
                state = 'missing';
            } else if (idxDisabled) {
                state = 'disabled';
            } else if (shVer && idxVer && shVer !== idxVer) {
                state = 'mismatch';
            } else {
                state = 'ok';
            }
            return { ...a, shVer, idxVer, idxDisabled, state, idxCount: idx ? idx.indexerCount : 0 };
        }).filter(r => r.state !== 'not_installed');
    }, [addonApp, addonLabel, appViz, appViz2, installedApps, indexerApps]);

    useEffect(() => {
        if (!open || !sourcetypes || sourcetypes.length === 0) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setResults(null);

        (async () => {
            try {
                // Build the IN() list for sourcetypes (exact names only; wildcards use match())
                // All comparisons use lowercase to handle case mismatches (e.g. Cisco:ISE:Syslog vs cisco:ise:syslog)
                const exactSts = sourcetypes.filter(st => !st.includes('*'));
                const wildcardPatterns = sourcetypes.filter(st => st.includes('*')).map(st => st.replace(/\*/g, '.*'));

                const filterParts = [];
                if (exactSts.length > 0) {
                    filterParts.push(`_norm_title IN (${exactSts.map(st => `"${st.toLowerCase()}"`).join(', ')})`);
                }
                wildcardPatterns.forEach(p => {
                    filterParts.push(`match(_norm_title, "^${p.toLowerCase()}$")`);
                });

                // System-wide lookup: don't scope to a single app because props.conf
                // stanzas merge across apps by priority.  A sourcetype can have
                // SHOULD_LINEMERGE from one app and TIME_FORMAT from another.
                // We aggregate across ALL apps so we never flag false-positive gaps.
                const titleFilter = filterParts.join(' OR ');

                // REST best practices:
                //   1. f= limits returned fields (bandwidth + performance)
                //   2. | search filters by sourcetypes immediately
                //   3. Distributed: Exclude local SH — we want indexer-tier props.conf
                //      Standalone: Query local only (same host is SH + indexer)
                //   4. | stats values(*) as * by title — dedup across cluster AND apps
                //   5. values(eai:acl.app) tracks which app(s) define each setting
                //   6. f=rename + _norm_title handles props.conf rename directives
                //      (e.g. [Cisco:ISE:Syslog] rename=cisco:ise:syslog) and case mismatches
                const m6Fields = MAGIC_EIGHT.map(m => `f=${m.key}`).join(' ');
                const isStandalone = indexerApps !== null && Object.keys(indexerApps).length === 0;
                const splParts = [
                    `| rest splunk_server=${isStandalone ? 'local' : '*'} /servicesNS/-/-/configs/conf-props f=eai:* f=rename ${m6Fields} count=0`,
                    '| eval _norm_title=if(isnotnull(rename) AND rename!="", rename, lower(title))',
                    `| search (${titleFilter}) NOT eai:acl.app IN (system, learned, _cluster_manager_app, splunk_ingest_actions, SplunkUniversalForwarder, SplunkForwarder, SplunkDeploymentServerConfig, Splunk_SA_CIM, python_upgrade_readiness_app, splunk_instrumentation, splunk_internal_metrics, splunk_monitoring_console, splunk_secure_gateway)`,
                    `| fields splunk_server eai:acl.app _norm_title ${MAGIC_EIGHT.map(m => m.key).join(' ')}`,
                ];
                if (!isStandalone) {
                    splParts.push('| search [| rest splunk_server=* /services/server/info f=server_roles | where match(server_roles, "indexer") | fields splunk_server]');
                }
                splParts.push('| stats values(*) as * values(eai:acl.app) as defining_apps by _norm_title | rename _norm_title as title');
                const spl = splParts.join(' ');
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
                    MAGIC_EIGHT.forEach(m => {
                        lookup[st][m.key] = r[m.key] !== undefined ? r[m.key] : null;
                    });
                    const da = r.defining_apps;
                    lookup[st].defining_apps = Array.isArray(da) ? da : (da ? [da] : []);
                });

                // Add entries for sourcetypes that had no stanza found
                sourcetypes.forEach(st => {
                    if (!st.includes('*') && !lookup[st]) {
                        lookup[st] = {};
                        MAGIC_EIGHT.forEach(m => { lookup[st][m.key] = null; });
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

    const sortedSts = results ? Object.keys(results).sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;
        if (sortColumn === 'sourcetype') {
            return dir * a.localeCompare(b);
        }
        if (sortColumn === 'defining_apps') {
            const aVal = (results[a].defining_apps || []).join(', ');
            const bVal = (results[b].defining_apps || []).join(', ');
            if (!aVal && !bVal) return a.localeCompare(b);
            if (!aVal) return 1;
            if (!bVal) return -1;
            return dir * aVal.localeCompare(bVal);
        }
        // Config columns: group empty/missing together at the end
        const aRaw = results[a][sortColumn];
        const bRaw = results[b][sortColumn];
        const aEmpty = aRaw === null || aRaw === undefined || aRaw === '';
        const bEmpty = bRaw === null || bRaw === undefined || bRaw === '';
        if (aEmpty && bEmpty) return a.localeCompare(b);
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        return dir * String(aRaw).localeCompare(String(bRaw));
    }) : [];
    const handleSort = (col) => {
        if (sortColumn === col) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDirection('asc');
        }
    };
    const allConfigured = sortedSts.length > 0 && sortedSts.every(st => {
        const r = results[st];
        return MAGIC_EIGHT.every(m => r[m.key] !== null && r[m.key] !== undefined && r[m.key] !== '');
    });
    const anyBad = sortedSts.length > 0 && sortedSts.some(st => {
        const r = results[st];
        return MAGIC_EIGHT.some(m => {
            const v = r[m.key];
            return v !== null && v !== undefined && v !== '' && m.isBad(String(v));
        });
    });

    if (!open) return null;

    const modalStyle = {
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${size.w}px`,
        height: `${size.h}px`,
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--modal-bg, #fff)',
        borderRadius: '8px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
        opacity: (isDragging || isResizing) ? 0.85 : 1,
        transition: (isDragging || isResizing) ? 'none' : 'opacity 0.15s',
        overflow: 'hidden',
    };

    return ReactDOM.createPortal(
        <>
            {/* Backdrop / scrim */}
            <div
                className="scan-drm-overlay"
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.35)' }}
            />
            {/* Modal container */}
            <div style={modalStyle}>
                {/* Header — draggable */}
                <div
                    className="scan-drm-header"
                    onMouseDown={onDragStart}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 20px', cursor: 'move', userSelect: 'none',
                        borderBottom: '1px solid var(--border-light, #e3ddd8)',
                        background: 'var(--bg-surface, #f8f9fb)',
                        borderRadius: '8px 8px 0 0',
                        flexShrink: 0,
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #1a2029)' }}>
                        Props.conf Audit — {productName || 'Product'}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                            fontSize: '20px', color: 'var(--text-secondary, #5a5450)', lineHeight: 1,
                        }}
                        title="Close"
                    >×</button>
                </div>
                {/* Body — scrollable */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
                <div className="csc-sc4s-info" style={{ '--info-accent': '#546e7a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        {addonApp ? (
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary, #5a5450)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600 }}>Add-on:</span>
                                <code style={{ fontSize: '12px', padding: '2px 8px', background: 'var(--bg-primary, #f4f4f4)', borderRadius: '4px', border: '1px solid var(--border-light, #e3ddd8)' }}>{addonLabel || addonApp}</code>
                                {addonLabel && addonLabel !== addonApp && <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #736d68)' }}>({addonApp})</span>}
                            </div>
                        ) : <div />}
                    </div>

                    {/* ── Tier Version Audit ── */}
                    {tierRows.length > 0 && (() => {
                        const hasProblems = tierRows.some(r => r.state === 'mismatch' || r.state === 'missing' || r.state === 'disabled');
                        const borderColor = hasProblems ? '#FF9000' : '#3D851C';
                        return (
                            <div style={{ marginBottom: '14px', padding: '10px 14px', borderLeft: `3px solid ${borderColor}`, borderRadius: '6px', background: 'var(--bg-primary, #f8f9fb)', fontSize: '12px' }}>
                                <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '6px', color: 'var(--text-primary, #1a2029)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {hasProblems ? '⚠' : '✓'} Deployment Versions
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-light, #e3ddd8)' }}>
                                            <th style={{ textAlign: 'left', padding: '3px 8px 3px 0', fontWeight: 600, color: 'var(--text-secondary, #5a5450)' }}>App</th>
                                            <th style={{ textAlign: 'left', padding: '3px 8px', fontWeight: 600, color: 'var(--text-secondary, #5a5450)' }}>SH</th>
                                            <th style={{ textAlign: 'left', padding: '3px 8px', fontWeight: 600, color: 'var(--text-secondary, #5a5450)' }}>Indexer Tier</th>
                                            <th style={{ textAlign: 'left', padding: '3px 8px', fontWeight: 600, color: 'var(--text-secondary, #5a5450)' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tierRows.map(r => {
                                            const stateStyle = {
                                                ok: { cls: 'scan-m8-state-ok', label: 'Matched' },
                                                mismatch: { cls: 'scan-m8-state-mismatch', label: 'Version Mismatch' },
                                                missing: { cls: 'scan-m8-state-missing', label: 'Not on Indexers' },
                                                disabled: { cls: 'scan-m8-state-disabled', label: 'Disabled on IDX' },
                                                standalone: { cls: 'scan-m8-state-standalone', label: 'Standalone' },
                                                sh_only: { cls: 'scan-m8-state-ok', label: 'SH Only' },
                                                loading: { cls: 'scan-m8-state-standalone', label: 'Checking…' },
                                            }[r.state] || { cls: 'scan-m8-state-standalone', label: '—' };
                                            return (
                                                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light, #e3ddd8)' }}>
                                                    <td style={{ padding: '4px 8px 4px 0', color: 'var(--text-primary, #1a2029)' }}>
                                                        <span style={{ fontWeight: 600 }}>{r.label}</span>
                                                        <span style={{ fontSize: '10px', marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-surface, #f0ede9)', color: 'var(--text-tertiary, #736d68)' }}>{r.role}</span>
                                                    </td>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        <code style={{ fontSize: '11px', padding: '1px 6px', background: 'var(--bg-surface, #f0ede9)', borderRadius: '3px' }}>{r.shVer || '—'}</code>
                                                    </td>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        {r.state === 'standalone' || r.state === 'sh_only' ? (
                                                            <span className="scan-m8-muted">N/A</span>
                                                        ) : r.state === 'loading' ? (
                                                            <span className="scan-m8-muted">…</span>
                                                        ) : r.state === 'missing' ? (
                                                            <span className="scan-m8-warn">Not installed</span>
                                                        ) : (
                                                            <code className={r.state === 'mismatch' ? 'scan-m8-state-mismatch' : ''} style={{ fontSize: '11px', padding: '1px 6px', background: 'var(--bg-surface, #f0ede9)', borderRadius: '3px' }}>{r.idxVer || '—'}</code>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        <span className={stateStyle.cls} style={{ fontSize: '11px', fontWeight: 600 }}>{stateStyle.label}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {hasProblems && (
                                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary, #5a5450)', lineHeight: 1.5 }}>
                                        Version mismatches between SH and indexer tiers can cause props.conf gaps — the indexer may be running older definitions.
                                    </div>
                                )}
                                <div style={{ marginTop: '6px', textAlign: 'right' }}>
                                    <a
                                        href={`/app/search/search?q=${encodeURIComponent(
                                            '| rest splunk_server=* /servicesNS/-/-/apps/local f=title f=version f=disabled count=0'
                                            + ` | search title IN (${tierRows.map(r => `"${r.id}"`).join(', ')})`
                                            + ' | join splunk_server [| rest splunk_server=* /services/server/info f=server_roles | where match(server_roles, "search_head|indexer") | fields splunk_server server_roles]'
                                            + ' | eval server_roles=mvjoin(server_roles, ", ")'
                                            + ' | fields splunk_server server_roles title version disabled'
                                            + ' | sort server_roles title'
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: '11px', color: 'var(--text-link, #0066cc)', textDecoration: 'none' }}
                                    >
                                        Open in Search ↗
                                    </a>
                                </div>
                            </div>
                        );
                    })()}
                    {tierRows.length === 0 && addonApp && (
                        <div style={{ marginBottom: '14px', padding: '10px 14px', borderLeft: '3px solid var(--color-warning, #FF9000)', borderRadius: '6px', background: 'var(--bg-primary, #f8f9fb)', fontSize: '12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '4px', color: 'var(--text-primary, #1a2029)' }}>
                                Add-on not installed
                            </div>
                            <div style={{ color: 'var(--text-secondary, #5a5450)', lineHeight: 1.5 }}>
                                <strong>{addonLabel || addonApp}</strong> is not installed on this search head. Install it to enable index-time parsing (props.conf, transforms.conf) and search-time field extractions for this product's sourcetypes.
                            </div>
                        </div>
                    )}

                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-text">
                            <h3>The Magic Eight — Props.conf Health Check</h3>
                            <p>Every well-tuned sourcetype should explicitly define these eight <code>props.conf</code> settings.
                            Missing settings force Splunk to fall back to expensive heuristics at index time, impacting ingestion performance.</p>
                        </div>
                    </div>

                    {loading && (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary, #5a5450)' }}>
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
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary, #5a5450)' }}>
                            No props.conf stanzas found for this product's sourcetypes.
                            This is expected if no add-on is installed.
                        </div>
                    )}

                    {results && sortedSts.length > 0 && (
                        <div className="scan-magic6-results">
                            {allConfigured && !anyBad && (
                                <div className="scan-magic6-allgood">
                                    All Magic Eight settings are explicitly configured — excellent!
                                </div>
                            )}
                            {anyBad && (
                                <div className="scan-magic6-allgood" style={{ borderLeftColor: 'var(--color-warning, #FF9000)' }}>
                                    Some settings use non-recommended values — review highlighted cells below.
                                </div>
                            )}
                            <div className="scan-magic6-table-wrap">
                                <table className="scan-magic6-table">
                                    <thead>
                                        <tr>
                                            <th className="scan-magic6-th-st scan-magic6-th-sort" onClick={() => handleSort('sourcetype')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                Sourcetype {sortColumn === 'sourcetype' && <span style={{ fontSize: '9px', marginLeft: '2px', opacity: 0.7 }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                                            </th>
                                            {MAGIC_EIGHT.map(m => (
                                                <th key={m.key} className="scan-magic6-th-setting scan-magic6-th-sort" title={`"${m.nickname}" — ${m.detail}`} onClick={() => handleSort(m.key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    {m.key.replace(/_/g, '_\u200B')} {sortColumn === m.key && <span style={{ fontSize: '9px', marginLeft: '2px', opacity: 0.7 }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                                                </th>
                                            ))}
                                            <th className="scan-magic6-th-setting scan-magic6-th-sort" title="App(s) where this sourcetype's props.conf stanza is defined" onClick={() => handleSort('defining_apps')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                Defining App {sortColumn === 'defining_apps' && <span style={{ fontSize: '9px', marginLeft: '2px', opacity: 0.7 }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedSts.map(st => {
                                            const r = results[st];
                                            return (
                                                <tr key={st}>
                                                    <td className="scan-magic6-td-st" title={st}>{st}</td>
                                                    {MAGIC_EIGHT.map(m => {
                                                        const val = r[m.key];
                                                        const isDefined = val !== null && val !== undefined && val !== '';
                                                        const bad = isDefined && m.isBad(String(val));
                                                        const cellClass = isDefined
                                                            ? (bad ? 'scan-magic6-bad' : 'scan-magic6-ok')
                                                            : 'scan-magic6-miss';
                                                        const tip = isDefined
                                                            ? `${m.key} = ${val}${bad ? ' — Not recommended' : ''}`
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
                        <h4>What Are the Magic Eight?</h4>
                        <div className="csc-sc4s-info-grid">
                            {MAGIC_EIGHT.map(m => (
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
                                                <p className="scan-tooltip-gotcha" style={{ margin: '0 0 8px', padding: '8px 12px', borderRadius: '4px', fontSize: '12px' }}>
                                                    <strong>Gotcha:</strong> {m.gotcha}
                                                </p>
                                            )}
                                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary, #5a5450)', marginTop: 6 }}>
                                                <span>Default: <code>{m.defaultVal}</code></span>
                                                <span>✓ Recommended: <code>{m.recommended}</code></span>
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className="csc-sc4s-info-card" style={{ cursor: 'help' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong><code>{m.key}</code></strong>
                                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', border: 'none', fontWeight: 600, background: m.difficulty === 'Easy' ? 'rgba(61,133,28,0.10)' : m.difficulty === 'Medium' ? 'rgba(192,118,0,0.10)' : 'rgba(217,24,33,0.10)', color: m.difficulty === 'Easy' ? '#3D851C' : m.difficulty === 'Medium' ? '#C07600' : '#D91821' }}>{m.difficulty}</span>
                                        </div>
                                        <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary, #5a5450)', fontWeight: 600 }}>"{m.nickname}"</span>
                                        <span>{m.desc}</span>
                                        {m.gotcha && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #5a5450)' }}>{m.gotcha}</span>
                                        )}
                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #736d68)' }}>Default: <code>{m.defaultVal}</code></span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary, #5a5450)' }}>✓ Recommended: <code>{m.recommended}</code></span>
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
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-info">
                                <div>
                                    <strong>Up to 60% CPU Reduction — Measured</strong>
                                    <p>Splunk Professional Services has documented that providing explicit Magic Eight values can
                                    <strong> reduce the CPU and wall-clock cost of ingesting a data set by as much as 60%</strong>.
                                    The two biggest contributors are SHOULD_LINEMERGE (disabling the aggregator's 4-regex heuristic cycle)
                                    and TIME_FORMAT (eliminating the datetime.xml keyring scan). These savings are cumulative — each
                                    setting you define removes an entire phase of guesswork from the indexing pipeline.</p>
                                    <p className="scan-m8-subtle" style={{ fontSize: '11px', marginTop: 6 }}>
                                        Source: <em>"The Importance of Being Earnest/Propped"</em> — Splunk Professional Services
                                    </p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-info">
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
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-info">
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
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-info">
                                <div>
                                    <strong>The Recipe Principle</strong>
                                    <p>Think of it this way: every sourcetype that arrives at your indexers without explicit Magic Eight settings
                                    is like handing raw ingredients to a chef with no recipe. The chef has to taste, smell, and test every
                                    combination before cooking — wasting time and likely getting the dish wrong. With a recipe (explicit
                                    props.conf), the chef goes straight to cooking.</p>
                                    <p style={{ marginTop: 6 }}>The impact compounds: <strong>faster indexing = more headroom for searches</strong>. Your indexers have
                                    a finite CPU budget. Every cycle spent on heuristic guesswork during ingestion is a cycle stolen from
                                    search processing. When you optimize props.conf, you're not just making ingestion faster — you're making
                                    your entire Splunk deployment faster because the indexers aren't burning CPU trying to figure out
                                    data they've already been told how to handle.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-warn">
                                <div>
                                    <strong>The Cascade: Missing One Setting Amplifies Others</strong>
                                    <p>These six settings are interconnected. Without TIME_PREFIX, Splunk scans the entire event for timestamps — but
                                    that scan uses TIME_FORMAT (or datetime.xml), which is bounded by MAX_TIMESTAMP_LOOKAHEAD. Without
                                    LINE_BREAKER, events aren't properly split — so SHOULD_LINEMERGE kicks in to try to reassemble them,
                                    triggering 4 regexes per boundary. And without TRUNCATE tuning, multi-line events silently lose data.
                                    Each missing setting doesn't just add cost — it amplifies the cost of every other missing setting.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/Splunk/latest/Admin/Propsconf" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            props.conf Reference — Splunk Docs
                        </a>
                        <a href="https://lantern.splunk.com/Platform_Data_Management/Optimize_Data/Configuring_new_source_types" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Configuring New Sourcetypes — Splunk Lantern
                        </a>
                        <a href="https://help.splunk.com/en/splunk-enterprise/get-data-in/get-started-with-getting-data-in/10.2/configure-timestamps/configure-timestamp-recognition" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                            Configure Timestamp Recognition
                        </a>
                    </div>
                </div>
                </div>
                {/* Footer */}
                <div className="scan-drm-footer" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px',
                    padding: '12px 20px', borderTop: '1px solid var(--border-light, #e3ddd8)',
                    background: 'var(--bg-surface, #f8f9fb)', borderRadius: '0 0 8px 8px',
                    flexShrink: 0, position: 'relative',
                }}>
                    {searchSpl && (
                        <Button
                            appearance="secondary"
                            label="Open in Search"
                            onClick={() => {
                                const stFilter = sourcetypes && sourcetypes.length > 0
                                    ? sourcetypes.map(s => `"${s}"`).join(', ')
                                    : null;
                                const savedSearchSpl = `| savedsearch "SCAN - Magic Eight Audit" scope="environment"${stFilter ? ` | search Sourcetype IN (${stFilter})` : ''}`;
                                window.open(createURL(`/app/${APP_ID}/search?q=${encodeURIComponent(savedSearchSpl)}`), '_blank');
                            }}
                            style={{ marginRight: 'auto' }}
                        />
                    )}
                    <Button appearance="secondary" label="Close" onClick={onClose} />
                    {/* Resize handle — SE corner */}
                    <div
                        className="scan-modal-resize-handle"
                        onMouseDown={onResizeStart}
                        title="Drag to resize"
                    />
                </div>
            </div>
        </>,
        document.body
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
                <div className="csc-sc4s-info" style={{ '--info-accent': '#00838f' }}>
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Security Orchestration, Automation & Response</h3>
                            <p>Splunk SOAR (formerly Phantom) enables organizations to <strong>automate security workflows</strong>, orchestrate actions across tools, and respond to threats in seconds rather than hours. SOAR connectors bridge Splunk SOAR with {productName ? <strong>{productName}</strong> : 'Cisco products'}, enabling automated investigation, containment, and remediation playbooks.</p>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-section">
                        <h4>What is Splunk SOAR?</h4>
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
                            <h4>{productName ? `${productName} — ` : ''}Available Connectors ({connectors.length})</h4>
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
                                                    <span className="scan-m8-dash">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="csc-sc4s-info-section">
                        <h4>Best Practices</h4>
                        <div className="csc-sc4s-info-bp">
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Install Connectors from Splunkbase</strong>
                                    <p>SOAR connectors are installed within SOAR's "Apps" menu, not via Splunk Enterprise. Download from Splunkbase and import into your SOAR instance.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Use Service Accounts</strong>
                                    <p>Configure SOAR connectors with dedicated service accounts (not personal credentials) with least-privilege access for each Cisco product integration.</p>
                                </div>
                            </div>
                            <div className="csc-sc4s-info-bp-item csc-sc4s-info-bp-good">
                                <span className="csc-sc4s-info-bp-marker"></span>
                                <div>
                                    <strong>Start with Investigation Playbooks</strong>
                                    <p>Before enabling automated response actions, start with investigative playbooks that enrich and triage. Graduate to automated containment once confidence is established.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="csc-sc4s-info-footer">
                        <a href="https://docs.splunk.com/Documentation/SOARonprem/latest/User/Overview" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                             Splunk SOAR Documentation
                        </a>
                        <a href="https://splunkbase.splunk.com/apps?page=1&keyword=cisco&built_by=splunk&built_by=cisco&product=soar" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                             Browse All SOAR Connectors
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  ALERT ACTIONS INFO MODAL  ───────────────────

function AlertActionsInfoModal({ open, onClose, alertActionUids, splunkbaseData, productName }) {
    const returnFocusRef = useRef(null);
    if (!open) return null;
    const actions = (alertActionUids || []).map(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return { uid, label: sb ? (sb.title || sb.appid || `App #${uid}`) : `App #${uid}` };
    });
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '560px', width: '92vw' }}>
            <Modal.Header title="Alert Actions" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ fontSize: '13px' }}>
                    <p>This product has <strong>custom alert actions</strong> available on Splunkbase. Install them to send Splunk alerts to {productName ? productName : 'Cisco'} systems (e.g. create tickets, trigger workflows).</p>
                    {actions.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                            <h4 style={{ marginBottom: '8px' }}>Available alert actions</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {actions.map((a) => (
                                    <li key={a.uid} style={{ marginBottom: '4px' }}>
                                        <a href={generateSplunkbaseUrl(a.uid)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                                            {a.label}
                                        </a>
                                        {' '}
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted, #666)' }}>(UID {a.uid})</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  ITSI INFO MODAL  ─────────────────────────────

function ITOpsContentModal({ open, onClose, itsiContentPack, iteLearnContent, iteLearnProcedures, iteLearnProcedureCount, productName, installedApps }) {
    const returnFocusRef = useRef(null);
    const [showProcedures, setShowProcedures] = useState(false);
    if (!open) return null;
    const pack = itsiContentPack || {};
    const hasItsi = !!pack.label;
    const procedures = iteLearnProcedures || [];
    const procCount = iteLearnProcedureCount || 0;
    const hasIteLearn = iteLearnContent && procCount > 0;
    const itsiInstalled = installedApps?.['itsi'];
    const iteInstalled = installedApps?.['it_essentials_learn'];

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '860px', width: '92vw' }}>
            <Modal.Header title="ITOps Content" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ '--info-accent': '#2e7d32' }}>
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>IT Operations</h3>
                            <p>
                                {productName ? <strong>{productName}</strong> : 'This product'} has ITOps content available
                                across Splunk's operations ecosystem.
                                {hasItsi && <>{' '}An <strong>ITSI Content Pack</strong> provides pre-built service templates and KPIs.</>}
                                {hasIteLearn && <>{' '}<strong>{procCount} IT Essentials Learn</strong> procedures are available.</>}
                            </p>
                        </div>
                    </div>

                    {/* ── Tier 1: IT Service Intelligence (Premium) ── */}
                    {hasItsi && (
                        <div className="csc-sc4s-info-section" style={{ borderLeft: '3px solid #7C3AED', paddingLeft: '16px' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Splunk IT Service Intelligence
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>Premium</span>
                                {itsiInstalled && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Installed</span>}
                            </h4>
                            <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                ITSI Content Packs provide <strong>pre-built service templates, KPIs, glass tables, and deep dives</strong> for monitoring Cisco infrastructure.
                            </p>

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

                    {/* ── Tier 2: IT Essentials Learn (Free) ── */}
                    {hasIteLearn && (
                        <div className="csc-sc4s-info-section" style={{ borderLeft: '3px solid #22C55E', paddingLeft: '16px' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                IT Essentials Learn
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Free</span>
                                {iteInstalled && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Installed</span>}
                            </h4>
                            <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                IT Essentials Learn provides guided operational procedures and analytics
                                {' '}— <strong>no ITSI license required</strong>.
                            </p>

                            <div>
                                <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary, #736d68)' }}>Procedures ({procCount})</strong>
                                <div style={{ marginTop: '6px' }}>
                                    {procedures.length > 5 && !showProcedures ? (
                                        <>
                                            <ul className="csc-es-detection-list">
                                                {procedures.slice(0, 5).map(p => <li key={p}>{p}</li>)}
                                            </ul>
                                            <button className="csc-es-show-all-btn" onClick={() => setShowProcedures(true)}>
                                                Show all {procCount} procedures ▾
                                            </button>
                                        </>
                                    ) : (
                                        <ul className="csc-es-detection-list">
                                            {procedures.map(p => <li key={p}>{p}</li>)}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="csc-sc4s-info-footer">
                        {hasItsi && (
                            <a href="https://docs.splunk.com/Documentation/ITSI/latest/Configure/ContentPackOverview" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                                 ITSI Documentation
                            </a>
                        )}
                        {hasItsi && pack.docs_url && (
                            <a href={pack.docs_url} target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                                 {pack.label} Docs
                            </a>
                        )}
                        {hasIteLearn && (
                            <a href="https://splunkbase.splunk.com/app/5390" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                                 IT Essentials Learn on Splunkbase
                            </a>
                        )}
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  ES INFO MODAL  ──────────────────────────────

const CIM_MODEL_LABELS = {
    Alerts: 'Alerts',
    Authentication: 'Authentication',
    Certificates: 'Certificates',
    Change: 'Change',
    DLP: 'DLP',
    Email: 'Email',
    Endpoint: 'Endpoint',
    Intrusion_Detection: 'Intrusion Detection',
    Malware: 'Malware',
    Network_Resolution: 'Network Resolution (DNS)',
    Network_Sessions: 'Network Sessions',
    Network_Traffic: 'Network Traffic',
    Threat_Intelligence: 'Threat Intelligence',
    Vulnerabilities: 'Vulnerabilities',
    Web: 'Web',
};

function SecOpsContentModal({ open, onClose, productName, esCompatible, cimDataModels, escuStories, escuDetectionCount, escuDetections, sseContent, sseUseCases, sseUseCaseCount, installedApps }) {
    const returnFocusRef = useRef(null);
    const [showDetections, setShowDetections] = useState(false);
    const [showSseUseCases, setShowSseUseCases] = useState(false);
    if (!open) return null;
    const models = cimDataModels || [];
    const stories = escuStories || [];
    const detections = escuDetections || [];
    const detCount = escuDetectionCount || 0;
    const hasEscu = detCount > 0;
    const sseList = sseUseCases || [];
    const sseCount = sseUseCaseCount || 0;
    const hasSse = sseContent && sseCount > 0;
    const esInstalled = installedApps?.['SplunkEnterpriseSecuritySuite'];
    const sseInstalled = installedApps?.['Splunk_Security_Essentials'];

    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '900px', width: '92vw' }}>
            <Modal.Header title="SecOps Content" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ '--info-accent': '#455a64' }}>
                    <div className="csc-sc4s-info-hero">
                        <div className="csc-sc4s-info-hero-icon"></div>
                        <div className="csc-sc4s-info-hero-text">
                            <h3>Security Operations</h3>
                            <p>
                                {productName ? <strong>{productName}</strong> : 'This product'} has security content available
                                across Splunk's SecOps ecosystem.
                                {esCompatible && <>{' '}Data is <strong>CIM-compliant</strong> for Enterprise Security.</>}
                                {hasSse && <>{' '}<strong>{sseCount} Security Essentials</strong> use cases are available.</>}
                            </p>
                        </div>
                    </div>

                    {/* ── Tier 1: Enterprise Security (Premium) ── */}
                    {esCompatible && (
                        <>
                            <div className="csc-sc4s-info-section" style={{ borderLeft: '3px solid #F59E0B', paddingLeft: '16px' }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Splunk Enterprise Security
                                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>Premium</span>
                                    {esInstalled && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Installed</span>}
                                </h4>
                                <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                    The add-on maps data to the <strong>Common Information Model (CIM)</strong> via
                                    {' '}<code>tags.conf</code> and <code>eventtypes.conf</code>, enabling ES correlation searches, dashboards, and adaptive response.
                                </p>

                                {models.length > 0 && (
                                    <div style={{ marginBottom: '14px' }}>
                                        <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary, #736d68)' }}>CIM Data Models</strong>
                                        <div className="csc-es-cim-pills" style={{ marginTop: '6px' }}>
                                            {models.map(m => (
                                                <span key={m} className="csc-es-cim-pill">{CIM_MODEL_LABELS[m] || m}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {stories.length > 0 && (
                                    <div style={{ marginBottom: '14px' }}>
                                        <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary, #736d68)' }}>ESCU Analytic Stories</strong>
                                        <div className="csc-es-stories" style={{ marginTop: '6px' }}>
                                            {stories.map(s => (
                                                <div key={s} className="csc-es-story-item">
                                                    <span className="csc-es-story-icon"></span>
                                                    <span>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {hasEscu && (
                                    <div style={{ marginBottom: '6px' }}>
                                        <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary, #736d68)' }}>ESCU Detections ({detCount})</strong>
                                        <div style={{ marginTop: '6px' }}>
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
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Tier 2: Security Essentials (Free) ── */}
                    {hasSse && (
                        <div className="csc-sc4s-info-section" style={{ borderLeft: '3px solid #22C55E', paddingLeft: '16px' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Splunk Security Essentials
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Free</span>
                                {sseInstalled && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Installed</span>}
                            </h4>
                            <p style={{ marginBottom: '10px', fontSize: '13px' }}>
                                Security Essentials provides detection guidance, analytics stories, and security use cases
                                {' '}— <strong>no Enterprise Security license required</strong>.
                            </p>

                            <div>
                                <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary, #736d68)' }}>Use Cases ({sseCount})</strong>
                                <div style={{ marginTop: '6px' }}>
                                    {sseList.length > 5 && !showSseUseCases ? (
                                        <>
                                            <ul className="csc-es-detection-list">
                                                {sseList.slice(0, 5).map(u => <li key={u}>{u}</li>)}
                                            </ul>
                                            <button className="csc-es-show-all-btn" onClick={() => setShowSseUseCases(true)}>
                                                Show all {sseCount} use cases ▾
                                            </button>
                                        </>
                                    ) : (
                                        <ul className="csc-es-detection-list">
                                            {sseList.map(u => <li key={u}>{u}</li>)}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="csc-sc4s-info-footer">
                        {esCompatible && (
                            <a href="https://docs.splunk.com/Documentation/ES/latest" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                                 ES Documentation
                            </a>
                        )}
                        {hasEscu && (
                            <a href="https://splunkbase.splunk.com/app/3449" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                                 ESCU on Splunkbase
                            </a>
                        )}
                        {hasSse && (
                            <a href="https://splunkbase.splunk.com/app/3435" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                                 Security Essentials on Splunkbase
                            </a>
                        )}
                        <a href="https://docs.splunk.com/Documentation/CIM/latest/User/Overview" target="_blank" rel="noopener noreferrer" className="csc-sc4s-info-link" style={{ color: '#0A60FF' }}>
                             CIM Reference
                        </a>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <CopyModalButton />
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
                            background: 'var(--bg-primary, #f4f4f4)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light, #e3ddd8)',
                            borderLeft: '3px solid var(--border-medium, #d2cbc5)',
                        }}>
                            {tip.icon && <span style={{ marginRight: '6px' }}>{tip.icon}</span>}
                            {tip.text}
                            {tip.linkUrl && typeof tip.linkUrl === 'string' && tip.linkUrl.startsWith('http') && (
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
                <CopyModalButton />
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
                 style={isInstalled ? { borderLeft: '4px solid var(--border-medium, #d2cbc5)' } : {}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <strong>{app.display_name || app.app_id}</strong>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {isOnSh && (
                            <span className="csc-legacy-status-badge" style={{ background: 'var(--bg-primary, #f4f4f4)', fontWeight: 600, fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                                SH Installed
                            </span>
                        )}
                        {isOnIdx && (
                            <span className="csc-legacy-status-badge" style={{ background: 'var(--bg-primary, #f4f4f4)', fontWeight: 600, fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
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
                            <p style={{ fontSize: '16px', fontWeight: 600, marginTop: '12px' }}>No legacy apps detected!</p>
                        </div>
                    )
                    : (
                        <div>
                            {/* ── Summary bar ── */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '13px', padding: '4px 12px', borderRadius: '12px',
                                    background: 'var(--bg-primary, #f4f4f4)',
                                    border: '1px solid var(--border-light, #e3ddd8)',
                                    fontWeight: 600
                                }}>
                                    SH: {shInstalledCount > 0 ? `${shInstalledCount} installed` : 'Clean'}
                                </span>
                                {hasIndexerData && (
                                    <span style={{
                                        fontSize: '13px', padding: '4px 12px', borderRadius: '12px',
                                        background: 'var(--bg-primary, #f4f4f4)',
                                        border: '1px solid var(--border-light, #e3ddd8)',
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
                                    <span>Archived on Splunkbase ({archivedApps.length})</span>
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
                <CopyModalButton />
                <Button appearance="secondary" label="Close" onClick={onClose} />
            </Modal.Footer>
        </Modal>
    );
}

// ────────────────────  FEEDBACK MODAL  ─────────────────────
function feedbackFallbackCopy(text, onSuccess, onFail) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); onSuccess(); }
    catch (_) { onFail(); }
    document.body.removeChild(ta);
}
const FEEDBACK_EMAIL = 'scan-feedback@cisco.com';
const FEEDBACK_TYPES = [
    { id: 'feature', label: 'Feature Request' },
    { id: 'bug', label: 'Bug Report' },
    { id: 'improvement', label: 'Improvement' },
    { id: 'general', label: 'General' },
];

function FeedbackModal({ open, onClose, platformType, appVersion }) {
    const returnFocusRef = useRef(null);
    const [feedbackType, setFeedbackType] = useState('feature');
    const [description, setDescription] = useState('');
    const [actionMsg, setActionMsg] = useState(null);

    if (!open) return null;

    const typeLabel = FEEDBACK_TYPES.find(t => t.id === feedbackType)?.label || feedbackType;

    const buildBody = () => [
        `Type: ${typeLabel}`,
        `Platform: ${platformType || 'unknown'}`,
        `SCAN Version: ${appVersion || 'unknown'}`,
        `Browser: ${navigator.userAgent}`,
        '',
        'Feedback:',
        description || '(please describe your feedback here)',
    ].join('\n');

    const handleSendEmail = () => {
        if (!description.trim()) { setActionMsg({ type: 'error', text: 'Please write your feedback first.' }); return; }
        const subject = `[SCAN Feedback] ${typeLabel}`;
        const body = buildBody();
        window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        setActionMsg({ type: 'success', text: 'Email client opened! Send the email to complete.' });
    };

    const handleCopyToClipboard = () => {
        if (!description.trim()) { setActionMsg({ type: 'error', text: 'Please write your feedback first.' }); return; }
        const text = `To: ${FEEDBACK_EMAIL}\nSubject: [SCAN Feedback] ${typeLabel}\n\n${buildBody()}`;
        const onSuccess = () => {
            setActionMsg({ type: 'success', text: 'Copied to clipboard! Paste into your preferred email or messaging app.' });
            setTimeout(() => setActionMsg(null), 4000);
        };
        const onFail = () => setActionMsg({ type: 'error', text: 'Could not copy — please select and copy manually.' });
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
                feedbackFallbackCopy(text, onSuccess, onFail);
            });
        } else {
            feedbackFallbackCopy(text, onSuccess, onFail);
        }
    };

    const radioStyle = (selected) => ({
        padding: '6px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
        borderRadius: '6px', border: '1px solid', borderColor: selected ? 'var(--border-medium, #d2cbc5)' : 'var(--border-light, #e3ddd8)',
        background: selected ? 'var(--bg-primary, #f4f4f4)' : 'var(--bg-surface, #fff)', color: 'var(--text-primary, #342f2c)',
        transition: 'all .15s',
    });

    return (
        <Modal open={true} returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '640px', width: '92vw' }}>
            <Modal.Header title="Give Feedback" />
            <Modal.Body>
                <div className="csc-sc4s-info" style={{ fontSize: '13px', lineHeight: '1.6' }}>
                    <p style={{ color: 'var(--muted-color, #666)', marginBottom: '20px' }}>
                        Share thoughts, report issues, or suggest features.
                        Clicking <b>Send via Email</b> will open your email client with the details pre-filled.
                    </p>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Feedback Type</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {FEEDBACK_TYPES.map(t => (
                                <span key={t.id} style={radioStyle(feedbackType === t.id)} onClick={() => setFeedbackType(t.id)}>
                                    {t.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Your Feedback</label>
                        <textarea value={description}
                            onChange={e => { setDescription(e.target.value); setActionMsg(null); }}
                            rows={5} placeholder="Please provide as much detail as possible..."
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--input-border, #ccc)', borderRadius: '6px', boxSizing: 'border-box', resize: 'vertical', background: 'var(--input-bg, #fff)', color: 'var(--page-color, #333)' }}
                        />
                    </div>
                    <div style={{ padding: '10px 14px', marginBottom: '14px', background: 'var(--card-footer-bg, #f9fafb)', borderRadius: '6px', fontSize: '11px', color: 'var(--muted-color, #888)', lineHeight: '1.5' }}>
                        The following context will be included automatically: feedback type, platform ({platformType || 'unknown'}), SCAN version ({appVersion || 'unknown'}), and browser info.
                    </div>
                    {actionMsg && <Message type={actionMsg.type}>{actionMsg.text}</Message>}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Cancel" onClick={onClose} />
                <Button appearance="secondary" label="Copy to Clipboard" onClick={handleCopyToClipboard} />
                <Button appearance="primary" className="scan-btn-primary" label="Send via Email" onClick={handleSendEmail} />
            </Modal.Footer>
        </Modal>
    );
}

function FeedbackTab({ onClick }) {
    return (
        <button className="scan-feedback-tab" onClick={onClick} title="Give Feedback">
            <span className="scan-feedback-tab-icon"></span>
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
                zIndex: 10010, opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease',
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
                                ⊞
                            </span>
                            {pinned && (
                                <span
                                    className="scan-tooltip-drag"
                                    onMouseDown={handleDragStart}
                                    title="Drag to move"
                                    style={{ cursor: isDragging ? 'grabbing' : 'grab', fontSize: '18px', userSelect: 'none' }}
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

// ────────────────────────  CUSTOMER SUMMARY COPY  ────────────
// Generates a plain-text summary for a product card that an engineer
// can paste into an email, ticket, or chat for a customer.

function copyRichToClipboard(html, plainText, onSuccess) {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const item = new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
        });
        navigator.clipboard.write([item]).then(onSuccess).catch(() => {
            fallbackCopyHtml(html, onSuccess);
        });
    } else {
        fallbackCopyHtml(html, onSuccess);
    }
}

function fallbackCopyHtml(html, onSuccess) {
    const el = document.createElement('div');
    el.innerHTML = html;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.whiteSpace = 'pre-wrap';
    document.body.appendChild(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand('copy'); onSuccess(); }
    catch (_) { /* best-effort */ }
    sel.removeAllRanges();
    document.body.removeChild(el);
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sbLink(uid, label) {
    const url = `https://splunkbase.splunk.com/app/${uid}`;
    return { url, html: `<a href="${url}">${esc(label || uid)}</a>`, text: label || uid };
}

function generateCustomerSummary(product, splunkbaseData) {
    const plain = [];
    const html = [];
    const divider = '─'.repeat(50);
    const dn = product.display_name || product.product_id;
    const CODE_CSS = 'background:#f4f4f4;border:1px solid #ddd;border-radius:3px;padding:1px 5px;font-family:Menlo,Consolas,monospace;font-size:12px;color:#333;';

    html.push(`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.5;background:#ffffff;">`);
    html.push(`<h2 style="margin:0 0 4px;font-size:16px;color:#003366;">${esc(dn)}</h2>`);
    plain.push(dn);
    plain.push(divider);

    if (product.tagline) {
        html.push(`<p style="margin:0 0 6px;font-style:italic;color:#555;">${esc(product.tagline)}</p>`);
        plain.push(product.tagline);
    }
    if (product.description) {
        html.push(`<p style="margin:0 0 10px;">${esc(product.description)}</p>`);
        plain.push(product.description);
    }
    plain.push('');

    const apps = [];
    if (product.addon) {
        apps.push({ label: product.addon_label || product.addon, uid: product.addon_splunkbase_uid, type: 'Add-on' });
    }
    if (product.app_viz) {
        apps.push({ label: product.app_viz_label || product.app_viz, uid: product.app_viz_splunkbase_uid, type: 'App' });
    }
    if (product.app_viz_2) {
        apps.push({ label: product.app_viz_2_label || product.app_viz_2, uid: product.app_viz_2_splunkbase_uid, type: 'App' });
    }
    if (product.sc4s_search_head_ta) {
        apps.push({ label: product.sc4s_search_head_ta_label || product.sc4s_search_head_ta, uid: product.sc4s_search_head_ta_splunkbase_id, type: 'Search Head TA (SC4S)' });
    }

    if (apps.length > 0) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">Required Apps &amp; Add-ons</h3><ul style="margin:0 0 8px;padding-left:20px;">`);
        plain.push('REQUIRED APPS & ADD-ONS');
        apps.forEach(a => {
            if (a.uid) {
                const sb = sbLink(a.uid, `${a.label} (${a.type})`);
                html.push(`<li>${sb.html}</li>`);
                plain.push(`  • ${a.label} (${a.type})\n    ${sb.url}`);
            } else {
                html.push(`<li>${esc(a.label)} (${esc(a.type)})</li>`);
                plain.push(`  • ${a.label} (${a.type})`);
            }
        });
        html.push(`</ul>`);
        plain.push('');
    }

    if (product.sc4s_supported) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">Syslog Collection (SC4S)</h3>`);
        html.push(`<p style="margin:0 0 4px;">Splunk Connect for Syslog (SC4S) is supported. <a href="https://splunkbase.splunk.com/app/4740">SC4S on Splunkbase</a></p>`);
        plain.push('SYSLOG COLLECTION (SC4S)');
        plain.push('  Splunk Connect for Syslog (SC4S) is supported for this product.');
        plain.push('  SC4S on Splunkbase: https://splunkbase.splunk.com/app/4740');
        if (product.sc4s_url) {
            html.push(`<p style="margin:0 0 4px;"><a href="${esc(product.sc4s_url)}">SC4S Documentation</a></p>`);
            plain.push(`  SC4S documentation: ${product.sc4s_url}`);
        }
        if (product.sc4s_sourcetypes && product.sc4s_sourcetypes.length > 0) {
            html.push(`<p style="margin:0 0 4px;">Sourcetypes: <code style="${CODE_CSS}">${product.sc4s_sourcetypes.map(esc).join(`</code>, <code style="${CODE_CSS}">`)}</code></p>`);
            plain.push(`  Sourcetypes: ${product.sc4s_sourcetypes.join(', ')}`);
        }
        if (product.sc4s_config_notes) {
            html.push(`<p style="margin:0 0 8px;color:#666;"><em>Note: ${esc(product.sc4s_config_notes)}</em></p>`);
            plain.push(`  Note: ${product.sc4s_config_notes}`);
        }
        plain.push('');
    }

    if (product.netflow_supported) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">NetFlow / Splunk Stream</h3><ul style="margin:0 0 8px;padding-left:20px;">`);
        plain.push('NETFLOW / SPLUNK STREAM');
        if (product.netflow_addon) {
            const nfUid = product.netflow_addon_splunkbase_id;
            const nfLabel = product.netflow_addon_label || product.netflow_addon;
            if (nfUid) {
                const sb = sbLink(nfUid, nfLabel);
                html.push(`<li>${sb.html}</li>`);
                plain.push(`  • ${nfLabel} — ${sb.url}`);
            } else {
                html.push(`<li>${esc(nfLabel)}</li>`);
                plain.push(`  • ${nfLabel}`);
            }
        }
        html.push(`</ul>`);
        if (product.netflow_sourcetypes && product.netflow_sourcetypes.length > 0) {
            html.push(`<p style="margin:0 0 4px;">Sourcetypes: <code style="${CODE_CSS}">${product.netflow_sourcetypes.map(esc).join(`</code>, <code style="${CODE_CSS}">`)}</code></p>`);
            plain.push(`  Sourcetypes: ${product.netflow_sourcetypes.join(', ')}`);
        }
        if (product.netflow_config_notes) {
            html.push(`<p style="margin:0 0 8px;color:#666;"><em>Note: ${esc(product.netflow_config_notes)}</em></p>`);
            plain.push(`  Note: ${product.netflow_config_notes}`);
        }
        plain.push('');
    }

    if (product.es_compatible || product.sse_content) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">SecOps Content</h3>`);
        plain.push('SECOPS CONTENT');
    }
    if (product.es_compatible) {
        html.push(`<p style="margin:0 0 4px;font-weight:600;">Enterprise Security (Premium)</p>`);
        plain.push('  Enterprise Security (Premium)');
        if (product.es_cim_data_models && product.es_cim_data_models.length > 0) {
            html.push(`<p style="margin:0 0 4px;">CIM Data Models: ${product.es_cim_data_models.map(esc).join(', ')}</p>`);
            plain.push(`  CIM Data Models: ${product.es_cim_data_models.join(', ')}`);
        }
        if (product.escu_analytic_stories && product.escu_analytic_stories.length > 0) {
            html.push(`<p style="margin:0 0 4px;">ESCU Analytic Stories: ${product.escu_analytic_stories.map(esc).join(', ')}</p>`);
            plain.push(`  ESCU Analytic Stories: ${product.escu_analytic_stories.join(', ')}`);
        }
        if (product.escu_detection_count) {
            html.push(`<p style="margin:0 0 8px;">ESCU Detections: ${esc(String(product.escu_detection_count))}</p>`);
            plain.push(`  ESCU Detections: ${product.escu_detection_count}`);
        }
    }
    if (product.sse_content && product.sse_use_case_count) {
        html.push(`<p style="margin:0 0 4px;font-weight:600;">Security Essentials (Free)</p>`);
        plain.push('  Security Essentials (Free)');
        html.push(`<p style="margin:0 0 8px;">SSE Use Cases: ${esc(String(product.sse_use_case_count))}</p>`);
        plain.push(`  SSE Use Cases: ${product.sse_use_case_count}`);
    }
    if (product.es_compatible || product.sse_content) {
        plain.push('');
    }

    if (product.soar_connector_uids && product.soar_connector_uids.length > 0) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">Splunk SOAR</h3><ul style="margin:0 0 8px;padding-left:20px;">`);
        plain.push('SPLUNK SOAR');
        plain.push('  SOAR connector(s) available on Splunkbase:');
        product.soar_connector_uids.forEach(uid => {
            const sbData = splunkbaseData && splunkbaseData[uid];
            const name = sbData ? (sbData.title || sbData.appid || `Connector ${uid}`) : `Connector ${uid}`;
            const sb = sbLink(uid, name);
            html.push(`<li>${sb.html}</li>`);
            plain.push(`  • ${name}\n    ${sb.url}`);
        });
        html.push(`</ul>`);
        plain.push('');
    }

    if (product.itsi_content_pack || product.ite_learn_content) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">ITOps Content</h3>`);
        plain.push('ITOPS CONTENT');
    }
    if (product.itsi_content_pack) {
        html.push(`<p style="margin:0 0 4px;font-weight:600;">IT Service Intelligence (Premium)</p>`);
        html.push(`<p style="margin:0 0 8px;">Content Pack: ${esc(product.itsi_content_pack.label || '')}</p>`);
        plain.push('  IT Service Intelligence (Premium)');
        plain.push(`  Content Pack: ${product.itsi_content_pack.label || ''}`);
    }
    if (product.ite_learn_content && product.ite_learn_procedure_count) {
        html.push(`<p style="margin:0 0 4px;font-weight:600;">IT Essentials Learn (Free)</p>`);
        html.push(`<p style="margin:0 0 8px;">Procedures: ${esc(String(product.ite_learn_procedure_count))}</p>`);
        plain.push('  IT Essentials Learn (Free)');
        plain.push(`  Procedures: ${product.ite_learn_procedure_count}`);
    }
    if (product.itsi_content_pack || product.ite_learn_content) {
        plain.push('');
    }

    if (product.sourcetypes && product.sourcetypes.length > 0) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">Sourcetypes</h3>`);
        html.push(`<p style="margin:0 0 8px;"><code style="${CODE_CSS}">${product.sourcetypes.map(esc).join(`</code>, <code style="${CODE_CSS}">`)}</code></p>`);
        plain.push('SOURCETYPES');
        product.sourcetypes.forEach(st => plain.push(`  • ${st}`));
        plain.push('');
    }

    const docs = [];
    if (product.learn_more_url) docs.push({ label: 'Product page', url: product.learn_more_url });
    if (product.addon_docs_url) docs.push({ label: 'Add-on documentation', url: product.addon_docs_url });
    if (product.addon_troubleshoot_url) docs.push({ label: 'Add-on troubleshooting', url: product.addon_troubleshoot_url });
    if (product.app_viz_docs_url) docs.push({ label: 'App documentation', url: product.app_viz_docs_url });
    if (product.app_viz_troubleshoot_url) docs.push({ label: 'App troubleshooting', url: product.app_viz_troubleshoot_url });
    if (product.sc4s_url) docs.push({ label: 'SC4S documentation', url: product.sc4s_url });
    if (product.stream_docs_url) docs.push({ label: 'Splunk Stream documentation', url: product.stream_docs_url });
    if (product.netflow_addon_docs_url) docs.push({ label: 'NetFlow add-on docs', url: product.netflow_addon_docs_url });

    if (docs.length > 0) {
        html.push(`<h3 style="margin:12px 0 4px;font-size:13px;color:#003366;">Documentation &amp; Links</h3><ul style="margin:0 0 8px;padding-left:20px;">`);
        plain.push('DOCUMENTATION & LINKS');
        docs.forEach(d => {
            html.push(`<li><a href="${esc(d.url)}">${esc(d.label)}</a></li>`);
            plain.push(`  • ${d.label}: ${d.url}`);
        });
        html.push(`</ul>`);
        plain.push('');
    }

    const SUPPORT_LABELS = {
        cisco_supported: 'Cisco Supported',
        splunk_supported: 'Splunk Supported',
        developer_supported: 'Developer Supported',
        community_supported: 'Community Supported',
        not_supported: 'Not Officially Supported',
    };
    if (product.support_level) {
        const sl = SUPPORT_LABELS[product.support_level] || product.support_level;
        html.push(`<p style="margin:8px 0 4px;"><strong>Support:</strong> ${esc(sl)}</p>`);
        plain.push(`Support: ${sl}`);
    }

    html.push(`<hr style="border:none;border-top:1px solid #ccc;margin:10px 0 6px;" />`);
    html.push(`<p style="margin:0;font-size:11px;color:#888;">Generated by Splunk Cisco App Navigator (SCAN)</p>`);
    html.push(`</div>`);
    plain.push(divider);
    plain.push('Generated by Splunk Cisco App Navigator (SCAN)');

    return { text: plain.join('\n'), html: html.join('') };
}

// ────────────────────────  PRODUCT CARD  ─────────────────────
// Renders one product: icon, name, links, support bar (bottom), install/configure actions.
// Support indicator: one blue bar at bottom via supportBadgeClass / data-support-level (see products.css).

function ProductCard({ product, installedApps, appStatuses, indexerApps, sourcetypeData, splunkbaseData, appidToUidMap, isConfigured, isComingSoon, noIntegration, platformType, onToggleConfigured, onShowBestPractices, onViewLegacy, onSetCustomDashboard, devMode, onViewConfig, showGtmRibbon = false, onEditCustom, onCloneCustom, onDeleteCustom, sharedSourcetypeMap }) {
    const {
        product_id, display_name, version, status, description, value_proposition, vendor, tagline,
        icon_svg, icon_emoji, learn_more_url, addon_docs_url, addon_troubleshoot_url, addon_install_url,
        addon, addon_label,
        app_viz, app_viz_label, app_viz_docs_url, app_viz_troubleshoot_url, app_viz_install_url,
        app_viz_2, app_viz_2_label, app_viz_2_docs_url, app_viz_2_troubleshoot_url, app_viz_2_install_url,
        legacy_uids, legacy_viz_uids, soar_connector_uids, alert_action_uids, community_uids, itsi_content_pack,
        is_new, support_level, cisco_retired, coverage_gap, gap_type, gtm_pillar,
        sc4s_url, sc4s_supported, sc4s_search_head_ta, sc4s_search_head_ta_label,
        sc4s_search_head_ta_splunkbase_id, sc4s_search_head_ta_install_url, sc4s_sourcetypes, sc4s_config_notes,
        netflow_supported, netflow_addon, netflow_addon_label,
        netflow_addon_splunkbase_id, netflow_addon_install_url, netflow_addon_docs_url,
        stream_docs_url, netflow_sourcetypes, netflow_config_notes,
        es_compatible, es_cim_data_models, escu_analytic_stories, escu_detection_count, escu_detections,
    } = product;

    // Suppress all action buttons for cards with no integration to install/configure.
    // isComingSoon (under_development only) also shows a "Coming Soon" badge;
    // noIntegration (roadmap / GTM / Integration Needed) suppresses buttons without a badge.
    const suppressActions = isComingSoon || noIntegration;

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
    const hasLegacyViz = legacy_viz_uids && legacy_viz_uids.length > 0;
    const allLegacyUids = [...(legacy_uids || []), ...(legacy_viz_uids || [])];
    const legacyAddonInstalled = hasLegacy ? legacy_uids.filter(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return sb && sb.appid && installedApps[sb.appid];
    }) : [];
    const legacyVizInstalled = hasLegacyViz ? legacy_viz_uids.filter(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return sb && sb.appid && installedApps[sb.appid];
    }) : [];
    const legacyInstalled = [...legacyAddonInstalled, ...legacyVizInstalled];
    const communityInstalled = (community_uids || []).filter(uid => {
        const sb = splunkbaseData && splunkbaseData[uid];
        return sb && sb.appid && installedApps[sb.appid];
    });

    const sc4sShTaStatus = sc4s_search_head_ta ? (appStatuses[sc4s_search_head_ta] || null) : null;
    const hasDifferentSc4sTa = sc4s_supported && sc4s_search_head_ta && sc4s_search_head_ta !== addon;

    const netflowAddonStatus = netflow_addon ? (appStatuses[netflow_addon] || null) : null;

    const [depsExpanded, setDepsExpanded] = useState(false);
    const [sc4sInfoOpen, setSc4sInfoOpen] = useState(false);
    const [netflowInfoOpen, setNetflowInfoOpen] = useState(false);
    const [hfInfoOpen, setHfInfoOpen] = useState(false);
    const [magicEightOpen, setMagicEightOpen] = useState(false);
    const [communityExpanded, setCommunityExpanded] = useState(false);
    const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
    const [launchMenuPos, setLaunchMenuPos] = useState({ top: 0, left: 0 });
    const [customDashModalOpen, setCustomDashModalOpen] = useState(false);
    const [customDashInput, setCustomDashInput] = useState(product.custom_dashboard || '');
    const [customDashSaving, setCustomDashSaving] = useState(false);
    const [customDashMsg, setCustomDashMsg] = useState(null);
    const [copiedSummary, setCopiedSummary] = useState(false);
    const launchBtnRef = useRef(null);
    const launchMenuRef = useRef(null);

    // Dependency summary
    const depItems = [];
    if (addon) depItems.push({ label: 'Add-on', installed: !!appStatus?.installed, disabled: !!appStatus?.disabled });
    if (app_viz) depItems.push({ label: 'Viz App', installed: !!vizAppStatus?.installed, disabled: !!vizAppStatus?.disabled });
    if (app_viz_2) depItems.push({ label: 'Viz App 2', installed: !!vizApp2Status?.installed, disabled: !!vizApp2Status?.disabled });
    if (sc4s_supported && !addon) depItems.push({ label: 'SC4S', installed: true, sc4sOnly: true });
    if (netflow_supported) depItems.push({ label: 'NetFlow', installed: !!netflowAddonStatus?.installed });
    const allDeps = [...depItems];
    const depsMissing = allDeps.filter(d => !d.installed).length;
    const hasDeps = allDeps.length > 0;

    // Launch handlers
    const productDashboards = product.dashboards || (product.dashboard ? [product.dashboard] : []);
    const handleLaunchDashboard = (dash) => {
        const launchTarget = app_viz || addon;
        if (!launchTarget || !(vizAppStatus?.installed || appStatus?.installed)) return;
        if (dash) {
            const dashApp = app_viz || addon || launchTarget;
            window.open(createURL(`/app/${dashApp}/${dash}`), '_blank');
        } else {
            window.open(createURL(`/app/${launchTarget}/`), '_blank');
        }
    };
    const handleLaunchDefault = () => {
        handleLaunchDashboard(productDashboards[0] || '');
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

    // TA-only: addon is installed but has no visible UI (no app_viz, addon is_visible=false)
    const isAddonOnly = !app_viz && addon && appStatus?.installed && !appStatus?.visible;

    // SC4S-only: no addon/app at all — data arrives via SC4S, user needs Explore to see it
    const isSc4sOnly = !addon && !app_viz && sc4s_supported && (product.sourcetypes || []).length > 0;

    const handleExploreData = () => {
        const sts = product.sourcetypes || [];
        if (sts.length > 0) {
            const escaped = sts.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const pattern = '^(' + escaped.join('|') + ')$';
            const spl = `| metadata type=sourcetypes index=* | where match(sourcetype, "${pattern}") | convert ctime(*Time) | table sourcetype recentTime firstTime lastTime totalCount | eventstats sum(totalCount) as GrandTotal | sort - totalCount`;
            window.open(createURL(`/app/search/search?q=${encodeURIComponent(spl)}`), '_blank');
        } else {
            window.open(createURL('/app/search/search'), '_blank');
        }
    };

    const handleCreateDashboard = () => {
        window.open(createURL('/app/search/dashboards'), '_blank');
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

    const handleCopySummary = useCallback(() => {
        const { text, html } = generateCustomerSummary(product, splunkbaseData);
        copyRichToClipboard(html, text, () => {
            setCopiedSummary(true);
            setTimeout(() => setCopiedSummary(false), 2000);
        });
    }, [product, splunkbaseData]);

    const isInstalled = appStatus?.installed || vizAppStatus?.installed || vizApp2Status?.installed;
    const hasItsi = !!itsi_content_pack;
    const hasItops = !!itsi_content_pack || !!product.ite_learn_content;
    const hasSoar = soar_connector_uids && soar_connector_uids.length > 0;
    const hasEs = !!es_compatible;
    const hasSecops = !!es_compatible || !!product.sse_content;
    const [soarInfoOpen, setSoarInfoOpen] = useState(false);
    const [alertActionsInfoOpen, setAlertActionsInfoOpen] = useState(false);
    const [itopsInfoOpen, setItopsInfoOpen] = useState(false);
    const [secopsInfoOpen, setSecopsInfoOpen] = useState(false);
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

    // Support indicator: colored bar at bottom of card.
    // Custom cards get a distinct teal border; catalog cards use Cisco blue / Splunk pink / red.
    const hasWorkingIntegration = !!(addon || app_viz || app_viz_2 || sc4s_supported);
    const supportBadgeClass = product.custom ? 'csc-card-custom'
        : support_level === 'cisco_supported' ? 'csc-card-cisco-supported'
        : support_level === 'splunk_supported' ? 'csc-card-splunk-supported'
        : hasWorkingIntegration && (support_level === 'developer_supported' || support_level === 'community_supported' || support_level === 'not_supported') ? 'csc-card-unsupported-tier' : '';
    const supportLevelAttr = supportBadgeClass ? (product.custom ? 'custom' : support_level) : undefined;
    return (
        <div
            className={`csc-card ${supportBadgeClass}`.trim()}
            data-addon-family={addonFamily}
            data-support-level={supportLevelAttr}
        >
            {/* ── NEW! corner ribbon ── */}
            {is_new && (
                <div className="csc-new-ribbon" aria-label="New product">NEW!</div>
            )}
            {/* ── Cisco Retired Product ribbon ── */}
            {cisco_retired && !is_new && (
                <div className="csc-retired-ribbon" aria-label="Cisco retired product">CISCO RETIRED</div>
            )}
            {/* ── GTM ribbons ── */}
            {coverage_gap && !cisco_retired && !is_new && gap_type === 'enhancement' && (
                <div className="csc-tracking-ribbon" aria-label="Syslog via SC4S — basic coverage, may need enrichment">BASIC COVERAGE</div>
            )}
            {(showGtmRibbon || gap_type === 'rebuild') && coverage_gap && !cisco_retired && !is_new && gap_type !== 'enhancement' && (addon || app_viz || app_viz_2) && (
                <div className="csc-vendor-support-gap-ribbon" aria-label="Developer add-on exists — need Cisco- or Splunk-supported solution">CISCO/SPLUNK SUPPORT NEEDED</div>
            )}
            {showGtmRibbon && coverage_gap && !cisco_retired && !is_new && gap_type !== 'enhancement' && !addon && !app_viz && !app_viz_2 && (
                <div className="csc-coverage-gap-ribbon" aria-label="On the GTM roadmap">ROADMAP</div>
            )}
            {/* ── Add-on Archived ribbon ── */}
            {status === 'deprecated' && !cisco_retired && !coverage_gap && !is_new && (
                <div className="csc-deprecated-ribbon" aria-label="Add-on archived">ADD-ON ARCHIVED</div>
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
                            {icon_emoji || (display_name || 'C')[0]}
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
                                                {support_level && (
                                                    <div className="csc-info-popover-section">
                                                        <div className="csc-info-popover-label">Support</div>
                                                        <div className="csc-info-popover-text">
                                                            {support_level === 'cisco_supported' && 'Cisco Supported'}
                                                            {support_level === 'splunk_supported' && 'Splunk Supported'}
                                                            {support_level === 'developer_supported' && 'Developer Supported'}
                                                            {support_level === 'community_supported' && 'Community Supported'}
                                                            {support_level === 'not_supported' && 'Not Supported'}
                                                        </div>
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
                            {sc4s_supported && (
                                <button className="csc-badge-btn csc-badge-sc4s" title="Supported by Splunk Connect for Syslog (SC4S) — Click for Info" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSc4sInfoOpen(true); }}>SC4S</button>
                            )}
                            {netflow_supported && (
                                <button className="csc-badge-btn csc-badge-netflow" title="Supports NetFlow / IPFIX — Click for Info" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setNetflowInfoOpen(true); }}>NetFlow</button>
                            )}
                            {hasSoar && (
                                <button className="csc-badge-btn csc-badge-soar" title={`${soar_connector_uids.length} SOAR Connector${soar_connector_uids.length !== 1 ? 's' : ''} — Click for Info`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSoarInfoOpen(true); }}>SOAR</button>
                            )}
                            {hasItops && (
                                <button className="csc-badge-btn csc-badge-itops" title="ITOps content available — Click for Info" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setItopsInfoOpen(true); }}><PulseIcon size="0.85em" style={{ verticalAlign: '-0.1em', marginRight: '3px' }} />ITOps</button>
                            )}
                            {hasSecops && (
                                <button className="csc-badge-btn csc-badge-secops" title={`SecOps content${escu_detection_count ? ` — ${escu_detection_count} ESCU Detections` : ''}${product.sse_use_case_count ? ` · ${product.sse_use_case_count} SSE Use Cases` : ''} — Click for Info`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSecopsInfoOpen(true); }}><ShieldIcon size="0.85em" style={{ verticalAlign: '-0.1em', marginRight: '3px' }} />SecOps</button>
                            )}
                            {alert_action_uids && alert_action_uids.length > 0 && (
                                <button className="csc-badge-btn csc-badge-alert" title={`${alert_action_uids.length} custom Alert Action${alert_action_uids.length !== 1 ? 's' : ''} — Click for Info`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAlertActionsInfoOpen(true); }}>Alert Actions</button>
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
                    {tagline && depsExpanded && (
                        <span className="csc-card-tagline">
                            {tagline}
                        </span>
                    )}
                    {showGtmRibbon && coverage_gap && gtm_pillar && GTM_PILLAR_LABELS[String(gtm_pillar).trim()] && (
                        <span className="csc-card-gtm-pillar" title="Cisco Secure Networking GTM pillar">
                            {GTM_PILLAR_LABELS[String(gtm_pillar).trim()]}
                        </span>
                    )}
                    {coverage_gap && gap_type === 'rebuild' && (
                        <span className="csc-card-vendor-support-gap-note" title="Need to build or acquire and ship as Cisco- or Splunk-supported">
                            Need Cisco- or Splunk-supported add-on (build or acquire)
                        </span>
                    )}
                    {coverage_gap && gap_type === 'enhancement' && (
                        <span className="csc-card-vendor-support-gap-note" title="Syslog via SC4S — may need field extractions, CIM mapping, or dashboards">
                            Syslog via SC4S — may need integration enrichment
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
                isRoadmapCard={coverage_gap || suppressActions}
                sourcetypeSearchUrl={sourcetypeSearchUrl}
                isArchived={!!(!addon_install_url && addon_splunkbase_uid)}
            />



            {/* ── Expandable details panel (toggle is in footer) ── */}
            {hasDeps && !suppressActions && depsExpanded && (
                <div className="csc-card-dependency">
                    <div className="csc-dep-expanded">
                            

                            {/* ── Primary Add-on ── */}
                            {addon && (
                                <>
                                <div className="csc-dep-detail">
                                    {appStatus?.installed && appStatus?.visible ? (
                                        <a href={createURL(`/app/${addon}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`${addon} — Click to open`}>{addon_label || addon}</a>
                                    ) : (
                                        <span className="csc-dep-name" title={appStatus?.installed ? `${addon} — TA only (no UI)` : addon}>{addon_label || addon}</span>
                                    )}
                                    {(addon_splunkbase_uid || addon_docs_url || addon_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {addon_splunkbase_uid && (
                                                <a href={generateSplunkbaseUrl(addon_splunkbase_uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title={`Splunkbase UID ${addon_splunkbase_uid}`}>
                                                    Splunkbase ({addon_splunkbase_uid})
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
                                    {!appStatus?.installed && !suppressActions && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                                {/* Tier deployment chips for add-on */}
                                <div className="scan-tier-chips">
                                    {hasIndexerPeers ? (
                                        <>
                                        <span className={`scan-tier-chip ${appStatus?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title={appStatus?.installed ? `Search Head: v${appStatus.version || ''}` : 'Not installed on Search Head'}>
                                            <CylinderMagnifier size={12} /> Search Head {appStatus?.installed ? '✓' : '✗'}
                                        </span>
                                        <span className={`scan-tier-chip ${
                                            idxTierState === 'deployed' ? 'scan-tier-ok' :
                                            idxTierState === 'disabled' ? 'scan-tier-alert' :
                                            idxTierState === 'mismatch' ? 'scan-tier-warn' :
                                            'scan-tier-miss'
                                        }`} title={
                                            idxTierState === 'deployed' ? `Deployed: v${idxStatus?.version || ''} — Click to audit props.conf Magic Eight` :
                                            idxTierState === 'disabled' ? 'DISABLED on indexer tier — props.conf/transforms.conf will not apply — Click to audit' :
                                            idxTierState === 'mismatch' ? `Version mismatch: Indexer v${idxStatus?.version} ≠ SH v${appStatus?.version} — Click to audit` :
                                            'Not deployed — index-time parsing will not work — Click to audit props.conf'
                                        } onClick={product.sourcetypes && product.sourcetypes.length > 0 ? (e) => { e.stopPropagation(); e.preventDefault(); setMagicEightOpen(true); } : undefined} style={product.sourcetypes && product.sourcetypes.length > 0 ? { cursor: 'pointer' } : undefined}>
                                            <CylinderIndex size={12} /> Indexers {
                                                idxTierState === 'deployed' ? '✓' :
                                                idxTierState === 'disabled' ? '⊘' :
                                                idxTierState === 'mismatch' ? '≠' : '✗'
                                            }
                                        </span>
                                        </>
                                    ) : (
                                        <span className={`scan-tier-chip ${appStatus?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title={appStatus?.installed ? `Standalone: v${appStatus.version || ''} — Click to audit props.conf` : 'Not installed'} onClick={product.sourcetypes && product.sourcetypes.length > 0 ? (e) => { e.stopPropagation(); e.preventDefault(); setMagicEightOpen(true); } : undefined} style={product.sourcetypes && product.sourcetypes.length > 0 ? { cursor: 'pointer' } : undefined}>
                                            <CylinderMagnifier size={12} /> Search Head {appStatus?.installed ? '✓' : '✗'}
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
                                    <a href={generateSplunkbaseUrl(SC4S_SPLUNKBASE_UID)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="Get SC4S on Splunkbase" style={{marginLeft: 6, fontSize: '11px'}}>
                                        Get SC4S
                                    </a>
                                </div>
                                {sc4s_sourcetypes && sc4s_sourcetypes.length > 0 && (
                                    <div className="scan-sc4s-primary-sts">
                                        <span className="csc-dep-label" style={{ fontSize: '10px' }}>SC4S Sourcetypes</span>
                                        <span className="scan-sc4s-st-list">{sc4s_sourcetypes.join(', ')}</span>
                                    </div>
                                )}
                                </>
                            )}

                            {/* ── Dashboard / Viz App ── */}
                            {app_viz && (
                                <>
                                <hr className="csc-dep-divider" />
                                <div className="csc-dep-detail">
                                    {vizAppStatus?.installed && vizAppStatus?.visible ? (
                                        <a href={createURL(`/app/${app_viz}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`${app_viz} — Click to open`}>{app_viz_label || app_viz}</a>
                                    ) : (
                                        <span className="csc-dep-name" title={app_viz}>{app_viz_label || app_viz}</span>
                                    )}
                                    {(app_viz_splunkbase_uid || app_viz_docs_url || app_viz_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {app_viz_splunkbase_uid && (
                                                <a href={generateSplunkbaseUrl(app_viz_splunkbase_uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title={`Splunkbase UID ${app_viz_splunkbase_uid}`}>
                                                    Splunkbase ({app_viz_splunkbase_uid})
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
                                    {!vizAppStatus?.installed && !suppressActions && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                                <div className="scan-tier-chips">
                                    <span className={`scan-tier-chip ${vizAppStatus?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title="Search Head only">
                                        <CylinderMagnifier size={12} /> Search Head {vizAppStatus?.installed ? '✓' : '✗'}
                                    </span>
                                </div>
                                </>
                            )}

                            {/* ── Secondary Dashboard App (app_viz_2) ── */}
                            {app_viz_2 && (
                                <>
                                <hr className="csc-dep-divider" />
                                <div className="csc-dep-detail">
                                    {vizApp2Status?.installed && vizApp2Status?.visible ? (
                                        <a href={createURL(`/app/${app_viz_2}/`)} target="_blank" rel="noopener noreferrer" className="csc-dep-name csc-dep-name-link" title={`${app_viz_2} — Click to open`}>{app_viz_2_label || app_viz_2}</a>
                                    ) : (
                                        <span className="csc-dep-name" title={app_viz_2}>{app_viz_2_label || app_viz_2}</span>
                                    )}
                                    {(app_viz_2_splunkbase_uid || app_viz_2_docs_url || app_viz_2_troubleshoot_url) && (
                                        <span className="csc-split-pill">
                                            {app_viz_2_splunkbase_uid && (
                                                <a href={generateSplunkbaseUrl(app_viz_2_splunkbase_uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title={`Splunkbase UID ${app_viz_2_splunkbase_uid}`}>
                                                    Splunkbase ({app_viz_2_splunkbase_uid})
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
                                    {!vizApp2Status?.installed && !suppressActions && (
                                        <span className="csc-dep-status-missing">not installed</span>
                                    )}
                                </div>
                                <div className="scan-tier-chips">
                                    <span className={`scan-tier-chip ${vizApp2Status?.installed ? 'scan-tier-ok' : 'scan-tier-miss'}`} title="Search Head only">
                                        <CylinderMagnifier size={12} /> Search Head {vizApp2Status?.installed ? '✓' : '✗'}
                                    </span>
                                </div>
                                </>
                            )}

                            {/* ── Data Paths (SC4S + NetFlow — slim summary, detail in modals) ── */}
                            {(sc4s_supported || netflow_supported) && (
                                <>
                                <hr className="csc-dep-divider" />
                                <div className="csc-section-data-paths-slim">
                                    <span className="csc-dp-slim-heading">
                                        Data Paths
                                        {sc4s_supported && <span className="csc-dp-tag csc-dp-tag-sc4s">SC4S</span>}
                                        {netflow_supported && <span className="csc-dp-tag csc-dp-tag-nf">{netflow_addon && netflowAddonStatus?.installed ? 'NetFlow ✓' : 'NetFlow'}</span>}
                                    </span>
                                    <div className="csc-dp-slim-rows">
                                        {sc4s_supported && (
                                            <div className="csc-dp-slim-row">
                                                <span className="csc-dp-group-title">SC4S</span>
                                                {addon && <span className="scan-sc4s-precedence-note">Optional — Add-on is primary</span>}
                                                <button type="button" className="csc-btn csc-btn-outline csc-dp-guide-btn" onClick={() => setSc4sInfoOpen(true)}>
                                                    View SC4S Guide
                                                </button>
                                            </div>
                                        )}
                                        {netflow_supported && (
                                            <div className="csc-dp-slim-row">
                                                <span className="csc-dp-group-title">NetFlow / IPFIX</span>
                                                {netflowAddonStatus?.installed && <span className="csc-dep-version">v{netflowAddonStatus.version}</span>}
                                                {!netflowAddonStatus?.installed && netflow_addon && <span className="csc-dep-status-missing">not installed</span>}
                                                <button type="button" className="csc-btn csc-btn-outline csc-dp-guide-btn" onClick={() => setNetflowInfoOpen(true)}>
                                                    View NetFlow Guide
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                </>
                            )}

                            {/* ── Legacy & Compatibility (consolidated) ── */}
                            {(() => {
                                const hasLegacyInstalled = legacyInstalled.length > 0;
                                const hasLegacyCataloged = allLegacyUids.length > 0;
                                const uids = [addon_splunkbase_uid, app_viz_splunkbase_uid, app_viz_2_splunkbase_uid].filter(Boolean);
                                const compatEntries = splunkbaseData ? uids.map(uid => {
                                    const entry = splunkbaseData[uid];
                                    return entry ? { ...entry, uid } : null;
                                }).filter(Boolean) : [];
                                const hasCompat = compatEntries.length > 0;
                                const hasSc4sCompat = sc4s_supported && !hasCompat;
                                if (!hasLegacyInstalled && !hasCompat && !hasSc4sCompat && !hasLegacyCataloged) return null;
                                const tagParts = [];
                                if (hasLegacyInstalled) tagParts.push(`${legacyInstalled.length} legacy`);
                                if (hasLegacyCataloged && !hasLegacyInstalled) tagParts.push(`${allLegacyUids.length} legacy (catalog)`);
                                if (hasCompat || hasSc4sCompat) tagParts.push('compat');
                                const renderLegacyGroup = (groupUids, groupLabel, supersededBy) => {
                                    if (!groupUids || groupUids.length === 0) return null;
                                    const installed = groupUids.filter(uid => {
                                        const sb = splunkbaseData && splunkbaseData[uid];
                                        return sb && sb.appid && installedApps[sb.appid];
                                    });
                                    if (installed.length === 0) return null;
                                    return (
                                        <div className="csc-dp-group">
                                            <div className="csc-dp-group-header">
                                                <span className="csc-dp-group-title">{groupLabel} ({installed.length} installed)</span>
                                            </div>
                                            <div className="scan-legacy-note">
                                                {supersededBy ? (
                                                    <>{supersededBy} supersedes {installed.length === 1 ? 'this' : 'these'}. Keeping both may cause duplicate knowledge objects or field conflicts — consider removing the legacy version.</>
                                                ) : (
                                                    <>These legacy items have been superseded and may cause duplicate knowledge objects or field conflicts if kept alongside the current version.</>
                                                )}
                                            </div>
                                            {installed.map(uid => {
                                                const sb = splunkbaseData && splunkbaseData[uid];
                                                if (!sb) return null;
                                                const legStatus = installedApps[sb.appid];
                                                return (
                                                    <div className="csc-dep-detail" key={uid}>
                                                        <span className="csc-dep-name">{sb.title || sb.appid}</span>
                                                        <span className="csc-dep-appid">{sb.appid}</span>
                                                        <span className="csc-split-pill">
                                                            <a href={generateSplunkbaseUrl(uid)} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg" title="View on Splunkbase">Splunkbase</a>
                                                        </span>
                                                        {legStatus?.version && <span className="csc-dep-version">v{legStatus.version}</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                };
                                return (
                                    <>
                                    <hr className="csc-dep-divider" />
                                    <details className={`csc-dep-details csc-section-legacy-compat${hasLegacyInstalled ? ' csc-section-legacy-warn' : ''}`}>
                                        <summary className="csc-dep-details-summary">
                                            Legacy & Compatibility
                                            <span className={`csc-dp-tag ${hasLegacyInstalled ? 'csc-dp-tag-legacy-warn' : 'csc-dp-tag-neutral csc-dp-tag-legacy-compat'}`}>{tagParts.join(' · ')}</span>
                                        </summary>
                                        <div className="csc-dep-details-body">
                                            {hasLegacyCataloged && (
                                                <div className="csc-dp-group" style={{ marginBottom: hasLegacyInstalled || hasCompat ? 12 : 0 }}>
                                                    <button type="button" className="csc-btn csc-btn-outline csc-btn-legacy-audit" style={{ fontSize: 12 }} onClick={() => onViewLegacy(allLegacyUids)}>
                                                        View full legacy audit ({allLegacyUids.length} app{allLegacyUids.length !== 1 ? 's' : ''})
                                                    </button>
                                                </div>
                                            )}
                                            {renderLegacyGroup(legacy_uids, 'Legacy Add-ons', addon_label || addon)}
                                            {renderLegacyGroup(legacy_viz_uids, 'Legacy Apps', app_viz_label || app_viz)}
                                            {hasLegacyInstalled && (hasCompat || hasSc4sCompat) && <hr className="csc-dep-divider" />}
                                            {hasCompat && (
                                                <div className="csc-dp-group">
                                                    <div className="csc-dp-group-header">
                                                        <span className="csc-dp-group-title">Compatibility</span>
                                                    </div>
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
                                            )}
                                            {hasSc4sCompat && (
                                                <div className="csc-dp-group">
                                                    <div className="csc-dp-group-header">
                                                        <span className="csc-dp-group-title">Compatibility (SC4S)</span>
                                                    </div>
                                                    <div className="csc-compat-entry">
                                                        <div className="csc-compat-row">
                                                            <span className="csc-compat-label">Platform</span>
                                                            <span className="csc-compat-value">Splunk Cloud, Splunk Enterprise</span>
                                                        </div>
                                                        <div className="csc-compat-row">
                                                            <span className="csc-compat-label">Splunk Versions</span>
                                                            <span className="csc-compat-value">All supported versions</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                    </>
                                );
                            })()}

                            {/* ── Sourcetypes (collapsible) ── */}
                            {product.sourcetypes && product.sourcetypes.length > 0 && (
                                <>
                                <hr className="csc-dep-divider" />
                                <details className="csc-dep-details csc-section-sourcetypes">
                                    <summary className="csc-dep-details-summary">
                                        Sourcetypes
                                        <span className="csc-dp-tag csc-dp-tag-neutral">{product.sourcetypes.length}</span>
                                    </summary>
                                    <div className="csc-dep-details-body">
                                        <div className="csc-sourcetypes-chips">
                                            {product.sourcetypes.map(st => {
                                                const peers = sharedSourcetypeMap && sharedSourcetypeMap[st];
                                                const isShared = peers && peers.length > 1;
                                                const hasFlow = sourcetypeInfo?.matchedSTs?.includes(st);
                                                return (
                                                    <span
                                                        key={st}
                                                        className={`csc-st-chip ${hasFlow ? 'csc-st-chip-active' : 'csc-st-chip-inactive'} ${isShared ? 'csc-st-chip-shared' : ''}`}
                                                        title={`${st}${hasFlow ? '' : ' — no data in last 7d'}${isShared ? ` — shared with ${peers.filter(x => x.product_id !== product.product_id).map(x => x.display_name).join(', ')}` : ''}`}
                                                    >{st}{isShared && <span className="csc-st-shared-badge" title="Shared sourcetype">⇄</span>}</span>
                                                );
                                            })}
                                        </div>
                                        {(() => {
                                            if (!sharedSourcetypeMap) return null;
                                            const sharedSts = product.sourcetypes.filter(st => sharedSourcetypeMap[st] && sharedSourcetypeMap[st].length > 1);
                                            if (sharedSts.length === 0) return null;
                                            const peerNames = new Set();
                                            for (const st of sharedSts) {
                                                for (const p of sharedSourcetypeMap[st]) {
                                                    if (p.product_id !== product.product_id) peerNames.add(p.display_name);
                                                }
                                            }
                                            return (
                                                <div className="csc-st-shared-note">
                                                    <span className="csc-st-shared-icon">ℹ</span>
                                                    {sharedSts.length === product.sourcetypes.length
                                                        ? 'All sourcetypes are '
                                                        : `${sharedSts.length} sourcetype${sharedSts.length > 1 ? 's are' : ' is'} `}
                                                    shared with: {[...peerNames].join(', ')}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </details>
                                </>
                            )}
                        </div>
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
                {/* Learn More — full text, outline; falls back to Cisco A-to-Z directory */}
                <a href={learn_more_url || CISCO_PRODUCT_DIRECTORY_URL} target="_blank" rel="noopener noreferrer"
                    className="csc-btn csc-btn-outline"
                    title={learn_more_url ? `Learn more about ${display_name}` : `Browse Cisco products (${display_name})`}>
                    Learn More
                </a>
                {/* Details toggle — expand/collapse deployment info */}
                {hasDeps && !suppressActions && (
                    <button className={`csc-btn csc-btn-outline csc-btn-details-toggle ${depsExpanded ? 'csc-btn-details-active' : ''}`}
                        onClick={() => setDepsExpanded((v) => !v)}
                        title={depsExpanded ? 'Hide deployment details' : 'Show deployment details'}>
                        {depsExpanded ? '− Hide' : '+ Details'}
                    </button>
                )}
                {/* Disabled TA — link to app manager */}
                {!suppressActions && isConfigured && appStatus?.installed && appStatus?.disabled && (
                    <a href={createURL('/manager/splunk-cisco-app-navigator/apps/local')}
                        target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-disabled-label"
                        title={`${addon_label || addon} is disabled — search for it in Manage Apps`}>
                        Add-on Disabled
                    </a>
                )}
                {/* Disabled Viz App — link to app manager */}
                {!suppressActions && isConfigured && vizAppStatus?.installed && vizAppStatus?.disabled && (
                    <a href={createURL('/manager/splunk-cisco-app-navigator/apps/local')}
                        target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-disabled-label"
                        title={`${app_viz_label || app_viz} is disabled — search for it in Manage Apps`}>
                        App Disabled
                    </a>
                )}
                {/* Update TA */}
                {!suppressActions && isConfigured && appStatus?.installed && !appStatus?.disabled && appStatus?.updateVersion && (addon_install_url || addon_splunkbase_uid) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : generateSplunkbaseUrl(addon_splunkbase_uid)} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Update ${addon_label || addon} to v${appStatus.updateVersion}`}>
                        Update Add-on v{appStatus.updateVersion}
                    </a>
                )}
                {/* Update Viz App */}
                {!suppressActions && isConfigured && vizAppStatus?.installed && !vizAppStatus?.disabled && vizAppStatus?.updateVersion && (app_viz_install_url || app_viz_splunkbase_uid) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : generateSplunkbaseUrl(app_viz_splunkbase_uid)} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Update ${app_viz_label || app_viz} to v${vizAppStatus.updateVersion}`}>
                        Update App v{vizAppStatus.updateVersion}
                    </a>
                )}
                {/* Update Viz App 2 */}
                {!suppressActions && isConfigured && vizApp2Status?.installed && !vizApp2Status?.disabled && vizApp2Status?.updateVersion && app_viz_2_install_url && (
                    <a href={createURL(app_viz_2_install_url)} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Update ${app_viz_2_label || app_viz_2} to v${vizApp2Status.updateVersion}`}>
                        Update App 2 v{vizApp2Status.updateVersion}
                    </a>
                )}
                {/* Install TA */}
                {!suppressActions && isConfigured && addon && !appStatus?.installed && (addon_install_url || addon_splunkbase_uid) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : generateSplunkbaseUrl(addon_splunkbase_uid)}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!addon_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!addon_install_url
                            ? `Not available in Browse More Apps — download ${addon_label || addon} from Splunkbase`
                            : `Install ${addon_label || addon}`}>
                        Install Add-on
                    </a>
                )}
                {/* Install Viz App */}
                {!suppressActions && isConfigured && app_viz && !vizAppStatus?.installed && (app_viz_install_url || app_viz_splunkbase_uid) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : generateSplunkbaseUrl(app_viz_splunkbase_uid)}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!app_viz_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!app_viz_install_url
                            ? `Not available in Browse More Apps — download ${app_viz_label || app_viz} from Splunkbase`
                            : `Install ${app_viz_label || app_viz}`}>
                        Install App
                    </a>
                )}
                {/* Install Viz App 2 */}
                {!suppressActions && isConfigured && app_viz_2 && !vizApp2Status?.installed && (app_viz_2_install_url || app_viz_2_splunkbase_uid) && (
                    <a href={app_viz_2_install_url ? createURL(app_viz_2_install_url) : generateSplunkbaseUrl(app_viz_2_splunkbase_uid)}
                        target="_blank" rel="noopener noreferrer"
                        className={`csc-btn ${!app_viz_2_install_url ? 'csc-btn-archived' : 'csc-btn-green'}`}
                        title={!app_viz_2_install_url
                            ? `Not available in Browse More Apps — download ${app_viz_2_label || app_viz_2} from Splunkbase`
                            : `Install ${app_viz_2_label || app_viz_2}`}>
                        Install App 2
                    </a>
                )}
                {/* Launch — only when installed AND not disabled */}
                {!suppressActions && isConfigured && isInstalled && !appStatus?.disabled && !vizAppStatus?.disabled && (
                    isAddonOnly ? (
                        /* ── TA-only: contextual Explore dropdown ── */
                        <div className="csc-launch-wrap" ref={launchBtnRef}>
                            <button className="csc-btn csc-btn-explore" onClick={product.custom_dashboard ? handleLaunchCustom : handleExploreData}
                                title={product.custom_dashboard
                                    ? `Open custom dashboard: ${product.custom_dashboard}`
                                    : `Explore ${display_name} data in Splunk Search`}>
                                <Search size={14} style={{ marginRight: 4 }} />
                                {product.custom_dashboard ? 'Launch' : 'Explore'}
                            </button>
                            <button
                                className="csc-btn csc-btn-explore csc-launch-caret"
                                onClick={toggleLaunchMenu}
                                title="More options"
                            ><ChevronDown size={14} /></button>
                            {launchMenuOpen && ReactDOM.createPortal(
                                <div className="csc-launch-menu" ref={launchMenuRef}
                                    style={{ top: launchMenuPos.top, left: launchMenuPos.left }}>
                                    <button className="csc-launch-menu-item" onClick={() => { handleExploreData(); setLaunchMenuOpen(false); }}>
                                        <Search size={13} style={{ marginRight: 6, opacity: 0.7 }} />Explore Data in Search
                                    </button>
                                    <button className="csc-launch-menu-item" onClick={() => { handleCreateDashboard(); setLaunchMenuOpen(false); }}>
                                        <LayoutIcon size={13} style={{ marginRight: 6, opacity: 0.7 }} />Create Dashboard
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
                    ) : (
                        /* ── Normal launch: app has visible UI ── */
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
                                    {productDashboards.length > 1 ? (
                                        productDashboards.map((dash, i) => (
                                            <button key={dash} className="csc-launch-menu-item" onClick={() => { handleLaunchDashboard(dash); setLaunchMenuOpen(false); }}>
                                                {dash.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                            </button>
                                        ))
                                    ) : (
                                        <button className="csc-launch-menu-item" onClick={() => { handleLaunchDefault(); setLaunchMenuOpen(false); }}>
                                            {productDashboards[0]
                                                ? productDashboards[0].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                                                : (app_viz_label || addon_label || 'Default Dashboard')}
                                        </button>
                                    )}
                                    <div className="csc-launch-menu-divider" />
                                    <button className="csc-launch-menu-item" onClick={() => { handleExploreData(); setLaunchMenuOpen(false); }}>
                                        <Search size={13} style={{ marginRight: 6, opacity: 0.7 }} />Explore Data in Search
                                    </button>
                                    <button className="csc-launch-menu-item" onClick={() => { handleCreateDashboard(); setLaunchMenuOpen(false); }}>
                                        <LayoutIcon size={13} style={{ marginRight: 6, opacity: 0.7 }} />Create Dashboard
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
                    )
                )}
                {/* SC4S-only: Explore button when configured (no addon/app to install) */}
                {!suppressActions && isConfigured && isSc4sOnly && !isInstalled && (
                    <div className="csc-launch-wrap" ref={launchBtnRef}>
                        <button className="csc-btn csc-btn-explore" onClick={product.custom_dashboard ? handleLaunchCustom : handleExploreData}
                            title={product.custom_dashboard
                                ? `Open custom dashboard: ${product.custom_dashboard}`
                                : `Explore ${display_name} data in Splunk Search`}>
                            <Search size={14} style={{ marginRight: 4 }} />
                            {product.custom_dashboard ? 'Launch' : 'Explore'}
                        </button>
                        <button
                            className="csc-btn csc-btn-explore csc-launch-caret"
                            onClick={toggleLaunchMenu}
                            title="More options"
                        ><ChevronDown size={14} /></button>
                        {launchMenuOpen && ReactDOM.createPortal(
                            <div className="csc-launch-menu" ref={launchMenuRef}
                                style={{ top: launchMenuPos.top, left: launchMenuPos.left }}>
                                <button className="csc-launch-menu-item" onClick={() => { handleExploreData(); setLaunchMenuOpen(false); }}>
                                    <Search size={13} style={{ marginRight: 6, opacity: 0.7 }} />Explore Data in Search
                                </button>
                                <button className="csc-launch-menu-item" onClick={() => { handleCreateDashboard(); setLaunchMenuOpen(false); }}>
                                    <LayoutIcon size={13} style={{ marginRight: 6, opacity: 0.7 }} />Create Dashboard
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
                {/* Add to My Products — allowed for coverage_gap products too (e.g. AppDynamics, Webex) */}
                {!suppressActions && !isConfigured && (
                    <button className="csc-btn csc-btn-green" onClick={() => onToggleConfigured(product_id)}
                        title="Add to My Products">
                        <Plus style={{marginRight: 4}} /> Add
                    </button>
                )}
                {/* Best Practices — hidden for roadmap/coverage_gap products (no add-on yet) */}
                {!suppressActions && !coverage_gap && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onShowBestPractices(product)}
                        title="Best Practices">
                        <QuestionCircle size={16} />
                    </button>
                )}
                {/* Copy customer summary to clipboard */}
                {!suppressActions && (
                    <button className={`csc-btn csc-btn-icon csc-btn-outline ${copiedSummary ? 'csc-btn-copied' : ''}`}
                        onClick={handleCopySummary}
                        title={copiedSummary ? 'Copied to clipboard!' : `Copy ${display_name} summary for customer`}>
                        {copiedSummary
                            ? <span style={{ fontSize: '13px', fontWeight: 600 }}>✓</span>
                            : <Clipboard size={16} />}
                    </button>
                )}
                {/* Remove */}
                {!suppressActions && isConfigured && (
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
                {/* Custom card management — edit, clone, delete (only when callbacks provided) */}
                {onEditCustom && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline"
                        onClick={() => onEditCustom(product)} title="Edit custom product">
                        <Pencil size={16} />
                    </button>
                )}
                {onCloneCustom && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline"
                        onClick={() => onCloneCustom(product)} title="Clone custom product">
                        <CloneIcon size={16} />
                    </button>
                )}
                {onDeleteCustom && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline csc-btn-custom-delete"
                        onClick={() => onDeleteCustom(product)} title="Delete custom product">
                        <TrashCan size={16} />
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
                                {isAddonOnly
                                    ? <>Set a custom dashboard for this product. This is a <strong>TA-only integration</strong> — the add-on ingests and normalises data but has no built-in dashboards. Create one with Dashboard Studio, then paste the path here. When set, the main button will open your dashboard directly.</>
                                    : <>Set a custom dashboard to launch for this product. When set, the Launch button will open your custom dashboard by default. Use the dropdown arrow to switch between the Cisco default and your custom dashboard at any time.</>
                                }
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
                            : <Button appearance="primary" className="scan-btn-primary" label="Save" onClick={handleSaveCustomDashboard} />
                        }
                    </Modal.Footer>
                </Modal>
            )}

            {/* ── SC4S / NetFlow / HF / SOAR / ITSI Modals (rendered outside details so they can open from header) ── */}
            {sc4s_supported && <SC4SInfoModal open={sc4sInfoOpen} onClose={() => setSc4sInfoOpen(false)} productContext={{
                displayName: display_name,
                sc4sUrl: sc4s_url,
                sc4sConfigNotes: sc4s_config_notes,
                sc4sSourcetypes: sc4s_sourcetypes,
                companionTa: hasDifferentSc4sTa && sc4s_search_head_ta ? {
                    name: sc4s_search_head_ta,
                    label: sc4s_search_head_ta_label,
                    splunkbaseId: sc4s_search_head_ta_splunkbase_id,
                    installed: sc4sShTaStatus?.installed || false,
                    version: sc4sShTaStatus?.version || '',
                } : null,
                hasAddon: !!addon,
            }} />}
            {netflow_supported && <NetFlowInfoModal open={netflowInfoOpen} onClose={() => setNetflowInfoOpen(false)} installedApps={installedApps} productContext={{
                displayName: display_name,
                netflowAddon: netflow_addon,
                netflowAddonLabel: netflow_addon_label,
                netflowAddonSplunkbaseId: netflow_addon_splunkbase_id,
                netflowAddonDocsUrl: netflow_addon_docs_url,
                netflowAddonStatus: netflowAddonStatus,
                netflowConfigNotes: netflow_config_notes,
            }} />}
            <HFInfoModal open={hfInfoOpen} onClose={() => setHfInfoOpen(false)} isCloud={platformType === 'cloud'} />
            <MagicEightModal open={magicEightOpen} onClose={() => setMagicEightOpen(false)} sourcetypes={product.sourcetypes} productName={display_name} addonApp={addon} addonLabel={addon_label} appViz={app_viz} appViz2={app_viz_2} installedApps={installedApps} indexerApps={indexerApps} />
            {hasSoar && <SOARInfoModal open={soarInfoOpen} onClose={() => setSoarInfoOpen(false)} soarConnectorUids={soar_connector_uids} splunkbaseData={splunkbaseData} productName={display_name} />}
            {hasItops && <ITOpsContentModal open={itopsInfoOpen} onClose={() => setItopsInfoOpen(false)} itsiContentPack={itsi_content_pack} iteLearnContent={product.ite_learn_content} iteLearnProcedures={product.ite_learn_procedures} iteLearnProcedureCount={product.ite_learn_procedure_count} productName={display_name} installedApps={installedApps} />}
            {hasSecops && <SecOpsContentModal open={secopsInfoOpen} onClose={() => setSecopsInfoOpen(false)} productName={display_name} esCompatible={es_compatible} cimDataModels={es_cim_data_models} escuStories={escu_analytic_stories} escuDetectionCount={escu_detection_count} escuDetections={escu_detections} sseContent={product.sse_content} sseUseCases={product.sse_use_cases} sseUseCaseCount={product.sse_use_case_count} installedApps={installedApps} />}
            {alert_action_uids && alert_action_uids.length > 0 && (
                <AlertActionsInfoModal open={alertActionsInfoOpen} onClose={() => setAlertActionsInfoOpen(false)} alertActionUids={alert_action_uids} splunkbaseData={splunkbaseData} productName={display_name} />
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
            'addon', 'addon_label', 'addon_family', 'addon_splunkbase_uid',
            'addon_docs_url', 'addon_troubleshoot_url', 'addon_install_url',
            'app_viz', 'app_viz_label', 'app_viz_splunkbase_uid', 'app_viz_docs_url',
            'app_viz_troubleshoot_url', 'app_viz_install_url',
            'app_viz_2', 'app_viz_2_label', 'app_viz_2_splunkbase_uid',
            'app_viz_2_docs_url', 'app_viz_2_install_url',
            'learn_more_url',
            'support_level', 'icon_emoji', 'sort_order',
            'gtm_pillar',
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
        if (p.coverage_gap) lines.push('coverage_gap = true');
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
        // SSE
        if (p.sse_content) {
            lines.push(`sse_content = true`);
            if (p.sse_use_case_count) lines.push(`sse_use_case_count = ${p.sse_use_case_count}`);
            if (p.sse_use_cases && p.sse_use_cases.length) lines.push(`sse_use_cases = ${p.sse_use_cases.join(',')}`);
            if (p.sse_data_sources && p.sse_data_sources.length) lines.push(`sse_data_sources = ${p.sse_data_sources.join(',')}`);
        }
        // ITSI
        if (p.itsi_content_pack) {
            lines.push(`itsi_content_pack_label = ${p.itsi_content_pack.label}`);
            if (p.itsi_content_pack.docs_url) lines.push(`itsi_content_pack_docs_url = ${p.itsi_content_pack.docs_url}`);
        }
        // ITE Learn
        if (p.ite_learn_content) {
            lines.push(`ite_learn_content = true`);
            if (p.ite_learn_procedure_count) lines.push(`ite_learn_procedure_count = ${p.ite_learn_procedure_count}`);
            if (p.ite_learn_procedures && p.ite_learn_procedures.length) lines.push(`ite_learn_procedures = ${p.ite_learn_procedures.join(',')}`);
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

    const INTERNAL_KEYS = new Set(['custom', 'catalog_disabled']);

    // Build enriched product data (what the card actually sees)
    const enrichProduct = (p) => {
        const appStatus = appStatuses[p.addon] || null;
        const vizStatus = p.app_viz ? (appStatuses[p.app_viz] || null) : null;
        const stData = sourcetypeData[p.product_id] || null;
        const clean = {};
        for (const [k, v] of Object.entries(p)) {
            if (!INTERNAL_KEYS.has(k)) clean[k] = v;
        }
        return {
            ...clean,
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
            <Modal.Header title="Config Viewer — Developer Mode" />
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
                        >Tree</button>
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
                        >Splunk</button>
                    </div>
                    <button className="csc-devmode-copy" onClick={handleCopy}>
                        {copied ? '✓ Copied!' : 'Copy'}
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
    '@babel/core': '7.29.0',
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

const LATEST_VERSIONS_CHECKED = '2026-03-17';

const HOLD_REASONS = {
    'styled-components': 'Held at v5 — @splunk/react-ui peer dependency does not support v6 yet',
    'eslint': 'Held at v7 — upgrading to v9 requires migrating to flat config (eslint.config.js)',
    'webpack-cli': 'Held at v5 — v6 is a major rewrite with breaking CLI changes',
    'webpack-merge': 'Held at v5 — v6 drops legacy merge strategies used by @splunk/webpack-configs',
    'copy-webpack-plugin': 'Held at v11 — v13 requires Webpack 5.88+ API changes not yet validated',
    'requests': 'Managed by Splunk — bundled with the Splunk Python runtime, not upgradable independently',
};

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
        entry.hold = HOLD_REASONS[name] || null;
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
        entry.hold = HOLD_REASONS[name] || null;
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
                const hold = d.hold ? ` [${d.hold}]` : '';
                lines.push(`  ${d.name}: ${d.current}${d.latest ? ` → latest ${d.latest} ${status}` : ''}${hold}`);
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
                <td className="scan-ts-note">{d.hold || ''}</td>
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
                            <th>Note</th>
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
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '860px', width: '92vw' }}>
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

// ─────────────────────  CUSTOM PRODUCT FORM  ─────────────────

const CUSTOM_FORM_CATEGORIES = [
    { value: 'security', label: 'Security' },
    { value: 'networking', label: 'Networking' },
    { value: 'collaboration', label: 'Collaboration' },
    { value: 'observability', label: 'Observability' },
];


function CustomProductFormModal({ open, onClose, onSave, editProduct, cloneProduct, existingIds, allProducts }) {
    const isEdit = !!editProduct;
    const returnFocusRef = useRef(null);
    const [displayName, setDisplayName] = useState('');
    const [vendor, setVendor] = useState('');
    const [description, setDescription] = useState('');
    const [tagline, setTagline] = useState('');
    const [category, setCategory] = useState('security');
    const [sourcetypes, setSourcetypes] = useState('');
    const [keywords, setKeywords] = useState('');
    const [learnMoreUrl, setLearnMoreUrl] = useState('');
    const [iconEmoji, setIconEmoji] = useState('');
    const [addonLabel, setAddonLabel] = useState('');
    const [addonUid, setAddonUid] = useState('');
    const [addonDocsUrl, setAddonDocsUrl] = useState('');
    const [addonAppId, setAddonAppId] = useState('');
    const [addonInstallUrl, setAddonInstallUrl] = useState('');
    const [supportLevel, setSupportLevel] = useState('');
    const [dashboards, setDashboards] = useState('');
    const [aliases, setAliases] = useState('');
    const [valueProp, setValueProp] = useState('');
    const [subcategory, setSubcategory] = useState('');
    const [version, setVersion] = useState('');
    const [addonTroubleshootUrl, setAddonTroubleshootUrl] = useState('');
    const [legacyUids, setLegacyUids] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [cloneSource, setCloneSource] = useState('');

    const populateFromProduct = useCallback((product, isClone) => {
        setDisplayName(isClone ? `Copy of ${product.display_name || ''}` : (product.display_name || ''));
        setVendor(product.vendor || '');
        setDescription(product.description || '');
        setTagline(product.tagline || '');
        setCategory(product.category || 'security');
        setSourcetypes((product.sourcetypes || []).join(', '));
        setKeywords((product.keywords || []).join(', '));
        setLearnMoreUrl(product.learn_more_url || '');
        setIconEmoji(product.icon_emoji || '');
        setAddonLabel(product.addon_label || '');
        setAddonUid(product.addon_splunkbase_uid || '');
        setAddonDocsUrl(product.addon_docs_url || '');
        setAddonAppId(product.addon || '');
        setAddonInstallUrl(product.addon_install_url || '');
        setSupportLevel(product.support_level || '');
        setDashboards((product.dashboards || []).join(', '));
        setAliases((product.aliases || []).join(', '));
        setValueProp(product.value_proposition || '');
        setSubcategory(product.subcategory || '');
        setVersion(product.version || '');
        setAddonTroubleshootUrl(product.addon_troubleshoot_url || '');
        setLegacyUids((product.legacy_uids || []).join(', '));
        const hasAdv = !!(product.addon || product.support_level || (product.dashboards && product.dashboards.length) || (product.aliases && product.aliases.length) || product.value_proposition || product.addon_troubleshoot_url || (product.legacy_uids && product.legacy_uids.length));
        setShowAdvanced(hasAdv);
    }, []);

    const resetForm = useCallback(() => {
        setDisplayName(''); setVendor(''); setDescription(''); setTagline('');
        setCategory('security'); setSubcategory(''); setSourcetypes(''); setKeywords('');
        setLearnMoreUrl(''); setIconEmoji(''); setAddonLabel('');
        setAddonUid(''); setAddonDocsUrl(''); setAddonAppId('');
        setAddonInstallUrl(''); setAddonTroubleshootUrl(''); setSupportLevel('');
        setDashboards(''); setAliases(''); setValueProp('');
        setVersion(''); setLegacyUids(''); setShowAdvanced(false);
    }, []);

    useEffect(() => {
        if (!open) return;
        if (editProduct) {
            populateFromProduct(editProduct, false);
            setCloneSource('');
        } else if (cloneProduct) {
            populateFromProduct(cloneProduct, true);
            setCloneSource(cloneProduct.product_id);
        } else {
            resetForm();
            setCloneSource('');
        }
        setFormError(''); setSaving(false);
    }, [open, editProduct, cloneProduct, populateFromProduct, resetForm]);

    const handleCloneSelect = useCallback((e) => {
        const pid = e.target.value;
        setCloneSource(pid);
        if (!pid) { resetForm(); return; }
        const source = (allProducts || []).find(p => p.product_id === pid);
        if (source) populateFromProduct(source, true);
    }, [allProducts, populateFromProduct, resetForm]);

    const sortedCloneOptions = useMemo(() =>
        (allProducts || []).filter(p => p.status === 'active').sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '')),
    [allProducts]);

    const generatedId = useMemo(() => slugifyProductId(displayName || 'untitled'), [displayName]);

    const handleSubmit = useCallback(async () => {
        if (!displayName.trim()) { setFormError('Display Name is required.'); return; }
        if (!description.trim()) { setFormError('Description is required.'); return; }
        const productId = isEdit ? editProduct.product_id : generatedId;
        if (!isEdit && (existingIds || []).includes(productId)) {
            setFormError(`A product with ID "${productId}" already exists. Change the display name.`);
            return;
        }
        setSaving(true); setFormError('');
        try {
            const fields = {
                display_name: displayName.trim(),
                vendor: vendor.trim(),
                description: description.trim(),
                tagline: tagline.trim(),
                category,
                subcategory: subcategory,
                version: version.trim() || '1.0.0',
                sourcetypes: sourcetypes.trim(),
                keywords: keywords.trim(),
                learn_more_url: learnMoreUrl.trim(),
                icon_emoji: iconEmoji.trim(),
                addon_label: addonLabel.trim(),
                addon_uid: addonUid.trim(),
                addon_docs_url: addonDocsUrl.trim(),
                addon_troubleshoot_url: addonTroubleshootUrl.trim(),
                addon: addonAppId.trim(),
                addon_install_url: addonInstallUrl.trim(),
                support_level: supportLevel,
                dashboards: dashboards.trim(),
                aliases: aliases.trim(),
                value_proposition: valueProp.trim(),
                legacy_uids: legacyUids.trim(),
                custom: 'true',
                status: 'active',
            };
            if (isEdit) {
                await updateCustomProduct(productId, fields);
            } else {
                await createCustomProduct(productId, fields);
            }
            onSave();
            onClose();
        } catch (e) {
            setFormError(e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    }, [displayName, vendor, description, tagline, category, subcategory, version,
        sourcetypes, keywords, learnMoreUrl, iconEmoji, addonLabel, addonUid, addonDocsUrl,
        addonTroubleshootUrl, addonAppId, addonInstallUrl, supportLevel, dashboards,
        aliases, valueProp, legacyUids,
        isEdit, editProduct, generatedId, existingIds, onSave, onClose]);

    const categoryIcons = { security: '🛡️', networking: '🌐', collaboration: '🎧', observability: '📊' };

    if (!open) return null;
    return (
        <Modal open returnFocus={returnFocusRef} onRequestClose={onClose} style={{ maxWidth: '860px', width: '94vw' }}>
            <Modal.Header title={isEdit ? 'Edit Custom Product' : 'Add Custom Product'} />
            <Modal.Body>
                <div className="csc-custom-form">
                    {formError && <div className="csc-custom-form-error">{formError}</div>}

                    {/* Clone from existing product */}
                    {!isEdit && (
                        <div className="csc-custom-form-row">
                            <label>Clone from existing product</label>
                            <select value={cloneSource} onChange={handleCloneSelect}>
                                <option value="">{'\u2014'} Start from scratch {'\u2014'}</option>
                                {sortedCloneOptions.map(p => (
                                    <option key={p.product_id} value={p.product_id}>
                                        {p.display_name}{p.vendor ? ` (${p.vendor})` : ''}
                                    </option>
                                ))}
                            </select>
                            <span className="csc-custom-form-hint">Pick an existing product to pre-fill the form, or start with a blank card.</span>
                        </div>
                    )}

                    {/* Live Preview */}
                    {displayName && (
                        <div className="csc-custom-preview">
                            <span className="csc-custom-preview-badge">Preview</span>
                            {iconEmoji && <span className="csc-custom-preview-emoji">{iconEmoji}</span>}
                            <div className="csc-custom-preview-name">{displayName}</div>
                            {tagline && <div className="csc-custom-preview-tagline">{tagline}</div>}
                            {vendor && <div className="csc-custom-preview-vendor">{vendor}</div>}
                            {description && <div className="csc-custom-preview-desc">{description.length > 120 ? description.slice(0, 120) + '\u2026' : description}</div>}
                        </div>
                    )}

                    {/* Section: Identity */}
                    <div className="csc-custom-form-section">
                        <div className="csc-custom-form-section-title">Identity — name, vendor, and icon</div>
                        <div className="csc-custom-form-row">
                            <label>Display Name <span className="csc-req">*</span></label>
                            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Cisco Secure Firewall" maxLength={120} />
                            <span className="csc-custom-form-hint">The product name shown on the card and in search results.</span>
                            {!isEdit && displayName && <span className="csc-custom-form-id">ID: {generatedId}</span>}
                        </div>
                        <div className="csc-custom-form-cols">
                            <div className="csc-custom-form-row">
                                <label>Vendor</label>
                                <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Cisco" maxLength={80} />
                                <span className="csc-custom-form-hint">The company or team that makes this product.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Icon Emoji</label>
                                <input type="text" value={iconEmoji} onChange={e => setIconEmoji(e.target.value)} placeholder="🔥" maxLength={4} style={{ textAlign: 'center', fontSize: '18px' }} />
                                <span className="csc-custom-form-hint">A single emoji displayed as the card icon.</span>
                            </div>
                        </div>
                        <div className="csc-custom-form-cols">
                            <div className="csc-custom-form-row">
                                <label>Tagline</label>
                                <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Next-generation firewall with advanced threat defense" maxLength={100} />
                                <span className="csc-custom-form-hint">A short subtitle displayed under the product name.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Version</label>
                                <input type="text" value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 1.0.0" maxLength={20} />
                                <span className="csc-custom-form-hint">Product or integration version number.</span>
                            </div>
                        </div>
                        <div className="csc-custom-form-row">
                            <label>Description <span className="csc-req">*</span></label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Cisco Secure Firewall provides advanced threat defense for your network, with Splunk integration via syslog and eStreamer." maxLength={1000} />
                            <span className="csc-custom-form-hint">Brief overview of the product and its Splunk integration.</span>
                        </div>
                    </div>

                    {/* Section: Category */}
                    <div className="csc-custom-form-section">
                        <div className="csc-custom-form-section-title">Category — where the card appears</div>
                        <div className="csc-custom-cat-pills">
                            {CUSTOM_FORM_CATEGORIES.map(c => (
                                <button key={c.value} className={`csc-custom-cat-pill${category === c.value ? ' active' : ''}`} onClick={() => { setCategory(c.value); setSubcategory(''); }}>
                                    {categoryIcons[c.value] || ''} {c.label}
                                </button>
                            ))}
                        </div>
                        <span className="csc-custom-form-hint">Determines which section the card appears in on the main page.</span>
                        {SUB_CATEGORIES[category] && SUB_CATEGORIES[category].length > 0 && (
                            <div className="csc-custom-form-row" style={{ marginTop: '8px' }}>
                                <label>Subcategory</label>
                                <select value={subcategory} onChange={e => setSubcategory(e.target.value)}>
                                    <option value="">— None —</option>
                                    {SUB_CATEGORIES[category].map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <span className="csc-custom-form-hint">Optional sub-section within the category (e.g. Network Security, Cloud Security).</span>
                            </div>
                        )}
                    </div>

                    {/* Section: Data */}
                    <div className="csc-custom-form-section">
                        <div className="csc-custom-form-section-title">Data — sourcetypes and search keywords</div>
                        <div className="csc-custom-form-row">
                            <label>Sourcetypes</label>
                            <input type="text" value={sourcetypes} onChange={e => setSourcetypes(e.target.value)} placeholder="e.g. cisco:asa, cisco:ftd" />
                            <span className="csc-custom-form-hint">Comma-separated Splunk sourcetypes ingested by this product. Used for data detection and search.</span>
                        </div>
                        <div className="csc-custom-form-row">
                            <label>Keywords</label>
                            <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. firewall, ftd, asa, firepower" />
                            <span className="csc-custom-form-hint">Comma-separated extra search terms to help users find this card.</span>
                        </div>
                    </div>

                    {/* Section: Add-on */}
                    <div className="csc-custom-form-section">
                        <div className="csc-custom-form-section-title">Add-on — optional Splunkbase integration</div>
                        <div className="csc-custom-form-row">
                            <label>Add-on Label</label>
                            <input type="text" value={addonLabel} onChange={e => setAddonLabel(e.target.value)} placeholder="e.g. Cisco Secure Firewall Add-on for Splunk" />
                            <span className="csc-custom-form-hint">Display name of the Splunkbase add-on associated with this product.</span>
                        </div>
                        <div className="csc-custom-form-cols">
                            <div className="csc-custom-form-row">
                                <label>Splunkbase UID</label>
                                <input type="text" value={addonUid} onChange={e => setAddonUid(e.target.value)} placeholder="e.g. 1234" maxLength={10} />
                                <span className="csc-custom-form-hint">Numeric ID from the Splunkbase URL (splunkbase.splunk.com/app/1234).</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Docs URL</label>
                                <input type="url" value={addonDocsUrl} onChange={e => setAddonDocsUrl(e.target.value)} placeholder="e.g. https://docs.splunk.com/..." />
                                <span className="csc-custom-form-hint">Link to the add-on's documentation page.</span>
                            </div>
                        </div>
                        <div className="csc-custom-form-row">
                            <label>Troubleshooting URL</label>
                            <input type="url" value={addonTroubleshootUrl} onChange={e => setAddonTroubleshootUrl(e.target.value)} placeholder="e.g. https://docs.splunk.com/.../troubleshoot" />
                            <span className="csc-custom-form-hint">Link to the add-on's troubleshooting guide. Shows as a link on the card.</span>
                        </div>
                    </div>

                    {/* Section: Links */}
                    <div className="csc-custom-form-section">
                        <div className="csc-custom-form-section-title">Links — external resources</div>
                        <div className="csc-custom-form-row">
                            <label>Learn More URL</label>
                            <input type="url" value={learnMoreUrl} onChange={e => setLearnMoreUrl(e.target.value)} placeholder="e.g. https://www.cisco.com/go/secure-firewall" />
                            <span className="csc-custom-form-hint">Link to the product's official page or documentation.</span>
                        </div>
                    </div>

                    {/* Section: Advanced (collapsible) */}
                    <div className={`csc-custom-form-section csc-custom-form-advanced${showAdvanced ? ' open' : ''}`}>
                        <button className="csc-custom-form-advanced-toggle" onClick={() => setShowAdvanced(prev => !prev)}>
                            <span className={`csc-custom-form-advanced-arrow${showAdvanced ? ' open' : ''}`}>&#9654;</span>
                            Advanced
                            <span className="csc-custom-form-hint" style={{ marginTop: 0, marginLeft: '4px' }}>— install detection, support level, dashboards, aliases, legacy apps</span>
                        </button>
                        {showAdvanced && (<>
                            <div className="csc-custom-form-row">
                                <label>Add-on App ID (folder name)</label>
                                <input type="text" value={addonAppId} onChange={e => setAddonAppId(e.target.value)} placeholder="e.g. Splunk_TA_cisco-secure-firewall" maxLength={120} />
                                <span className="csc-custom-form-hint">The Splunk app folder name — enables install status detection on the card.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Install URL</label>
                                <input type="text" value={addonInstallUrl} onChange={e => setAddonInstallUrl(e.target.value)} placeholder='e.g. /manager/splunk-cisco-app-navigator/appsremote?query="Cisco+Secure+Firewall"' />
                                <span className="csc-custom-form-hint">Deep link to install via Browse More Apps (leave blank to use Splunkbase link).</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Support Level</label>
                                <div className="csc-custom-cat-pills">
                                    {[
                                        { v: '', l: 'None' },
                                        { v: 'cisco_supported', l: 'Cisco' },
                                        { v: 'splunk_supported', l: 'Splunk' },
                                        { v: 'developer_supported', l: 'Developer' },
                                        { v: 'community_supported', l: 'Community' },
                                    ].map(sl => (
                                        <button key={sl.v} className={`csc-custom-cat-pill${supportLevel === sl.v ? ' active' : ''}`} onClick={() => setSupportLevel(sl.v)}>
                                            {sl.l}
                                        </button>
                                    ))}
                                </div>
                                <span className="csc-custom-form-hint">Shown as a colored badge on the card.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Dashboards</label>
                                <input type="text" value={dashboards} onChange={e => setDashboards(e.target.value)} placeholder="e.g. cisco_fw_overview, cisco_fw_threats" />
                                <span className="csc-custom-form-hint">Comma-separated Splunk view names that enable the Launch button on the card.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Aliases (former names)</label>
                                <input type="text" value={aliases} onChange={e => setAliases(e.target.value)} placeholder="e.g. Firepower, ASA" />
                                <span className="csc-custom-form-hint">Shows "Formerly: ..." on the card and helps with search.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Legacy App UIDs</label>
                                <input type="text" value={legacyUids} onChange={e => setLegacyUids(e.target.value)} placeholder="e.g. Splunk_TA_cisco-old, cisco_legacy_ta" />
                                <span className="csc-custom-form-hint">Comma-separated app folder names of previous/retired add-ons. Enables "Legacy App" detection on the card.</span>
                            </div>
                            <div className="csc-custom-form-row">
                                <label>Value Proposition</label>
                                <textarea value={valueProp} onChange={e => setValueProp(e.target.value)} placeholder="e.g. Unified visibility into firewall events, threats, and policy changes" maxLength={300} style={{ minHeight: '50px' }} />
                                <span className="csc-custom-form-hint">One-liner benefit shown in the detail tooltip.</span>
                            </div>
                        </>)}
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Cancel" onClick={onClose} disabled={saving} />
                <Button appearance="primary" label={saving ? 'Saving\u2026' : (isEdit ? 'Save Changes' : 'Create Product')} onClick={handleSubmit} disabled={saving} />
            </Modal.Footer>
        </Modal>
    );
}

function DeleteCustomProductModal({ open, onClose, product, onConfirm }) {
    const [deleting, setDeleting] = useState(false);
    if (!open || !product) return null;

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteCustomProduct(product.product_id);
            onConfirm();
            onClose();
        } catch (e) {
            console.error('Delete failed:', e);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal open onRequestClose={onClose} style={{ width: '420px' }}>
            <Modal.Header title="Delete Custom Product" />
            <Modal.Body>
                <div className="csc-delete-confirm-body">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗑️</div>
                    <div className="csc-delete-confirm-name">{product.display_name}</div>
                    <div className="csc-delete-confirm-warn">
                        This will permanently remove this custom product card.<br />
                        This action cannot be undone.
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="secondary" label="Cancel" onClick={onClose} disabled={deleting} />
                <Button appearance="destructive" label={deleting ? 'Deleting...' : 'Delete'} onClick={handleDelete} disabled={deleting} />
            </Modal.Footer>
        </Modal>
    );
}

// ─────────────────────  SEARCH BAR  ─────────────────

function UniversalFinderBar({ onSearch, resultCount, totalCount, products, externalQuery }) {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const debounceRef = useRef(null);

    // Allow parent to clear the query (e.g. after devmode intercept)
    useEffect(() => {
        if (externalQuery !== undefined && externalQuery !== query) {
            setQuery(externalQuery);
        }
    }, [externalQuery]);

    // Cleanup debounce timer on unmount
    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    const keywordMap = useMemo(() => {
        const map = {};
        (products || []).forEach((p) => {
            (p.keywords || []).forEach((kw) => {
                const k = kw.toLowerCase().trim();
                if (!k) return;
                if (!map[k]) map[k] = [];
                if (!map[k].includes(p.product_id)) map[k].push(p.product_id);
            });
            (p.sourcetypes || []).forEach((st) => {
                const s = st.toLowerCase().trim();
                if (!s || s.includes('*')) return;
                if (!map[s]) map[s] = [];
                if (!map[s].includes(p.product_id)) map[s].push(p.product_id);
            });
        });
        return map;
    }, [products]);

    const broadMatchCount = useCallback((term) => {
        const q = term.toLowerCase().trim();
        if (!q) return 0;
        return (products || []).filter((p) => productMatchesSearch(p, q)).length;
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

    const handleChange = (e) => {
        const v = e.target.value;
        setQuery(v);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onSearch(v), 250);
    };
    const handleSuggestionClick = (kw) => {
        setQuery(kw);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        onSearch(kw);
        setFocused(false);
        setSelectedIdx(-1);
    };
    const handleClear = () => {
        setQuery('');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        onSearch('');
        setSelectedIdx(-1);
    };
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
                                {(() => { const c = broadMatchCount(kw); return (
                                    <span style={{ fontSize: '11px', color: 'var(--faint-color, #888)', marginLeft: '8px' }}>
                                        ({c} product{c !== 1 ? 's' : ''})
                                    </span>
                                ); })()}
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
    platformFilter, onSelectPlatform,
    versionFilter, onSelectVersion,
    splunkbaseData,
    csvSyncStatus, csvSyncMessage, onSyncSplunkbase,
    selectedAddon, onSelectAddon,
    products, allProducts, preAddonProducts, categoryCounts,
    showFullPortfolio, versionFilterMode, onToggleVersionFilterMode,
    platformFilterMode, onTogglePlatformFilterMode,
    appidToUidMap,
    onResetAll,
    showVault, onToggleShowVault, vaultCount,
    showInternalContent, devMode,
}) {
    const [versionExpanded, setVersionExpanded] = useState(false);

    /* ── Helper: apply platform/version compat filters ── */
    const applyCompatFilters = (list) => {
        let result = list;
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (platformFilterMode === 'include') {
                result = result.filter((p) => {
                    if (sc4sCoversFilter(p, platformFilter)) return true;
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true;
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            } else {
                result = result.filter((p) => {
                    if (sc4sCoversFilter(p, platformFilter)) return false;
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
                result = result.filter((p) => productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
            } else {
                result = result.filter((p) => !productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
            }
        }
        return result;
    };

    /* ── Counter logic: base sets then category/capability filters ── */
    const rawBase = applyCompatFilters(allProducts || products);
    const portfolioBase = showFullPortfolio
        ? rawBase
        : rawBase.filter(p => SUPPORTED_LEVELS.has(p.support_level) && p.status !== 'under_development');

    // Category + capability: main categories (security, networking, …) or cross-cutting (es, itsi, sc4s, netflow, soar, alert_actions, etc.)
    let catBase = portfolioBase;
    if (selectedCategory === 'soar') catBase = catBase.filter(p => p.soar_connector_uids && p.soar_connector_uids.length > 0);
    else if (selectedCategory === 'alert_actions') catBase = catBase.filter(p => p.alert_action_uids && p.alert_action_uids.length > 0);
    else if (selectedCategory === 'secure_networking') catBase = catBase.filter(p => p.secure_networking_gtm);
    else if (selectedCategory === 'secops') catBase = catBase.filter(p => p.es_compatible || p.sse_content);
    else if (selectedCategory === 'itops') catBase = catBase.filter(p => p.itsi_content_pack || p.ite_learn_content);
    else if (selectedCategory === 'sc4s') catBase = catBase.filter(p => p.sc4s_supported);
    else if (selectedCategory === 'netflow') catBase = catBase.filter(p => p.netflow_supported);
    else if (selectedCategory) catBase = catBase.filter(p => p.category === selectedCategory);

    /* Support counts */
    let supportCountBase = catBase;
    if (!showRetired) supportCountBase = supportCountBase.filter(p => p.status !== 'retired');
    if (!showDeprecated) supportCountBase = supportCountBase.filter(p => p.status !== 'deprecated');
    if (!showComingSoon) supportCountBase = supportCountBase.filter(p => p.status !== 'under_development');
    if (!showGtmRoadmap) supportCountBase = supportCountBase.filter(p => !p.coverage_gap || (p.addon || p.app_viz || p.app_viz_2 || p.sc4s_supported));
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
    const retiredCount = visCountBase.filter(p => p.status === 'retired').length;
    const deprecatedCount = visCountBase.filter(p => p.status === 'deprecated').length;
    const comingSoonCount = visCountBase.filter(p => p.status === 'under_development').length;
    const gtmRoadmapCount = visCountBase.filter(p => p.coverage_gap && !(p.addon || p.app_viz || p.app_viz_2 || p.sc4s_supported)).length;

    /* Cross-cutting counts (all from categoryCounts) */
    const soarCount = categoryCounts?.soar || 0;
    const alertCount = categoryCounts?.alert_actions || 0;
    const secNetCount = categoryCounts?.secure_networking || 0;
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

    /* Addon (Powered By) groups — derived from the pre-addon filtered list
       so counts reflect the current category/search/platform filters */
    const addonGroups = useMemo(() => {
        const src = preAddonProducts || [];
        const map = {};
        let standalone = 0;
        let sc4sOnly = 0;
        src.forEach((p) => {
            if (!p.addon) {
                if (p.sc4s_supported) { sc4sOnly++; } else { standalone++; }
                return;
            }
            if (!map[p.addon]) map[p.addon] = { label: p.addon_label || p.addon, folder: p.addon, uid: p.addon_splunkbase_uid || '', count: 0 };
            map[p.addon].count++;
        });
        const entries = Object.entries(map)
            .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label));
        if (sc4sOnly > 0) entries.push(['__sc4s__', { label: 'SC4S Only', count: sc4sOnly }]);
        if (standalone > 0) entries.push(['__standalone__', { label: 'Standalone', count: standalone }]);
        return entries;
    }, [preAddonProducts]);

    const isCrossCutting = (cat) => ['soar', 'alert_actions', 'secure_networking', 'secops', 'itops', 'sc4s', 'netflow'].includes(cat);
    const addonTotal = (preAddonProducts || []).length;

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

                    {/* ── By capability (aligns with card badges: ES, SOAR, ITSI, etc.) ── */}
                    <div className="scan-drawer-section">
                        <div className="scan-drawer-section-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                            By capability
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
                            {(categoryCounts?.secops || 0) > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'secops' ? 'scan-drawer-pill-cisco-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'secops' ? null : 'secops'); }}
                                    title="SecOps — products with ES and/or Security Essentials content"
                                >
                                    SecOps
                                    <span className="scan-drawer-pill-count">{categoryCounts.secops}</span>
                                </button>
                            )}
                            {(categoryCounts?.itops || 0) > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'itops' ? 'scan-drawer-pill-cisco-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'itops' ? null : 'itops'); }}
                                    title="ITOps — products with ITSI and/or IT Essentials Learn content"
                                >
                                    ITOps
                                    <span className="scan-drawer-pill-count">{categoryCounts.itops}</span>
                                </button>
                            )}
                            {(categoryCounts?.sc4s || 0) > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'sc4s' ? 'scan-drawer-pill-sc4s-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'sc4s' ? null : 'sc4s'); }}
                                    title="SC4S-supported products"
                                >
                                    SC4S
                                    <span className="scan-drawer-pill-count">{categoryCounts.sc4s}</span>
                                </button>
                            )}
                            {(categoryCounts?.netflow || 0) > 0 && (
                                <button
                                    className={`scan-drawer-pill ${selectedCategory === 'netflow' ? 'scan-drawer-pill-stream-active' : ''}`}
                                    onClick={() => { onSelectCategory(selectedCategory === 'netflow' ? null : 'netflow'); }}
                                    title="NetFlow / IPFIX supported products"
                                >
                                    NetFlow
                                    <span className="scan-drawer-pill-count">{categoryCounts.netflow}</span>
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
                            {/* "No Integration" pill hidden from regular users — these products
                                only appear in the Integration Needed section which requires devMode/gtmMode */}
                            {showInternalContent && (
                            <button
                                className={`scan-drawer-pill ${supportLevelFilter.includes('not_supported') ? 'scan-drawer-pill-unsupported-active' : ''}`}
                                onClick={() => onSelectSupportLevel('not_supported')}
                                title="Toggle products needing integration"
                            >
                                No Integration <span className="scan-drawer-pill-count">{supportCounts.not_supported}</span>
                            </button>
                            )}
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
                            {showInternalContent && (
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
                            )}
                            {showInternalContent && gtmRoadmapCount > 0 && (
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
                            {devMode && vaultCount > 0 && (
                                <button
                                    className={`scan-drawer-vis-item ${showVault ? 'scan-drawer-vis-on' : 'scan-drawer-vis-off'}`}
                                    onClick={() => onToggleShowVault(!showVault)}
                                    title={showVault ? 'Catalog Vault products are shown — click to hide' : 'Show disabled catalog entries that are hidden from the main view'}
                                >
                                    <div className="scan-drawer-vis-left">
                                        <div className="scan-drawer-vis-icon" style={{ background: '#e2e8f0' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                        </div>
                                        <span className="scan-drawer-vis-label">Catalog Vault</span>
                                    </div>
                                    <span className="scan-drawer-vis-count">{vaultCount}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="scan-drawer-divider" />

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
                                            <div
                                                className="scan-drawer-version-header scan-drawer-version-header-toggle"
                                                onClick={() => setVersionExpanded(prev => !prev)}
                                                style={{ cursor: 'pointer', userSelect: 'none' }}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVersionExpanded(prev => !prev); } }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                                    <svg
                                                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                                                        className={`scan-drawer-version-chevron ${versionExpanded ? 'scan-drawer-version-chevron-open' : ''}`}
                                                    >
                                                        <polyline points="9 18 15 12 9 6" />
                                                    </svg>
                                                    <span className="scan-drawer-version-label">Splunk Version</span>
                                                    {!versionExpanded && versionFilter.length > 0 && (
                                                        <span className="scan-drawer-version-badge">{versionFilter.length}</span>
                                                    )}
                                                    {versionExpanded && versionFilter.length > 0 && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onToggleVersionFilterMode(); }}
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
                                                {versionExpanded && versionFilter.length > 0 && (
                                                    <button
                                                        className="scan-drawer-version-clear"
                                                        onClick={(e) => { e.stopPropagation(); onSelectVersion(null); }}
                                                        title="Clear all version filters"
                                                    >Clear ({versionFilter.length})</button>
                                                )}
                                            </div>
                                            {versionExpanded && gKeys.map((major, gi) => (
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
                    {addonGroups.length > 0 && (
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
                                        title={g.folder ? `${g.folder}${g.uid ? `  •  UID ${g.uid}` : ''}` : g.label}
                                    >
                                        <span className="scan-drawer-addon-name">{g.label}</span>
                                        <span className="scan-drawer-addon-count">{g.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
                <div className="scan-drawer-footer">
                    <button
                        className="scan-drawer-reset-btn"
                        onClick={onResetAll}
                        title="Reset all filters back to factory defaults"
                    >
                        Reset Filters
                    </button>
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
    platformFilter, onSelectPlatform,
    versionFilter, onSelectVersion,
    selectedAddon, onSelectAddon,
    addonLabel,
    showVault, onToggleShowVault,
}) {
    const chips = [];

    // Cross-cutting category filters
    const crossCutLabels = { soar: 'SOAR', alert_actions: 'Alert Actions', secure_networking: 'Secure Networking GTM', secops: 'SecOps', itops: 'ITOps', sc4s: 'SC4S', netflow: 'NetFlow' };
    if (selectedCategory && crossCutLabels[selectedCategory]) {
        chips.push({ label: crossCutLabels[selectedCategory], onRemove: () => onSelectCategory(null) });
    }
    if (supportLevelFilter.length > 0) {
        const labels = { cisco_supported: 'Cisco', splunk_supported: 'Splunk', developer_supported: 'Developer', not_supported: 'No Integration' };
        supportLevelFilter.forEach(level => {
            chips.push({ label: labels[level] || level, onRemove: () => onSelectSupportLevel(level) });
        });
    }
    if (showRetired) chips.push({ label: 'Show Retired', onRemove: () => onToggleShowRetired(false) });
    if (showDeprecated) chips.push({ label: 'Show Deprecated', onRemove: () => onToggleShowDeprecated(false) });
    if (showComingSoon) chips.push({ label: 'Show Coming Soon', onRemove: () => onToggleShowComingSoon(false) });
    if (showGtmRoadmap) chips.push({ label: 'Show GTM Roadmap', onRemove: () => onToggleShowGtmRoadmap(false) });
    if (showVault) chips.push({ label: 'Catalog Vault', onRemove: () => onToggleShowVault(false) });
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
        onToggleShowRetired(false);
        onToggleShowDeprecated(false);
        onToggleShowComingSoon(false);
        onToggleShowGtmRoadmap(false);
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
        const map = {};          // addon → { label, folder, uid, count }
        let standalone = 0;
        let sc4sOnly = 0;
        (products || []).forEach((p) => {
            if (!p.addon) {
                if (p.sc4s_supported) { sc4sOnly++; }
                else { standalone++; }
                return;
            }
            if (!map[p.addon]) map[p.addon] = { label: p.addon_label || p.addon, folder: p.addon, uid: p.addon_splunkbase_uid || '', count: 0 };
            map[p.addon].count++;
        });
        // Sort by count desc, then alphabetical
        const entries = Object.entries(map)
            .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label));
        if (sc4sOnly > 0) entries.push(['__sc4s__', { label: 'Splunk Connect for Syslog (SC4S)', count: sc4sOnly }]);
        if (standalone > 0) entries.push(['__standalone__', { label: 'Standalone', count: standalone }]);
        return entries;          // [[ addonId, { label, folder, uid, count }], …]
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
                            title={id === '__standalone__' ? 'Products with their own dedicated add-on' : id === '__sc4s__' ? 'Products powered exclusively by Splunk Connect for Syslog' : g.folder ? `${g.folder}${g.uid ? `  •  UID ${g.uid}` : ''}` : g.label}
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
            <Modal.Header title="Quick Start — Choose Your Role" />
            <Modal.Body>
                <div className="csc-persona-intro">
                    Select your primary role to personalize your view. We'll filter to the most relevant products
                    and pre-add top recommendations to <strong>My Products</strong>.
                    <span className="csc-persona-intro-hint">You can change this anytime via the role button in the header.</span>
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
                                <span className="csc-persona-icon">
                                    {preset.icon
                                        ? React.createElement('img', { src: createURL(`/static/app/${APP_ID}/icons/${preset.icon}.svg`), alt: '', style: { width: '36px', height: '36px' } })
                                        : '🔍'}
                                </span>
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
                    if (sc4sCoversFilter(p, platformFilter)) return true;
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true;
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            } else {
                result = result.filter((p) => {
                    if (sc4sCoversFilter(p, platformFilter)) return false;
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
                result = result.filter((p) => productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
            } else {
                result = result.filter((p) => !productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
            }
        }
        return result;
    };

    // Cisco official category SVG icons
    const catIconMap = { security: 'cat-security', observability: 'cat-observability', networking: 'cat-networking', collaboration: 'cat-collaboration' };
    const isDark = document.documentElement.classList.contains('dce-dark');
    const renderCatIcon = (catId, active) => {
        const svgName = catIconMap[catId];
        if (!svgName) return null;
        return React.createElement('img', {
            src: createURL(`/static/app/${APP_ID}/icons/${svgName}.svg`),
            alt: '',
            className: 'csc-filter-pill-icon',
            style: { width: '18px', height: '18px', filter: active ? (isDark ? 'brightness(0.15)' : 'brightness(0) invert(1)') : 'none', transition: 'filter 0.2s' },
        });
    };
    const btnStyle = (active) => {
        if (isDark) {
            return {
                display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                padding: '7px 14px', borderRadius: '9999px', border: '1px solid',
                borderColor: active ? '#0A60FF' : 'rgba(10, 96, 255, 0.3)',
                background: active ? '#0A60FF' : '#1e262c',
                color: active ? '#ffffff' : '#d4d4d4',
                boxShadow: 'none',
                cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                transition: 'all 0.2s', flexShrink: 0,
            };
        }
        return {
            display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            padding: '7px 14px', borderRadius: '9999px', border: '1px solid',
            borderColor: active ? '#342f2c' : '#e3ddd8',
            background: active ? '#342f2c' : '#FFFFFF',
            color: active ? '#fff' : 'var(--page-color, #333)',
            boxShadow: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: '13px',
            transition: 'all 0.2s', flexShrink: 0,
        };
    };

    const isCrossCutting = ['soar', 'alert_actions', 'secure_networking', 'secops', 'itops', 'sc4s', 'netflow'].includes(selectedCategory);
    const CROSS_CUT_IDS = ['soar', 'alert_actions', 'secure_networking', 'secops', 'itops', 'sc4s', 'netflow'];
    const totalCount = categoryCounts ? Object.keys(categoryCounts).reduce((sum, k) => (CROSS_CUT_IDS.includes(k)) ? sum : sum + categoryCounts[k], 0) : null;

    return (<>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollBehavior: 'smooth', alignItems: 'center' }}>
            <button onClick={() => onSelectCategory(null)} style={btnStyle(!selectedCategory)}>
                All
                {totalCount != null && (
                    <span style={isDark
                        ? { fontSize: '10px', background: !selectedCategory ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.15)', color: !selectedCategory ? '#ffffff' : '#d4d4d4', padding: '1px 6px', borderRadius: '10px' }
                        : { fontSize: '10px', background: !selectedCategory ? '#5a5450' : 'var(--version-bg, #e8e8e8)', color: !selectedCategory ? '#fff' : undefined, padding: '1px 6px', borderRadius: '10px' }
                    }>
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
                            <span style={isDark
                                ? { fontSize: '10px', background: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.15)', color: active ? '#ffffff' : '#d4d4d4', padding: '1px 6px', borderRadius: '10px' }
                                : { fontSize: '10px', background: active ? '#5a5450' : 'var(--version-bg, #e8e8e8)', color: active ? '#fff' : undefined, padding: '1px 6px', borderRadius: '10px' }
                            }>
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
            const countBase = catProducts;
            const subCounts = {};
            subs.forEach(s => { subCounts[s.id] = countBase.filter(p => p.subcategory === s.id).length; });
            const unassigned = countBase.filter(p => !p.subcategory || !subs.some(s => s.id === p.subcategory)).length;
            const hasAnySubs = subs.some(s => subCounts[s.id] > 0);
            if (!hasAnySubs) return null;
            return (
                <div className="csc-subcategory-bar" style={{ display: 'flex', gap: '6px', marginTop: '8px', paddingLeft: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--faint-color, #888)', fontWeight: 500, marginRight: '4px' }}>Sub:</span>
                    <button onClick={() => onSelectSubCategory(null)} className={`csc-subcategory-pill ${!selectedSubCategory ? 'csc-subcategory-pill-active' : ''}`}>
                        All <span className="csc-subcategory-count">{countBase.length}</span>
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
                </div>
            );
        })()}
    </>);
}

// ─────────────────────────  MAIN PAGE  ───────────────────────
// Products page: category/capability filters, product cards, install status from REST.
// Data: loadProductsFromConf() prefers products.conf REST; falls back to static PRODUCT_CATALOG.
// Each card shows support (Cisco/Splunk), links, and actions (configure, best practices, etc.).

function SCANProductsPage() {
    const [products, setProducts] = useState(PRODUCT_CATALOG.filter(p => CATEGORY_IDS.has(p.category) && !p.catalog_disabled));
    const [vaultProducts, setVaultProducts] = useState(PRODUCT_CATALOG.filter(p => CATEGORY_IDS.has(p.category) && p.catalog_disabled));
    const [customProducts, setCustomProducts] = useState([]);
    const [showVault, setShowVault] = useState(false);
    const [customFormOpen, setCustomFormOpen] = useState(false);
    const [customEditProduct, setCustomEditProduct] = useState(null);
    const [customCloneProduct, setCustomCloneProduct] = useState(null);
    const [customDeleteTarget, setCustomDeleteTarget] = useState(null);
    const [configuredIds, setConfiguredIdsState] = useState(getConfiguredIds);
    const [installedApps, setInstalledApps] = useState({});
    const [appStatuses, setAppStatuses] = useState({});
    const [sourcetypeData, setSourcetypeData] = useState({});
    const [indexerApps, setIndexerApps] = useState(null);        // null (not loaded) | {} (no peers) | { appid: { version, disabled, indexerCount } }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(_savedFilters.selectedCategory ?? null);
    const [selectedSubCategory, setSelectedSubCategory] = useState(_savedFilters.selectedSubCategory ?? null);
    const [selectedAddon, setSelectedAddon] = useState(_savedFilters.selectedAddon ?? null);
    const [legacyModalOpen, setLegacyModalOpen] = useState(false);
    const [legacyModalApps, setLegacyModalApps] = useState([]);
    const [bpModalOpen, setBpModalOpen] = useState(false);
    const [bpProduct, setBpProduct] = useState(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [removeAllModalOpen, setRemoveAllModalOpen] = useState(false);
    const removeAllReturnRef = useRef(null);
    const [cardLegendOpen, setCardLegendOpen] = useState(false);
    const [issuesPanelOpen, setIssuesPanelOpen] = useState(false);
    const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
        try { return localStorage.getItem('scan_welcome_dismissed') === '1'; } catch (_e) { return false; }
    });
    const guideReturnRef = useRef(null);
    const [appVersion, setAppVersion] = useState('');
    const [appBuild, setAppBuild] = useState(() =>
        typeof SCAN_BUILD_HASH !== 'undefined' ? SCAN_BUILD_HASH : ''
    );
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
    const [gtmMode, setGtmMode] = useState(false);
    // Internal-only sections (Integration Needed, Coming Soon, GTM Roadmap) are
    // gated behind devMode or gtmMode.  When false, portfolioProducts also
    // excludes not_supported products so header/pill counts stay consistent.
    const showInternalContent = devMode || gtmMode;
    const [devToast, setDevToast] = useState(null);
    const [configViewerOpen, setConfigViewerOpen] = useState(false);
    const [configViewerProductId, setConfigViewerProductId] = useState(null);
    const [techStackOpen, setTechStackOpen] = useState(false);
    const [searchBarQuery, setSearchBarQuery] = useState('');
    const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [supportLevelFilter, setSupportLevelFilter] = useState(_savedFilters.supportLevelFilter || []);
    const [showRetired, setShowRetired] = useState(_savedFilters.showRetired || false);
    const [showDeprecated, setShowDeprecated] = useState(_savedFilters.showDeprecated || false);
    const [showComingSoon, setShowComingSoon] = useState(_savedFilters.showComingSoon || false);
    const [showGtmRoadmap, setShowGtmRoadmap] = useState(_savedFilters.showGtmRoadmap || false);
    const [personaModalOpen, setPersonaModalOpen] = useState(() => {
        try { return localStorage.getItem(PERSONA_STORAGE_KEY) !== 'true'; } catch (_e) { return false; }
    });
    const [splunkbaseData, setSplunkbaseData] = useState({});    // uid → { version_compatibility, product_compatibility, app_version, title, appid }
    const [appidToUidMap, setAppidToUidMap] = useState({});      // appid (folder name) → uid (for legacy/prereq/community app lookups)
    const [splunkbaseLoaded, setSplunkbaseLoaded] = useState(false);
    const [csvSyncStatus, setCsvSyncStatus] = useState(null);    // null | 'syncing' | 'success' | 'error'
    const [csvSyncMessage, setCsvSyncMessage] = useState('');
    const [platformFilter, setPlatformFilter] = useState(_savedFilters.platformFilter || []);    // [] | ['Splunk Cloud'] | ...

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
    const [versionFilter, setVersionFilter] = useState(_savedFilters.versionFilter || []);        // [] | ['10.2', '10.1', ...]
    const [versionFilterMode, setVersionFilterMode] = useState(_savedFilters.versionFilterMode || 'include'); // 'include' | 'exclude'
    const [platformFilterMode, setPlatformFilterMode] = useState(_savedFilters.platformFilterMode || 'include'); // 'include' | 'exclude'

    useEffect(() => {
        saveFilters({
            selectedCategory, selectedSubCategory,
            selectedAddon, supportLevelFilter, showRetired, showDeprecated,
            showComingSoon, showGtmRoadmap, platformFilter, platformFilterMode,
            versionFilter, versionFilterMode,
        });
    }, [selectedCategory, selectedSubCategory,
        selectedAddon, supportLevelFilter, showRetired, showDeprecated,
        showComingSoon, showGtmRoadmap, platformFilter, platformFilterMode,
        versionFilter, versionFilterMode]);

    // ── Collapsible panel state (persisted) ──
    const [panelState, setPanelState] = useState(() => ({ ...DEFAULT_PANEL_STATE, ...getSavedPanelState() }));

    const handlePanelToggle = useCallback((_e, { panelId, action }) => {
        setPanelState(prev => {
            const next = { ...prev, [panelId]: action === 'open' };
            savePanelState(next);
            return next;
        });
    }, []);

    const allPanelsCollapsed = useMemo(() =>
        Object.values(panelState).every(v => !v),
    [panelState]);

    const handleExpandCollapseAll = useCallback(() => {
        const expand = allPanelsCollapsed;
        setPanelState(prev => {
            const next = {};
            for (const key of Object.keys(prev)) next[key] = expand;
            savePanelState(next);
            return next;
        });
    }, [allPanelsCollapsed]);

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
            } catch (_e) {
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

    const allProductIds = useMemo(() => {
        return [...products, ...vaultProducts, ...customProducts].map(p => p.product_id);
    }, [products, vaultProducts, customProducts]);

    const handleCustomProductSaved = useCallback(() => {
        loadData();
    }, [loadData]);

    const handleEditCustomProduct = useCallback((product) => {
        setCustomEditProduct(product);
        setCustomFormOpen(true);
    }, []);

    const handleCloneCustomProduct = useCallback((product) => {
        setCustomEditProduct(null);
        setCustomCloneProduct(product);
        setCustomFormOpen(true);
    }, []);

    const handleDeleteCustomProduct = useCallback((product) => {
        setCustomDeleteTarget(product);
    }, []);

    const handleCustomDeleted = useCallback(() => {
        setCustomDeleteTarget(null);
        loadData();
    }, [loadData]);

    // ── Secret mode search intercepts ──
    const handleSearchInput = useCallback((value) => {
        const cmd = value.toLowerCase().trim();
        if (cmd === 'devmode') {
            setDevMode(prev => {
                const next = !prev;
                try { if (next) localStorage.setItem(DEVMODE_STORAGE_KEY, 'true'); else localStorage.removeItem(DEVMODE_STORAGE_KEY); } catch {}
                setDevToast(next ? 'Developer Mode ON' : 'Developer Mode OFF');
                setTimeout(() => setDevToast(null), 2500);
                if (next) {
                    setShowRetired(true);
                    setShowDeprecated(true);
                    setShowComingSoon(true);
                    setShowGtmRoadmap(true);
                    setShowFullPortfolio(true);
                    setShowVault(true);
                    setPanelState(prev => {
                        const collapsed = {};
                        for (const key of Object.keys(prev)) collapsed[key] = false;
                        savePanelState(collapsed);
                        return collapsed;
                    });
                } else {
                    setSelectedCategory(null);
                    setSelectedSubCategory(null);
                    setSelectedAddon(null);
                    setSupportLevelFilter([]);
                    setShowRetired(false);
                    setShowDeprecated(false);
                    setShowComingSoon(false);
                    setShowGtmRoadmap(false);
                    setShowVault(false);
                    setPlatformFilter([]);
                    setVersionFilter([]);
                    setVersionFilterMode('include');
                    setPlatformFilterMode('include');
                    setShowFullPortfolio(false);
                    savePortfolioPreference(false);
                    setPanelState({ ...DEFAULT_PANEL_STATE });
                    savePanelState({ ...DEFAULT_PANEL_STATE });
                    setCloudSimulation(false);
                    setAppUpdateVersion('');
                }
                return next;
            });
            setSearchQuery('');
            setSearchBarQuery('');
            return;
        }
        if (cmd === 'gtmmode') {
            setGtmMode(prev => {
                const next = !prev;
                setDevToast(next ? 'GTM Mode ON' : 'GTM Mode OFF');
                setTimeout(() => setDevToast(null), 2500);
                if (next) {
                    setShowComingSoon(true);
                    setShowGtmRoadmap(true);
                    setShowFullPortfolio(true);
                    setPanelState(prev => {
                        const collapsed = {};
                        for (const key of Object.keys(prev)) collapsed[key] = false;
                        savePanelState(collapsed);
                        return collapsed;
                    });
                } else {
                    setSelectedCategory(null);
                    setSelectedSubCategory(null);
                    setSelectedAddon(null);
                    setSupportLevelFilter([]);
                    setShowRetired(false);
                    setShowDeprecated(false);
                    setShowComingSoon(false);
                    setShowGtmRoadmap(false);
                    setPlatformFilter([]);
                    setVersionFilter([]);
                    setVersionFilterMode('include');
                    setPlatformFilterMode('include');
                    setShowFullPortfolio(false);
                    savePortfolioPreference(false);
                    setPanelState({ ...DEFAULT_PANEL_STATE });
                    savePanelState({ ...DEFAULT_PANEL_STATE });
                }
                return next;
            });
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
        try { localStorage.setItem(PERSONA_STORAGE_KEY, 'true'); } catch (_e) { /* */ }
    }, [products]);

    const handleDismissPersona = useCallback(() => {
        setPersonaModalOpen(false);
        try { localStorage.setItem(PERSONA_STORAGE_KEY, 'true'); } catch (_e) { /* */ }
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
            // 1. Try live conf-products (single source of truth when app is installed)
            //    POST _reload first so splunkd re-reads products.conf from disk.
            //    This guarantees freshness after app upgrades without requiring a restart.
            try {
                await splunkFetch(CONF_RELOAD_ENDPOINT, { method: 'POST' }).catch(() => {});
                const confProducts = await loadProductsFromConf();
                if (confProducts.length > 0) {
                    setCustomProducts(confProducts.filter(p => p.custom));
                    setProducts(confProducts.filter(p => !p.custom && !p.catalog_disabled));
                    setVaultProducts(confProducts.filter(p => !p.custom && p.catalog_disabled));
                }
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
                const vEntry = vData.entry?.[0] || {};
                const vContent = vEntry.content || {};
                setAppVersion(vContent.version || '');
                const restBuild = String(vContent.build || vEntry.build || '').replace(/^0$/, '');
                if (restBuild) setAppBuild(restBuild);
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
                        statuses[aid] = { installed: false, version: null, updateVersion: null, disabled: false, visible: false };
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

    // ── Indexer tier detection — unified across all platforms ──
    // Runs on Enterprise standalone, distributed, AND Splunk Cloud.
    // The subsearch requires both "indexer" AND "search_peer" server roles:
    //   Standalone → local server lacks search_peer → {} → SH-only chip
    //   Distributed → indexers have search_peer → full detection → SH + IDX chips
    //   Cloud → if peers visible, shows indexer status; if REST blocked, null → {} fallback
    useEffect(() => {
        if (loading) return;
        const detect = async () => {
            const result = await detectIndexerTierApps();
            setIndexerApps(result !== null ? result : {});
        };
        detect();
    }, [loading, platformType]);

    // Stable key of all referenced UIDs — only changes when a product's UID fields change
    // (e.g. new custom card with a Splunkbase UID), not on unrelated product state updates.
    const referencedUidKey = useMemo(() => collectReferencedUids(products).join(','), [products]);

    // ── Load Splunkbase CSV data via inputlookup (scoped to referenced UIDs) ──
    useEffect(() => {
        if (loading || !referencedUidKey) return;
        const loadSplunkbaseData = async () => {
            try {
                const searchStr = buildSplunkbaseLookupSPL(products);
                if (!searchStr) { console.warn('[SCAN] Splunkbase lookup skipped — no UIDs referenced by catalog'); return; }
                const sbEndpoint = `/splunkd/__raw/servicesNS/-/${APP_ID}/search/jobs`;
                const res = await splunkFetch(sbEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `search=${encodeURIComponent(searchStr)}&output_mode=json&exec_mode=oneshot&count=0&timeout=60`,
                });
                if (!res.ok) { console.warn('[SCAN] Splunkbase lookup not available (not yet synced?)', res.status, res.statusText); return; }
                const data = await res.json();
                const rows = data.results || [];
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
            } catch (e) {
                console.error('[SCAN] Could not load Splunkbase data:', e);
            }
        };
        loadSplunkbaseData();
    }, [loading, referencedUidKey]);

    // ── Conf reload handler (devMode) ──
    // POSTs _reload to force splunkd to re-read products.conf from disk,
    // then re-runs the full data load so the UI picks up changes immediately.
    const [confReloadStatus, setConfReloadStatus] = useState('');
    const handleConfReload = useCallback(async () => {
        setConfReloadStatus('reloading');
        try {
            const res = await splunkFetch(CONF_RELOAD_ENDPOINT, { method: 'POST' });
            if (!res.ok) {
                setConfReloadStatus('error');
                setTimeout(() => setConfReloadStatus(''), 3000);
                return;
            }
            await loadData();
            setConfReloadStatus('success');
            setTimeout(() => setConfReloadStatus(''), 3000);
        } catch (e) {
            console.error('[SCAN] conf-products reload failed:', e);
            setConfReloadStatus('error');
            setTimeout(() => setConfReloadStatus(''), 3000);
        }
    }, [loadData]);

    // ── Splunkbase CSV sync handler ──
    // Runs the "SCAN - Splunkbase Catalog Sync" saved search which:
    //   1. Downloads the latest CSV from S3 via | synclookup
    //   2. Normalizes and deduplicates the data
    //   3. Writes the cleaned lookup to scan_splunkbase_apps.csv.gz
    //   4. Returns a count of entries written
    const handleSyncSplunkbase = useCallback(async () => {
        setCsvSyncStatus('syncing');
        setCsvSyncMessage('Syncing Splunkbase catalog…');
        try {
            const searchStr = '| savedsearch "SCAN - Splunkbase Catalog Sync"';
            const syncEndpoint = `/splunkd/__raw/servicesNS/-/${APP_ID}/search/jobs`;
            const res = await splunkFetch(syncEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `search=${encodeURIComponent(searchStr)}&output_mode=json&exec_mode=oneshot&count=0&timeout=300`,
            });
            if (!res.ok) {
                setCsvSyncStatus('error');
                setCsvSyncMessage(`HTTP ${res.status}`);
                return;
            }
            const data = await res.json();
            const results = data.results || [];
            const catalogRow = results.find(r => r.status != null);
            const countRow = results.find(r => r.count != null);
            const entryCount = countRow ? parseInt(countRow.count, 10) : 0;
            const catStatus = catalogRow ? catalogRow.status : '';
            const catNote = catStatus === 'Success' ? 'Product catalog updated'
                : catStatus === 'Skipped' ? 'Product catalog current'
                : catStatus === 'Failed' ? 'Product catalog sync failed'
                : '';
            if (entryCount > 0) {
                setCsvSyncStatus(catStatus === 'Failed' ? 'error' : 'success');
                const parts = [`${entryCount.toLocaleString()} apps`];
                if (catNote) parts.push(catNote);
                setCsvSyncMessage(`Synced — ${parts.join(' · ')}`);
                // Reload only the UIDs our catalog references
                const reloadSearch = buildSplunkbaseLookupSPL(products);
                if (!reloadSearch) return;
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
                }
            } else {
                setCsvSyncStatus('error');
                setCsvSyncMessage('Sync returned 0 entries');
            }
        } catch (e) {
            console.error('[SCAN] Splunkbase catalog sync failed:', e);
            setCsvSyncStatus('error');
            setCsvSyncMessage(e.message || 'Unknown error');
        }
    }, [products]);

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
    // This is the single source of truth for counts: the header counter,
    // category pill badges, and search bar all derive from portfolioProducts.
    // Every visibility toggle must be mirrored here so counts never include
    // products the user cannot see in any section on the page.
    const portfolioProducts = useMemo(() => {
        let base = products;
        if (supportLevelFilter.length > 0) {
            base = base.filter((p) => supportLevelFilter.includes(p.support_level));
        } else if (!showFullPortfolio) {
            // "Supported Only" mode: show only cisco/splunk-supported, hide under_development
            base = base.filter((p) => SUPPORTED_LEVELS.has(p.support_level) && p.status !== 'under_development');
        }
        if (!showRetired) {
            base = base.filter((p) => p.status !== 'retired');
        }
        if (!showDeprecated) {
            base = base.filter((p) => p.status !== 'deprecated');
        }
        if (!showComingSoon || !showInternalContent) {
            base = base.filter((p) => p.status !== 'under_development');
        }
        // Coverage-gap products without any integration go to GTM Roadmap section
        if (!showGtmRoadmap || !showInternalContent) {
            base = base.filter((p) => !p.coverage_gap || (p.addon || p.app_viz || p.app_viz_2 || p.sc4s_supported));
        }
        // not_supported products go to "Integration Needed" which is only visible in dev/GTM mode;
        // exclude them from counts when that section is hidden to prevent phantom counts
        if (!showInternalContent) {
            base = base.filter((p) => p.support_level !== 'not_supported');
        }
        return base;
    }, [products, supportLevelFilter, showFullPortfolio, showRetired, showDeprecated, showComingSoon, showGtmRoadmap, showInternalContent]);

    // ── Filtering (two-stage: preAddon for faceted dropdown, then full) ──
    const preAddonProducts = useMemo(() => {
        let filtered = portfolioProducts;
        if (selectedCategory === 'soar') {
            filtered = filtered.filter((p) => p.soar_connector_uids && p.soar_connector_uids.length > 0);
        } else if (selectedCategory === 'alert_actions') {
            filtered = filtered.filter((p) => p.alert_action_uids && p.alert_action_uids.length > 0);
        } else if (selectedCategory === 'secure_networking') {
            filtered = filtered.filter((p) => p.secure_networking_gtm);
        } else if (selectedCategory === 'secops') {
            filtered = filtered.filter((p) => p.es_compatible || p.sse_content);
        } else if (selectedCategory === 'itops') {
            filtered = filtered.filter((p) => p.itsi_content_pack || p.ite_learn_content);
        } else if (selectedCategory === 'sc4s') {
            filtered = filtered.filter((p) => p.sc4s_supported);
        } else if (selectedCategory === 'netflow') {
            filtered = filtered.filter((p) => p.netflow_supported);
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
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            filtered = filtered.filter((p) => productMatchesSearch(p, q));
            filtered.sort((a, b) => {
                const aExact = a.display_name.toLowerCase().includes(q) ? 0 : 1;
                const bExact = b.display_name.toLowerCase().includes(q) ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                const aAlias = (a.aliases || []).some(al => al.toLowerCase().includes(q)) ? 0 : 1;
                const bAlias = (b.aliases || []).some(al => al.toLowerCase().includes(q)) ? 0 : 1;
                if (aAlias !== bAlias) return aAlias - bAlias;
                const aSt = (a.sourcetypes || []).some(s => s.toLowerCase().includes(q)) ? 0 : 1;
                const bSt = (b.sourcetypes || []).some(s => s.toLowerCase().includes(q)) ? 0 : 1;
                if (aSt !== bSt) return aSt - bSt;
                return (a.sort_order || 100) - (b.sort_order || 100);
            });
        }
        // ── Splunkbase platform filter ──
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (platformFilterMode === 'include') {
                filtered = filtered.filter((p) => {
                    if (sc4sCoversFilter(p, platformFilter)) return true;
                    const uids = getAllProductUids(p, appidToUidMap);
                    if (uids.length === 0) return true;
                    return uids.some(uid => {
                        const entry = splunkbaseData[uid];
                        if (!entry || !entry.product_compatibility) return false;
                        const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                        return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                    });
                });
            } else {
                filtered = filtered.filter((p) => {
                    if (sc4sCoversFilter(p, platformFilter)) return false;
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
        // ── Splunkbase version compatibility filter (addon-first: addon MUST support the version) ──
        if (versionFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            if (versionFilterMode === 'include') {
                filtered = filtered.filter((p) => productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
            } else {
                filtered = filtered.filter((p) => !productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
            }
        }
        return filtered;
    }, [portfolioProducts, selectedCategory, selectedSubCategory, searchQuery, platformFilter, versionFilter, splunkbaseData, appidToUidMap, versionFilterMode, platformFilterMode]);

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
    const crossCutLabels = { soar: 1, alert_actions: 1, secure_networking: 1, secops: 1, itops: 1, sc4s: 1, netflow: 1 };
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategory && crossCutLabels[selectedCategory]) count++;
        if (supportLevelFilter.length > 0) count++;
        if (showRetired) count++;
        if (showDeprecated) count++;
        if (showComingSoon) count++;
        if (showGtmRoadmap) count++;
        if (platformFilter.length > 0) count++;
        if (versionFilter.length > 0) count++;
        if (selectedAddon) count++;
        return count;
    }, [selectedCategory, supportLevelFilter, showRetired, showDeprecated, showComingSoon, showGtmRoadmap, platformFilter, versionFilter, selectedAddon]);

    /* Addon label for active chip display */
    const activeAddonLabel = useMemo(() => {
        if (!selectedAddon || !preAddonProducts) return '';
        // Derive label from a product that has this addon
        if (selectedAddon === '__standalone__') return 'Standalone';
        if (selectedAddon === '__sc4s__') return 'SC4S Only';
        const match = preAddonProducts.find(p => p.addon === selectedAddon);
        return match ? (match.addon_label || match.addon) : selectedAddon;
    }, [selectedAddon, preAddonProducts]);

    // ── Section assignment ──
    // Products are split into mutually exclusive sections in priority order.
    // coverage_gap products without any integration bypass main sections → gtmGapProducts.
    // not_supported products bypass Available → unsupportedProducts ("Integration Needed").
    // Configured/Detected/Available cascade: configured first, then auto-detected, then the rest.
    // Custom products (from local/products.conf) are merged into the routable pool so
    // clicking "+ Add" moves them into "Configured Products" alongside catalog cards.
    const includeInMainSections = (p) => !p.coverage_gap || !!(p.addon || p.app_viz || p.app_viz_2 || p.sc4s_supported);

    const filteredCustomProducts = useMemo(() => {
        if (!searchQuery) return customProducts;
        const q = searchQuery.toLowerCase().trim();
        return customProducts.filter((p) => productMatchesSearch(p, q));
    }, [customProducts, searchQuery]);

    const allRoutableProducts = useMemo(() => [...filteredProducts, ...filteredCustomProducts], [filteredProducts, filteredCustomProducts]);
    const configuredProducts = allRoutableProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && includeInMainSections(p) && configuredIds.includes(p.product_id));
    const configuredIdSet = new Set(configuredProducts.map((p) => p.product_id));
    const detectedProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && includeInMainSections(p) && p.support_level !== 'not_supported' && !configuredIdSet.has(p.product_id) && sourcetypeData[p.product_id] && sourcetypeData[p.product_id].hasData);
    const detectedIds = new Set(detectedProducts.map((p) => p.product_id));
    const availableProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && includeInMainSections(p) && p.support_level !== 'not_supported' && !configuredIdSet.has(p.product_id) && !detectedIds.has(p.product_id));
    const unsupportedProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'retired' && p.status !== 'deprecated' && includeInMainSections(p) && p.support_level === 'not_supported' && !configuredIdSet.has(p.product_id));
    const comingSoonProducts = filteredProducts.filter((p) => p.status === 'under_development');
    const deprecatedProducts = filteredProducts.filter((p) => p.status === 'deprecated');
    const retiredProducts = filteredProducts.filter((p) => p.status === 'retired');
    const gtmGapProducts = filteredProducts.filter((p) => p.coverage_gap && !(p.addon || p.app_viz || p.app_viz_2 || p.sc4s_supported));
    const unconfiguredCustomProducts = filteredCustomProducts.filter((p) => !configuredIdSet.has(p.product_id));

    const sharedSourcetypeMap = useMemo(() => {
        const stMap = {};
        for (const p of products) {
            if (!p.sourcetypes || p.catalog_disabled) continue;
            for (const st of p.sourcetypes) {
                if (!stMap[st]) stMap[st] = [];
                stMap[st].push({ product_id: p.product_id, display_name: p.display_name });
            }
        }
        const shared = {};
        for (const [st, prods] of Object.entries(stMap)) {
            if (prods.length > 1) shared[st] = prods;
        }
        return shared;
    }, [products]);

    // ── Section title with inline product icon peek ──
    const renderSectionTitle = useCallback((label, count, productList, opts = {}) => {
        const MAX_PEEK = 8;
        const icons = productList.slice(0, MAX_PEEK);
        return (
            <span className="csc-section-title-row">
                <span>{label} ({count})</span>
                {count > 0 && (
                    <span className="csc-section-peek">
                        {icons.map(p => (
                            <span key={p.product_id} className="csc-peek-icon">
                                {p.icon_svg
                                    ? React.createElement('img', {
                                        src: createURL(`/static/app/${APP_ID}/icons/${p.icon_svg}${document.documentElement.classList.contains('dce-dark') ? '_white' : ''}.svg`),
                                        alt: '', className: 'csc-peek-svg',
                                        onError: (e) => { e.target.replaceWith(document.createTextNode((p.display_name || '?')[0])); }
                                    })
                                    : (p.icon_emoji || (p.display_name || '?')[0])
                                }
                            </span>
                        ))}
                        {count > MAX_PEEK && (
                            <span
                                className="csc-peek-more"
                                title={productList.slice(MAX_PEEK).map(p => p.display_name).join('\n')}
                            >+{count - MAX_PEEK}</span>
                        )}
                    </span>
                )}
                {opts.pulse && <span className="csc-section-pulse" />}
            </span>
        );
    }, []);

    // ── Effective panel open state (search overrides collapsed panels) ──
    const effectivePanelOpen = useMemo(() => {
        if (!searchQuery) return panelState;
        const overrides = {};
        if (configuredProducts.length > 0)    overrides.configured_products = true;
        if (detectedProducts.length > 0)      overrides.detected_products = true;
        if (availableProducts.length > 0)     overrides.available_products = true;
        if (unsupportedProducts.length > 0)   overrides.unsupported_products = true;
        if (comingSoonProducts.length > 0)    overrides.coming_soon_products = true;
        if (deprecatedProducts.length > 0)    overrides.deprecated_products = true;
        if (retiredProducts.length > 0)       overrides.retired_products = true;
        if (gtmGapProducts.length > 0)        overrides.gtm_coverage_gaps = true;
        if (unconfiguredCustomProducts.length > 0) overrides.custom_products = true;
        return { ...panelState, ...overrides };
    }, [searchQuery, panelState, configuredProducts.length, detectedProducts.length,
        availableProducts.length, unsupportedProducts.length, comingSoonProducts.length,
        deprecatedProducts.length, retiredProducts.length, gtmGapProducts.length,
        unconfiguredCustomProducts.length]);

    // ── Scroll to first matching card when search changes ──
    const prevSearchRef = useRef('');
    useEffect(() => {
        if (!searchQuery || searchQuery === prevSearchRef.current) {
            prevSearchRef.current = searchQuery;
            return;
        }
        prevSearchRef.current = searchQuery;
        const timer = setTimeout(() => {
            const card = document.querySelector('.csc-card-grid .csc-product-card');
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('csc-card-search-pulse');
                setTimeout(() => card.classList.remove('csc-card-search-pulse'), 1200);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // GTM Roadmap: sort by pillar (Campus & Branch first, then WAN Edge, Data Center, Visibility, Industrial)
    // and group for section headings so the order matches "roadmap begins with Campus and Branch and will expand."
    const gtmGapProductsByPillar = useMemo(() => {
        const gapProducts = filteredProducts.filter((p) => p.coverage_gap && !(p.addon || p.app_viz || p.app_viz_2 || p.sc4s_supported));
        const sorted = [...gapProducts].sort((a, b) => {
            const pa = (a.gtm_pillar && String(a.gtm_pillar).trim()) ? parseInt(a.gtm_pillar, 10) : 99;
            const pb = (b.gtm_pillar && String(b.gtm_pillar).trim()) ? parseInt(b.gtm_pillar, 10) : 99;
            if (pa !== pb) return pa - pb;
            return (a.sort_order || 100) - (b.sort_order || 100) || (a.display_name || '').localeCompare(b.display_name || '');
        });
        const groups = [];
        let currentPillar = null;
        let currentProducts = [];
        for (const p of sorted) {
            const pillar = (p.gtm_pillar && String(p.gtm_pillar).trim()) || '';
            const pillarNum = pillar ? parseInt(pillar, 10) : 0;
            if (pillarNum !== currentPillar) {
                if (currentProducts.length > 0) groups.push({ pillarNum: currentPillar, pillarLabel: GTM_PILLAR_LABELS[currentPillar] || `Pillar ${currentPillar}`, products: currentProducts });
                currentPillar = pillarNum;
                currentProducts = [];
            }
            currentProducts.push(p);
        }
        if (currentProducts.length > 0) groups.push({ pillarNum: currentPillar, pillarLabel: GTM_PILLAR_LABELS[currentPillar] || (currentPillar ? `Pillar ${currentPillar}` : 'Other'), products: currentProducts });
        return groups;
    }, [filteredProducts]);

    const categoryCounts = useMemo(() => {
        let base = portfolioProducts;
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            base = base.filter((p) => productMatchesSearch(p, q));
        }
        if (platformFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            base = base.filter((p) => {
                if (sc4sCoversFilter(p, platformFilter)) return true;
                const uids = getAllProductUids(p, appidToUidMap);
                if (uids.length === 0) return true;
                return uids.some(uid => {
                    const entry = splunkbaseData[uid];
                    if (!entry || !entry.product_compatibility) return false;
                    const platforms = entry.product_compatibility.split(/[|,]/).map(v => v.trim());
                    return platformFilter.some(pf => platforms.some(pl => pl.toLowerCase().includes(pf.toLowerCase())));
                });
            });
        }
        if (versionFilter.length > 0 && splunkbaseData && Object.keys(splunkbaseData).length > 0) {
            base = base.filter((p) => productSupportsVersions(p, versionFilter, splunkbaseData, appidToUidMap));
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
        counts.secops = base.filter((p) => p.es_compatible || p.sse_content).length;
        counts.itops = base.filter((p) => p.itsi_content_pack || p.ite_learn_content).length;
        counts.sc4s = base.filter((p) => p.sc4s_supported).length;
        counts.netflow = base.filter((p) => p.netflow_supported).length;
        return counts;
    }, [portfolioProducts, searchQuery, platformFilter, versionFilter, splunkbaseData, selectedAddon, appidToUidMap]);

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
                    <a href={createURL('/_bump')} target="_blank" rel="noopener noreferrer" className="scan-devmode-bump" title="Bump Splunk static asset cache (CSS/JS)">Bump Cache</a>
                </div>
            )}
            {/* GTM Mode Banner (only when gtmMode is on and devMode is off) */}
            {gtmMode && !devMode && (
                <div className="scan-devmode-banner scan-gtmmode-banner">
                    <span className="scan-devmode-banner-pulse" />
                    <span className="scan-devmode-banner-text">GTM MODE</span>
                    <span className="scan-devmode-banner-pulse" />
                </div>
            )}
            {/* Header */}
            <div className="products-page-header">
                <div className="header-left">
                    <h1 className="page-title">
                        <span className="scan-logo-mark">SCAN</span>
                        <span className="scan-logo-full">Splunk Cisco App Navigator</span>
                    </h1>
                    <p className="products-page-subtitle">
                        The Front Door to the Cisco-Splunk Ecosystem
                    </p>
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
                                    <li>Hit <b>Launch</b> or <b>Explore</b> to jump straight into dashboards or search your data.</li>
                                    <li>Open <b>Filters</b> and toggle <b>Visibility</b> checkboxes to show Retired or Deprecated products.</li>
                                    <li>Use the <b>Expand / Collapse All</b> toggle to manage all sections at once.</li>
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
                    {/* ── Dev Mode: platform, Splunk version, SCAN version & build ── */}
                    {devMode && (
                        <span className={`scan-util-pill scan-util-devinfo ${cloudSimulation ? 'scan-util-cloud-sim' : ''}`} title={
                            [
                                cloudSimulation ? `Cloud Sim v${SIMULATED_CLOUD_VERSION}` : `${effectivePlatformType === 'cloud' ? 'Splunk Cloud' : 'Splunk Enterprise'}${effectiveSplunkVersion ? ' v' + effectiveSplunkVersion : ''}`,
                                appVersion ? `SCAN v${appVersion}` : null,
                                appBuild ? `build ${appBuild}` : null,
                            ].filter(Boolean).join(' · ')
                        }>
                            {effectivePlatformType === 'cloud' ? 'Cloud' : 'Enterprise'}
                            {effectiveSplunkVersion && <span className="scan-util-splunk-ver">{effectiveSplunkVersion}</span>}
                            {appVersion && <><span className="scan-util-devinfo-sep">|</span>SCAN {appVersion}</>}
                            {appBuild && <><span className="scan-util-devinfo-sep">|</span><span className="scan-util-devinfo-build">build {appBuild.substring(0, 8)}</span></>}
                        </span>
                    )}
                    {/* ── Update badge (always visible when update available) ── */}
                    {appUpdateVersion && (
                        <a
                            href={createURL(`/manager/appinstall/${APP_ID}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="scan-util-pill scan-util-update"
                            title={`Upgrade from v${appVersion} to v${appUpdateVersion} — click to update`}
                        >
                            ⬆ v{appUpdateVersion}
                        </a>
                    )}
                    {/* ── Actions ── */}
                    <button
                        className="scan-util-pill scan-util-theme"
                        onClick={handleThemeCycle}
                        title={`Theme: ${themeOverride === 'auto' ? 'Auto (Splunk)' : themeOverride === 'light' ? 'Light' : 'Dark'} — click to cycle`}
                    >
                        <span className="scan-util-theme-label">
                            {themeOverride === 'auto' ? '◐' : themeOverride === 'light' ? '☀' : '☾'}
                        </span>
                    </button>
                    <InfoTooltip
                        title="Catalog Sync"
                        placement="bottom"
                        width={380}
                        content={
                            <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                                <p style={{ margin: '0 0 6px', fontWeight: 600 }}>This job performs two syncs:</p>
                                <ol style={{ margin: '0 0 8px', paddingLeft: '18px' }}>
                                    <li style={{ marginBottom: '4px' }}><strong>Product catalog</strong> — Checks S3 for a newer <code style={{ fontSize: '11px' }}>products.conf</code> and updates it if a compatible version is available ({products.length} products).</li>
                                    <li><strong>Splunkbase apps</strong> — Downloads the latest app catalog from S3 and refreshes the local lookup used for version compatibility, platform filters, and ecosystem intelligence.</li>
                                </ol>
                                <p style={{ margin: '0 0 8px' }}>This runs <strong>automatically every night</strong> via a scheduled saved search. Use this button when you need fresh data immediately.</p>
                                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-tertiary, #736d68)' }}>Saved search: SCAN - Splunkbase Catalog Sync</p>
                            </div>
                        }
                    >
                        <button
                            className={`scan-util-pill scan-util-sync ${csvSyncStatus === 'success' ? 'scan-sync-ok' : csvSyncStatus === 'error' ? 'scan-sync-err' : csvSyncStatus === 'syncing' ? 'scan-sync-busy' : ''}`}
                            onClick={handleSyncSplunkbase}
                            disabled={csvSyncStatus === 'syncing'}
                            title={csvSyncStatus === 'success' ? `✓ ${csvSyncMessage}` : csvSyncStatus === 'error' ? `✗ ${csvSyncMessage}` : csvSyncStatus === 'syncing' ? 'Syncing…' : 'Sync product catalog and Splunkbase apps'}
                            style={{ cursor: csvSyncStatus === 'syncing' ? 'wait' : 'pointer' }}
                        >
                            Sync Catalog
                        </button>
                    </InfoTooltip>
                    {devMode && (
                        <button
                            className={`scan-util-pill scan-util-sync ${confReloadStatus === 'success' ? 'scan-sync-ok' : confReloadStatus === 'error' ? 'scan-sync-err' : confReloadStatus === 'reloading' ? 'scan-sync-busy' : ''}`}
                            onClick={handleConfReload}
                            disabled={confReloadStatus === 'reloading'}
                            title={confReloadStatus === 'success' ? '✓ products.conf reloaded' : confReloadStatus === 'error' ? '✗ Reload failed' : confReloadStatus === 'reloading' ? 'Reloading…' : 'Force splunkd to re-read products.conf from disk (no restart needed)'}
                            style={{ cursor: confReloadStatus === 'reloading' ? 'wait' : 'pointer' }}
                        >
                            {confReloadStatus === 'reloading' ? 'Reloading…' : 'Reload Conf'}
                        </button>
                    )}
                    <button
                        className="scan-util-pill"
                        onClick={handleExpandCollapseAll}
                        title={allPanelsCollapsed ? 'Expand all sections' : 'Collapse all sections'}
                    >
                        {allPanelsCollapsed ? 'Expand All' : 'Collapse All'}
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
                    {welcomeDismissed && (
                        <button
                            className="scan-util-pill"
                            onClick={() => { setWelcomeDismissed(false); try { localStorage.removeItem('scan_welcome_dismissed'); } catch (_e) { /* noop */ } window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            title="Show the getting started guide"
                        >
                            Welcome
                        </button>
                    )}
                    {/* ── Group 4: DevMode tools ── */}
                    {devMode && (
                        <>
                        <span className="scan-util-sep" />
                        <button
                            className={`scan-util-pill scan-util-devmode scan-util-cloud-toggle ${cloudSimulation ? 'scan-util-cloud-active' : ''}`}
                            onClick={() => {
                                setCloudSimulation(prev => {
                                    const next = !prev;
                                    setDevToast(next ? 'Cloud Simulation ON — v' + SIMULATED_CLOUD_VERSION : 'Cloud Simulation OFF — using real platform');
                                    setTimeout(() => setDevToast(null), 2500);
                                    return next;
                                });
                            }}
                            title={cloudSimulation ? `Cloud Simulation ON — Simulating Splunk Cloud v${SIMULATED_CLOUD_VERSION} — click to disable` : 'Simulate Splunk Cloud environment — click to enable'}
                        >
                            {cloudSimulation ? 'Cloud' : 'Cloud'}
                        </button>
                        <button
                            className={`scan-util-pill scan-util-devmode ${appUpdateVersion ? 'scan-util-cloud-active' : ''}`}
                            onClick={() => {
                                setAppUpdateVersion(prev => {
                                    if (prev) {
                                        setDevToast('Update Simulation OFF');
                                        setTimeout(() => setDevToast(null), 2500);
                                        return '';
                                    }
                                    const parts = (appVersion || '1.0.0').split('.');
                                    parts[parts.length - 1] = String(Number(parts[parts.length - 1] || 0) + 1);
                                    const fakeVersion = parts.join('.');
                                    setDevToast(`Update Simulation ON — faking v${fakeVersion}`);
                                    setTimeout(() => setDevToast(null), 2500);
                                    return fakeVersion;
                                });
                            }}
                            title={appUpdateVersion ? `Update Simulation ON — faking v${appUpdateVersion} — click to disable` : 'Simulate an available app update — click to enable'}
                        >
                            Update
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
                        if (!cat) {
                            setSelectedAddon(null);
                            setSearchQuery('');
                            setSearchBarQuery('');
                        }
                    }}
                    selectedSubCategory={selectedSubCategory}
                    onSelectSubCategory={setSelectedSubCategory}
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
                    platformFilter={platformFilter}
                    onSelectPlatform={handlePlatformToggle}
                    versionFilter={versionFilter}
                    onSelectVersion={handleVersionToggle}
                    selectedAddon={selectedAddon}
                    onSelectAddon={setSelectedAddon}
                    addonLabel={activeAddonLabel}
                    showVault={showVault}
                    onToggleShowVault={setShowVault}
                />
            </div>

            <FilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    setSelectedSubCategory(null);
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
                showVault={showVault}
                onToggleShowVault={setShowVault}
                vaultCount={vaultProducts.length}
                showInternalContent={showInternalContent}
                devMode={devMode}
                onResetAll={() => {
                    setSelectedCategory(null);
                    setSelectedSubCategory(null);
                    setSelectedAddon(null);
                    setSupportLevelFilter([]);
                    setShowRetired(false);
                    setShowDeprecated(false);
                    setShowComingSoon(false);
                    setShowGtmRoadmap(false);
                    setShowVault(false);
                    setPlatformFilter([]);
                    setVersionFilter([]);
                    setVersionFilterMode('include');
                    setPlatformFilterMode('include');
                    setSearchQuery('');
                    setSearchBarQuery('');
                    setShowFullPortfolio(false);
                    savePortfolioPreference(false);
                    setPanelState({ ...DEFAULT_PANEL_STATE });
                    savePanelState({ ...DEFAULT_PANEL_STATE });
                }}
            />

            {/* ── Ecosystem Health Stats Bar ── */}
            {(() => {
                const visibleProducts = portfolioProducts.filter(p => !p.catalog_disabled);
                const totalSourcetypes = new Set(visibleProducts.flatMap(p => p.sourcetypes || [])).size;
                const referencedAddons = new Set(visibleProducts.map(p => p.addon).filter(Boolean));
                const addonsInstalled = [...referencedAddons].filter(a => installedApps[a]).length;
                const sc4sReady = visibleProducts.filter(p => p.sc4s_supported).length;
                const netflowReady = visibleProducts.filter(p => p.netflow_supported).length;
                const secopsCount = visibleProducts.filter(p => p.es_compatible || p.sse_content).length;
                const itopsCount = visibleProducts.filter(p => p.itsi_content_pack || p.ite_learn_content).length;
                const dataFlowing = detectedProducts.length + configuredProducts.filter(p => sourcetypeData[p.product_id] && sourcetypeData[p.product_id].hasData).length;
                const activeSourcetypes = new Set(Object.values(sourcetypeData).flatMap(d => d.matchedSTs || [])).size;

                // ── Misconfiguration Detection ──
                // Only compute issues after sourcetype metadata has loaded;
                // until then sourcetypeData is {} and every configured product
                // would falsely appear as "no data flowing".
                const issues = [];
                const sourcetypeDataReady = Object.keys(sourcetypeData).length > 0;
                const appStatusesReady = Object.keys(appStatuses).length > 0;
                sourcetypeDataReady && visibleProducts.forEach(p => {
                    const stData = sourcetypeData[p.product_id];
                    const hasData = stData && stData.hasData;
                    const addonInstalled = p.addon && installedApps[p.addon];
                    const isConfigured = configuredIds.includes(p.product_id);

                    const pName = p.display_name || p.product_id;

                    if (hasData && p.addon && !addonInstalled) {
                        issues.push({
                            severity: 'critical',
                            type: 'data_no_addon',
                            product: p,
                            title: `${pName}: data flowing without add-on`,
                            detail: `${(stData.matchedSTs || []).length} sourcetype(s) active (~${formatCount(stData.eventCount)} events) but ${p.addon} is not installed. CIM normalization, field aliases, and dashboards are not available for this data.`,
                        });
                    }

                    if (isConfigured && p.addon && addonInstalled && !hasData) {
                        issues.push({
                            severity: 'warning',
                            type: 'configured_no_data',
                            product: p,
                            title: `${pName}: configured but no data flowing`,
                            detail: `Product is configured and add-on is installed, but no events detected in the last 7 days. Check data inputs, credentials, and network connectivity.`,
                        });
                    }

                    if (appStatusesReady && addonInstalled) {
                        const status = appStatuses[p.addon];
                        if (status && status.updateVersion) {
                            issues.push({
                                severity: 'warning',
                                type: 'addon_outdated',
                                product: p,
                                title: `${pName}: add-on update available`,
                                detail: `${p.addon_label || p.addon} v${status.version || '?'} is installed — v${status.updateVersion} is available. Updating ensures the latest CIM mappings, bug fixes, and security patches.`,
                            });
                        }
                    }

                    if (splunkbaseData) {
                        const legacyAddonFound = (p.legacy_uids || []).filter(uid => {
                            const sb = splunkbaseData[uid];
                            return sb && sb.appid && installedApps[sb.appid];
                        });
                        const legacyVizFound = (p.legacy_viz_uids || []).filter(uid => {
                            const sb = splunkbaseData[uid];
                            return sb && sb.appid && installedApps[sb.appid];
                        });
                        if (legacyAddonFound.length > 0) {
                            const names = legacyAddonFound.map(uid => { const sb = splunkbaseData[uid]; return sb ? (sb.appid || uid) : uid; });
                            const currentLabel = p.addon_label || p.addon;
                            issues.push({
                                severity: 'warning',
                                type: 'legacy_detected',
                                product: p,
                                title: `${pName}: legacy add-on(s) detected`,
                                detail: `${names.join(', ')} ${legacyAddonFound.length === 1 ? 'is' : 'are'} still installed. ${addonInstalled ? `${currentLabel} supersedes ${legacyAddonFound.length === 1 ? 'this' : 'these'} — the legacy version may cause conflicts or duplicate knowledge objects.` : `Consider migrating to ${currentLabel}.`}`,
                                legacyUids: legacyAddonFound,
                            });
                        }
                        if (legacyVizFound.length > 0) {
                            const names = legacyVizFound.map(uid => { const sb = splunkbaseData[uid]; return sb ? (sb.appid || uid) : uid; });
                            const vizInstalled = p.app_viz && installedApps[p.app_viz];
                            const currentLabel = p.app_viz_label || p.app_viz;
                            issues.push({
                                severity: 'warning',
                                type: 'legacy_detected',
                                product: p,
                                title: `${pName}: legacy app(s) detected`,
                                detail: `${names.join(', ')} ${legacyVizFound.length === 1 ? 'is' : 'are'} still installed. ${vizInstalled ? `${currentLabel} supersedes ${legacyVizFound.length === 1 ? 'this' : 'these'} — the legacy version may cause conflicts or duplicate dashboards.` : `Consider migrating to ${currentLabel}.`}`,
                                legacyUids: legacyVizFound,
                            });
                        }
                    }

                    if (hasData && addonInstalled && !isConfigured) {
                        issues.push({
                            severity: 'info',
                            type: 'data_not_configured',
                            product: p,
                            title: `${pName}: data flowing but not added to workspace`,
                            detail: `${(stData.matchedSTs || []).length} sourcetype(s) detected with the add-on installed. Add this product to your configured workspace for dashboards and monitoring.`,
                        });
                    }
                });
                issues.sort((a, b) => {
                    const sev = { critical: 0, warning: 1, info: 2 };
                    return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
                });
                const issueCount = issues.filter(i => i.severity !== 'info').length;

                const stats = [
                    { label: 'Products', value: visibleProducts.length, accent: '#5B6ABF', tip: 'Total Cisco products in your catalog' },
                    { label: 'Configured', value: configuredProducts.length, accent: '#0A60FF', tip: 'Products pinned to your workspace' },
                    { label: 'Data Flowing', value: dataFlowing, accent: '#22C55E', pulse: dataFlowing > 0, tip: 'Products with active data in the last 7 days' },
                    { label: 'Sourcetypes', value: totalSourcetypes, accent: '#546E7A', tip: 'Unique sourcetypes across all products' },
                    { label: 'Active STs', value: activeSourcetypes, accent: '#22C55E', pulse: activeSourcetypes > 0, tip: `${activeSourcetypes} of ${totalSourcetypes} sourcetypes have data flowing in the last 7 days` },
                    { label: 'Add-ons', value: `${addonsInstalled}/${referencedAddons.size}`, accent: '#7C3AED', tip: 'Installed / total referenced add-ons' },
                    { label: 'SC4S Ready', value: sc4sReady, accent: '#049FD9', tip: 'Ready-to-go SC4S configurations — deploy the container, point syslog' },
                    { label: 'NetFlow', value: netflowReady, accent: '#14B8A6', tip: 'Products with ready-to-go NetFlow/IPFIX collection support' },
                    { label: 'SecOps', value: secopsCount, accent: '#475569', tip: 'Products with SecOps content \u2014 ES (CIM-compliant) and/or Security Essentials use cases' },
                    { label: 'ITOps', value: itopsCount, accent: '#4F46E5', tip: 'Products with ITOps content \u2014 ITSI content packs and/or IT Essentials Learn procedures' },
                ];
                return (
                    <>
                    <div className="csc-stats-bar">
                        {stats.map(s => (
                            <div key={s.label} className="csc-stat-card" data-tooltip={s.tip} style={{ '--stat-accent': s.accent }}>
                                <span className="csc-stat-value">
                                    {s.value}
                                    {s.pulse && <span className="csc-pulse-dot" />}
                                </span>
                                <span className="csc-stat-label">{s.label}</span>
                            </div>
                        ))}
                        {issues.length > 0 && (
                            <div
                                className={`csc-stat-card csc-issues-badge ${issueCount > 0 ? 'csc-issues-badge--warn' : 'csc-issues-badge--info'}`}
                                data-tooltip={issueCount > 0 ? `${issueCount} issue${issueCount !== 1 ? 's' : ''} detected — click to review` : `${issues.length} suggestion${issues.length !== 1 ? 's' : ''} — click to review`}
                                style={{ '--stat-accent': issueCount > 0 ? '#F59E0B' : '#3B82F6', cursor: 'pointer' }}
                                onClick={() => setIssuesPanelOpen(!issuesPanelOpen)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIssuesPanelOpen(!issuesPanelOpen); }}}
                            >
                                <span className="csc-stat-value">
                                    {issueCount > 0 ? issueCount : issues.length}
                                    {issueCount > 0 && <span className="csc-issues-pulse" />}
                                </span>
                                <span className="csc-stat-label">{issueCount > 0 ? 'Issues' : 'Insights'}</span>
                            </div>
                        )}
                    </div>

                    {/* ── Issues Panel ── */}
                    {issuesPanelOpen && issues.length > 0 && (
                        <div className="csc-issues-panel">
                            <div className="csc-issues-panel-header">
                                <span className="csc-issues-panel-title">
                                    {issueCount > 0 ? '\u26A0' : '\u2139'}{' '}
                                    Ecosystem Health Check
                                    <span className="csc-issues-panel-count">{issues.length} item{issues.length !== 1 ? 's' : ''}</span>
                                </span>
                                <button className="csc-issues-panel-close" onClick={() => setIssuesPanelOpen(false)} title="Close">{'\u2715'}</button>
                            </div>
                            <div className="csc-issues-panel-body">
                                {issues.map((issue, idx) => (
                                    <div key={`${issue.product.product_id}-${issue.type}`} className={`csc-issue-row csc-issue-row--${issue.severity}`}>
                                        <span className="csc-issue-severity-icon">
                                            {issue.severity === 'critical' ? '\u26D4' : issue.severity === 'warning' ? '\u26A0' : '\u2139\uFE0F'}
                                        </span>
                                        <div className="csc-issue-content">
                                            <div className="csc-issue-title">{issue.title}</div>
                                            <div className="csc-issue-detail">{issue.detail}</div>
                                            <div className="csc-issue-action">
                                                {issue.type === 'data_no_addon' && issue.product.addon && (() => {
                                                    const p = issue.product;
                                                    const installUrl = p.addon_install_url;
                                                    const uid = p.addon_splunkbase_uid || (appidToUidMap && appidToUidMap[p.addon]) || '';
                                                    const href = installUrl ? createURL(installUrl) : uid ? generateSplunkbaseUrl(uid) : '';
                                                    return href ? (
                                                        <a
                                                            href={href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="csc-issue-action-link"
                                                        >
                                                            Install {p.addon_label || p.addon} {'\u2197'}
                                                        </a>
                                                    ) : (
                                                        <span className="csc-issue-action-text">Install {p.addon_label || p.addon} from Splunkbase</span>
                                                    );
                                                })()}
                                                {issue.type === 'configured_no_data' && (
                                                    <span className="csc-issue-action-text">Check data inputs, credentials, and network connectivity</span>
                                                )}
                                                {issue.type === 'addon_outdated' && issue.product.addon && (() => {
                                                    const p = issue.product;
                                                    const installUrl = p.addon_install_url;
                                                    const uid = p.addon_splunkbase_uid || (appidToUidMap && appidToUidMap[p.addon]) || '';
                                                    const href = installUrl ? createURL(installUrl) : uid ? generateSplunkbaseUrl(uid) : '';
                                                    return href ? (
                                                        <a
                                                            href={href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="csc-issue-action-link"
                                                        >
                                                            Update Add-on v{appStatuses[p.addon]?.updateVersion} {'\u2197'}
                                                        </a>
                                                    ) : (
                                                        <span className="csc-issue-action-text">Update {p.addon_label || p.addon} from Splunkbase</span>
                                                    );
                                                })()}
                                                {issue.type === 'legacy_detected' && (
                                                    <button
                                                        className="csc-issue-action-btn"
                                                        onClick={() => { handleViewLegacy(issue.legacyUids); }}
                                                    >
                                                        View Legacy Audit
                                                    </button>
                                                )}
                                                {!configuredIds.includes(issue.product.product_id) && (
                                                    <button
                                                        className="csc-issue-action-btn"
                                                        onClick={() => { handleToggleConfigured(issue.product.product_id); }}
                                                    >
                                                        + Add to My Products
                                                    </button>
                                                )}
                                                <span
                                                    className="csc-issue-find-link"
                                                    onClick={() => {
                                                        const name = issue.product.display_name || issue.product.product_id;
                                                        setSearchQuery(name);
                                                        setSearchBarQuery(name);
                                                        setIssuesPanelOpen(false);
                                                    }}
                                                    title={`Filter catalog to show ${issue.product.display_name || issue.product.product_id}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const name = issue.product.display_name || issue.product.product_id; setSearchQuery(name); setSearchBarQuery(name); setIssuesPanelOpen(false); }}}
                                                >
                                                    Locate {'\u203A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    </>
                );
            })()}

            {/* ── Welcome Card (shown when not dismissed; toggleable via Welcome button) ── */}
            {!welcomeDismissed && !searchQuery && (
                <div className="csc-welcome-card">
                    <div className="csc-welcome-header">
                        <div style={{ flex: 1 }}>
                            <div className="csc-welcome-title">Get started with the Cisco-Splunk Ecosystem</div>
                            <div className="csc-welcome-subtitle">Connect your Cisco infrastructure to Splunk in four steps</div>
                        </div>
                        <button
                            className="csc-welcome-dismiss"
                            onClick={() => { setWelcomeDismissed(true); try { localStorage.setItem('scan_welcome_dismissed', '1'); } catch (_e) { /* noop */ } }}
                            title="Dismiss"
                        >{'\u2715'}</button>
                    </div>
                    <div className="csc-welcome-steps">
                        {[
                            { step: '1', title: 'Install Add-ons', desc: 'Deploy from Splunkbase to Search Heads & Indexers' },
                            { step: '2', title: 'Configure Products', desc: 'Click "+ Add" to pin products to your workspace' },
                            { step: '3', title: 'Verify Data Flow', desc: 'Confirm sourcetypes appear via status indicators' },
                            { step: '4', title: 'Explore & Operate', desc: 'Launch dashboards, correlations, and SOAR playbooks' },
                        ].map(s => (
                            <div key={s.step} className="csc-welcome-step">
                                <span className="csc-welcome-step-num">{s.step}</span>
                                <span className="csc-welcome-step-title">{s.title}</span>
                                <span className="csc-welcome-step-desc">{s.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Section 1: Configured */}
            <div id="configured_products">
            <CollapsiblePanel title={renderSectionTitle('Configured Products', configuredProducts.length, configuredProducts)} open={effectivePanelOpen.configured_products} onChange={handlePanelToggle} panelId="configured_products">
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
                            <div key={p.product_id} style={{ position: 'relative' }}>
                                {p.custom && <span className="csc-custom-badge">Custom</span>}
                                <ProductCard
                                    product={p}
                                    installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                    sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured isComingSoon={false}
                                    platformType={effectivePlatformType}
                                    onToggleConfigured={handleToggleConfigured}
                                    onShowBestPractices={handleShowBestPractices}
                                    onViewLegacy={handleViewLegacy}
                                    onSetCustomDashboard={handleSetCustomDashboard}
                                    devMode={devMode} onViewConfig={handleOpenConfigViewer}
                                    onEditCustom={p.custom ? handleEditCustomProduct : undefined}
                                    onCloneCustom={p.custom ? handleCloneCustomProduct : undefined}
                                    onDeleteCustom={p.custom ? handleDeleteCustomProduct : undefined}
                                    sharedSourcetypeMap={sharedSourcetypeMap}
                                />
                            </div>
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
                <CollapsiblePanel title={renderSectionTitle('Data Detected', detectedProducts.length, detectedProducts, { pulse: true })} open={effectivePanelOpen.detected_products} onChange={handlePanelToggle} panelId="detected_products">
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
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}

            {/* Section 2: Available */}
            <div id="available_products">
            <CollapsiblePanel title={renderSectionTitle('Available Products', availableProducts.length, availableProducts)} open={effectivePanelOpen.available_products} onChange={handlePanelToggle} panelId="available_products">
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
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-section">
                        {searchQuery || selectedCategory ? 'No products match your search criteria.' : 'All products are configured!'}
                    </div>
                )}
            </CollapsiblePanel>
            </div>

            {/* Section 3: Integration Needed — Cisco products with support_level = not_supported.
                Gated behind showInternalContent (devMode or gtmMode) so regular users never
                see products without Splunk integrations. Cards render with noIntegration to
                suppress all action buttons and sourcetype warnings without showing a badge
                (unlike isComingSoon which displays "Coming Soon"). */}
            {showInternalContent && unsupportedProducts.length > 0 && (
                <div id="unsupported_products">
                <CollapsiblePanel title={renderSectionTitle('Integration Needed', unsupportedProducts.length, unsupportedProducts)} open={effectivePanelOpen.unsupported_products} onChange={handlePanelToggle} panelId="unsupported_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-warning-bg)', borderLeft: '4px solid var(--status-warning-border)', borderRadius: '4px', fontSize: '13px', color: 'var(--text-primary, #333)' }}>
                        These Cisco products do not have a dedicated Splunk add-on or integration yet. They are listed here for awareness and tracking — a Splunk integration may be developed in the future.
                    </div>
                    <div className="csc-card-grid">
                        {unsupportedProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} noIntegration
                                platformType={effectivePlatformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
                                devMode={devMode} onViewConfig={handleOpenConfigViewer}
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}

            {/* Section 4: Coming Soon (gated behind gtmMode / devMode) */}
            {showInternalContent && <div id="coming_soon_products">
            <CollapsiblePanel title={renderSectionTitle('Coming Soon', comingSoonProducts.length, comingSoonProducts)} open={effectivePanelOpen.coming_soon_products} onChange={handlePanelToggle} panelId="coming_soon_products">
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
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-section">No upcoming products at this time.</div>
                )}
            </CollapsiblePanel>
            </div>}

            {/* Section 5: Deprecated Products — warning banner uses theme-aware CSS
                variables (--status-warning-bg, --status-warning-border, --text-primary) for
                correct rendering in both light and dark modes */}
            {deprecatedProducts.length > 0 && (
                <div id="deprecated_products">
                <CollapsiblePanel title={renderSectionTitle('Deprecated Products', deprecatedProducts.length, deprecatedProducts)} open={effectivePanelOpen.deprecated_products} onChange={handlePanelToggle} panelId="deprecated_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-warning-bg)', borderLeft: '4px solid var(--status-warning-border)', borderRadius: '4px', fontSize: '13px', color: 'var(--text-primary, #333)' }}>
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
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}

            {/* Section 6: Retired Products (Cisco EOL) */}
            {retiredProducts.length > 0 && (
                <div id="retired_products">
                <CollapsiblePanel title={renderSectionTitle('Retired Products', retiredProducts.length, retiredProducts)} open={effectivePanelOpen.retired_products} onChange={handlePanelToggle} panelId="retired_products">
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
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}

            {/* Section 6: GTM Roadmap — Coverage Gaps (only when user has turned on "GTM Roadmap" in filters) */}
            {showGtmRoadmap && gtmGapProducts.length > 0 && (
                <div id="gtm_coverage_gaps">
                <CollapsiblePanel title={renderSectionTitle('GTM Roadmap \u2014 Coverage Gaps', gtmGapProducts.length, gtmGapProducts)} open={effectivePanelOpen.gtm_coverage_gaps} onChange={handlePanelToggle} panelId="gtm_coverage_gaps">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-neutral-bg, #eceff1)', borderLeft: '4px solid var(--text-tertiary, #607d8b)', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        These Cisco products are on the <strong>Secure Networking GTM roadmap</strong> for Splunk integration. Items are ordered by GTM pillar — <strong>Campus &amp; Branch first</strong>, then WAN Edge, Data Center &amp; Cloud, Visibility &amp; Assurance, and Industrial/OT.
                    </div>
                    {gtmGapProductsByPillar.map(({ pillarNum, pillarLabel, products }) => (
                        <div key={pillarNum ?? 'other'} style={{ marginBottom: '20px' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #546e7a)', margin: '0 0 10px', paddingBottom: '4px', borderBottom: '1px solid var(--border-light, #e0e0e0)' }}>{pillarLabel}</h4>
                            <div className="csc-card-grid">
                                {products.map((p) => (
                                    <ProductCard
                                        key={p.product_id} product={p}
                                        installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                        sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap} isConfigured={false} noIntegration
                                        platformType={effectivePlatformType}
                                        onToggleConfigured={handleToggleConfigured}
                                        onShowBestPractices={handleShowBestPractices}
                                        onViewLegacy={handleViewLegacy}
                                        onSetCustomDashboard={handleSetCustomDashboard}
                                        devMode={devMode} onViewConfig={handleOpenConfigViewer}
                                        showGtmRibbon
                                        sharedSourcetypeMap={sharedSourcetypeMap}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </CollapsiblePanel>
                </div>
            )}

            {/* Section: Custom Products — shows only unconfigured custom cards;
                configured custom cards move to the "Configured Products" section above. */}
            <div id="custom_products">
            <CollapsiblePanel
                title={renderSectionTitle('Custom Products', unconfiguredCustomProducts.length, unconfiguredCustomProducts)}
                open={effectivePanelOpen.custom_products}
                onChange={handlePanelToggle}
                panelId="custom_products"
            >
                <div className="csc-custom-section-banner">
                    Products you've added beyond the official Cisco catalog. Custom cards are stored in <code>local/products.conf</code> and survive app upgrades.
                    {configuredIdSet.size > 0 && filteredCustomProducts.length !== unconfiguredCustomProducts.length && (
                        <span style={{ marginLeft: '6px', fontStyle: 'italic', opacity: 0.8 }}>
                            ({filteredCustomProducts.length - unconfiguredCustomProducts.length} configured — shown above)
                        </span>
                    )}
                </div>
                {unconfiguredCustomProducts.length > 0 ? (
                    <div className="csc-card-grid">
                        {unconfiguredCustomProducts.map((p) => (
                            <div key={p.product_id} style={{ position: 'relative' }}>
                                <span className="csc-custom-badge">Custom</span>
                                <ProductCard
                                    product={p}
                                    installedApps={installedApps} appStatuses={appStatuses} indexerApps={indexerApps}
                                    sourcetypeData={sourcetypeData} splunkbaseData={splunkbaseData} appidToUidMap={appidToUidMap}
                                    isConfigured={false} isComingSoon={false}
                                    platformType={effectivePlatformType}
                                    onToggleConfigured={handleToggleConfigured}
                                    onShowBestPractices={handleShowBestPractices}
                                    onViewLegacy={handleViewLegacy}
                                    onSetCustomDashboard={handleSetCustomDashboard}
                                    devMode={devMode} onViewConfig={handleOpenConfigViewer}
                                    onEditCustom={handleEditCustomProduct}
                                    onCloneCustom={handleCloneCustomProduct}
                                    onDeleteCustom={handleDeleteCustomProduct}
                                    sharedSourcetypeMap={sharedSourcetypeMap}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-section" style={{ textAlign: 'center', padding: '24px' }}>
                        {searchQuery ? 'No custom products match your search.' : (filteredCustomProducts.length > 0 ? 'All custom products are configured — see Configured Products above.' : 'No custom products yet.')}
                    </div>
                )}
                <div style={{ marginTop: '12px' }}>
                    <button className="csc-custom-add-btn" onClick={() => { setCustomEditProduct(null); setCustomCloneProduct(null); setCustomFormOpen(true); }}>
                        <Plus size={14} /> Add Custom Product
                    </button>
                </div>
            </CollapsiblePanel>
            </div>

            {/* Section 8: Catalog Vault — Disabled Products */}
            {showVault && vaultProducts.length > 0 && (
                <div id="vault_products">
                <CollapsiblePanel title={renderSectionTitle('Catalog Vault', vaultProducts.length, vaultProducts)} open={effectivePanelOpen.vault_products} onChange={handlePanelToggle} panelId="vault_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--status-neutral-bg, #f1f5f9)', borderLeft: '4px solid #64748b', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        These catalog entries are <strong>disabled</strong> in products.conf and hidden from the main view. They may be placeholders, duplicates, or products intentionally removed from the active catalog.
                    </div>
                    <div className="csc-card-grid">
                        {vaultProducts.map((p) => (
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
                                sharedSourcetypeMap={sharedSourcetypeMap}
                            />
                        ))}
                    </div>
                </CollapsiblePanel>
                </div>
            )}


            {/* Modals */}
            <CustomProductFormModal
                open={customFormOpen}
                onClose={() => { setCustomFormOpen(false); setCustomEditProduct(null); setCustomCloneProduct(null); }}
                onSave={handleCustomProductSaved}
                editProduct={customEditProduct}
                cloneProduct={customCloneProduct}
                existingIds={allProductIds}
                allProducts={[...products, ...customProducts, ...vaultProducts]}
            />
            <DeleteCustomProductModal
                open={!!customDeleteTarget}
                onClose={() => setCustomDeleteTarget(null)}
                product={customDeleteTarget}
                onConfirm={handleCustomDeleted}
            />
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
                    products={[...products, ...customProducts, ...vaultProducts]}
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
            <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} platformType={effectivePlatformType} appVersion={appVersion} />

            {/* Usage Guide Modal */}
            {cardLegendOpen && (
                <Modal open returnFocus={guideReturnRef} onRequestClose={() => setCardLegendOpen(false)} style={{ maxWidth: '680px', width: '92vw' }}>
                    <Modal.Header title="How to Use SCAN" />
                    <Modal.Body>
                        <div className="csc-sc4s-info scan-guide" style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--page-color, #333)' }}>

                            {/* Quick-start cheat sheet — always visible */}
                            <div className="scan-guide-quick">
                                <div className="scan-guide-quick-row"><span className="scan-guide-key">Category tabs</span><span className="scan-guide-val">Filter by Security, Networking, etc.</span></div>
                                <div className="scan-guide-quick-row"><span className="scan-guide-key">Subcategory pills</span><span className="scan-guide-val">Narrow within a category</span></div>
                                <div className="scan-guide-quick-row"><span className="scan-guide-key">Search bar</span><span className="scan-guide-val">Matches names, keywords, aliases, sourcetypes</span></div>
                                <div className="scan-guide-quick-row"><span className="scan-guide-key">+ Details</span><span className="scan-guide-val">Expand deployment guide with tier chips</span></div>
                                <div className="scan-guide-quick-row"><span className="scan-guide-key">Filters sidebar</span><span className="scan-guide-val">Platform, Version, SC4S, NetFlow, support level</span></div>
                                <div className="scan-guide-quick-row"><span className="scan-guide-key">Add to My Products</span><span className="scan-guide-val">Pin cards to the Configured section</span></div>
                            </div>

                            {/* Expandable details */}
                            <details className="scan-guide-section">
                                <summary className="scan-guide-summary">Product Cards</summary>
                                <ul className="scan-guide-list">
                                    <li>Intelligence badges show <strong>install status</strong>, <strong>updates</strong>, <strong>data flowing</strong> (7d), and <strong>legacy apps</strong>.</li>
                                    <li>Header badges (<span className="csc-badge-btn csc-badge-sc4s" style={{ fontSize: '12px', padding: '3px 8px' }}>SC4S</span> <span className="csc-badge-btn csc-badge-netflow" style={{ fontSize: '12px', padding: '3px 8px' }}>NetFlow</span> <span className="csc-badge-btn csc-badge-soar" style={{ fontSize: '12px', padding: '3px 8px' }}>SOAR</span> <span className="csc-badge-btn csc-badge-itops" style={{ fontSize: '12px', padding: '3px 8px' }}><PulseIcon size="0.85em" style={{ verticalAlign: '-0.1em', marginRight: '3px' }} />ITOps</span> <span className="csc-badge-btn csc-badge-secops" style={{ fontSize: '12px', padding: '3px 8px' }}><ShieldIcon size="0.85em" style={{ verticalAlign: '-0.1em', marginRight: '3px' }} />SecOps</span> <span className="csc-badge-btn csc-badge-alert" style={{ fontSize: '12px', padding: '3px 8px' }}>Alert Actions</span>) open info panels.</li>
                                    <li>Hover <strong>ⓘ</strong> for description, value proposition, and former names.</li>
                                </ul>
                            </details>

                            <details className="scan-guide-section">
                                <summary className="scan-guide-summary">Deployment Details</summary>
                                <ul className="scan-guide-list">
                                    <li>Tier chips: <strong>Search Head</strong>, <strong>Indexers</strong> (✓ deployed, ≠ mismatch, ✗ missing, ⊘ disabled), <strong>Heavy Forwarder</strong>.</li>
                                    <li>Each component links to <strong>Splunkbase</strong>, <strong>Docs</strong>, and <strong>Troubleshoot</strong>.</li>
                                    <li><strong>SC4S</strong> and <strong>NetFlow</strong> sections appear inline when applicable.</li>
                                </ul>
                            </details>

                            <details className="scan-guide-section">
                                <summary className="scan-guide-summary">Filters &amp; Compatibility</summary>
                                <ul className="scan-guide-list">
                                    <li>Click <strong>Filters</strong> to open the sidebar with support level, visibility, and onboarding filters.</li>
                                    <li><strong>Platform</strong> and <strong>Version</strong> checkboxes filter by Splunkbase compatibility.</li>
                                    <li>Toggle <strong>Include / Exclude</strong> to find products <em>not yet compatible</em> with a version.</li>
                                    <li>Use <strong>Supported Only / All Products</strong> to show the full portfolio.</li>
                                </ul>
                            </details>

                            <details className="scan-guide-section">
                                <summary className="scan-guide-summary">Actions &amp; Personalization</summary>
                                <ul className="scan-guide-list">
                                    <li>Click <strong>Launch ▾</strong> to open an installed app's dashboard directly. For TA-only products (no built-in UI), the button changes to <strong>Explore ▾</strong> with options to search your data or create a dashboard.</li>
                                    <li><strong>? Best Practices</strong> provides platform-specific tips and SC4S links.</li>
                                    <li><strong>Sync Catalog</strong> checks S3 for a newer product catalog (<code>products.conf</code>) and downloads the latest Splunkbase app lookup. Runs nightly, but click for on-demand sync.</li>
                                    <li><strong>Role</strong> picks a persona for a curated quick-start.</li>
                                    <li>Cycle through <strong>Light / Dark / Auto</strong> themes.</li>
                                    <li>Use <strong>Expand / Collapse All</strong> (next to the search bar) to open or close every section at once.</li>
                                </ul>
                            </details>

                            <details className="scan-guide-section">
                                <summary className="scan-guide-summary">Sections &amp; Visibility</summary>
                                <ul className="scan-guide-list">
                                    <li><strong>Configured Products</strong> — cards you've pinned to your workspace.</li>
                                    <li><strong>Data Detected</strong> — products with active sourcetype data flowing (not yet configured).</li>
                                    <li><strong>Available Products</strong> — all supported products you haven't added yet.</li>
                                    <li><strong>Custom Products</strong> — cards you've created beyond the official catalog.</li>
                                    <li>Toggle visibility in <strong>Filters → Visibility</strong>: Retired and Deprecated products can be shown or hidden.</li>
                                </ul>
                            </details>

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
                            <div className="scan-warn-banner" style={{
                                borderRadius: '6px',
                                marginBottom: '14px',
                            }}>
                                <strong>Warning:</strong> This action will remove <strong>all {configuredProducts.length} product{configuredProducts.length !== 1 ? 's' : ''}</strong> from your configured list.
                            </div>
                            <p style={{ margin: 0 }}>
                                All products will be moved back to their original sections
                                (<em>Available Products</em>, <em>Integration Needed</em>, or <em>Coming Soon</em>). No data
                                will be lost — you can re-add products at any time.
                            </p>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button appearance="secondary" label="Cancel" onClick={() => setRemoveAllModalOpen(false)} />
                        <Button appearance="destructive" className="scan-btn-destructive" label="Yes, Remove All" onClick={handleRemoveAllConfigured} />
                    </Modal.Footer>
                </Modal>
            )}

            <FeedbackTab onClick={() => setFeedbackOpen(true)} />

            {/* Footer */}
            <div style={{
                marginTop: '16px', padding: '14px 20px', textAlign: 'center',
                fontSize: '12px', color: 'var(--faint-color, #888)',
                borderTop: '1px solid var(--card-border, #e0e0e0)',
            }}>
                SCAN {appVersion && `v${appVersion}`} — The Front Door to the Cisco-Splunk Ecosystem
            </div>
        </div>
    );
}

export default SCANProductsPage;
