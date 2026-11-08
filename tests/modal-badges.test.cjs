const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const postcss = require('postcss');
const css = fs.readFileSync('packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/products.css', 'utf8');
const root = postcss.parse(css);
function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
test('all six light/dark semantic badge pairs exceed 4.5:1 text contrast', () => {
    let pairs = 0;
    root.walkRules(rule => {
        if (!rule.selector.includes('.scan-content-badge--')) return;
        const vars = Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]));
        const a = luminance(vars['--scan-badge-bg']);
        const b = luminance(vars['--scan-badge-fg']);
        assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, rule.selector);
        pairs++;
    });
    assert.equal(pairs, 6);
});
test('modal rules do not force foreground color on every descendant', () => {
    root.walkRules(rule => {
        if (rule.selector.includes("[data-test='modal']") && /\*\s*(,|$)/.test(rule.selector)) {
            assert.ok(!rule.nodes.some(n => n.prop === 'color' && n.important));
        }
    });
});
