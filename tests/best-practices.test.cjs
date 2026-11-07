const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/index.jsx', 'utf8');
const start = source.indexOf('function getBestPractices(');
const end = source.indexOf('\n}', start) + 2;
const context = vm.createContext({ resolveLabel: (_uid, label, app) => label || app || '' });
vm.runInContext(source.slice(start, end), context);
const tips = (product, platform) => context.getBestPractices(product, platform, {}).map(t => t.text).join('\n');
test('HEC-only products retain explicit guidance without invented SC4S or Cloud advice', () => {
    for (const platform of ['enterprise', 'cloud']) {
        const text = tips({ display_name: 'Crosswork Assurance', best_practices: ['Native HEC alert export requires no TA.', 'Direct connectivity to Cloud is unavailable.'] }, platform);
        assert.match(text, /Native HEC/);
        assert.match(text, /Cloud is unavailable/);
        assert.doesNotMatch(text, /SC4S|Data Manager|best ingested/);
    }
});
test('API add-ons do not receive syslog advice or mandatory placement on both tiers', () => {
    const text = tips({ display_name: 'Intersight', addon: 'TA', sc4s_url: 'https://example.com' }, 'enterprise');
    assert.doesNotMatch(text, /SC4S|search heads and heavy forwarders/);
    assert.match(text, /deployment documentation/);
});
test('declared syslog support gets scoped advice and legacy apps get migration review', () => {
    const text = tips({ display_name: 'Syslog device', sc4s_supported: true, legacy_uids: ['123'] }, 'cloud');
    assert.match(text, /supported syslog sources/);
    assert.match(text, /outside Splunk Cloud/);
    assert.match(text, /before disabling or removing/);
    assert.doesNotMatch(text, /Disable and remove these deprecated/);
});
