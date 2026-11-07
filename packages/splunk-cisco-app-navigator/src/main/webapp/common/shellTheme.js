import { getThemeOptions, getUserTheme } from '@splunk/splunk-utils/themes';

// Simple XML needs a URL theme to render Splunk's navigation in the user's
// preferred scheme. Preserve explicit links and every other query parameter.
export async function mountWithUserTheme(mount) {
    const url = new URL(window.location.href);
    if (['light', 'dark'].includes(url.searchParams.get('theme'))) {
        mount();
        return;
    }
    try {
        const theme = await getUserTheme();
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
