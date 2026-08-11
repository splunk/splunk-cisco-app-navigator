/* eslint-disable import/no-extraneous-dependencies, react/prop-types */
/* global SCAN_APP_VERSION, SCAN_BUILD_HASH */
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { SplunkThemeProvider } from '@splunk/themes';
import { createURL } from '@splunk/splunk-utils/url';
import ArrowSquareTopRight from '@splunk/react-icons/ArrowSquareTopRight';
import BookOpen from '@splunk/react-icons/BookOpen';
import CheckCircle from '@splunk/react-icons/CheckCircle';
import Clipboard from '@splunk/react-icons/Clipboard';
import CloudArrowDown from '@splunk/react-icons/CloudArrowDown';
import Cog from '@splunk/react-icons/Cog';
import CylinderMagnifier from '@splunk/react-icons/CylinderMagnifier';
import House from '@splunk/react-icons/House';
import InformationCircle from '@splunk/react-icons/InformationCircle';
import Layout from '@splunk/react-icons/Layout';
import Magnifier from '@splunk/react-icons/Magnifier';
import Palette from '@splunk/react-icons/Palette';
import Printer from '@splunk/react-icons/Printer';
import QuestionCircle from '@splunk/react-icons/QuestionCircle';
import Shield from '@splunk/react-icons/Shield';
import Wrench from '@splunk/react-icons/Wrench';

import { PRODUCT_CATALOG } from '../products/productCatalog.generated';

const APP_ID = 'splunk-cisco-app-navigator';
const THEME_STORAGE_KEY = 'scan_theme_preference';
const SEARCHABLE_SELECTOR = 'h2, h3, h4, p, li, td, th';
const SUPPORTED_LEVELS = new Set(['cisco_supported', 'splunk_supported']);
const BUILD_VERSION = typeof SCAN_APP_VERSION !== 'undefined' ? SCAN_APP_VERSION : '';
const BUILD_HASH = typeof SCAN_BUILD_HASH !== 'undefined' ? SCAN_BUILD_HASH : '';

const GUIDE_GROUPS = [
    {
        label: 'Start',
        sections: [
            { id: 'overview', label: 'Overview' },
            { id: 'first-run', label: 'First-run checklist' },
            { id: 'catalog', label: 'Catalog structure' },
        ],
    },
    {
        label: 'Explore',
        sections: [
            { id: 'find-products', label: 'Find products' },
            { id: 'product-cards', label: 'Read product cards' },
            { id: 'actions', label: 'Install, launch, and inspect' },
            { id: 'intelligence', label: 'Intelligence panels' },
        ],
    },
    {
        label: 'Personalize',
        sections: [
            { id: 'workspace', label: 'Workspace and preferences' },
            { id: 'custom-products', label: 'Custom products' },
        ],
    },
    {
        label: 'Operate',
        sections: [
            { id: 'ecosystem', label: 'Ecosystem intelligence' },
            { id: 'catalog-sync', label: 'Catalog sync and reports' },
            { id: 'deployment', label: 'Deployment and Splunk Cloud' },
        ],
    },
    {
        label: 'Support',
        sections: [
            { id: 'troubleshooting', label: 'Troubleshooting' },
            { id: 'configuration', label: 'Configuration reference' },
        ],
    },
];

const GUIDE_SECTIONS = GUIDE_GROUPS.flatMap((group) =>
    group.sections.map((section) => ({ ...section, group: group.label }))
);

const SECTION_ICONS = {
    overview: House,
    'first-run': CheckCircle,
    catalog: Layout,
    'find-products': Magnifier,
    'product-cards': InformationCircle,
    actions: CloudArrowDown,
    intelligence: Shield,
    workspace: Palette,
    'custom-products': Clipboard,
    ecosystem: CylinderMagnifier,
    'catalog-sync': Cog,
    deployment: BookOpen,
    troubleshooting: Wrench,
    configuration: QuestionCircle,
};

const statusRows = [
    ['Installed', 'The expected add-on or app is enabled on the search head.'],
    ['Update available', 'Splunkbase metadata reports a newer version than the detected app.'],
    ['Data detected', 'One or more expected sourcetypes have recent events in the searchable window.'],
    ['No recent data', 'SCAN found no matching events; confirm time, indexes, permissions, and parsing.'],
    ['Version mismatch', 'Different app versions were detected across relevant Splunk tiers.'],
    ['Missing on tier', 'An add-on may be absent where index-time configuration is expected.'],
    ['Legacy app', 'A deprecated or replaced integration is installed and should be reviewed.'],
];

const intelligenceRows = [
    ['SC4S', 'Syslog collection guidance and product-specific Splunk Connect for Syslog links.'],
    ['NetFlow', 'Flow collection architecture, required packages, and product-specific notes.'],
    ['SOAR', 'Available Splunk SOAR connectors and their Splunkbase references.'],
    ['ITOps', 'ITSI Content Packs and IT Essentials Learn material associated with the product.'],
    ['SecOps', 'CIM, Enterprise Security, ESCU, and security-content alignment.'],
    ['Alert Actions', 'Companion alert-action apps that extend response workflows.'],
    ['AI-powered', 'Cataloged machine-learning or AI capabilities in the integration story.'],
];

const troubleshootingRows = [
    ['Cards do not load', 'Hard-refresh the browser, then inspect the console for fresh JavaScript or REST errors.'],
    ['Data is not detected', 'Confirm the sourcetype exists in an index the current role can search and has events in the last seven days.'],
    ['App shows Not installed', 'Verify that the expected app is installed and enabled on the search head serving this session.'],
    ['Indexer tier shows Missing', 'Check the deployment server or cluster-manager workflow used to place index-time configuration on indexers.'],
    ['Compatibility filters are empty', 'Run Sync Catalog, then confirm the scheduled search and scan_splunkbase_apps lookup are readable.'],
    ['Custom product cannot be saved', 'Confirm the role can write the app configuration through the conf-products REST endpoint.'],
    ['Magic Eight audit fails', 'Check indexer-peer reachability and retry after any peer or cluster health issue is resolved.'],
];

const configurationRows = [
    ['default/products.conf', 'Shipped product catalog. Do not edit it for local customization.'],
    ['local/products.conf', 'Custom product cards and administrator overrides.'],
    ['README/products.conf.spec', 'Field-level reference for every supported catalog key.'],
    ['default/savedsearches.conf', 'Catalog analytics, health reports, and the scheduled sync job.'],
    ['lookups/scan_splunkbase_apps.csv.gz', 'Local Splunkbase metadata used for compatibility and version intelligence.'],
    ['default/data/ui/nav/default.xml', 'App navigation, including this User Guide view.'],
];

function getSplunkLocale() {
    if (typeof window === 'undefined') {return 'en-US';}
    const match = window.location.pathname.match(/^\/([a-z]{2}-[A-Z]{2})\//);
    return match ? match[1] : 'en-US';
}

function appUrl(view) {
    return `/${getSplunkLocale()}/app/${APP_ID}/${view}`;
}

function managerUrl(page) {
    return `/${getSplunkLocale()}/manager/${APP_ID}/${page}`;
}

function searchUrl(search) {
    return `${appUrl('search')}?q=${encodeURIComponent(search)}`;
}

function sectionNumber(id) {
    return GUIDE_SECTIONS.findIndex((section) => section.id === id) + 1;
}

function headingSlug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'heading';
}

function getStoredTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
    } catch (_error) {
        return 'auto';
    }
}

function saveStoredTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_error) {
        // Keep the in-memory preference when browser storage is unavailable.
    }
}

function detectDarkThemeFromDom() {
    const html = document.documentElement;
    const {body} = document;
    const htmlTheme = html.getAttribute('data-theme');
    const bodyTheme = body?.getAttribute('data-theme');
    if (htmlTheme === 'dark' || bodyTheme === 'dark') {return true;}
    if (htmlTheme === 'light' || bodyTheme === 'light') {return false;}
    if (html.classList.contains('theme-dark')) {return true;}
    if (body?.classList?.contains('dark') || body?.classList?.contains('theme-dark')) {return true;}
    return null;
}

function GuideAction({ href, children }) {
    return (
        <a
            className="scan-guide-action"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
        >
            {children}
            <ArrowSquareTopRight size="15px" />
        </a>
    );
}

function InfoCard({ title, children, tone = 'neutral' }) {
    return (
        <div className={`scan-guide-info-card scan-guide-info-card-${tone}`}>
            <h3>{title}</h3>
            <div>{children}</div>
        </div>
    );
}

function DataTable({ columns, rows }) {
    return (
        <div className="scan-guide-table-wrap">
            <table className="scan-guide-table">
                <thead>
                    <tr>
                        {columns.map((column) => <th key={column}>{column}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row[0]}>
                            {row.map((cell, index) => (
                                <td key={`${row[0]}-${columns[index]}`}>
                                    {index === 0 ? <strong>{cell}</strong> : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GuideSection({ id, title, kicker, children }) {
    const Icon = SECTION_ICONS[id] || BookOpen;
    return (
        <section id={id} data-guide-section={id} className="scan-guide-section-card">
            <header className="scan-guide-section-header">
                <span className="scan-guide-section-icon" aria-hidden="true">
                    <Icon size="20px" />
                </span>
                <span>
                    <span className="scan-guide-section-number">
                        {`Section ${sectionNumber(id)}`}
                    </span>
                    <h2>{title}</h2>
                    {kicker && <p>{kicker}</p>}
                </span>
            </header>
            <div className="scan-guide-section-body">{children}</div>
        </section>
    );
}

function GuideContents({
    activeSection,
    clearSearch,
    currentSearchIndex,
    goToSection,
    nextSearchMatch,
    searchMatches,
    searchQuery,
    searchStatus,
    setSearchQuery,
}) {
    return (
        <nav className="scan-guide-toc scan-guide-no-print" aria-label="User guide contents">
            <div className="scan-guide-toc-header">
                <span>User guide</span>
                <strong>Contents</strong>
            </div>
            <div className="scan-guide-search">
                <span id="scan-guide-search-label" className="scan-guide-search-label">
                    Search this guide
                </span>
                <div className="scan-guide-search-field">
                    <Magnifier size="16px" aria-hidden="true" />
                    <input
                        id="scan-guide-search"
                        type="search"
                        aria-labelledby="scan-guide-search-label"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                nextSearchMatch();
                            }
                        }}
                        placeholder="Search guide"
                    />
                </div>
                <div className="scan-guide-search-actions">
                    <span aria-live="polite">
                        {searchStatus}
                        {searchMatches > 0 && ` ${currentSearchIndex + 1}/${searchMatches}`}
                    </span>
                    <button type="button" disabled={searchMatches < 2} onClick={nextSearchMatch}>
                        Next
                    </button>
                    <button type="button" disabled={!searchQuery} onClick={clearSearch}>
                        Clear
                    </button>
                </div>
            </div>
            <ol className="scan-guide-toc-list">
                {GUIDE_GROUPS.map((group) => (
                    <React.Fragment key={group.label}>
                        <li className="scan-guide-toc-group">{group.label}</li>
                        {group.sections.map((section) => {
                            const active = activeSection === section.id;
                            return (
                                <li
                                    key={section.id}
                                    className={active ? 'scan-guide-toc-item-active' : ''}
                                >
                                    <button
                                        type="button"
                                        aria-current={active ? 'location' : undefined}
                                        onClick={() => goToSection(section.id)}
                                    >
                                        <span>{sectionNumber(section.id)}</span>
                                        {section.label}
                                    </button>
                                </li>
                            );
                        })}
                    </React.Fragment>
                ))}
            </ol>
            <div className="scan-guide-toc-footer">
                <a href={appUrl('products')}>Open Cisco Products</a>
                <a href={appUrl('ecosystem_intelligence')}>Open Ecosystem Intelligence</a>
            </div>
        </nav>
    );
}

function PageContents({ activeHeading, activeSection, entries, goToHeading }) {
    return (
        <aside className="scan-guide-page-toc scan-guide-no-print" aria-label="On this page">
            <span>This section</span>
            <strong>On this page</strong>
            <ol>
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        className={activeHeading === entry.id ? 'scan-guide-page-toc-active' : ''}
                    >
                        <button type="button" onClick={() => goToHeading(entry.id)}>
                            {entry.label}
                        </button>
                    </li>
                ))}
            </ol>
            <div>
                {`Section ${sectionNumber(activeSection)} of ${GUIDE_SECTIONS.length}`}
            </div>
        </aside>
    );
}

function UserGuideContent() {
    const [themePreference, setThemePreference] = useState(getStoredTheme);
    const [splunkDark, setSplunkDark] = useState(false);
    const [appVersion, setAppVersion] = useState(BUILD_VERSION);
    const [appBuild, setAppBuild] = useState(BUILD_HASH);
    const [activeSection, setActiveSection] = useState(GUIDE_SECTIONS[0].id);
    const [activeHeading, setActiveHeading] = useState(GUIDE_SECTIONS[0].id);
    const [pageTocBySection, setPageTocBySection] = useState(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const [searchStatus, setSearchStatus] = useState('');
    const [searchMatches, setSearchMatches] = useState(0);
    const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
    const guideContentRef = useRef(null);
    const matchesRef = useRef([]);
    const currentSearchIndexRef = useRef(-1);

    const catalogStats = useMemo(() => {
        const catalogProducts = PRODUCT_CATALOG.filter((product) =>
            ['security', 'networking', 'observability', 'collaboration'].includes(product.category)
        );
        const visibleProducts = catalogProducts.filter((product) => !product.catalog_disabled);
        const supportedProducts = visibleProducts.filter((product) =>
            SUPPORTED_LEVELS.has(product.support_level)
        );
        const sourcetypes = new Set();
        catalogProducts.forEach((product) => {
            (product.sourcetypes || []).forEach((sourcetype) => sourcetypes.add(sourcetype));
        });
        return {
            total: catalogProducts.length,
            supported: supportedProducts.length,
            sourcetypes: sourcetypes.size,
        };
    }, []);

    const resolvedTheme = themePreference === 'dark'
        || (themePreference === 'auto' && splunkDark)
        ? 'dark'
        : 'light';

    const smoothScrollBehavior = useCallback(() => (
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    ), []);

    useEffect(() => {
        let cancelled = false;
        const updateFromDom = () => {
            const detected = detectDarkThemeFromDom();
            if (!cancelled && detected !== null) {setSplunkDark(detected);}
        };
        updateFromDom();

        fetch(createURL('/splunkd/__raw/servicesNS/-/-/data/user-prefs/general?output_mode=json'), {
            credentials: 'include',
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                const theme = data?.entry?.[0]?.content?.theme;
                if (!cancelled && theme) {setSplunkDark(theme === 'dark');}
            })
            .catch(() => {});

        const observer = new MutationObserver(updateFromDom);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'class'],
        });
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['data-theme', 'class'],
            });
        }
        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(createURL(`/splunkd/__raw/services/apps/local/${APP_ID}?output_mode=json`), {
            credentials: 'include',
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (cancelled || !data?.entry?.[0]?.content) {return;}
                const {content} = data.entry[0];
                if (content.version) {setAppVersion(content.version);}
                if (content.build) {setAppBuild(String(content.build));}
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        document.title = `Splunk Cisco App Navigator User Guide${appVersion ? ` ${appVersion}` : ''}`;
    }, [appVersion]);

    const cycleTheme = useCallback(() => {
        setThemePreference((current) => {
            let next = 'auto';
            if (current === 'auto') {
                next = 'light';
            } else if (current === 'light') {
                next = 'dark';
            }
            saveStoredTheme(next);
            return next;
        });
    }, []);

    const clearSearchClasses = useCallback(() => {
        matchesRef.current.forEach((node) => {
            node.classList.remove('scan-guide-search-match', 'scan-guide-search-current');
        });
        matchesRef.current = [];
        currentSearchIndexRef.current = -1;
        setSearchMatches(0);
        setCurrentSearchIndex(-1);
    }, []);

    const showSearchMatch = useCallback((index, shouldScroll = true) => {
        const matches = matchesRef.current;
        if (!matches.length) {
            setSearchStatus(searchQuery.trim() ? 'No matches' : '');
            return;
        }
        const previous = matches[currentSearchIndexRef.current];
        previous?.classList.remove('scan-guide-search-current');
        const nextIndex = (index + matches.length) % matches.length;
        const match = matches[nextIndex];
        currentSearchIndexRef.current = nextIndex;
        match.classList.add('scan-guide-search-current');
        setCurrentSearchIndex(nextIndex);
        setSearchStatus(`${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`);
        const section = match.closest('[data-guide-section]');
        if (section?.dataset?.guideSection) {setActiveSection(section.dataset.guideSection);}
        const nextActiveHeading = match.closest('h3[id], h4[id]')?.id || section?.id;
        if (nextActiveHeading) {setActiveHeading(nextActiveHeading);}
        if (shouldScroll) {
            match.scrollIntoView({ behavior: smoothScrollBehavior(), block: 'center' });
        }
    }, [searchQuery, smoothScrollBehavior]);

    const runSearch = useCallback((query) => {
        clearSearchClasses();
        const normalized = query.trim().toLowerCase();
        if (!normalized || !guideContentRef.current) {
            setSearchStatus('');
            return;
        }
        const matches = Array.from(
            guideContentRef.current.querySelectorAll(SEARCHABLE_SELECTOR)
        ).filter((node) => node.textContent?.toLowerCase().includes(normalized));
        matches.forEach((node) => node.classList.add('scan-guide-search-match'));
        matchesRef.current = matches;
        setSearchMatches(matches.length);
        if (matches.length) {showSearchMatch(0);}
        else {setSearchStatus('No matches');}
    }, [clearSearchClasses, showSearchMatch]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchStatus('');
        clearSearchClasses();
    }, [clearSearchClasses]);

    const nextSearchMatch = useCallback(() => {
        if (!matchesRef.current.length) {runSearch(searchQuery);}
        else {showSearchMatch(currentSearchIndexRef.current + 1);}
    }, [runSearch, searchQuery, showSearchMatch]);

    const goToSection = useCallback((id) => {
        const section = document.getElementById(id);
        if (!section) {return;}
        setActiveSection(id);
        setActiveHeading(id);
        section.scrollIntoView({ behavior: smoothScrollBehavior(), block: 'start' });
        window.history.replaceState(null, '', `#${id}`);
    }, [smoothScrollBehavior]);

    const goToHeading = useCallback((id) => {
        const heading = document.getElementById(id);
        if (!heading) {return;}
        const section = heading.closest('[data-guide-section]');
        if (section?.dataset?.guideSection) {setActiveSection(section.dataset.guideSection);}
        setActiveHeading(id);
        heading.scrollIntoView({ behavior: smoothScrollBehavior(), block: 'start' });
        window.history.replaceState(null, '', `#${id}`);
    }, [smoothScrollBehavior]);

    const exportPdf = useCallback(() => {
        const previousTitle = document.title;
        const cleanup = () => {
            document.body.classList.remove('scan-guide-printing');
            document.title = previousTitle;
            window.removeEventListener('afterprint', cleanup);
        };
        document.body.classList.add('scan-guide-printing');
        document.title = `Splunk Cisco App Navigator User Guide${appVersion ? ` ${appVersion}` : ''}`;
        window.addEventListener('afterprint', cleanup);
        window.setTimeout(() => {
            window.print();
            cleanup();
        }, 50);
    }, [appVersion]);

    useEffect(() => {
        const timer = window.setTimeout(() => runSearch(searchQuery), 160);
        return () => window.clearTimeout(timer);
    }, [runSearch, searchQuery]);

    useEffect(() => () => clearSearchClasses(), [clearSearchClasses]);

    useEffect(() => {
        const toc = new Map();
        GUIDE_SECTIONS.forEach((sectionDefinition) => {
            const section = document.getElementById(sectionDefinition.id);
            if (!section) {return;}
            const entries = [{
                id: sectionDefinition.id,
                label: section.querySelector('h2')?.textContent?.trim() || sectionDefinition.label,
            }];
            const seen = new Set();
            section.querySelectorAll('h3, h4').forEach((heading) => {
                const label = heading.textContent?.trim();
                if (!label) {return;}
                const base = `${sectionDefinition.id}-${headingSlug(label)}`;
                let id = base;
                let suffix = 2;
                while (seen.has(id) || (document.getElementById(id) && heading.id !== id)) {
                    id = `${base}-${suffix}`;
                    suffix += 1;
                }
                seen.add(id);
                heading.setAttribute('id', id);
                heading.setAttribute('data-guide-page-heading', 'true');
                entries.push({ id, label });
            });
            toc.set(sectionDefinition.id, entries);
        });
        setPageTocBySection(toc);

        const hash = window.location.hash.replace(/^#/, '');
        if (hash && document.getElementById(hash)) {
            window.requestAnimationFrame(() => goToHeading(hash));
        }
    }, [goToHeading]);

    useEffect(() => {
        const root = document.getElementById('scan-root');
        const sections = GUIDE_SECTIONS
            .map((section) => document.getElementById(section.id))
            .filter(Boolean);
        let frame = 0;
        const updateActive = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const rootTop = root?.getBoundingClientRect().top || 0;
                const threshold = rootTop + 120;
                const active = [...sections].reverse().find((section) =>
                    section.getBoundingClientRect().top <= threshold
                ) || sections[0];
                if (!active) {return;}
                setActiveSection(active.id);
                const headings = [active, ...active.querySelectorAll('[data-guide-page-heading]')];
                const visible = [...headings].reverse().find((heading) =>
                    heading.getBoundingClientRect().top <= threshold
                ) || active;
                setActiveHeading(visible.id);
            });
        };
        updateActive();
        root?.addEventListener('scroll', updateActive, { passive: true });
        window.addEventListener('resize', updateActive);
        return () => {
            window.cancelAnimationFrame(frame);
            root?.removeEventListener('scroll', updateActive);
            window.removeEventListener('resize', updateActive);
        };
    }, []);

    const themeLabel = themePreference[0].toUpperCase() + themePreference.slice(1);

    return (
        <SplunkThemeProvider
            family="prisma"
            colorScheme={resolvedTheme}
            density="comfortable"
        >
            <main className="scan-user-guide" data-theme={resolvedTheme}>
                <div className="scan-guide-layout">
                    <GuideContents
                        activeSection={activeSection}
                        clearSearch={clearSearch}
                        currentSearchIndex={currentSearchIndex}
                        goToSection={goToSection}
                        nextSearchMatch={nextSearchMatch}
                        searchMatches={searchMatches}
                        searchQuery={searchQuery}
                        searchStatus={searchStatus}
                        setSearchQuery={setSearchQuery}
                    />

                    <article className="scan-guide-document">
                        <header className="scan-guide-hero">
                            <div className="scan-guide-hero-topline">
                                <span>
                                    <BookOpen size="16px" />
                                    {' '}
                                    User guide
                                </span>
                                <div className="scan-guide-hero-controls scan-guide-no-print">
                                    <button
                                        type="button"
                                        onClick={cycleTheme}
                                        title="Cycle Auto, Light, and Dark guide themes"
                                    >
                                        <Palette size="16px" />
                                        {' '}
                                        {`Theme: ${themeLabel}`}
                                    </button>
                                    <button type="button" onClick={exportPdf}>
                                        <Printer size="16px" />
                                        {' '}
                                        Print / save PDF
                                    </button>
                                </div>
                            </div>
                            <h1>Splunk Cisco App Navigator</h1>
                            <p>
                                Discover Cisco integrations, understand deployment requirements,
                                validate data flow, and operate the Cisco–Splunk ecosystem from one
                                task-focused workspace.
                            </p>
                            <div className="scan-guide-metadata">
                                <span>
                                    <strong>Version</strong>
                                    {' '}
                                    {appVersion || 'Current build'}
                                </span>
                                {appBuild && (
                                <span>
                                    <strong>Build</strong>
                                    {' '}
                                    {appBuild}
                                </span>
)}
                                <span>
                                    <strong>Catalog</strong>
                                    {' '}
                                    {catalogStats.total}
                                    {' '}
                                    entries
                                </span>
                            </div>
                            <div className="scan-guide-actions scan-guide-no-print">
                                <GuideAction href={appUrl('products')}>
                                    <Layout size="15px" />
                                    {' '}
                                    Open Cisco Products
                                </GuideAction>
                                <GuideAction href={appUrl('ecosystem_intelligence')}>
                                    <CylinderMagnifier size="15px" />
                                    {' '}
                                    Open Ecosystem Intelligence
                                </GuideAction>
                            </div>
                        </header>

                        <div ref={guideContentRef} className="scan-guide-content">
                            <GuideSection
                                id="overview"
                                title="What SCAN provides"
                                kicker="A front door for discovering, deploying, and managing Cisco integrations for Splunk."
                            >
                                <div className="scan-guide-card-grid scan-guide-card-grid-three">
                                    <InfoCard title="Discover">
                                        Browse Cisco products with their required add-ons, visualization
                                        apps, sourcetypes, support level, and documentation in one catalog.
                                    </InfoCard>
                                    <InfoCard title="Deploy">
                                        See installation state, tier placement, prerequisites, compatibility,
                                        upgrade availability, and product-specific collection guidance.
                                    </InfoCard>
                                    <InfoCard title="Operate">
                                        Detect recent data, review ecosystem health, audit parsing practices,
                                        synchronize catalog intelligence, and open analytical reports.
                                    </InfoCard>
                                </div>
                                <div className="scan-guide-stat-grid">
                                    <div>
                                        <strong>{catalogStats.total}</strong>
                                        <span>catalog entries</span>
                                    </div>
                                    <div>
                                        <strong>{catalogStats.supported}</strong>
                                        <span>Cisco- or Splunk-supported</span>
                                    </div>
                                    <div>
                                        <strong>{catalogStats.sourcetypes}</strong>
                                        <span>known sourcetypes</span>
                                    </div>
                                    <div>
                                        <strong>4</strong>
                                        <span>portfolio categories</span>
                                    </div>
                                </div>
                                <p className="scan-guide-note">
                                    Counts above come from the catalog bundled with this build, so they stay
                                    aligned as product metadata changes.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="first-run"
                                title="First-run checklist"
                                kicker="Start with a supported deployment, choose a working set, and validate what SCAN can observe."
                            >
                                <h3>Install in the right place</h3>
                                <p>
                                    Install SCAN on a search head. For a search head cluster, use the
                                    organization&apos;s deployer workflow so every member receives the same app.
                                    SCAN supports Splunk Enterprise and Splunk Cloud, subject to the role and
                                    platform limitations described later in this guide.
                                </p>
                                <ol className="scan-guide-steps">
                                    <li>
                                        <span>1</span>
                                        <div>
                                            <strong>Open Cisco Products.</strong>
                                            {' '}
                                            It is the default app view and loads the product catalog plus environment intelligence.
                                        </div>
                                    </li>
                                    <li>
                                        <span>2</span>
                                        <div>
                                            <strong>Choose a role.</strong>
                                            {' '}
                                            Security, networking, collaboration, observability, and explorer presets provide a useful starting filter and suggested products.
                                        </div>
                                    </li>
                                    <li>
                                        <span>3</span>
                                        <div>
                                            <strong>Review detected products.</strong>
                                            {' '}
                                            Treat data detection as evidence of recent searchable events, not proof that every deployment requirement is complete.
                                        </div>
                                    </li>
                                    <li>
                                        <span>4</span>
                                        <div>
                                            <strong>Add your working set.</strong>
                                            {' '}
                                            Pin the products your team operates so they remain in Configured Products for this browser profile.
                                        </div>
                                    </li>
                                    <li>
                                        <span>5</span>
                                        <div>
                                            <strong>Inspect deployment details.</strong>
                                            {' '}
                                            Review add-on versions, tier placement, sourcetypes, prerequisites, and product-specific guidance before installing or changing anything.
                                        </div>
                                    </li>
                                </ol>
                                <div className="scan-guide-callout scan-guide-callout-info">
                                    <InformationCircle size="18px" />
                                    <span>Role, configured-product, filter, panel, and theme choices are browser-local preferences. They do not install or remove Splunk apps.</span>
                                </div>
                            </GuideSection>

                            <GuideSection
                                id="catalog"
                                title="How the catalog is organized"
                                kicker="Sections separate your working set, observed data, deployable integrations, and special lifecycle states."
                            >
                                <DataTable
                                    columns={['Section', 'Purpose']}
                                    rows={[
                                        ['Configured Products', 'Products explicitly added to the current browser workspace.'],
                                        ['Data Detected', 'Unconfigured products whose expected sourcetypes have recent searchable events.'],
                                        ['Available Products', 'Supported integrations that are not configured and have not been auto-detected.'],
                                        ['Custom Products', 'Administrator-created cards stored in local/products.conf.'],
                                        ['Deprecated Products', 'Integrations being replaced or sunset; enable them from Filters when needed.'],
                                        ['Retired Products', 'End-of-life product context; hidden by default.'],
                                        ['Catalog Vault', 'Disabled or archived catalog records exposed only when the visibility control is enabled.'],
                                    ]}
                                />
                                <h3>Section controls</h3>
                                <p>
                                    Expand or collapse one section from its header. Use Expand All or Collapse
                                    All in the utility strip to change every visible section at once. Panel
                                    state is restored from browser storage on the next visit.
                                </p>
                                <p className="scan-guide-note">
                                    Internal roadmap and integration-gap sections are intentionally hidden in
                                    standard user mode.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="find-products"
                                title="Find and filter products"
                                kicker="Combine broad search with category, compatibility, support, capability, and add-on filters."
                            >
                                <div className="scan-guide-card-grid scan-guide-card-grid-two">
                                    <InfoCard title="Search">
                                        Match product names, aliases, descriptions, keywords, add-on names,
                                        and sourcetypes. Search is useful for both product terms such as ISE
                                        and technical terms such as
                                        {' '}
                                        <code>cisco:asa</code>
                                        .
                                    </InfoCard>
                                    <InfoCard title="Categories and subcategories">
                                        Start with Security, Networking, Observability, or Collaboration,
                                        then use the contextual subcategory pills to narrow the current domain.
                                    </InfoCard>
                                    <InfoCard title="Filters drawer">
                                        Filter by operational capability, support level, lifecycle visibility,
                                        Splunk platform, Splunk version, or the add-on that powers the product.
                                    </InfoCard>
                                    <InfoCard title="Include or exclude">
                                        Platform and version filters can include compatible products or invert
                                        the question to expose compatibility gaps for upgrade planning.
                                    </InfoCard>
                                </div>
                                <h3>Capability filters</h3>
                                <p>
                                    Capability filters mirror card intelligence: SOAR, Alert Actions, Secure
                                    Networking, SecOps, ITOps, SC4S, and NetFlow. Active filters appear as
                                    removable chips so the current result set remains explainable.
                                </p>
                                <h3>Supported only and full portfolio</h3>
                                <p>
                                    Supported Only keeps the default experience focused on Cisco- and
                                    Splunk-supported integrations. All Products broadens the catalog for
                                    research and planning; support labels still identify the ownership model.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="product-cards"
                                title="Read a product card"
                                kicker="Each card combines catalog facts with the environment evidence SCAN can safely observe."
                            >
                                <DataTable columns={['State', 'Meaning']} rows={statusRows} />
                                <h3>Data detection</h3>
                                <p>
                                    SCAN checks expected sourcetypes for recent events, using a seven-day
                                    observation window. Green means evidence was found. A warning means no
                                    matching event was found and should be investigated against index access,
                                    time range, input configuration, and source typing.
                                </p>
                                <div className="scan-guide-callout scan-guide-callout-warning">
                                    <InformationCircle size="18px" />
                                    <span>No recent data is not automatically a failure. Quiet systems, labs, role restrictions, and alternate sourcetype names can all produce the same observation.</span>
                                </div>
                                <h3>Deployment tiers</h3>
                                <p>
                                    Deployment details distinguish search-head, indexer, and heavy-forwarder
                                    context where the platform exposes it. Tier chips help identify missing,
                                    disabled, or mismatched components that may affect parsing or index-time
                                    behavior.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="actions"
                                title="Install, launch, and inspect"
                                kicker="Actions are contextual: SCAN links to the right next step but does not silently deploy third-party apps."
                            >
                                <div className="scan-guide-card-grid scan-guide-card-grid-two">
                                    <InfoCard title="Install or update">
                                        Opens the applicable Splunkbase or configured installation page.
                                        Validate platform compatibility and follow your organization&apos;s app
                                        deployment process before installing.
                                    </InfoCard>
                                    <InfoCard title="Launch or explore">
                                        Launch opens a known dashboard in its owning app. TA-only products use
                                        Explore to open data in Search, create a dashboard, or assign a custom view.
                                    </InfoCard>
                                    <InfoCard title="Details">
                                        Expands the product&apos;s data path, dependencies, tier placement,
                                        sourcetypes, documentation, and troubleshooting references.
                                    </InfoCard>
                                    <InfoCard title="Best Practices">
                                        Opens the Magic Eight props.conf audit and platform-specific collection
                                        guidance for the selected product.
                                    </InfoCard>
                                </div>
                                <h3>Copy a customer-ready summary</h3>
                                <p>
                                    Copy produces a formatted product summary for email, tickets, chat, or a
                                    runbook. It includes the product&apos;s integration components, relevant
                                    sourcetypes, support context, and available documentation links.
                                </p>
                                <div className="scan-guide-actions scan-guide-no-print">
                                    <GuideAction href={searchUrl('| metadata type=sourcetypes | sort - totalCount')}>
                                        <Magnifier size="15px" />
                                        {' '}
                                        Open sourcetype inventory
                                    </GuideAction>
                                </div>
                            </GuideSection>

                            <GuideSection
                                id="intelligence"
                                title="Use intelligence panels"
                                kicker="Badges open focused guidance without overloading the card face."
                            >
                                <DataTable columns={['Badge', 'What it provides']} rows={intelligenceRows} />
                                <h3>Magic Eight parsing audit</h3>
                                <p>
                                    Best Practices evaluates key props.conf settings including line merging,
                                    timestamp parsing, event breaking, truncation, timestamp prefixes and
                                    lookahead, punctuation annotation, and learned sourcetypes. Use it when
                                    onboarding data or diagnosing malformed events.
                                </p>
                                <h3>Interpret badges as guidance</h3>
                                <p>
                                    Badges describe cataloged capabilities and available content. Confirm the
                                    installed versions, data models, permissions, and content-pack requirements
                                    in your own environment before treating a badge as deployment readiness.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="workspace"
                                title="Workspace and preferences"
                                kicker="Personalize the catalog without changing the shared shipped catalog."
                            >
                                <div className="scan-guide-card-grid scan-guide-card-grid-three">
                                    <InfoCard title="Configured Products">
                                        Add or remove cards to maintain a personal working set. This preference
                                        is saved in the current browser profile.
                                    </InfoCard>
                                    <InfoCard title="Role and filters">
                                        Role presets accelerate first use. Category, add-on, support, platform,
                                        version, and visibility filters persist for the browser.
                                    </InfoCard>
                                    <InfoCard title="Panels and theme">
                                        Section expansion state and Light, Dark, or Auto appearance persist as
                                        user preferences and can be changed at any time.
                                    </InfoCard>
                                </div>
                                <h3>Theme behavior</h3>
                                <p>
                                    Auto follows the current Splunk appearance when it is detectable. Light and
                                    Dark override only SCAN&apos;s content surface; they do not rewrite the
                                    Splunk shell&apos;s theme setting.
                                </p>
                                <h3>Resetting a focused view</h3>
                                <p>
                                    Remove active filter chips or use Reset Filters in the drawer. The Role
                                    button can reapply a persona when you want a new starting point.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="custom-products"
                                title="Create and manage custom products"
                                kicker="Represent internal or non-catalog integrations with the same discovery and audit experience."
                            >
                                <ol className="scan-guide-steps">
                                    <li>
                                        <span>1</span>
                                        <div>
                                            <strong>Open Custom Products.</strong>
                                            {' '}
                                            Choose New Custom Card or clone an existing card as a starting point.
                                        </div>
                                    </li>
                                    <li>
                                        <span>2</span>
                                        <div>
                                            <strong>Describe the integration.</strong>
                                            {' '}
                                            Supply a unique product ID, display name, category, description, add-on identity, sourcetypes, and search keywords.
                                        </div>
                                    </li>
                                    <li>
                                        <span>3</span>
                                        <div>
                                            <strong>Add operational metadata.</strong>
                                            {' '}
                                            Include documentation, dashboards, compatibility, or intelligence fields that are known and supportable.
                                        </div>
                                    </li>
                                    <li>
                                        <span>4</span>
                                        <div>
                                            <strong>Save and validate.</strong>
                                            {' '}
                                            Confirm the card participates correctly in search, detection, details, and Best Practices.
                                        </div>
                                    </li>
                                </ol>
                                <h3>Persistence and permissions</h3>
                                <p>
                                    Custom records are stored as app-local configuration in
                                    <code> local/products.conf</code>
                                    . They survive normal app upgrades when the
                                    local directory is preserved. Saving requires a Splunk role that can write
                                    this app&apos;s configuration through REST.
                                </p>
                                <div className="scan-guide-callout scan-guide-callout-warning">
                                    <InformationCircle size="18px" />
                                    <span>Do not edit default/products.conf for customer-specific entries. Shipped defaults can be replaced during an upgrade.</span>
                                </div>
                            </GuideSection>

                            <GuideSection
                                id="ecosystem"
                                title="Use Ecosystem Intelligence"
                                kicker="Move from one-product deployment questions to portfolio health and planning."
                            >
                                <div className="scan-guide-card-grid scan-guide-card-grid-two">
                                    <InfoCard title="Product intelligence">
                                        Analyze catalog coverage, category distribution, sourcetype visibility,
                                        support posture, migration state, and installation readiness.
                                    </InfoCard>
                                    <InfoCard title="Splunkbase and operations">
                                        Review freshness, versions, compatibility, validation, archive state,
                                        and broader Cisco Splunkbase ecosystem signals.
                                    </InfoCard>
                                </div>
                                <h3>Choose the right surface</h3>
                                <p>
                                    Use Cisco Products for a specific integration and its deployment path. Use
                                    Ecosystem Intelligence when the question spans the portfolio, such as
                                    coverage gaps, outdated apps, compliance posture, or leadership reporting.
                                </p>
                                <div className="scan-guide-actions scan-guide-no-print">
                                    <GuideAction href={appUrl('ecosystem_intelligence')}>
                                        <CylinderMagnifier size="15px" />
                                        {' '}
                                        Open Ecosystem Intelligence
                                    </GuideAction>
                                </div>
                            </GuideSection>

                            <GuideSection
                                id="catalog-sync"
                                title="Synchronize catalog intelligence and use reports"
                                kicker="Keep compatibility metadata current and use saved searches for repeatable operational views."
                            >
                                <h3>Sync Catalog</h3>
                                <p>
                                    The Sync Catalog action runs the SCAN - Splunkbase Catalog Sync saved
                                    search. It checks for a compatible products.conf update and refreshes the
                                    local Splunkbase lookup used by version, platform, and ecosystem intelligence.
                                    A scheduled job runs daily; use the button when current data is needed now.
                                </p>
                                <div className="scan-guide-callout scan-guide-callout-info">
                                    <InformationCircle size="18px" />
                                    <span>Synchronization depends on outbound access, saved-search permissions, the custom commands, and write access to the local lookup or catalog target.</span>
                                </div>
                                <h3>Analytics and reports</h3>
                                <p>
                                    The Analytics &amp; Reports navigation groups searches for ecosystem
                                    overview, catalog analysis, migration, deployment readiness, Splunkbase
                                    intelligence, versions and compliance, data coverage, health, and command logs.
                                </p>
                                <div className="scan-guide-actions scan-guide-no-print">
                                    <GuideAction href={appUrl('reports')}>
                                        <Layout size="15px" />
                                        {' '}
                                        Open all reports
                                    </GuideAction>
                                    <GuideAction href={managerUrl('saved/searches')}>
                                        <Cog size="15px" />
                                        {' '}
                                        Manage saved searches
                                    </GuideAction>
                                </div>
                            </GuideSection>

                            <GuideSection
                                id="deployment"
                                title="Deployment and Splunk Cloud considerations"
                                kicker="Understand what SCAN can observe on each platform and where integration components belong."
                            >
                                <DataTable
                                    columns={['Capability', 'Splunk Enterprise', 'Splunk Cloud']}
                                    rows={[
                                        ['Sourcetype detection', 'Supported for indexes the current role can search.', 'Supported for indexes the current role can search.'],
                                        ['Search-head app status', 'Read from the local apps endpoint.', 'Read from the search-head application context.'],
                                        ['Indexer-tier status', 'Available when peer metadata is exposed and permitted.', 'Limited because direct indexer-peer REST visibility is not generally exposed.'],
                                        ['Custom products', 'Written to app-local configuration through REST.', 'Subject to Cloud role, app, and configuration-management policy.'],
                                        ['App deployment', 'Use deployment server, cluster manager, deployer, or local policy.', 'Use supported Cloud app-management and support processes.'],
                                    ]}
                                />
                                <h3>Why tier placement matters</h3>
                                <p>
                                    Add-ons can contain search-time knowledge, index-time event breaking, or
                                    both. A search-head-only installation may leave indexers without required
                                    props.conf or transforms.conf behavior. Follow each add-on&apos;s documented
                                    distributed-deployment model.
                                </p>
                                <h3>Performance</h3>
                                <p>
                                    Page load combines REST reads with bounded searches for data and deployment
                                    evidence. The most infrastructure-sensitive work is sourcetype detection and,
                                    where available, indexer-tier detection. Restrict access to appropriate roles
                                    and investigate slow searches through Job Inspector and the shipped reports.
                                </p>
                            </GuideSection>

                            <GuideSection
                                id="troubleshooting"
                                title="Troubleshoot common issues"
                                kicker="Start with permissions and fresh evidence, then narrow to app state, data, configuration, or synchronization."
                            >
                                <DataTable columns={['Symptom', 'First check']} rows={troubleshootingRows} />
                                <h3>Collect a useful support record</h3>
                                <p>
                                    Record the Splunk version, SCAN version and build, platform type, browser,
                                    affected product, observed state, time range, role, and screenshots. Include
                                    fresh console or search-job errors without copying credentials or tokens.
                                </p>
                                <div className="scan-guide-actions scan-guide-no-print">
                                    <GuideAction href={searchUrl('index=_internal (sourcetype=scan:synclookup:log OR sourcetype=scan:synccatalog:log) | sort 0 - _time')}>
                                        <Wrench size="15px" />
                                        {' '}
                                        Open sync command logs
                                    </GuideAction>
                                </div>
                            </GuideSection>

                            <GuideSection
                                id="configuration"
                                title="Configuration reference"
                                kicker="Use local overrides and documented fields; preserve the shipped default layer."
                            >
                                <DataTable columns={['Path', 'Purpose']} rows={configurationRows} />
                                <h3>Safe customization rule</h3>
                                <p>
                                    Treat
                                    {' '}
                                    <code>default/</code>
                                    {' '}
                                    as vendor-owned and
                                    {' '}
                                    <code>local/</code>
                                    {' '}
                                    as the
                                    customer-owned override layer. Use the Products editor or supported Splunk
                                    configuration workflows so upgrades do not erase local intent.
                                </p>
                                <h3>Need a quick reminder?</h3>
                                <p>
                                    The Guide button on Cisco Products keeps a concise task cheat sheet close to
                                    the workflow. Use this full guide when you need deployment, operations,
                                    troubleshooting, or configuration detail.
                                </p>
                            </GuideSection>
                        </div>
                    </article>

                    <PageContents
                        activeHeading={activeHeading}
                        activeSection={activeSection}
                        entries={pageTocBySection.get(activeSection) || []}
                        goToHeading={goToHeading}
                    />
                </div>
            </main>
        </SplunkThemeProvider>
    );
}

export default UserGuideContent;
