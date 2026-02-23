#!/usr/bin/env node
/**
 * Minimal build.js for cisco-control-center-app: run webpack to build UI
 * and copy src/main/resources/splunk -> stage.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const cmd = process.argv[2] || 'build';
const pkgRoot = path.join(__dirname, '..');

if (cmd === 'build') {
  // 1. Generate static catalog from products.conf
  const genResult = spawnSync('node', [path.join(pkgRoot, 'bin', 'generate-catalog.js')], {
    stdio: 'inherit',
    cwd: pkgRoot,
  });
  if (genResult.status !== 0) {
    console.error('generate-catalog failed');
    process.exit(genResult.status || 1);
  }
  // 2. Run webpack
  const r = spawnSync('npx', ['webpack', '--config', path.join(pkgRoot, 'webpack.config.js')], {
    stdio: 'inherit',
    cwd: pkgRoot,
  });
  process.exit(r.status != null ? r.status : 0);
} else if (cmd === 'link') {
  console.warn('link:app not implemented in minimal build. Symlink stage/ manually if needed.');
  process.exit(0);
} else {
  console.error('Usage: node bin/build.js [build|link]');
  process.exit(1);
}
