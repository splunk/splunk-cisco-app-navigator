#!/usr/bin/env node
// Keep in-app release history aligned with the reviewed package changelog.
const fs = require('fs');
const path = require('path');
const pkg = path.resolve(__dirname, '..');
const text = fs.readFileSync(path.join(pkg, 'CHANGELOG.md'), 'utf8');
const releases = [];
let current;
for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^(\d+\.\d+\.\d+) — (.+)$/);
    if (heading) {
        current = { version: heading[1], date: heading[2], blocks: [] };
        releases.push(current);
    } else if (current && line.trim() && !/^-+$/.test(line)) {
        current.blocks.push(line);
    }
}
if (!releases.length) throw new Error('No versioned release notes found');
// This changelog feeds customer help. Fail rather than silently publishing
// recognizable maintainer-only process notes into the product.
const maintainerOnly = /publish-catalog\.sh|shared build identities|build-number allocation|VERSION is the release authority|source metadata uses generic templates|CODEOWNERS|pre-PR checklist|CI\/CD|### Build (?:&|and) /i;
if (releases.some(release => release.blocks.some(line => maintainerOnly.test(line)))) {
    throw new Error('Maintainer-only content found in customer release notes; move it to maintainer documentation.');
}

fs.writeFileSync(path.join(pkg, 'src/main/webapp/pages/user_guide/releaseNotes.generated.json'), JSON.stringify(releases, null, 2) + '\n');
console.log(`Generated ${releases.length} release history entries`);
