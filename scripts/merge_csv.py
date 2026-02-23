#!/usr/bin/env python3
"""Merge export.csv into sheet1.csv.

- Matches rows by Splunkbase_ID.
- For matching rows: updates sheet1 columns that exist in export.
- For new rows in export: appends them to sheet1 with empty values for sheet1-only columns.
- Preserves sheet1's column order and extra columns untouched.
"""
import csv
import os

docs = os.path.expanduser("~/repo/cisco_control_center_app/docs")
export_path = os.path.join(docs, "export.csv")
sheet1_path = os.path.join(docs, "sheet1.csv")

# ---------- helpers ----------
def strip_bom(s):
    return s.lstrip("\ufeff").strip()

def normalize_header(h):
    return strip_bom(h).strip()

# ---------- read export ----------
with open(export_path, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    export_headers = [normalize_header(h) for h in reader.fieldnames]
    # Re-read with normalized headers
    f.seek(0)
    reader = csv.reader(f)
    raw_export_headers = next(reader)  # skip header
    export_rows = {}
    for row in reader:
        d = {}
        for i, val in enumerate(row):
            if i < len(export_headers):
                d[export_headers[i]] = val
        key = d.get("Splunkbase_ID", "").strip()
        if key:
            export_rows[key] = d

print(f"Export: {len(export_rows)} rows, columns: {export_headers}")

# ---------- read sheet1 ----------
with open(sheet1_path, newline="", encoding="utf-8-sig") as f:
    reader = csv.reader(f)
    raw_sheet1_headers = next(reader)
    sheet1_headers = [normalize_header(h) for h in raw_sheet1_headers]
    sheet1_rows = []
    sheet1_keys = set()
    for row in reader:
        d = {}
        for i, val in enumerate(row):
            if i < len(sheet1_headers):
                d[sheet1_headers[i]] = val
        sheet1_rows.append(d)
        key = d.get("Splunkbase_ID", "").strip()
        if key:
            sheet1_keys.add(key)

print(f"Sheet1: {len(sheet1_rows)} rows, columns: {sheet1_headers}")

# ---------- field mapping (export col -> sheet1 col) ----------
# Both files share these exact column names:
shared_fields = []
for ec in export_headers:
    for sc in sheet1_headers:
        if ec == sc:
            shared_fields.append(ec)
            break

print(f"Shared fields for update: {shared_fields}")

# ---------- merge ----------
updated = 0
added = 0

# Update existing sheet1 rows with export data
for row in sheet1_rows:
    key = row.get("Splunkbase_ID", "").strip()
    if key in export_rows:
        exp = export_rows[key]
        for field in shared_fields:
            new_val = exp.get(field, "")
            if new_val:  # only overwrite if export has a non-empty value
                row[field] = new_val
        updated += 1

# Add new rows from export that aren't in sheet1
for key, exp in export_rows.items():
    if key not in sheet1_keys:
        new_row = {h: "" for h in sheet1_headers}
        for field in shared_fields:
            new_row[field] = exp.get(field, "")
        sheet1_rows.append(new_row)
        added += 1

print(f"Updated: {updated} rows, Added: {added} new rows")
print(f"Total sheet1 rows: {len(sheet1_rows)}")

# ---------- write ----------
# Keep the original header format (with BOM to match source)
with open(sheet1_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    # Write header using original sheet1 header names (preserving spacing)
    writer.writerow(raw_sheet1_headers)
    for row in sheet1_rows:
        out = []
        for h in sheet1_headers:
            out.append(row.get(h, ""))
        writer.writerow(out)

print(f"Written to {sheet1_path}")
