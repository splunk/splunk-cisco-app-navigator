import React from 'react';
import ReactDOM from 'react-dom';
import { SplunkThemeProvider } from '@splunk/themes';
import ProductsPage from './index.jsx';

/**
 * Mount into #scan-root which lives inside a Simple XML <html> panel.
 * We wait for DOM ready since RequireJS may load us before the panel exists.
 */
function mount() {
    const root = document.getElementById('scan-root');
    if (!root) {
        // Panel hasn't rendered yet — wait and retry
        setTimeout(mount, 50);
        return;
    }
    ReactDOM.render(
        <SplunkThemeProvider family="prisma" colorScheme="light" density="comfortable">
            <ProductsPage />
        </SplunkThemeProvider>,
        root
    );
}

mount();
