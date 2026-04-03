# SCAN — Release Guide

Step-by-step process for publishing a new version to Splunkbase.

---

## Pre-Release Checklist

- [ ] All changes committed and pushed to `TENG-<Jira>` branch
- [ ] Branch merged to `main` on GitHub
- [ ] App tested locally (light mode + dark mode)
- [ ] `CHANGELOG.md` updated with new version entry
- [ ] `DECISIONS.md` updated if any design decisions were made

## 1. Bump the Version

Edit `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/app.conf`:

```conf
[id]
version = X.Y.Z

[launcher]
version = X.Y.Z
```

Both version fields must match.

## 2. Commit, Push, and Merge

```bash
git add -A
git commit -m "chore: bump version to X.Y.Z"
git push origin TENG-XXXX
git checkout main
git merge TENG-XXXX
git push origin main
git checkout TENG-XXXX
```

## 3. Package the App

From the package directory:

```bash
cd packages/splunk-cisco-app-navigator
yarn run package:app
```

This runs a clean build + webpack + tarball creation in one step. The output lands at:

```
dist/splunk-cisco-app-navigator-X.Y.Z.tar.gz
```

The `build` field in `app.conf` is stamped with the git short hash automatically during the CI build. For local packages, it reflects the hash at the time of your last commit.

## 4. Run AppInspect (Optional but Recommended)

```bash
cd packages/splunk-cisco-app-navigator
bash bin/appinspect.sh
```

Review the HTML report for any failures before uploading.

## 5. Upload to Splunkbase

1. Go to [splunkbase.splunk.com/app/8566](https://splunkbase.splunk.com/app/8566)
2. Click **Edit Listing** (top right, requires publisher access)
3. Go to **Version History** tab
4. Click **New Version**
5. Upload `dist/splunk-cisco-app-navigator-X.Y.Z.tar.gz`
6. Set **Splunk compatibility** versions (e.g., 10.3, 10.2, 10.1, 10.0, 9.4, 9.3, 9.2, 9.1, 9.0)
7. Set **CIM compatibility** (e.g., 8.x, 6.x)
8. Paste release notes from `CHANGELOG.md` into the release notes field
9. Set visibility to **true** when ready
10. Click **Save**

## 6. Post-Release

- [ ] Verify the new version appears on the Splunkbase listing
- [ ] Test install via **Apps > Find More Apps** on a clean Splunk instance
- [ ] Update `README.md` and `CHANGELOG.md` if not already done
- [ ] Update `docs/splunkbase_release_notes.md` for the Splunkbase listing

---

## Quick Reference

| Task | Command |
|------|---------|
| Build only | `yarn run build` |
| Clean build + package | `yarn run package:app` |
| Run AppInspect | `bash bin/appinspect.sh` |
| Regenerate catalog | `node bin/generate-catalog.js` |

## File Locations

| File | Purpose |
|------|---------|
| `src/main/resources/splunk/default/app.conf` | Version source of truth |
| `dist/splunk-cisco-app-navigator-*.tar.gz` | Splunkbase upload package |
| `docs/splunkbase_*.md` | Splunkbase listing content (gitignored) |
| `CHANGELOG.md` | Version history |
