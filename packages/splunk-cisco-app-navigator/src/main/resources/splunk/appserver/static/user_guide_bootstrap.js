/**
 * Bootstrap loader for the App Navigator User Guide React bundle.
 * Simple XML loads this file and the bundle mounts itself into #scan-root.
 */
var scanUserGuideAssetVersion = Date.now();
require([
    '/static/app/splunk-cisco-app-navigator/pages/user_guide.js?v=' +
        scanUserGuideAssetVersion,
], function () {
    // The React bundle self-initializes on load.
});
