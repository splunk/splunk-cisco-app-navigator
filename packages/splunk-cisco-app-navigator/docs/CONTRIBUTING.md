# Contributing to SCAN

Guidelines for contributing to the **Splunk Cisco App Navigator** (SCAN).

## Branching Policy — GitHub Flow

`main` is the single long-lived branch. It is always releasable. All work
happens on short-lived feature branches created from `main` and merged back
via pull request.

```
main ─────●────────●────────●──── (always releasable)
           \      / \      /
       feature/…   fix/…
```

### Branch Naming

| Prefix | When to use | Example |
|---|---|---|
| `feature/` | New feature or enhancement | `feature/dashboard-app-context` |
| `fix/` | Bug fix | `fix/savedsearches-parse-error` |
| `hotfix/` | Urgent production fix | `hotfix/btool-crash` |
| `docs/` | Documentation only | `docs/contributing-branching-policy` |
| `chore/` | Build, deps, version bumps | `chore/bump-v1.0.27` |
| `refactor/` | Code restructuring | `refactor/launch-handler` |
| `spike/` | Experimental / throwaway | `spike/react18-upgrade` |

Use lowercase, hyphens for spaces, and keep it short but descriptive (3–5
words max). **Do not** include Jira ticket IDs or other tracker prefixes in
the branch name.

### Rules

1. **No direct commits to `main`** — all changes go through PRs.
2. **Branch from `main`** — never branch from another feature branch.
3. **One logical change per branch** — keep PRs focused and reviewable.
4. **Delete branch after merge** — keep the branch list clean.
5. **Squash merge preferred** — keeps `main` history linear and readable.

---

## Daily Workflow

Each section below shows both **command line** and **GitHub Desktop** steps.

### 1. Start: branch off `main`

Always start from an up-to-date `main`.

**Command line:**
```bash
git checkout main
git pull origin main
git checkout -b feature/my-new-feature
```

**GitHub Desktop:**
1. Click **Current Branch** (top) → switch to **main**.
2. Click **Fetch origin** (top right). If a **Pull origin** button appears, click it.
3. Click **Current Branch** → **New Branch**.
4. Name it using the convention above (e.g. `feature/dashboard-app-context`).
5. Click **Create Branch**.

### 2. Work: make changes, commit often

Commit at logical checkpoints — small, focused commits are easier to review
and revert.

**Command line:**
```bash
git add -A
git commit -m "feat: add explicit app context to launch dropdown"
```

**GitHub Desktop:**
1. Changed files appear in the left panel.
2. Tick the files you want included (or leave all selected).
3. Write a Conventional Commit summary (e.g. `feat: add app context`).
4. Click **Commit to feature/your-branch-name**.

### 3. Stay current: sync with `main` regularly

Other people may merge changes to `main` while you work. Sync at least once
a day if others are active, and always before opening a PR.

**Command line:**
```bash
git checkout main
git pull origin main
git checkout feature/my-new-feature
git merge main
```

If conflicts appear, resolve them, then `git add` and `git commit`.

**GitHub Desktop:**
1. **Current Branch** → switch to **main**.
2. **Fetch origin**, then **Pull origin**.
3. Switch back to your branch.
4. **Branch** menu → **Merge into current branch...** → pick **main**.
5. Resolve any conflicts in your editor, then commit the merge.

### 4. Push: send your branch to GitHub

**Command line:**
```bash
git push origin feature/my-new-feature
```

First push needs `-u`: `git push -u origin feature/my-new-feature`.

**GitHub Desktop:** click **Publish branch** (first time) or **Push origin**.

### 5. Open a Pull Request

**GitHub Desktop:** after pushing, click **Create Pull Request** — it opens
the browser on GitHub.

**Browser:** go to the repo on GitHub. You'll see a banner offering
"Compare & pull request" — click it.

PR description must include:
- **Summary** — 1–3 bullets of what changed and why.
- **Test plan** — checklist of manual or automated verification.
- **Linked issue** — reference the GitHub issue (e.g. `Closes #42`). See
  [Issue Tracking](#issue-tracking--run-book).

### 6. After merge: clean up

Once your PR is squash-merged into `main`:

**Command line:**
```bash
git checkout main
git pull origin main
git branch -d feature/my-new-feature
```

**GitHub Desktop:**
1. Switch to **main**, then **Fetch origin** → **Pull origin**.
2. **Branch** menu → **Delete...** to remove the local branch.

---

## Daily Routine — Quick Reference

```
1.  git checkout main && git pull        ← start from latest main
2.  git checkout -b feature/my-change    ← create your branch
3.  (make changes, build, test)
4.  git add -A && git commit -m "..."    ← commit your work
5.  git push origin feature/my-change    ← push to GitHub
6.  (repeat 3–5 as needed)
7.  git checkout main && git pull        ← sync main
8.  git checkout feature/my-change       ← back to your branch
9.  git merge main                       ← merge main into your branch
10. git push                             ← push the merge
11. Open PR on GitHub, link the issue    ← request review
12. After merge: switch to main, pull,   ← clean up
    delete your branch
```

---

## Commit Messages — Conventional Commits

```
<type>: <short description>

<optional body explaining why, not what>
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `chore` | Build, packaging, version bumps |
| `docs` | Documentation only |
| `refactor` | Code restructuring with no behavior change |
| `style` | CSS, formatting, whitespace |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |

### Examples

**Good:**

```
feat: explicit app context for dashboard launch entries

The dashboards field now accepts app_id/view_name pairs so products
whose dashboards span multiple Splunk apps launch under the correct
app context.

Closes #12
```

```
fix: remove stray text in savedsearches.conf causing btool error
```

**Bad:**

```
updated stuff
```

```
fixed the bug
```

Keep the first line under 72 characters. Use imperative mood
("add", not "added"). Reference the issue number in the body when applicable.

---

## Pull Request Workflow

1. Push your branch to origin (see [Daily Workflow §4](#4-push-send-your-branch-to-github)).
2. Open a PR targeting `main` on GitHub.
3. PR title should match the primary commit message.
4. PR body must include:
   - **Summary** — 1–3 bullets of what changed and why.
   - **Test plan** — checklist of manual or automated verification.
   - **Linked issue** — `Closes #N` (or `Refs #N` for partial work).
5. Get at least one review when team size permits.
6. Squash-merge into `main`.
7. Delete the remote branch after merge (GitHub does this automatically when
   "Automatically delete head branches" is enabled in repo settings).

---

## Issue Tracking — Run-book

**Every bug fix and enhancement landed since v1.0.24 (the first Splunkbase
release) gets a tracked GitHub issue.** This is the source of truth for the
release narrative — the `CHANGELOG.md` summarises, the issue list explains.

### When to file an issue

| You did this | File an issue? |
|---|---|
| Fixed a bug a user could see or hit | **Yes** — label `bug` |
| Added a feature, capability, or enhancement | **Yes** — label `enhancement` |
| Polished UX (icon, copy, layout, color) noticeable to users | **Yes** — label `enhancement` |
| Bumped a version, stamped a build hash | No — covered by the release tag |
| Pure refactor with no behaviour change | Optional — only if you want it tracked |
| Internal docs or comment tweaks | No |

### Required fields

- **Title** — imperative, specific, ≤ 80 chars (e.g. *"Restore cisco:catalyst:center:\*:report sourcetypes on cisco_dnac card"*).
- **Body** — paragraph or bullets describing symptom (for bugs) or motivation
  (for enhancements), the fix/approach, and any user-visible impact.
- **Commit refs** — list every commit SHA that contributes (e.g.
  ``Commits: `f97cc88`, `fa3bb89` ``).
- **Labels** — `bug` or `enhancement`. Add `status:in-progress` while open.
- **Assignee** — whoever is driving the work.

### Lifecycle

```
draft → open (label: in-progress) → linked PR merged → closed
```

- Open the issue **before** or **alongside** the PR — never after, since the
  PR description should reference it (`Closes #N`).
- Keep at most one issue per logical bug/feature. Group related sub-fixes
  with separate commit refs in the same issue rather than splitting.
- The PR's squash-merge auto-closes the issue when the PR description uses
  the `Closes #N` keyword.
- If a follow-up commit on `main` extends the same fix, reopen and re-link
  rather than filing a new issue.

### Backfill rule

If you forget to file an issue at the time, backfill **before the next
Splunkbase release**. The set of closed issues since the last release tag
must equal the set of user-visible changes documented in `CHANGELOG.md`.

---

## What Goes Where

| Change type | File or directory |
|---|---|
| Product catalog (cards, sourcetypes, badges) | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/products.conf` |
| Catalog field spec / docs | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/README/products.conf.spec` |
| Catalog generator (run after `products.conf` edits) | `packages/splunk-cisco-app-navigator/bin/generate-catalog.js` |
| Generated catalog (**do not edit by hand**) | `packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/productCatalog.generated.js` |
| Main React UI (cards, filters, modals, layout) | `packages/splunk-cisco-app-navigator/src/main/webapp/pages/products/index.jsx` |
| Styles (light + dark mode) | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/appserver/static/products.css` |
| Saved searches | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/savedsearches.conf` |
| Macros | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/macros.conf` |
| Dashboards & views | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/data/ui/views/` |
| Navigation | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/data/ui/nav/default.xml` |
| App config / version / build hash | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/default/app.conf` |
| App manifest (Splunkbase metadata) | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/app.manifest` |
| Splunkbase lookup (CSV, refreshed periodically) | `packages/splunk-cisco-app-navigator/src/main/resources/splunk/lookups/scan_splunkbase_apps.csv.gz` |
| Build & packaging scripts | `packages/splunk-cisco-app-navigator/bin/` (`generate-catalog.js`, `package_app.sh`, `appinspect.sh`) |
| Architecture, decisions, user manual | `packages/splunk-cisco-app-navigator/docs/` |
| Cursor rules (AI agent conventions) | `.cursor/rules/` |
| Cursor skills (AI agent skill files) | `.cursor/skills/` |

**Do not edit directly:**
- `productCatalog.generated.js` — regenerated by `generate-catalog.js`.
- `dist/` — build output.
- Anything under `node_modules/`.

---

## Build & Test Before PR

Verify these before you push or open a PR:

1. **Regenerate the catalog** if `products.conf` changed:
   ```bash
   node packages/splunk-cisco-app-navigator/bin/generate-catalog.js
   ```
   Commit `productCatalog.generated.js` alongside the `products.conf` change.
2. **Build completes cleanly**:
   ```bash
   yarn install
   yarn build
   ```
3. **AppInspect passes** (Splunkbase pre-validation):
   ```bash
   bin/appinspect.sh
   ```
4. **Splunk loads the app without errors**:
   ```
   index=_internal source=*splunkd* component=ConfModuleSetup splunk-cisco-app-navigator ERROR
   ```
5. **The dashboard renders** in your dev Splunk and the cards you touched
   look correct in **both light and dark mode**.
6. **Visual consistency sweep** if you changed any color, badge, icon, or
   label — search the codebase for the old value and confirm every surface is
   updated (cards, filter pills, modals, exports). See
   [SCAN Conventions](#scan-conventions-cheat-sheet) below.

---

## Files to Never Commit

- Credentials, tokens, passwords, API keys, or `.env` files.
- Anything under `local/` (instance-specific Splunk configs).
- Customer-specific data (sample events, hostnames, IPs).
- `*.spl` build outputs (use `dist/` which is git-ignored).
- IDE state (`.vscode/`, `.idea/`) unless project-wide and intentional.
- `.DS_Store`, `Thumbs.db`, and other OS junk.

If you accidentally commit a secret, rotate the secret first, then rewrite
history (`git filter-repo` or BFG) and force-push only with explicit
maintainer approval.

---

## SCAN Conventions Cheat Sheet

The five rules most likely to be violated. The full set lives in
`.cursor/rules/scan-conventions.mdc`.

1. **Regenerate the catalog after every `products.conf` edit** — run
   `node packages/splunk-cisco-app-navigator/bin/generate-catalog.js` and
   commit both files together.
2. **Bump `date_updated` to today** on any product field change in
   `products.conf`. Use `YYYY-MM-DD` format.
3. **`sourcetypes` field is alphabetical and comma-separated** — no spaces
   after commas, lowercase only.
4. **Visual consistency sweep** — any color/badge/icon/label change must be
   searched across the entire codebase before the task is "done": cards,
   help/guide modal, filter drawer pills, category bar, stats bar, customer
   summary export (HTML + plain text), CSS classes (light + dark), inline
   styles in JSX.
5. **Dark mode is mandatory** — every UI change must work in `:root.dce-dark`.
   New CSS classes need both a light-mode rule and a `:root.dce-dark`
   override. Prefer CSS custom properties over hardcoded hex.

For larger design decisions, add a dated entry to
`packages/splunk-cisco-app-navigator/docs/DECISIONS.md` so the rationale
survives chat sessions and turnover.

---

## Releases

Detailed step-by-step instructions live in `RELEASE_GUIDE.md`. Summary:

1. Open a release PR (`chore/bump-v1.0.x`) that updates `app.conf`,
   `app.manifest`, `CHANGELOG.md`, and both `README.md` files.
2. Squash-merge into `main`.
3. Tag the merge commit:
   ```bash
   git checkout main
   git pull origin main
   git tag v1.0.x
   git push origin v1.0.x
   ```
4. Build the Splunkbase package from the tagged commit
   (`bin/package_app.sh`).
5. Confirm every closed issue since the previous tag is reflected in
   `CHANGELOG.md` (see [Issue Tracking](#issue-tracking--run-book)).

---

## Recommended Branch Protection (GitHub Settings)

Configure these on `main` via **Settings → Branches → Branch protection rules**:

- Require pull request reviews before merging (1 reviewer minimum).
- Require status checks to pass before merging (when CI is configured).
- Require branches to be up to date before merging.
- Do not allow force pushes.
- Do not allow deletions.
- Require linear history (squash merges only).
- Automatically delete head branches after merge.
