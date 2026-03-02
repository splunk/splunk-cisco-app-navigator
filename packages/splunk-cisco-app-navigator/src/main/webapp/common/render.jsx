import layout from '@splunk/react-page';
import { getUserTheme } from '@splunk/splunk-utils/themes';
import React from 'react';

export function renderAsPage(PageComponent) {
    getUserTheme()
        .then((theme) => {
            layout(PageComponent, {
                hideAppBar: true,
                theme,
            });
        })
        .catch((e) => {
            const errorEl = document.createElement('span');
            errorEl.innerHTML = `<div style="color: red; padding: 20px;">Failed to load theme: ${e}</div>`;
            document.body.appendChild(errorEl);
        });
}
