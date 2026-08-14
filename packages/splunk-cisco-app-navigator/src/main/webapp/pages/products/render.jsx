import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SplunkThemeProvider } from '@splunk/themes';
import ProductsPage, { PRODUCTS_THEME_CHANGE_EVENT } from './index.jsx';

/**
 * Mount into #scan-root which lives inside a Simple XML <html> panel.
 * We wait for DOM ready since RequireJS may load us before the panel exists.
 */
let reactRoot = null;

function ProductsThemeRoot() {
    const [colorScheme, setColorScheme] = useState(() => (
        document.documentElement.classList.contains('dce-dark') ? 'dark' : 'light'
    ));

    useEffect(() => {
        const handleThemeChange = (event) => {
            const nextColorScheme = event.detail?.colorScheme;
            if (nextColorScheme === 'dark' || nextColorScheme === 'light') {
                setColorScheme(nextColorScheme);
            }
        };

        window.addEventListener(PRODUCTS_THEME_CHANGE_EVENT, handleThemeChange);
        return () => window.removeEventListener(PRODUCTS_THEME_CHANGE_EVENT, handleThemeChange);
    }, []);

    return (
        <SplunkThemeProvider
            family="prisma"
            colorScheme={colorScheme}
            density="comfortable"
        >
            <ProductsPage />
        </SplunkThemeProvider>
    );
}

function mount() {
    const el = document.getElementById('scan-root');
    if (!el) {
        setTimeout(mount, 50);
        return;
    }
    if (!reactRoot) {
        reactRoot = createRoot(el);
    }
    reactRoot.render(<ProductsThemeRoot />);
}

mount();
