import { getThemeOptions, getUserTheme } from '@splunk/splunk-utils/themes';
import { createStaticURL } from '@splunk/splunk-utils/url';

// On Simple XML pages the theme API registers as an AMD module, rather than
// window.__get_theme__. Load it through the dashboard's existing RequireJS.
export function readUserTheme() {
    if (typeof window.require !== 'function' || !window.define?.amd) {
        return getUserTheme();
    }
    return new Promise((resolve, reject) => {
        window.require([createStaticURL('build/api/get_theme.js')], (api) => {
            if (!api || typeof api.getTheme !== 'function') {
                reject(new Error('Splunk theme API unavailable'));
                return;
            }
            Promise.resolve().then(() => api.getTheme()).then(resolve, reject);
        }, reject);
    });
}

// Simple XML needs a URL theme to render Splunk's navigation in the user's
// preferred scheme. Preserve explicit links and every other query parameter.
export async function mountWithUserTheme(mount) {
    const url = new URL(window.location.href);
    if (['light', 'dark'].includes(url.searchParams.get('theme'))) {
        mount();
        return;
    }
    try {
        const theme = await readUserTheme();
        if (theme) {
            const { colorScheme } = getThemeOptions(theme);
            if (['light', 'dark'].includes(colorScheme)) {
                url.searchParams.set('theme', colorScheme);
                window.location.replace(url.href);
                return;
            }
        }
    } catch (_error) {
        // Keep the page usable if Splunk's theme API is unavailable.
    }
    mount();
}
