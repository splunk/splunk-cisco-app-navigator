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
 * Three sections:
 *   1. Configured Products  — products the admin has added to their workspace
 *   2. Available Products   — active products ready to configure
 *   3. Coming Soon          — products under development
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

const APP_ID = 'cisco-control-center-app';
const CONF_ENDPOINT = `/splunkd/__raw/servicesNS/-/${APP_ID}/configs/conf-products`;
const APPS_LOCAL_ENDPOINT = '/splunkd/__raw/services/apps/local';
const SERVER_INFO_ENDPOINT = '/splunkd/__raw/services/server/info';
const SEARCH_ENDPOINT = '/splunkd/__raw/services/search/jobs';
const CONFIGURED_STORAGE_KEY = 'scan_configured_products';
const THEME_STORAGE_KEY = 'scan_theme_preference'; // 'light' | 'dark' | 'auto'

const CATEGORIES = [
    { id: 'security', name: 'Security', icon: 'shield', description: 'Firewalls, identity, threat detection, and secure access' },
    { id: 'observability', name: 'Observability', icon: 'chart', description: 'Monitoring, analytics, and telemetry' },
    { id: 'networking', name: 'Networking', icon: 'globe', description: 'Campus, branch, WAN, and OT/ICS networking' },
    { id: 'collaboration', name: 'Collaboration', icon: 'headset', description: 'Meeting, messaging, calling, and workspace platforms' },
    { id: 'deprecated', name: 'Deprecated', icon: 'archive', description: 'Archived or deprecated products — add-on may no longer be available on Splunkbase' },
];

// Categories that render as product cards. Stanzas with a category NOT in this
// set (e.g. alert_actions) are metadata-only and excluded from the UI grid.
const CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id));

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

function IntelligenceBadges({ appStatus, vizAppStatus, vizApp2Status, sourcetypeInfo, legacyInstalled, sourcetypeSearchUrl, isArchived }) {
    const items = [];

    if (isArchived) {
        items.push({ cls: 'archived', label: 'Archived — download from Splunkbase', key: 'archived' });
    }

    if (appStatus) {
        if (appStatus.installed && appStatus.updateVersion) {
            items.push({ cls: 'update', label: `Update v${appStatus.updateVersion}`, key: 'ta-update' });
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
    return (
        <div className="csc-intelligence-badges">
            {items.map(b => (
                <span key={b.key} className={`csc-badge-item csc-badge-${b.cls}`}>
                    {b.url ? (
                        <a href={b.url} target="_blank" rel="noopener noreferrer" className="csc-badge-link" onClick={e => e.stopPropagation()}>
                            {b.label}
                        </a>
                    ) : b.label}
                    {b.key === 'legacy' && b.legacyApps && b.legacyApps.length > 0 && (
                        <div className="csc-legacy-tooltip">
                            <div className="csc-legacy-tooltip-inner">
                                <div className="csc-legacy-tooltip-title">Legacy Apps Detected</div>
                                {b.legacyApps.map((la, i) => (
                                    <div key={i} className="csc-legacy-tooltip-item">
                                        <strong>{la.display_name}</strong>
                                        <span className="csc-legacy-tooltip-appid">{la.app_id}</span>
                                        {la.addon_splunkbase_url && (
                                            <a href={la.addon_splunkbase_url} target="_blank" rel="noopener noreferrer"
                                               className="csc-legacy-tooltip-link" onClick={e => e.stopPropagation()}>
                                                Splunkbase ↗
                                            </a>
                                        )}
                                    </div>
                                ))}
                                <div className="csc-legacy-tooltip-hint">These may be archived or deprecated on Splunkbase.</div>
                            </div>
                        </div>
                    )}
                </span>
            ))}
        </div>
    );
}

// ────────────────────  BEST PRACTICES MODAL  ───────────────────────

function BestPracticesModal({ open, onClose, product, platformType }) {
    if (!open || !product) return null;
    const tips = getBestPractices(product, platformType);
    return (
        <Modal open={true} onRequestClose={onClose} style={{ maxWidth: '640px' }}>
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
    if (!open) return null;
    return (
        <Modal open={true} onRequestClose={onClose} style={{ maxWidth: '720px' }}>
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
                            {legacyApps.map(app => (
                                <div key={app.app_id} style={{ padding: '12px 16px', marginBottom: '10px', background: 'var(--legacy-enabled-bg, #fff3e0)', border: '1px solid var(--legacy-enabled-border, #ffe0b2)', borderRadius: '6px' }}>
                                    <strong>{app.display_name || app.app_id}</strong>
                                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                        <code style={{ background: 'var(--legacy-enabled-code-bg, #f5f5f5)', padding: '1px 4px', borderRadius: '3px' }}>{app.app_id}</code>
                                    </div>
                                    {app.addon_splunkbase_url && (
                                        <div style={{ marginTop: '6px' }}>
                                            <a href={app.addon_splunkbase_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>
                                                View on Splunkbase →
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ))}
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
// TODO: Wire in feedback backend before re-enabling
/*
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
*/

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

function ProductCard({ product, installedApps, appStatuses, sourcetypeData, isConfigured, isComingSoon, platformType, onToggleConfigured, onShowBestPractices, onViewLegacy, onSetCustomDashboard }) {
    const {
        product_id, display_name, version, description, value_proposition, vendor, tagline,
        icon_emoji, learn_more_url, addon_splunkbase_url, addon_docs_url, addon_troubleshoot_url, addon_install_url,
        addon, addon_label,
        app_viz, app_viz_label, app_viz_splunkbase_url, app_viz_docs_url, app_viz_troubleshoot_url, app_viz_install_url,
        app_viz_2, app_viz_2_label, app_viz_2_splunkbase_url, app_viz_2_docs_url, app_viz_2_troubleshoot_url, app_viz_2_install_url,
        legacy_apps, prereq_apps, soar_connectors, alert_actions, community_apps, itsi_content_pack,
        card_banner, card_banner_color, card_banner_size, card_banner_opacity, card_accent, card_bg_color, is_new, support_level,
        sc4s_url,
    } = product;

    const appStatus = appStatuses[addon] || null;
    const vizAppStatus = app_viz ? (appStatuses[app_viz] || null) : null;
    const vizApp2Status = app_viz_2 ? (appStatuses[app_viz_2] || null) : null;
    const sourcetypeInfo = sourcetypeData[product_id] || null;
    const hasLegacy = legacy_apps && legacy_apps.length > 0;
    const legacyInstalled = hasLegacy ? legacy_apps.filter(la => installedApps[la.app_id]) : [];
    const communityInstalled = (community_apps || []).filter(ca => installedApps[ca.app_id]);

    const [depsExpanded, setDepsExpanded] = useState(false);
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

    // Banner color: named preset → hex, or raw hex passthrough
    const BANNER_PRESETS = { blue: '#049fd9', green: '#6abf4b', gold: '#d4a017', red: '#e53935', purple: '#7b1fa2', teal: '#00897b', cisco: '#049fd9' };
    const bannerHex = card_banner_color ? (BANNER_PRESETS[card_banner_color.toLowerCase()] || card_banner_color) : null;
    const bannerOpacity = card_banner_opacity ? parseFloat(card_banner_opacity) : null;

    // Card background: support hex colors or named shades
    const BG_PRESETS = {
        ice: '#f0f8ff', mint: '#f0fff4', lavender: '#f5f0ff', rose: '#fff5f5',
        cream: '#fffdf5', smoke: '#f4f5f7', sky: '#eef6fc', pearl: '#fafafa',
    };
    const cardBgStyle = {};
    if (card_accent) cardBgStyle.borderLeft = `4px solid ${card_accent}`;
    if (card_bg_color) {
        const bgVal = BG_PRESETS[card_bg_color.toLowerCase()] || card_bg_color;
        cardBgStyle.background = bgVal;
    }

    return (
        <div
            className="csc-card"
            data-addon-family={addonFamily}
            style={Object.keys(cardBgStyle).length ? cardBgStyle : undefined}
        >
            {/* ── Translucent background banner ── */}
            {card_banner && (
                <div
                    className={`csc-card-banner${card_banner_size && card_banner_size !== 'medium' ? ` csc-banner-${card_banner_size}` : ''}`}
                    aria-hidden="true"
                    style={bannerHex
                        ? { color: bannerHex, opacity: bannerOpacity || 0.10 }
                        : bannerOpacity
                            ? { opacity: bannerOpacity }
                            : undefined
                    }
                >
                    {card_banner}
                </div>
            )}
            {/* ── NEW! corner ribbon ── */}
            {is_new && (
                <div className="csc-new-ribbon" aria-label="New product">NEW!</div>
            )}
            {/* ── Header: icon + name + tagline + configured badge + info tooltip ── */}
            <div className="csc-card-header">
                <div className="csc-card-icon">
                    <span className="csc-icon-placeholder">
                        {ICON_EMOJI_MAP[icon_emoji] || icon_emoji || (display_name || 'C')[0]}
                    </span>
                </div>
                <div className="csc-card-title-block">
                    <span className="csc-card-name">
                        {display_name}
                        {hasItsi && <span className="csc-itsi-badge"><img src={createURL(`/static/app/${APP_ID}/icon-itsi.svg`)} alt="" className="badge-icon" /> ITSI</span>}
                        {soar_connectors && soar_connectors.length > 0 && <span className="csc-soar-badge" title={`${soar_connectors.length} SOAR connector${soar_connectors.length > 1 ? 's' : ''} available`}><img src={createURL(`/static/app/${APP_ID}/icon-soar.svg`)} alt="" className="badge-icon" /> SOAR</span>}
                        {alert_actions && alert_actions.length > 0 && <span className="csc-alert-badge" title={`${alert_actions.length} alert action${alert_actions.length > 1 ? 's' : ''} available`}>🔔 Alert Action</span>}
                        {description && (
                            <Tooltip
                                content={
                                    <div className="csc-tooltip-content">
                                        <div className="csc-tooltip-desc">{description}</div>
                                        {value_proposition && (
                                            <div className="csc-tooltip-vp">
                                                <strong>Value:</strong> {value_proposition}
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        )}
                    </span>
                    <span className="csc-card-subtitle">
                        {tagline || vendor || 'Cisco'}
                    </span>
                    {product.aliases && product.aliases.length > 0 && (
                        <span className="csc-card-aliases">
                            Formerly: {product.aliases.join(', ')}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Intelligence Badges (add-on status, updates, data flowing, legacy) ── */}
            <IntelligenceBadges
                appStatus={appStatus}
                vizAppStatus={vizAppStatus}
                vizApp2Status={vizApp2Status}
                sourcetypeInfo={sourcetypeInfo}
                legacyInstalled={legacyInstalled}
                sourcetypeSearchUrl={sourcetypeSearchUrl}
                isArchived={!!(!addon_install_url && addon_splunkbase_url)}
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
                            {/* ── Support Level Badge ── */}
                            {support_level && (
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
                            {addon && (
                                <div className="csc-dep-detail">
                                    <span className="csc-dep-name">{addon_label || addon}</span>
                                    {(addon_splunkbase_url || addon_docs_url || addon_troubleshoot_url || sc4s_url) && (
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
                                            {sc4s_url && (
                                                <a href={sc4s_url} target="_blank" rel="noopener noreferrer" className="csc-split-pill-seg csc-split-pill-sc4s" title="SC4S — Splunk Connect for Syslog">
                                                    SC4S 📡
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
                                    <span className="csc-dep-name">{app_viz_label || app_viz}</span>
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
                                    <span className="csc-dep-name">{app_viz_2_label || app_viz_2}</span>
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
                                                <span className="csc-dep-name">{pa.display_name}</span>
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
                            {soar_connectors && soar_connectors.length > 0 && (
                                <>
                                    <hr className="csc-dep-divider" />
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
                                    <hr className="csc-dep-divider" />
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
                            {community_apps && community_apps.length > 0 && (
                                <>
                                    <hr className="csc-dep-divider" />
                                    <span className="csc-dep-label csc-dep-label-community">⚠️ Third-Party Alternatives</span>
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
            {communityInstalled.length > 0 && (
                <div className="csc-community-warning">
                    <div className="csc-community-summary" onClick={() => setCommunityExpanded((v) => !v)} role="button" tabIndex={0}>
                        <span>⚠️ Third-party add-on detected ({communityInstalled.length})</span>
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
                                Not official Cisco add-ons. Consider migrating to <strong>{addon_label || addon}</strong> for full support.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ── Footer: compact icon buttons (full text in title tooltip) ── */}
            <div className="csc-card-footer">
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
                {/* Install TA — use install_url (Browse More Apps) or fall back to splunkbase_url */}
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
                {/* Install Viz App — use install_url or fall back to splunkbase_url */}
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
                {/* Install Viz App 2 — use install_url or fall back to splunkbase_url */}
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
                {/* Upgrade TA */}
                {!isComingSoon && isConfigured && appStatus?.installed && appStatus?.updateVersion && (addon_install_url || addon_splunkbase_url) && (
                    <a href={addon_install_url ? createURL(addon_install_url) : addon_splunkbase_url} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${addon_label || addon} to v${appStatus.updateVersion}`}>
                        v{appStatus.updateVersion}
                    </a>
                )}
                {/* Upgrade Viz App */}
                {!isComingSoon && isConfigured && vizAppStatus?.installed && vizAppStatus?.updateVersion && (app_viz_install_url || app_viz_splunkbase_url) && (
                    <a href={app_viz_install_url ? createURL(app_viz_install_url) : app_viz_splunkbase_url} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${app_viz_label || app_viz} to v${vizAppStatus.updateVersion}`}>
                        v{vizAppStatus.updateVersion}
                    </a>
                )}
                {/* Upgrade Viz App 2 */}
                {!isComingSoon && isConfigured && vizApp2Status?.installed && vizApp2Status?.updateVersion && app_viz_2_install_url && (
                    <a href={createURL(app_viz_2_install_url)} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-upgrade"
                        title={`Upgrade ${app_viz_2_label || app_viz_2} to v${vizApp2Status.updateVersion}`}>
                        v{vizApp2Status.updateVersion}
                    </a>
                )}
                {/* Add to My Products */}
                {!isComingSoon && !isConfigured && (
                    <button className="csc-btn csc-btn-green" onClick={() => onToggleConfigured(product_id)}
                        title="Add to My Products">
                        Add
                    </button>
                )}
                {/* Best Practices — icon only */}
                {!isComingSoon && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onShowBestPractices(product)}
                        title="Best Practices">
                        ?
                    </button>
                )}
                {/* Remove — icon only */}
                {!isComingSoon && isConfigured && (
                    <button className="csc-btn csc-btn-icon csc-btn-outline" onClick={() => onToggleConfigured(product_id)}
                        title="Remove from My Products">
                        ×
                    </button>
                )}
                {/* Learn More — icon only */}
                {learn_more_url && (
                    <a href={learn_more_url} target="_blank" rel="noopener noreferrer"
                        className="csc-btn csc-btn-icon csc-btn-outline"
                        title={`Learn more about ${display_name}`}>
                        ↗
                    </a>
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

            {/* ── IS4S-inspired gradient bottom border ── */}
            <div className={`csc-card-bottom-border ${
                card_accent ? 'csc-bottom-cisco' :
                card_banner_color === 'cisco' ? 'csc-bottom-security' :
                'csc-bottom-neutral'
            }`} />
        </div>
    );
}

// ─────────────────────  SEARCH BAR  ─────────────────

function UniversalFinderBar({ onSearch, resultCount, totalCount, products }) {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);

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

    const handleChange = (e) => { const v = e.target.value; setQuery(v); onSearch(v); };
    const handleSuggestionClick = (kw) => { setQuery(kw); onSearch(kw); setFocused(false); };
    const handleClear = () => { setQuery(''); onSearch(''); };

    return (
        <div className="products-search-bar">
            <div style={{ position: 'relative', flex: 1, maxWidth: '560px' }}>
                <input
                    type="text"
                    className="products-search-input"
                    placeholder='Search: "Firewall", "Duo", "XDR", "ISE", "SD-WAN"…'
                    value={query}
                    onChange={handleChange}
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
                        {suggestions.map((kw) => (
                            <div
                                key={kw}
                                onMouseDown={() => handleSuggestionClick(kw)}
                                style={{
                                    padding: '10px 14px', fontSize: '13px', cursor: 'pointer',
                                    borderBottom: '1px solid var(--card-footer-border, #f0f0f0)',
                                    color: 'var(--page-color, #333)',
                                }}
                                onMouseEnter={(e) => { e.target.style.background = 'var(--section-alt-bg, #eee)'; }}
                                onMouseLeave={(e) => { e.target.style.background = 'transparent'; }}
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
        (products || []).forEach((p) => {
            if (!p.addon) { standalone++; return; }
            if (!map[p.addon]) map[p.addon] = { label: p.addon_label || p.addon, count: 0 };
            map[p.addon].count++;
        });
        // Sort by count desc, then alphabetical
        const entries = Object.entries(map)
            .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label));
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
                            title={id === '__standalone__' ? 'Products with their own dedicated add-on' : g.label}
                        >
                            {g.label} <span className="addon-pill-count">{g.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ──────────────────────  CATEGORY FILTER  ────────────────────

function CategoryFilterBar({ selectedCategory, onSelectCategory, categoryCounts }) {
    const iconMap = { shield: '🛡️', chart: '📊', globe: '🌐', headset: '🎧', archive: '📦' };
    const btnStyle = (active, variant) => {
        const isAmber = variant === 'soar';
        const isTeal = variant === 'alert';
        const isSecNet = variant === 'secnet';
        let activeColor, activeBg, activeBorder, activeText;
        if (isAmber) {
            activeBg = '#fef3c7'; activeBorder = '#f59e0b'; activeText = '#92400e';
        } else if (isTeal) {
            activeBg = '#dbeafe'; activeBorder = '#3b82f6'; activeText = '#1e40af';
        } else if (isSecNet) {
            activeBg = '#e0f2f1'; activeBorder = '#00897b'; activeText = '#004d40';
        } else {
            activeBg = '#049fd9'; activeBorder = '#049fd9'; activeText = '#fff';
        }
        return {
            display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            padding: '7px 14px', borderRadius: '20px', border: '2px solid',
            borderColor: active ? activeBorder : 'var(--card-border, #ddd)',
            background: active ? activeBg : 'var(--card-bg, #f5f5f5)',
            color: active ? activeText : 'var(--page-color, #333)',
            cursor: 'pointer', fontWeight: 600, fontSize: '12px',
            transition: 'all 0.2s', flexShrink: 0,
        };
    };

    const totalCount = categoryCounts ? Object.keys(categoryCounts).reduce((sum, k) => (k === 'soar' || k === 'alert_actions' || k === 'secure_networking') ? sum : sum + categoryCounts[k], 0) : null;
    const soarCount = categoryCounts?.soar || 0;
    const alertCount = categoryCounts?.alert_actions || 0;
    const secNetCount = categoryCounts?.secure_networking || 0;

    return (
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
        </div>
    );
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
    const [selectedAddon, setSelectedAddon] = useState(null);
    const [legacyModalOpen, setLegacyModalOpen] = useState(false);
    const [legacyModalApps, setLegacyModalApps] = useState([]);
    const [bpModalOpen, setBpModalOpen] = useState(false);
    const [bpProduct, setBpProduct] = useState(null);
    // const [feedbackOpen, setFeedbackOpen] = useState(false); // TODO: re-enable with feedback backend
    const [removeAllModalOpen, setRemoveAllModalOpen] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const [appUpdateVersion, setAppUpdateVersion] = useState('');
    const [platformType, setPlatformType] = useState('');
    const [themeOverride, setThemeOverride] = useState(getThemePreference); // 'auto' | 'light' | 'dark'
    const [splunkTheme, setSplunkTheme] = useState(null);                  // true = dark, false = light, null = unknown

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
        });
        const checkAll = async () => {
            const statuses = {};
            // Pre-fill not-installed status for apps not in installedApps
            products.forEach((p) => {
                [p.addon, p.app_viz, p.app_viz_2].forEach((aid) => {
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

    // ── Filtering ──
    const filteredProducts = useMemo(() => {
        let filtered = products;
        if (selectedCategory === 'soar') {
            filtered = filtered.filter((p) => p.soar_connectors && p.soar_connectors.length > 0);
        } else if (selectedCategory === 'alert_actions') {
            filtered = filtered.filter((p) => p.alert_actions && p.alert_actions.length > 0);
        } else if (selectedCategory === 'secure_networking') {
            filtered = filtered.filter((p) => p.secure_networking_gtm);
        } else if (selectedCategory) {
            filtered = filtered.filter((p) => p.category === selectedCategory);
        }
        if (selectedAddon) {
            if (selectedAddon === '__standalone__') {
                filtered = filtered.filter((p) => !p.addon);
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
    }, [products, selectedCategory, selectedAddon, searchQuery]);

    const configuredProducts = filteredProducts.filter((p) => p.status !== 'under_development' && configuredIds.includes(p.product_id));
    const availableProducts = filteredProducts.filter((p) => p.status !== 'under_development' && p.status !== 'deprecated' && !configuredIds.includes(p.product_id));
    const comingSoonProducts = filteredProducts.filter((p) => p.status === 'under_development');
    const deprecatedProducts = filteredProducts.filter((p) => p.status === 'deprecated' && !configuredIds.includes(p.product_id));

    const categoryCounts = useMemo(() => {
        const counts = {};
        CATEGORIES.forEach((c) => { counts[c.id] = products.filter((p) => p.category === c.id).length; });
        counts.soar = products.filter((p) => p.soar_connectors && p.soar_connectors.length > 0).length;
        counts.alert_actions = products.filter((p) => p.alert_actions && p.alert_actions.length > 0).length;
        counts.secure_networking = products.filter((p) => p.secure_networking_gtm).length;
        return counts;
    }, [products]);

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
        <div className="products-page">
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
                            href={createURL('/manager/cisco-control-center-app/appsremote?order=relevance&query=%22Cisco+Control+Center%22&offset=0&support=splunk&support=cisco&type=app')}
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
                </div>
            </div>

            {error && (
                <Message appearance="fill" type="warning" style={{ marginBottom: '16px' }}>
                    {error} — showing built-in product catalog.
                </Message>
            )}

            <UniversalFinderBar
                onSearch={setSearchQuery}
                resultCount={filteredProducts.length}
                totalCount={products.length}
                products={products}
            />
            <div style={{ marginBottom: '20px' }}>
                <CategoryFilterBar
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    categoryCounts={categoryCounts}
                />
            </div>

            <AddonFilterBar
                selectedAddon={selectedAddon}
                onSelectAddon={setSelectedAddon}
                products={products}
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

            {/* Section 3: Coming Soon */}
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
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-section">No upcoming products at this time.</div>
                )}
            </CollapsiblePanel>
            </div>

            {/* Section 4: Deprecated / Archived */}
            {deprecatedProducts.length > 0 && (
                <div id="deprecated_products">
                <CollapsiblePanel title={`Deprecated / Archived (${deprecatedProducts.length})`} defaultOpen={false} panelId="deprecated_products">
                    <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'var(--warning-bg, #fff3e0)', borderLeft: '4px solid #e65100', borderRadius: '4px', fontSize: '13px', color: 'var(--page-color, #333)' }}>
                        ⚠ These products reference add-ons or apps that have been archived on Splunkbase. They will still work if already installed, but customers cannot discover them via <strong>Find More Apps</strong> inside Splunk.
                    </div>
                    <div className="csc-card-grid">
                        {deprecatedProducts.map((p) => (
                            <ProductCard
                                key={p.product_id} product={p}
                                installedApps={installedApps} appStatuses={appStatuses}
                                sourcetypeData={sourcetypeData} isConfigured={false} isComingSoon={false}
                                platformType={platformType}
                                onToggleConfigured={handleToggleConfigured}
                                onShowBestPractices={handleShowBestPractices}
                                onViewLegacy={handleViewLegacy}
                                onSetCustomDashboard={handleSetCustomDashboard}
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
            {/* <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} /> */}

            {/* Remove All Confirmation Modal */}
            {removeAllModalOpen && (
                <Modal open onRequestClose={() => setRemoveAllModalOpen(false)} style={{ maxWidth: '520px' }}>
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
                                (<em>Available Products</em> or <em>Coming Soon</em>). No data
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

            {/* <FeedbackTab onClick={() => setFeedbackOpen(true)} /> */}

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
