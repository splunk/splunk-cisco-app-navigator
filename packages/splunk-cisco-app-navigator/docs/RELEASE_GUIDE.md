# SCAN — Maintainer Release Guide

Step-by-step process for publishing a new version to Splunkbase.

---

## Pre-Release Checklist

- [ ] All bug fixes / enhancements going into the release have a tracked GitHub issue
      (see Issue Tracking run-book in [`CONTRIBUTING.md`](CONTRIBUTING.md))
- [ ] All feature/fix branches already merged to `main` via PR
- [ ] App tested locally (light mode + dark mode)
- [ ] `CHANGELOG.md` updated with new version entry
- [ ] `DECISIONS.md` updated if any design decisions were made

## 1. Bump the Version

Cut a release branch from a fully-synced `main`:

```bash
git checkout main && git pull origin main --ff-only
git checkout -b chore/bump-vX.Y.Z
```

Edit `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/app.conf`:

```conf
[id]
version = X.Y.Z

[launcher]
version = X.Y.Z
```

Both version fields must match. Also bump `version` in `app.manifest` and add a new entry at the top of `CHANGELOG.md`.

## 2. Commit, Build, Push, PR, Merge

```bash
git add -A
git commit -m "chore: bump version to X.Y.Z"

cd packages/splunk-cisco-app-navigator
yarn run package:app                # auto-stamps build hash; produces dist/*.tar.gz
git add -A
git commit -m "chore: stamp build hash for vX.Y.Z Splunkbase upload"

git push -u origin chore/bump-vX.Y.Z
gh pr create --base main --head chore/bump-vX.Y.Z \
  --title "chore: bump version to X.Y.Z" \
  --body  "Release vX.Y.Z — packages #<issues> for Splunkbase."

# After review:
gh pr merge <number> --squash --delete-branch

# Tag the squash-merge commit on main:
git checkout main && git pull origin main --ff-only
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

> Version-bump PRs do **not** need a `Closes #N` reference — they are tracked by
> the release tag (`vX.Y.Z`), not by an issue. See the run-book table in
> `CONTRIBUTING.md`.

## 3. Package the App

From the package directory:

```bash
cd packages/splunk-cisco-app-navigator
yarn run package:app
```

This runs a clean build + webpack + tarball creation in one step. The output lands at:

```
dist/splunk-cisco-app-navigator-X.Y.Z-BUILD.tar.gz
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
5. Upload `dist/splunk-cisco-app-navigator-X.Y.Z-BUILD.tar.gz`
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
| Repository-root `VERSION` | Release version source of truth |
| `dist/splunk-cisco-app-navigator-*.tar.gz` | Splunkbase upload package |
| `docs/splunkbase_*.md` | Splunkbase listing content (gitignored) |
| `CHANGELOG.md` | Version history |

## Shared build numbers

Every new package normally reserves from the existing project-specific GitHub
workflow `splunk/splunk-cisco-app-navigator:reserve-build-number.yml`. Preserve
its filename, run sequence and permanent offset 99: build = 99 + run_number.
GitHub assigns that number atomically at dispatch, before a runner starts;
runner completion is not required. Failed attempts spend their numbers. Distinct
workspaces/machines can reserve concurrently; completion can be out of order.
Never delete/recreate or reset this counter, force-update it, or use a fork's
counter. The sequence continues across application version changes.

Local state is only ignored `dist/build-reservations/current.json`, atomically
replaced with its reservation, backend, build, high-water mark and claimed status.
Claiming consumes it before packaging; retry a failed attempt with a fresh number.
Missing/corrupt state is recreated using the shared counter and available staged
app.conf, optional repository-root `BUILD_NUMBER_FLOOR`, retained archive metadata
(`.tar.gz`, including alternate/minified suffixes, and `.tgz`), target app.conf
under `SPLUNK_HOME` (default `/opt/splunk`), and higher recoverable local state.
Archives are history floors, never an automatic offline counter. Recognized old
numbered receipts/claims and interrupted atomic-write files are cleaned after
their high-water marks have been preserved. Unrelated files and archives remain.
A malformed existing archive or unreadable metadata is an integrity error that
must be repaired; it is not bypassed as a numbering outage.

Shared numbering needs `gh` authenticated on github.com with dispatch access,
and the workflow active on the canonical default branch (`main`, `master`,
`develop`, or the repository's actual configured branch). Network, authentication
or Actions outages offer a visible controlling-terminal prompt for a coordinated
manual integer above every known floor. An explicit override works even online:

```bash
NAVIGATOR_BUILD_NUMBER=<coordinated-integer> ./build.sh --minify
```

Replace the placeholder with a coordinated number, not a guessed next value.
Manual allocation is recorded as `backend: manual`; global uniqueness cannot be
verified offline. Coordinate the number with every other developer, including
those still using older tooling. If a manual number is ahead of the workflow,
shared allocation can spend up to eight real reservations to catch up, then
requests another coordinated manual number rather than inventing an identity.
Unattended builds (CI, redirected stdin or no terminal) fail with an actionable
override instruction when no shared reservation/override is usable. The prompt
remains visible even when build.sh captures stdout/stderr. Compilation, disk,
archive, packaging and installation errors still fail normally.

Use one build per workspace. A lock covers stage/build/package; stale locks after
an abrupt termination must be inspected before removal. Do not package a stage
that an unrelated watcher is updating. `--no-build` reuses a package and allocates
nothing. Package names remain `<app>-<version>-<build>.tar.gz`.

A local commit does not distribute these improvements: other developers must
update after the change reaches the canonical branch. The existing shared
workflow identity is retained, so this change does not need a new counter or
workflow activation. Protocol tests simulate shared dispatches, outages and
competing machines; they do not qualify live service permissions.

## Publishing a catalog update

The tracked `products.conf` keeps `# version = __CATALOG_VERSION__` as a stable
placeholder. Packaging replaces this only in the archive copy with the current
UTC minute (`YYYY_MM_DD_HHMM`), including `--from-stage` builds. The source and
watch-maintained stage retain their revision header. `--no-build` reuses the
existing archive and its timestamp unchanged.

For S3 publication, extract `default/products.conf` from the exact package being
released and upload that stamped file, never the source template. Verify its
revision is strictly later than the published S3 catalog and check
`min_app_version` compatibility. Builds within one minute can share a catalog
revision; wait until a later minute and rebuild if a second update must sync.
The existing sync parser and comparison logic are unchanged. Packaging does not
upload anything. The stamping helper requires an explicit copy path and rejects
the tracked source file.

### Publish the packaged catalog with AWS CLI

Check an exact package first (replace BUILD with its number):

```sh
./publish-catalog.sh dist/splunk-cisco-app-navigator-1.0.33-BUILD.tar.gz
```

Repeat with `--publish` to replace `s3://is4s/scan/products.conf` without a backup.
The helper verifies account, catalog timestamp and app compatibility; it refuses
to overwrite a concurrent S3 update and verifies uploaded bytes. It never builds
or chooses a package automatically. Temporary downloads are cleaned up.

For an expired session, run `aws sso login --profile catalog-publisher`, complete
browser sign-in, and retry. For first-time setup use
`aws configure sso --profile catalog-publisher`. The SSO region is `us-west-2`;
the bucket/client region is `us-east-1`. Access-denied errors after login require
checking the selected role's S3 permissions.

Catalog `min_app_version` is maintained explicitly in the source catalog and is
preserved during builds. Raise it only when a catalog change requires a newer
app; it is independent of the packaged app version and catalog timestamp.
