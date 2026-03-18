import React from 'react';
import { createRoot } from 'react-dom/client';
import { SplunkThemeProvider } from '@splunk/themes';
import ProductsPage from './index.jsx';

/**
 * Mount into #scan-root which lives inside a Simple XML <html> panel.
 * We wait for DOM ready since RequireJS may load us before the panel exists.
 */
let reactRoot = null;

function mount() {
    const el = document.getElementById('scan-root');
    if (!el) {
        setTimeout(mount, 50);
        return;
    }
    if (!reactRoot) {
        reactRoot = createRoot(el);
    }
    reactRoot.render(
        <SplunkThemeProvider family="prisma" colorScheme="light" density="comfortable">
            <ProductsPage />
        </SplunkThemeProvider>
    );
}

mount();
