const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('packages/splunk-cisco-app-navigator/src/main/webapp/common/shellTheme.js', 'utf8')
    .replace(/^import .*;\n/, '').replace('export async function', 'async function');
async function run(href, theme, fail = false) {
    let destination;
    let mounts = 0;
    let calls = 0;
    const context = vm.createContext({ URL, window: { location: { href, replace: value => { destination = value; } } },
        getUserTheme: async () => { calls++; if (fail) throw Error('unavailable'); return theme; },
        getThemeOptions: value => ({ colorScheme: value === 'prismaDark' ? 'dark' : 'light' }) });
    vm.runInContext(source, context);
    await context.mountWithUserTheme(() => { mounts++; });
    return { destination, mounts, calls };
}
test('saved dark preference reaches shell while preserving search and hash', async () => {
    const result = await run('http://forge:8000/en-US/app/navigator/products?form.product=cisco#catalog', 'prismaDark');
    const url = new URL(result.destination);
    assert.equal(url.searchParams.get('theme'), 'dark');
    assert.equal(url.searchParams.get('form.product'), 'cisco');
    assert.equal(url.hash, '#catalog');
    assert.equal(result.mounts, 0);
    const next = await run(url.href, 'prismaDark');
    assert.equal(next.destination, undefined);
    assert.equal(next.mounts, 1);
    assert.equal(next.calls, 0);
});
test('explicit light link remains light for a dark user', async () => {
    assert.equal((await run('http://forge/products?theme=light', 'prismaDark')).mounts, 1);
});
test('saved light preference and unavailable theme API remain usable', async () => {
    assert.equal(new URL((await run('http://forge/products', 'light')).destination).searchParams.get('theme'), 'light');
    assert.equal((await run('http://forge/products', null, true)).mounts, 1);
});
