#!/usr/bin/env python3
"""Add legacy_statuses field after each legacy_urls line in products.conf."""

import os

CONF_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'packages', 'splunk-cisco-app-navigator', 'src', 'main',
    'resources', 'splunk', 'default', 'products.conf'
)

# Map of 1-based line numbers (legacy_urls line) to the legacy_statuses value
INSERTIONS = {
    185: 'legacy_statuses = archived,archived',
    227: 'legacy_statuses = archived',
    430: 'legacy_statuses = archived,archived,archived',
    467: 'legacy_statuses = archived,archived',
    512: 'legacy_statuses = archived,active,active,active,active,archived,archived,archived,archived,archived,archived,archived,archived',
    569: 'legacy_statuses = archived,archived',
    610: 'legacy_statuses = archived,archived,archived',
    805: 'legacy_statuses = archived',
    899: 'legacy_statuses = archived',
    979: 'legacy_statuses = archived',
    1072: 'legacy_statuses = archived,archived,archived,archived',
    1121: 'legacy_statuses = archived',
    1210: 'legacy_statuses = active,active,archived,archived,archived',
    1277: 'legacy_statuses = active,archived,archived',
    1322: 'legacy_statuses = archived,archived',
    1369: 'legacy_statuses = active,active,active',
    1414: 'legacy_statuses = active,active,archived,active,active',
    1470: 'legacy_statuses = active,active,active',
    1534: 'legacy_statuses = active,active,active',
    1588: 'legacy_statuses = active,active,active,active,active',
    1632: 'legacy_statuses = active,active',
    1744: 'legacy_statuses = active,active,active',
    1788: 'legacy_statuses = active,active,active',
    1831: 'legacy_statuses = active,active,active',
    1874: 'legacy_statuses = active,active,active',
    1927: 'legacy_statuses = active,active,active',
    1971: 'legacy_statuses = active,active,active',
    2022: 'legacy_statuses = archived,archived,archived,archived,archived,archived,archived',
    2139: 'legacy_statuses = active,archived',
    2502: 'legacy_statuses = archived,archived',
}


def main():
    with open(CONF_PATH, 'r') as f:
        lines = f.readlines()

    print(f'Read {len(lines)} lines from products.conf')

    # Verify each target line contains 'legacy_urls'
    for line_num in sorted(INSERTIONS.keys()):
        idx = line_num - 1  # 0-based
        if 'legacy_urls' not in lines[idx]:
            print(f'ERROR: Line {line_num} does not contain legacy_urls: {lines[idx].strip()!r}')
            return

    # Insert from bottom to top to preserve line numbers
    for line_num in sorted(INSERTIONS.keys(), reverse=True):
        idx = line_num  # insert AFTER the legacy_urls line
        lines.insert(idx, INSERTIONS[line_num] + '\n')

    with open(CONF_PATH, 'w') as f:
        f.writelines(lines)

    print(f'Successfully inserted {len(INSERTIONS)} legacy_statuses lines')
    print(f'New total: {len(lines)} lines')


if __name__ == '__main__':
    main()
