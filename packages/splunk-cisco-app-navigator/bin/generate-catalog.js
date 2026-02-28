#!/usr/bin/env node
/**
 * generate-catalog.js — Build-time generator
 *
 * Reads products.conf (the single source of truth) and emits a JS module
 * that index.jsx imports as the static fallback catalog.
 *
 * Usage:  node bin/generate-catalog.js
 * Called automatically by bin/build.js before webpack runs.
 */
const fs = require('fs');
const path = require('path');

const CONF_PATH = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'resources',
    'splunk',
    'default',
    'products.conf'
);

const OUT_PATH = path.join(
    __dirname,
    '..',
    'src',
    'main',
    'webapp',
    'pages',
    'products',
    'productCatalog.generated.js'
);

// ── INI-style parser for products.conf ──

function csvToArray(val) {
    if (!val) return [];
    return val.split(',').map(s => s.trim()).filter(Boolean);
}

function parseConf(text) {
    const stanzas = [];
    let current = null;

    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        const stanzaMatch = line.match(/^\[(.+)\]$/);
        if (stanzaMatch) {
            current = { name: stanzaMatch[1], fields: {} };
            stanzas.push(current);
            continue;
        }

        if (current) {
            const eqIdx = line.indexOf('=');
            if (eqIdx > 0) {
                const key = line.slice(0, eqIdx).trim();
                const val = line.slice(eqIdx + 1).trim();
                current.fields[key] = val;
            }
        }
    }

    return stanzas;
}

// ── Build product object (same shape as loadProductsFromConf in index.jsx) ──

function buildProduct(name, c) {
    const laIds = csvToArray(c.legacy_apps);
    const laLabels = csvToArray(c.legacy_labels);
    const laUids = csvToArray(c.legacy_uids);
    const laUrls = csvToArray(c.legacy_urls);
    const laStatuses = csvToArray(c.legacy_statuses);
    const paIds = csvToArray(c.prereq_apps);
    const paLabels = csvToArray(c.prereq_labels);
    const paUids = csvToArray(c.prereq_uids);
    const paUrls = csvToArray(c.prereq_urls);
    const caIds = csvToArray(c.community_apps);
    const caLabels = csvToArray(c.community_labels);
    const caUids = csvToArray(c.community_uids);
    const caUrls = csvToArray(c.community_urls);

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
        addon_install_url: c.addon_install_url || '',
        app_viz: c.app_viz || '',
        app_viz_label: c.app_viz_label || '',
        app_viz_splunkbase_url: c.app_viz_splunkbase_url || '',
        app_viz_docs_url: c.app_viz_docs_url || '',
        app_viz_install_url: c.app_viz_install_url || '',
        app_viz_2: c.app_viz_2 || '',
        app_viz_2_label: c.app_viz_2_label || '',
        app_viz_2_splunkbase_url: c.app_viz_2_splunkbase_url || '',
        app_viz_2_docs_url: c.app_viz_2_docs_url || '',
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
        sc4s_supported: c.sc4s_supported === 'true' || c.sc4s_supported === '1',
        sc4s_search_head_ta: c.sc4s_search_head_ta || '',
        sc4s_search_head_ta_label: c.sc4s_search_head_ta_label || '',
        sc4s_search_head_ta_splunkbase_url: c.sc4s_search_head_ta_splunkbase_url || '',
        sc4s_search_head_ta_splunkbase_id: c.sc4s_search_head_ta_splunkbase_id || '',
        sc4s_search_head_ta_install_url: c.sc4s_search_head_ta_install_url || '',
        sc4s_config_notes: (c.sc4s_config_notes || '').split('|').map(s => s.trim()).filter(Boolean),
        best_practices: (c.best_practices || '').split('|').map(s => s.trim()).filter(Boolean),
        sort_order: parseInt(c.sort_order || '100', 10),
    };
}

// ── Main ──

// Categories that are metadata-only and should NOT render as product cards.
// Stanzas with these categories are kept in products.conf for reference
// (e.g. saved searches) but excluded from the static UI catalog.
const HIDDEN_CATEGORIES = new Set([]);

const confText = fs.readFileSync(CONF_PATH, 'utf8');
const stanzas = parseConf(confText);

const products = stanzas
    .filter(s => s.fields.disabled !== "1" && s.fields.disabled !== "true")
    .map(s => buildProduct(s.name, s.fields))
    .filter(p => !HIDDEN_CATEGORIES.has(p.category))
    .sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name));

const output = [
    '/* eslint-disable */',
    '/**',
    ' * AUTO-GENERATED from products.conf — DO NOT EDIT BY HAND.',
    ' * Regenerate:  node bin/generate-catalog.js',
    ` * Generated:   ${new Date().toISOString()}`,
    ` * Products:    ${products.length}`,
    ' */',
    '',
    `export const PRODUCT_CATALOG = ${JSON.stringify(products, null, 2)};`,
    '',
].join('\n');

fs.writeFileSync(OUT_PATH, output, 'utf8');
console.log(`generate-catalog: wrote ${products.length} products → ${path.relative(process.cwd(), OUT_PATH)}`);
