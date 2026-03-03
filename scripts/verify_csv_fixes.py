#!/usr/bin/env python3
"""Verify that all CSV fixes were applied correctly."""
import csv
import os

CSV = os.path.join(os.path.dirname(__file__), '..', 'packages', 'splunk-cisco-app-navigator',
                   'src', 'main', 'resources', 'splunk', 'lookups', 'cisco_apps.csv')

with open(CSV, 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

uid_map = {r['uid']: r for r in rows}

results = []

# Fix 1: uid=4251 product name updated
r = uid_map.get('4251')
if r:
    v = r['Supported_Cisco_Products_Zipped']
    ok = 'Cisco Secure Malware Analytics' in v
    results.append(('Fix1: uid=4251 product name', ok, v[:80]))

# Fix 2: uid=4817 product name (remove "(BST)")
r = uid_map.get('4817')
if r:
    v = r['Supported_Cisco_Products_Zipped']
    ok = '(BST)' not in v and 'Cisco Bug Search Tool' in v
    results.append(('Fix2: uid=4817 product name', ok, v[:80]))

# Fix 3: uid=1903 Replacement field
r = uid_map.get('1903')
if r:
    v = r['Replacement']
    ok = v.strip() == '7404'
    results.append(('Fix3: uid=1903 Replacement=7404', ok, v))

# Fix 4: uid=6657 Cisco_App_Class cleared
r = uid_map.get('6657')
if r:
    v = r['Cisco_App_Class']
    ok = not v.strip()
    results.append(('Fix4: uid=6657 App_Class cleared', ok, repr(v)))

# Fix 5: product mappings
for uid, expected in [('1711', 'Cisco Meraki'), ('7390', 'Cisco WSA'), ('7581', 'Cisco Catalyst Center')]:
    r = uid_map.get(uid)
    if r:
        v = r['Supported_Cisco_Products_Zipped']
        ok = expected in v
        results.append((f'Fix5: uid={uid} mapped to {expected}', ok, v[:80]))

# Fix 6: Umbrella Investigate
for uid in ['3324', '5780']:
    r = uid_map.get(uid)
    if r:
        v = r['Supported_Cisco_Products_Zipped']
        ok = 'Umbrella Investigate' in v
        results.append((f'Fix6: uid={uid} Umbrella Investigate', ok, v[:80]))

# Fix 7: No empty Deprecated fields
empty_dep = [r['uid'] for r in rows if not r['Deprecated'].strip()]
results.append((f'Fix7: empty Deprecated fields ({len(empty_dep)})', len(empty_dep) == 0, str(empty_dep[:5])))

# Fix 8: Archived apps marked Deprecated
check_archived = ['1297', '3472', '1629', '1808', '3504', '3194']
for uid in check_archived:
    r = uid_map.get(uid)
    if r:
        v = r['Deprecated']
        ok = v == 'Yes'
        results.append((f'Fix8: uid={uid} archived→Deprecated', ok, v))

# Fix 9: uid=8413 Meeting Management
r = uid_map.get('8413')
if r:
    v = r['Supported_Cisco_Products_Zipped']
    ok = 'Meeting Management' in v
    results.append((f'Fix9: uid=8413 Meeting Management', ok, v[:80]))

# Print results
print("=" * 60)
print("CSV FIX VERIFICATION REPORT")
print("=" * 60)
passed = 0
failed = 0
for label, ok, detail in results:
    status = "PASS" if ok else "FAIL"
    if ok:
        passed += 1
    else:
        failed += 1
    print(f"  [{status}] {label}")
    if not ok:
        print(f"         Current value: {detail}")

print(f"\nTotal: {passed} passed, {failed} failed out of {passed+failed} checks")
