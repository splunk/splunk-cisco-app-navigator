const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const page = path.join(root, 'packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/index.jsx');
const generated = fs.readFileSync(path.join(path.dirname(page), 'productCatalog.generated.js'), 'utf8');
const catalog = JSON.parse(generated.split('export const PRODUCT_CATALOG = ')[1].replace(/;\s*$/, ''));
const compiled = new Module(page, module);
compiled.filename = page;
compiled.paths = Module._nodeModulePaths(path.dirname(page));
const originalRequire = compiled.require.bind(compiled);
compiled.require = id => id === '@splunk/splunk-utils/themes' ? { getThemeOptions: () => ({ colorScheme: 'light' }) } : id === '../../common/shellTheme' ? { readUserTheme: async () => 'light' } : id === './productCatalog.generated' ? { PRODUCT_CATALOG: catalog } : originalRequire(id);
compiled._compile(babel.transformSync(fs.readFileSync(page, 'utf8'), {
    filename: page, presets: ['@splunk/babel-preset'],
}).code + '\nmodule.exports.review = { EssentialsRecommendation, generateCustomerSummary, toSplunkConf, productMatchesSearch };', page);
const { EssentialsRecommendation, generateCustomerSummary, toSplunkConf, productMatchesSearch } = compiled.exports.review;
const product = catalog.find(p => p.product_id === 'cisco_catalyst_switches');
const appId = 'splunk-cisco-dashboards';
const render = (p, apps) => renderToStaticMarkup(React.createElement(EssentialsRecommendation, { product: p, installedApps: apps }));

test('missing and disabled apps offer the listing without broken local launch links', () => {
    for (const apps of [{}, { [appId]: { disabled: true } }, { [appId]: { disabled: '1' } }, { [appId]: { disabled: 'true' } }]) {
        const html = render(product, apps);
        assert.match(html, /https:\/\/splunkbase\.splunk\.com\/app\/9257/);
        assert.doesNotMatch(html, /href="[^"]*\/app\/splunk-cisco-dashboards\//);
    }
});

test('enabled apps link to the product target and index-mapping documentation', () => {
    const html = render(product, { [appId]: { disabled: '0' } });
    assert.ok(html.includes(`/dashboard_manager#/${product.essentials_dashboards[0]}`));
    assert.ok(html.includes('/user_guide#macro-tuning'));
    assert.match(html, /target="_blank"/);
    assert.ok(html.includes('Optional visualization for Cisco Catalyst Switches'));
    assert.ok(html.includes('collection add-on is still required'));
});

test('workspace recommendations open the native page while dashboards use Dashboard Manager', () => {
    const apps = { [appId]: { disabled: false } };
    const workspaceProducts = catalog.filter(p => p.essentials_dashboards[0] === 'workspace_insights');
    assert.ok(workspaceProducts.some(p => p.display_name.includes('Secure Network Analytics')));
    for (const p of workspaceProducts) {
        const html = render(p, apps);
        assert.ok(html.includes(`/app/${appId}/workspace_insights"`), p.product_id);
        assert.doesNotMatch(html, /dashboard_manager#\/workspace_insights/);
    }
    for (const p of catalog.filter(p => p.essentials_dashboards.length && p.essentials_dashboards[0] !== 'workspace_insights')) {
        assert.ok(render(p, apps).includes(`/dashboard_manager#/${p.essentials_dashboards[0]}`), p.product_id);
    }
});

test('unmapped products and invalid routes do not create recommendations', () => {
    assert.equal(render({ product_id: 'unmapped' }, {}), '');
    assert.equal(render({ ...product, essentials_dashboards: ['https://invalid.example/', '../setup'] }, {}), '');
});

test('both existing visualization choices survive on fully populated cards', () => {
    assert.equal(product.app_viz, 'cisco-catalyst-app');
    assert.equal(product.app_viz_2, 'cisco_ios');
    assert.ok(product.essentials_dashboards.length);
    assert.equal(catalog.filter(p => p.essentials_dashboards.length).length, 37);
    assert.equal(catalog.find(p => p.product_id === 'cisco_crosswork_assurance').essentials_dashboards.length, 0);
});

test('search, customer summaries and configuration export preserve optional semantics', () => {
    assert.equal(productMatchesSearch(product, 'secure networking essentials'), true);
    const summary = generateCustomerSummary(product, {});
    assert.ok(summary.text.includes('OPTIONAL VISUALIZATION'));
    assert.ok(summary.html.includes('Optional visualization'));
    const exported = toSplunkConf(product);
    assert.ok(exported.includes(`essentials_dashboards = ${product.essentials_dashboards.join(',')}`));
    assert.ok(exported.includes('essentials_coverage = '));
});

test('the actual User Guide renders Essentials instructions and current release notes', () => {
    const file = path.resolve(path.dirname(page), '../user_guide/index.jsx');
    const guide = new Module(file, module);
    guide.filename = file;
    guide.paths = Module._nodeModulePaths(path.dirname(file));
    const requireGuide = guide.require.bind(guide);
    guide.require = id => id === '@splunk/splunk-utils/themes' ? { getThemeOptions: () => ({ colorScheme: 'light' }) } : id === '../../common/shellTheme' ? { readUserTheme: async () => 'light' } : id === '../products/productCatalog.generated' ? { PRODUCT_CATALOG: catalog } : requireGuide(id);
    guide._compile(babel.transformSync(fs.readFileSync(file, 'utf8'), {
        filename: file, presets: ['@splunk/babel-preset'],
    }).code, file);
    const html = renderToStaticMarkup(React.createElement(guide.exports.default));
    assert.ok(html.includes('id="essentials"'));
    assert.ok(html.includes('id="release-notes"'));
    assert.ok(html.includes('Version 1.0.33'));
    assert.ok(html.includes('Version 1.0.50'));
    assert.ok(html.includes('Expand all'));
    assert.ok(html.includes('Collapse all'));
    const releases = JSON.parse(fs.readFileSync(path.resolve(path.dirname(page), '../user_guide/releaseNotes.generated.json'), 'utf8'));
    assert.equal((html.match(/<details/g) || []).length, releases.length);
    assert.equal(releases[0].version, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
    assert.ok(html.includes('Install Essentials'));
    assert.ok(html.includes('Partial Success'));
    assert.ok(html.includes('Introducing Splunk Secure Networking Essentials recommendations'));
    assert.ok(html.includes('Macro Index Tuning'));
});

test('Essentials installation and disabled management remain separate from product dependencies', () => {
    const missing = render(product, {});
    assert.match(missing, /Install Essentials/);
    assert.match(missing, /appsremote\?query=Splunk%20Secure%20Networking%20Essentials/);
    const disabled = render(product, { [appId]: { disabled: true } });
    assert.match(disabled, /Manage Essentials/);
    assert.match(disabled, /apps\/local\?search=splunk-cisco-dashboards/);
    assert.doesNotMatch(disabled, />Install Essentials</);
    const enabled = render(product, { [appId]: { disabled: false } });
    assert.match(enabled, /Open Essentials content/);
    assert.doesNotMatch(enabled, /appsremote/);
});

test('customer release history excludes project delivery procedures', () => {
    const file = path.resolve(path.dirname(page), '../user_guide/releaseNotes.generated.json');
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /publish-catalog\.sh|shared build identities|VERSION is|CODEOWNERS|pre-PR|GitHub Desktop|build hash stamp|webpack/i);
    assert.match(text, /Catalog compatibility/);
    assert.match(text, /1\.0\.26/);
    assert.match(text, /Sync reporting/);
});
