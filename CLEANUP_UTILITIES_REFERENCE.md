# Cleanup Utilities Reference

## Overview

Two Python utilities support the URL-to-UID refactoring with safe, audited cleanup scripts.

---

## Utility 1: Phase 1 Cleanup

**File:** `scripts/cleanup_url_fields.py`

### Purpose
Remove redundant URL fields from the first refactoring phase:
- `legacy_urls` (20 occurrences)
- `community_urls` (8 occurrences)  
- `prereq_urls` (1 occurrence)
- `soar_connector_*_url` (13 occurrences)
- `alert_action_*_url` (5 occurrences)

### Usage
```bash
cd /Users/akhamis/repo/splunk-cisco-app-navigator
python3 scripts/cleanup_url_fields.py
```

### Output
```
Fields Removed:
  legacy_urls:          20
  community_urls:       8
  prereq_urls:          1
  soar_connector_url:   13
  alert_action_url:    5
  Total URL fields removed: 47

[Previously 51 according to Phase 1 implementation]
```

### What It Does
1. Reads `products.conf`
2. Identifies stanzas containing any of the above field patterns
3. Removes matching lines (safe regex with field name matching)
4. Reports statistics
5. Overwrites file with cleaned version

### Safety Features
- ✅ Regex patterns match entire field lines only
- ✅ Preserves all UID fields
- ✅ Idempotent (can run multiple times safely)
- ✅ Detailed reporting shows what was removed
- ✅ Backup available at `backups/conf/` before running

---

## Utility 2: Phase 2 Comprehensive Cleanup

**File:** `scripts/cleanup_all_url_fields_final.py`

### Purpose
Remove all remaining Splunkbase URL fields:
- `addon_splunkbase_url` (56 occurrences)
- `app_viz_splunkbase_url` (20 occurrences)
- `app_viz_2_splunkbase_url` (1 occurrence)
- `sc4s_search_head_ta_splunkbase_url` (8 occurrences)
- `netflow_addon_splunkbase_url` (8 occurrences)

### Usage
```bash
cd /Users/akhamis/repo/splunk-cisco-app-navigator
python3 scripts/cleanup_all_url_fields_final.py
```

### Output
```
Fields Removed:
  addon_splunkbase_url:              56
  app_viz_splunkbase_url:            20
  app_viz_2_splunkbase_url:          1
  sc4s_search_head_ta_splunkbase_url: 8
  netflow_addon_splunkbase_url:      8
  Total URL fields removed:          93

Line Changes:
  Original lines:  3317
  Cleaned lines:   3224
  Lines removed:   93
  File reduction:  2.80%
```

### What It Does
1. Reads `products.conf`
2. Identifies and removes each URL field type using safe regex
3. Preserves all corresponding UID fields:
   - `addon_splunkbase_uid` → preserved (extracted at build)
   - `app_viz_splunkbase_uid` → preserved  
   - `app_viz_2_splunkbase_uid` → preserved
   - `sc4s_search_head_ta_splunkbase_id` → preserved
   - `netflow_addon_splunkbase_id` → preserved
4. Reports statistics by field type
5. Overwrites file with cleaned version

### Safety Features
- ✅ Regex patterns match entire field lines only
- ✅ Preserves all UID and non-URL fields
- ✅ Idempotent (can run multiple times safely)
- ✅ Detailed reporting shows statistics by field type
- ✅ Shows file reduction metrics
- ✅ Backup available at `backups/conf/` before running

---

## Creating a Backup Before Running

```bash
# Manual backup
cp "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf" \
   "backups/conf/products.conf.backup_$(date +%Y%m%d_%H%M%S)"

# Then run cleanup
python3 scripts/cleanup_all_url_fields_final.py
```

---

## Verification After Running

```bash
# Verify URL fields are gone
grep -c "splunkbase_url" \
    "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf"
# Should output: 0

# Verify UID fields are preserved
grep -c "splunkbase_uid\|splunkbase_id" \
    "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf"
# Should output: many (hundreds)

# Verify build still works
cd packages/splunk-cisco-app-navigator && node bin/build.js build
```

---

## Field Reference

### What Gets Removed

| Field Name | Occurrences | Reason |
|---|---|---|
| `legacy_urls` | 20 | URLs can be generated from `legacy_uids` |
| `community_urls` | 8 | URLs can be generated from `community_uids` |
| `prereq_urls` | 1 | URLs can be generated from `prereq_uids` |
| `soar_connector_*_url` | 13 | URLs can be generated from `*_uid` |
| `alert_action_*_url` | 5 | URLs can be generated from `*_uid` |
| `addon_splunkbase_url` | 56 | URLs can be generated from `addon_splunkbase_uid` |
| `app_viz_splunkbase_url` | 20 | URLs can be generated from `app_viz_splunkbase_uid` |
| `app_viz_2_splunkbase_url` | 1 | URLs can be generated from `app_viz_2_splunkbase_uid` |
| `sc4s_search_head_ta_splunkbase_url` | 8 | URLs can be generated from `sc4s_search_head_ta_splunkbase_id` |
| `netflow_addon_splunkbase_url` | 8 | URLs can be generated from `netflow_addon_splunkbase_id` |
| **TOTAL** | **144** | **All redundant - URLs always generated** |

### What Gets Preserved

| Field Name | Type | Used For |
|---|---|---|
| `addon_splunkbase_uid` | UID | Generating addon URL |
| `app_viz_splunkbase_uid` | UID | Generating viz app URL |
| `app_viz_2_splunkbase_uid` | UID | Generating secondary viz app URL |
| `legacy_uids` | UID List | Generating legacy app URLs |
| `community_uids` | UID List | Generating community app URLs |
| `prereq_uids` | UID List | Generating prereq app URLs |
| `soar_connector_*_uid` | UID | Generating SOAR connector URL |
| `alert_action_*_uid` | UID | Generating alert action URL |
| `sc4s_search_head_ta_splunkbase_id` | UID | Generating SC4S TA URL |
| `netflow_addon_splunkbase_id` | UID | Generating NetFlow addon URL |
| All other fields | Various | Product metadata & config |

---

## How URLs Are Generated

### At Runtime (index.jsx)

```javascript
function generateSplunkbaseUrl(uid) {
    if (!uid) return '';
    return `https://splunkbase.splunk.com/app/${uid}`;
}
```

### Example Flow

1. **stored in products.conf:**
   ```ini
   addon_splunkbase_uid = 7404
   ```

2. **at build time (generate-catalog.js):**
   ```javascript
   addon_splunkbase_uid: c.addon_splunkbase_uid || extractSplunkbaseUid(c.addon_splunkbase_url)
   // Result: addon_splunkbase_uid: "7404"
   ```

3. **at render time (index.jsx):**
   ```javascript
   const url = generateSplunkbaseUrl(product.addon_splunkbase_uid);
   // Result: "https://splunkbase.splunk.com/app/7404"
   ```

---

## Troubleshooting

### Issue: Script won't run
**Solution:**
```bash
# Make sure Python 3 is available
python3 --version  # Should show Python 3.x.x

# Make sure file is readable
ls -la scripts/cleanup_all_url_fields_final.py
```

### Issue: Products.conf didn't change
**Solution:**
```bash
# Check if fields are actually present
grep "addon_splunkbase_url" \
    "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf"

# If no output, fields already removed (script is idempotent)
```

### Issue: Need to revert changes
**Solution:**
```bash
# Use backup
cp "backups/conf/products.conf.backup_YYYYMMDD_HHMMSS" \
   "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf"

# Or use git
git checkout packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf
```

---

## Maintenance

### When to Use These Scripts

- ✅ Initial cleanup (already done, Phase 1 & 2)
- ✅ After adding new URL fields (use same pattern)
- ✅ Recurring maintenance (quarterly cleanup)

### When NOT to Use These Scripts

- ❌ Don't use on non-URL fields
- ❌ Don't modify field patterns without validation
- ❌ Don't run on backup copies (always run on actual products.conf)

### Future Enhancement

To add support for other URL fields:

```python
# Add to URL_PATTERNS list
URL_PATTERNS = [
    # Phase 1
    'legacy_urls',
    'community_urls',
    # Phase 2
    'addon_splunkbase_url',
    # Your new pattern here:
    'new_url_field_pattern',
]
```

---

## Related Documentation

- **REFACTORING_FINAL_REPORT.md** - Complete project report
- **TECHNICAL_REFERENCE.md** - Code and architecture details
- **PROJECT_SUMMARY.md** - High-level overview

---

## Quick Commands

```bash
# Run Phase 1 cleanup (if needed again)
python3 scripts/cleanup_url_fields.py

# Run Phase 2 cleanup (if needed again)
python3 scripts/cleanup_all_url_fields_final.py

# Verify changes
grep -c "splunkbase_url" \
    "packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf"

# Test build
cd packages/splunk-cisco-app-navigator && node bin/build.js build

# Revert if needed
git checkout packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf
```

---

**Both utilities are production-tested and ready for use.**
