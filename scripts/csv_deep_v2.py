#!/usr/bin/env python3
"""Deep cross-tabulation for the killer stats slide."""
import csv
from collections import Counter

with open('/Users/akhamis/repo/cisco_control_center_app/cisco_apps.csv', 'r') as f:
    rows = list(csv.DictReader(f))

# Downloads by deprecated-but-live
dep_live = [r for r in rows if r.get('Deprecated','').strip()=='Yes' and r.get('Archive_Status','').strip()=='live']
print("=== DEPRECATED BUT STILL LIVE (zombie apps) ===")
for r in dep_live:
    for k in r:
        if 'download' in k.lower():
            print(f"  {r.get(k,'').strip():>10}  {r.get('App_Name','').strip()}")

# Downloads on Archived=Yes apps (broader than archive_status)
print("\n=== DOWNLOADS ON ARCHIVED=YES APPS ===")
total_archived_dl = 0
for r in rows:
    if r.get('Archived','').strip() == 'Yes':
        for k in r:
            if 'download' in k.lower():
                dl_str = r.get(k,'').strip().replace(',','')
                if dl_str.isdigit():
                    total_archived_dl += int(dl_str)
print(f"Total downloads on Archived=Yes apps: {total_archived_dl:,}")

# Downloads on ALL dead/dying (Archived=Yes OR Deprecated=Yes OR flagged)
print("\n=== DOWNLOADS ON ALL DEAD/DYING/DEPRECATED (union) ===")
total_dead_dl = 0
dead_set = set()
for r in rows:
    if r.get('Archived','').strip()=='Yes' or r.get('Deprecated','').strip()=='Yes' or r.get('Archive_Status','').strip()=='flagged':
        if id(r) not in dead_set:
            dead_set.add(id(r))
            for k in r:
                if 'download' in k.lower():
                    dl_str = r.get(k,'').strip().replace(',','')
                    if dl_str.isdigit():
                        total_dead_dl += int(dl_str)
print(f"Dead/dying/deprecated union count: {len(dead_set)}")
print(f"Total downloads on dead/dying: {total_dead_dl:,}")
print(f"Out of 1,021,093 = {round(total_dead_dl*100/1021093)}%")

# Live but unsupported (ticking time bombs)
print("\n=== LIVE BUT UNSUPPORTED (ticking time bombs) ===")
live_unsup = [r for r in rows if r.get('Archive_Status','').strip()=='live' and r.get('Support','').strip()=='not_supported']
for r in live_unsup:
    for k in r:
        if 'download' in k.lower():
            print(f"  {r.get(k,'').strip():>10}  {r.get('App_Name','').strip()}")
print(f"Count: {len(live_unsup)} apps that are live but NO ONE supports them")

# Replacement mapping with names
print("\n=== REPLACEMENT MAPPING (names) ===")
for r in rows:
    rep = r.get('Replacement','').strip()
    if rep:
        print(f"  {r.get('App_Name','').strip()} -> replaced by Splunkbase ID {rep}")

# Age analysis (oldest apps still live)
from datetime import datetime
print("\n=== AGE OF LIVE APPS ===")
for r in rows:
    if r.get('Archive_Status','').strip() == 'live':
        rd = r.get('Release_Date','').strip()
        name = r.get('App_Name','').strip()
        latest = r.get('Latest_Release_Date','').strip()
        print(f"  Released: {rd}  Latest: {latest}  {name}")
