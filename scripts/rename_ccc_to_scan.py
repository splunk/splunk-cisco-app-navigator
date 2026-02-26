#!/usr/bin/env python3
"""
rename_ccc_to_scan.py
─────────────────────
Renames "Splunk Cisco App Navigator" → "Splunk Cisco App Navigator"
and the abbreviation "SCAN" → "SCAN" across all active source files.

Skips:
  - backup/ folder
  - node_modules/ folder  
  - Folder names (only file contents)
  - CSS hex color #ccc (left as-is)
  - Binary / built files (products.js webpack output)

Run from repo root:
    python3 scripts/rename_ccc_to_scan.py [--dry-run]
"""
import os, re, sys

DRY_RUN = '--dry-run' in sys.argv

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directories to skip entirely
SKIP_DIRS = {'backup', 'node_modules', '.git', '__pycache__'}

# File extensions to process
TEXT_EXTS = {
    '.jsx', '.js', '.css', '.xml', '.html', '.conf', '.spec',
    '.md', '.py', '.json', '.meta', '.txt', '.csv', '.sh',
}

# ── Replacement rules (order matters) ──

REPLACEMENTS = [
    # ── Full name variants ──
    ('Splunk Cisco App Navigator', 'Splunk Cisco App Navigator'),

    # ── DOM / CSS id: scan-root → scan-root ──
    ('scan-root', 'scan-root'),

    # ── CSS class prefixes: ccc- → scan- ──
    ('scan-tooltip-card', 'scan-tooltip-card'),
    ('scan-tooltip-header', 'scan-tooltip-header'),
    ('scan-tooltip-body', 'scan-tooltip-body'),
    ('scan-tooltip-pin', 'scan-tooltip-pin'),
    ('scan-info-pill-icon', 'scan-info-pill-icon'),
    ('scan-info-pill', 'scan-info-pill'),
    ('scan-hero-logo', 'scan-hero-logo'),
    ('scan-feedback-tab-icon', 'scan-feedback-tab-icon'),
    ('scan-feedback-tab-text', 'scan-feedback-tab-text'),
    ('scan-feedback-tab', 'scan-feedback-tab'),

    # ── JS variable / localStorage key prefixes: ccc_ → scan_ ──
    ('scan_configured_products', 'scan_configured_products'),
    ('scan_theme_preference', 'scan_theme_preference'),

    # ── Sourcetype: scan:feedback → scan:feedback ──
    ('scan:feedback', 'scan:feedback'),

    # ── Function / export names ──
    ('SCANProductsPage', 'SCANProductsPage'),

    # ── Log messages ──
    ('Failed to load SCAN data', 'Failed to load SCAN data'),

    # ── Abbreviation "SCAN" in prose/comments (word-boundary) ──
    # These are regex-based replacements (flagged below)
]

# Regex-based replacements for the abbreviation in prose
# These use word boundaries to avoid hitting #ccc (CSS color) or ccc inside words
REGEX_REPLACEMENTS = [
    # "(SCAN)" parenthesized abbreviation → "(SCAN)"
    (re.compile(r'\(SCAN\)'), '(SCAN)'),
    # Standalone SCAN with word boundaries (but NOT preceded by # which is CSS color)
    # Also not matching ccc_ or ccc- or ccc: (already handled above as literal)
    (re.compile(r'(?<!#)(?<![a-zA-Z_\-:])SCAN(?![a-zA-Z_\-:])'), 'SCAN'),
]


def should_process(filepath):
    """Return True if this file should be processed."""
    rel = os.path.relpath(filepath, REPO)
    parts = rel.split(os.sep)
    # Skip excluded directories
    for skip in SKIP_DIRS:
        if skip in parts:
            return False
    # Only process known text extensions
    _, ext = os.path.splitext(filepath)
    return ext in TEXT_EXTS


def process_file(filepath):
    """Apply all replacements to a single file. Returns (changed, count)."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            original = f.read()
    except (UnicodeDecodeError, PermissionError):
        return False, 0

    content = original
    total_count = 0

    # Apply literal replacements
    for old, new in REPLACEMENTS:
        if old in content:
            n = content.count(old)
            content = content.replace(old, new)
            total_count += n

    # Apply regex replacements
    for pattern, repl in REGEX_REPLACEMENTS:
        matches = pattern.findall(content)
        if matches:
            content = pattern.sub(repl, content)
            total_count += len(matches)

    if content != original:
        if not DRY_RUN:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        return True, total_count
    return False, 0


def main():
    if DRY_RUN:
        print("═══ DRY RUN — no files will be modified ═══\n")
    else:
        print("═══ Renaming SCAN → SCAN in active source files ═══\n")

    changed_files = []
    total_replacements = 0

    for dirpath, dirnames, filenames in os.walk(REPO):
        # Prune skipped directories
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in sorted(filenames):
            fpath = os.path.join(dirpath, fname)
            if not should_process(fpath):
                continue
            changed, count = process_file(fpath)
            if changed:
                rel = os.path.relpath(fpath, REPO)
                changed_files.append((rel, count))
                total_replacements += count
                print(f"  {'[DRY] ' if DRY_RUN else ''}✓ {rel} ({count} replacements)")

    print(f"\n{'Would change' if DRY_RUN else 'Changed'} {len(changed_files)} files, "
          f"{total_replacements} total replacements.")

    if not changed_files:
        print("Nothing to do.")


if __name__ == '__main__':
    main()
