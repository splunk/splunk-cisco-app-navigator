#!/usr/bin/env node
/**
 * Minimal build.js for splunk-cisco-app-navigator: run webpack to build UI
 * and copy src/main/resources/splunk -> stage.
 *
 * After a successful build, automatically clears Splunk's UI cache and
 * triggers a view refresh so changes are visible without manual steps.
 */
const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

const cmd = process.argv[2] || 'build';
const pkgRoot = path.join(__dirname, '..');

// --- Post-build: clear Splunk cache & refresh UI ---
function postBuildRefresh() {
  const splunkHome = process.env.SPLUNK_HOME || '/opt/splunk';
  const cacheDir = path.join(splunkHome, 'var/run/splunk/appserver/i18n');
  const adminUser = process.env.SPLUNK_ADMIN || 'admin';
  const adminPass = process.env.SPLUNK_PASS || 'changeme';
  const splunkPort = process.env.SPLUNK_MGMT_PORT || '8089';

  // 1. Clear UI cache files
  try {
    const cachePattern = path.join(cacheDir, 'products*.cache');
    const cacheFiles = glob.sync(cachePattern);
    if (cacheFiles.length > 0) {
      cacheFiles.forEach((f) => fs.unlinkSync(f));
      console.log(`\x1b[36m[post-build]\x1b[0m Cleared ${cacheFiles.length} cache file(s)`);
    } else {
      console.log('\x1b[36m[post-build]\x1b[0m No cache files to clear');
    }
  } catch (err) {
    console.warn(`\x1b[33m[post-build]\x1b[0m Could not clear cache: ${err.message}`);
  }

  // 2. Trigger Splunk UI refresh (non-fatal if Splunk isn't running)
  try {
    execSync(
      `curl -sk -u "${adminUser}:${adminPass}" ` +
        `https://localhost:${splunkPort}/services/debug/refresh ` +
        `-X POST -d "entity=data/ui/views"`,
      { stdio: 'pipe', timeout: 5000 }
    );
    console.log('\x1b[36m[post-build]\x1b[0m Splunk UI refresh triggered');
  } catch (err) {
    console.warn('\x1b[33m[post-build]\x1b[0m Splunk UI refresh skipped (Splunk may not be running)');
  }

  console.log('\x1b[32m[post-build]\x1b[0m Done — hard-refresh your browser (Cmd+Shift+R)');
}

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
  if (r.status !== 0) {
    process.exit(r.status != null ? r.status : 1);
  }
  // 3. Post-build: clear cache & refresh
  postBuildRefresh();
  process.exit(0);
} else if (cmd === 'link') {
  console.warn('link:app not implemented in minimal build. Symlink stage/ manually if needed.');
  process.exit(0);
} else {
  console.error('Usage: node bin/build.js [build|link]');
  process.exit(1);
}
