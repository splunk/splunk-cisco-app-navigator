/* eslint-disable import/no-extraneous-dependencies */
import React from 'react';
import { createRoot } from 'react-dom/client';
import UserGuidePage from './index.jsx';

let reactRoot = null;

function mount() {
    const element = document.getElementById('scan-root');
    if (!element) {
        window.setTimeout(mount, 50);
        return;
    }
    if (!reactRoot) {reactRoot = createRoot(element);}
    reactRoot.render(<UserGuidePage />);
}

mount();
