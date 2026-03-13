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
    const laUids = csvToArray(c.legacy_uids);
    const caUids = csvToArray(c.community_uids);

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
        ai_enabled: c.ai_enabled === 'true' || c.ai_enabled === '1',
        ai_description: c.ai_description || '',
        cisco_retired: c.cisco_retired === 'true' || c.cisco_retired === '1',
        coverage_gap: c.coverage_gap === 'true' || c.coverage_gap === '1',
        addon_splunkbase_uid: c.addon_uid || c.addon_splunkbase_uid || '',
        addon_docs_url: c.addon_docs_url || '',
        addon_troubleshoot_url: c.addon_troubleshoot_url || '',
        addon_install_url: c.addon_install_url || '',
        app_viz: c.app_viz || '',
        app_viz_label: c.app_viz_label || '',
        app_viz_splunkbase_uid: c.app_viz_uid || c.app_viz_splunkbase_uid || '',
        app_viz_docs_url: c.app_viz_docs_url || '',
        app_viz_troubleshoot_url: c.app_viz_troubleshoot_url || '',
        app_viz_install_url: c.app_viz_install_url || '',
        app_viz_2: c.app_viz_2 || '',
        app_viz_2_label: c.app_viz_2_label || '',
        app_viz_2_splunkbase_uid: c.app_viz_2_uid || c.app_viz_2_splunkbase_uid || '',
        app_viz_2_docs_url: c.app_viz_2_docs_url || '',
        app_viz_2_troubleshoot_url: c.app_viz_2_troubleshoot_url || '',
        app_viz_2_install_url: c.app_viz_2_install_url || '',
        learn_more_url: c.learn_more_url || '',
        legacy_uids: laUids.filter(Boolean),
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
        sc4s_supported: c.sc4s_supported === 'true' || c.sc4s_supported === '1',
        sc4s_search_head_ta: c.sc4s_search_head_ta || '',
        sc4s_search_head_ta_label: c.sc4s_search_head_ta_label || '',
        sc4s_search_head_ta_splunkbase_url: '',
        sc4s_search_head_ta_splunkbase_id: c.sc4s_search_head_ta_splunkbase_id || '',
        sc4s_search_head_ta_install_url: c.sc4s_search_head_ta_install_url || '',
        sc4s_sourcetypes: csvToArray(c.sc4s_sourcetypes),
        sc4s_config_notes: (c.sc4s_config_notes || '').split('|').map(s => s.trim()).filter(Boolean),
        netflow_supported: c.netflow_supported === 'true' || c.netflow_supported === '1',
        netflow_addon: c.netflow_addon || '',
        netflow_addon_label: c.netflow_addon_label || '',
        netflow_addon_splunkbase_url: '',
        netflow_addon_splunkbase_id: c.netflow_addon_splunkbase_id || '',
        netflow_addon_install_url: c.netflow_addon_install_url || '',
        netflow_addon_docs_url: c.netflow_addon_docs_url || '',
        stream_docs_url: c.stream_docs_url || '',
        netflow_sourcetypes: csvToArray(c.netflow_sourcetypes),
        netflow_config_notes: (c.netflow_config_notes || '').split('|').map(s => s.trim()).filter(Boolean),
        best_practices: (c.best_practices || '').split('|').map(s => s.trim()).filter(Boolean),
        sort_order: parseInt(c.sort_order || '100', 10),
        es_compatible: c.es_compatible === 'true' || c.es_compatible === '1',
        es_cim_data_models: csvToArray(c.es_cim_data_models),
        escu_analytic_stories: csvToArray(c.escu_analytic_stories),
        escu_detection_count: parseInt(c.escu_detection_count || '0', 10),
        escu_detections: csvToArray(c.escu_detections),
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
    .map(s => {
        const prod = buildProduct(s.name, s.fields);
        prod.catalog_disabled = s.fields.disabled === "1" || s.fields.disabled === "true";
        return prod;
    })
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
