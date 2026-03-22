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

// --- Pre-build: stamp products.conf line 1 (date/time) and min_app_version ---
function stampProductsConf() {
  const productsConfPath = path.join(pkgRoot, 'src/main/resources/splunk/default/products.conf');
  const appConfPath = path.join(pkgRoot, 'src/main/resources/splunk/default/app.conf');
  if (!fs.existsSync(productsConfPath)) return;

  let appVersion = '1.0.0';
  if (fs.existsSync(appConfPath)) {
    const appConf = fs.readFileSync(appConfPath, 'utf8');
    const idMatch = appConf.match(/\[id\][\s\S]*?version\s*=\s*(\S+)/m);
    if (idMatch) appVersion = idMatch[1].trim();
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const versionStamp = `${now.getUTCFullYear()}_${pad(now.getUTCMonth() + 1)}_${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const line1 = `# version = ${versionStamp}`;
  const line2 = `# min_app_version = ${appVersion}`;

  let content = fs.readFileSync(productsConfPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const rest = lines.slice(2).join('\n');
  const newContent = line1 + '\n' + line2 + '\n' + rest;
  fs.writeFileSync(productsConfPath, newContent, 'utf8');
  console.log(`\x1b[36m[build-stamp]\x1b[0m products.conf: version = ${versionStamp}, min_app_version = ${appVersion}`);
}

// --- Pre-build: stamp build hash in app.conf (git short hash or date fallback) ---
function stampBuildHash() {
  const appConfPath = path.join(pkgRoot, 'src/main/resources/splunk/default/app.conf');
  if (!fs.existsSync(appConfPath)) return;

  let conf = fs.readFileSync(appConfPath, 'utf8');

  const buildMatch = conf.match(/^build\s*=\s*(\S+)/m);
  const oldHash = buildMatch ? buildMatch[1].trim() : null;

  let buildHash;
  try {
    buildHash = execSync('git rev-parse --short=8 HEAD', { cwd: pkgRoot, stdio: 'pipe' })
      .toString()
      .trim();
  } catch (_) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    buildHash = parseInt(stamp, 10).toString(16).slice(0, 8);
  }

  if (buildHash === oldHash) {
    console.log(`\x1b[36m[build-stamp]\x1b[0m build = ${oldHash} (unchanged, skipping)`);
    return;
  }

  conf = conf.replace(/^build\s*=\s*.+$/m, `build = ${buildHash}`);
  fs.writeFileSync(appConfPath, conf, 'utf8');
  console.log(`\x1b[36m[build-stamp]\x1b[0m build = ${buildHash}`);
}

// --- Post-build: clear Splunk cache & refresh UI ---
function postBuildRefresh() {
  const splunkHome = process.env.SPLUNK_HOME || '/opt/splunk';
  const cacheDir = path.join(splunkHome, 'var/run/splunk/appserver/i18n');
  const adminUser = process.env.SPLUNK_ADMIN || 'admin';
  const adminPass = process.env.SPLUNK_PASS || 'changeme';
  const splunkPort = process.env.SPLUNK_MGMT_PORT || '8089';

  // 1. Clear UI cache files (i18n and static asset cache)
  try {
    const cachePattern = path.join(cacheDir, 'products*.cache');
    const cacheFiles = glob.sync(cachePattern);
    if (cacheFiles.length > 0) {
      cacheFiles.forEach((f) => fs.unlinkSync(f));
      console.log(`\x1b[36m[post-build]\x1b[0m Cleared ${cacheFiles.length} i18n cache file(s)`);
    }
    const staticCacheDir = path.join(splunkHome, 'var/run/splunk/appserver/static');
    if (fs.existsSync(staticCacheDir)) {
      fs.rmSync(staticCacheDir, { recursive: true, force: true });
      console.log(`\x1b[36m[post-build]\x1b[0m Cleared static asset cache`);
    } else {
      console.log('\x1b[36m[post-build]\x1b[0m No static cache to clear');
    }
  } catch (err) {
    console.warn(`\x1b[33m[post-build]\x1b[0m Could not clear cache: ${err.message}`);
  }

  // 2. Trigger Splunk reload (non-fatal if Splunk isn't running)
  //    debug/refresh was removed in Splunk 10.x — use _reload endpoints instead
  try {
    // Reload products.conf so REST API picks up changes without restart
    execSync(
      `curl -sk -u "${adminUser}:${adminPass}" ` +
        `https://localhost:${splunkPort}/servicesNS/nobody/splunk-cisco-app-navigator/configs/conf-products/_reload ` +
        `-X POST`,
      { stdio: 'pipe', timeout: 5000 }
    );
    // Reload views so UI dashboard picks up changes
    execSync(
      `curl -sk -u "${adminUser}:${adminPass}" ` +
        `https://localhost:${splunkPort}/servicesNS/nobody/splunk-cisco-app-navigator/data/ui/views/_reload ` +
        `-X POST`,
      { stdio: 'pipe', timeout: 5000 }
    );
    console.log('\x1b[36m[post-build]\x1b[0m Splunk UI refresh triggered');
  } catch (err) {
    console.warn('\x1b[33m[post-build]\x1b[0m Splunk UI refresh skipped (Splunk may not be running)');
  }

  console.log('\x1b[32m[post-build]\x1b[0m Done — hard-refresh your browser (Cmd+Shift+R)');
}

if (cmd === 'build') {
  // 0. Stamp build hash in app.conf (git short hash or date fallback)
  stampBuildHash();
  // 0b. Stamp products.conf line 1 (date/time) and min_app_version from app.conf
  stampProductsConf();
  // 1. Generate static catalog from products.conf
  const genResult = spawnSync('node', [path.join(pkgRoot, 'bin', 'generate-catalog.js')], {
    stdio: 'inherit',
    cwd: pkgRoot,
  });
  if (genResult.status !== 0) {
    console.error('generate-catalog failed');
    process.exit(genResult.status || 1);
  }
  // 2. Run webpack (suppress npm config warnings, Babel deopt notice, and verbose asset output)
  const r = spawnSync('npx', ['--loglevel=error', 'webpack', '--config', path.join(pkgRoot, 'webpack.config.js')], {
    stdio: 'inherit',
    cwd: pkgRoot,
    env: { ...process.env, NPM_CONFIG_LOGLEVEL: 'error', BABEL_COMPACT: 'true' },
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
