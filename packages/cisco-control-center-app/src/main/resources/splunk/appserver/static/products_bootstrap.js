/**
 * Bootstrap loader for the Splunk Cisco App Navigator React app.
 *
 * Simple XML loads this file via RequireJS (specified via script= attribute
 * on the <dashboard> element in products.xml).  We use require() to pull in
 * the webpack-built React bundle which renders into #scan-root.
 *
 * Because Simple XML pages already provide __splunkd_partials__, i18n, and
 * the Splunk config endpoint, NO Mako template is needed — this works
 * immediately after app install on Splunk Cloud (no restart required).
 */
require([
    '/static/app/cisco-control-center-app/pages/products.js'
], function () {
    // The React bundle self-initialises on load — nothing else to do here.
});
