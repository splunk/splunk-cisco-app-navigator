# Contributing to SCAN

## Branching Policy — GitHub Flow

`main` is the single long-lived branch. It is always releasable. All work
happens on short-lived feature branches created from `main` and merged back
via pull request.

```
main ─────●────────●────────●──── (always releasable)
           \      / \      /
            TENG-1234  TENG-5678
```

### Branch Naming

| Type | Pattern | Example |
|---|---|---|
| Feature / task | `TENG-<Jira#>` | `TENG-2573` |
| Hotfix | `hotfix/TENG-<Jira#>` | `hotfix/TENG-2600` |
| Experimental | `spike/<short-desc>` | `spike/react18-upgrade` |

### Rules

1. **No direct commits to `main`** — all changes go through PRs.
2. **Branch from `main`** — never branch from another feature branch.
3. **One logical change per branch** — keep PRs focused and reviewable.
4. **Delete branch after merge** — keep the branch list clean.
5. **Squash merge preferred** — keeps `main` history linear and readable.

## Creating a Branch

```bash
git checkout main
git pull origin main
git checkout -b TENG-<Jira#>
```

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

```
feat: explicit app context for dashboard launch entries
fix: remove stray text in savedsearches.conf causing btool error
chore: bump to v1.0.26, update catalog
docs: add architecture guide
```

## Pull Request Workflow

1. Push your branch to origin:
   ```bash
   git push -u origin TENG-<Jira#>
   ```
2. Open a PR targeting `main` on GitHub.
3. PR title should match the primary commit message.
4. PR body should include:
   - **Summary** — 1-3 bullet points of what changed and why.
   - **Test plan** — checklist of manual or automated verification steps.
5. Get at least one review (when team size permits).
6. Squash-merge into `main`.
7. Delete the remote branch after merge.

## Releases

After merging a release PR into `main`:

1. Tag the merge commit:
   ```bash
   git checkout main
   git pull origin main
   git tag v1.0.27
   git push origin v1.0.27
   ```
2. Update `app.conf`, `app.manifest`, `CHANGELOG.md`, and both `README.md`
   files with the new version before tagging.
3. Build the Splunkbase package from the tagged commit.

## Recommended Branch Protection (GitHub Settings)

Configure these on `main` via **Settings > Branches > Branch protection rules**:

- Require pull request reviews before merging (1 reviewer minimum)
- Require status checks to pass before merging (when CI is configured)
- Require branches to be up to date before merging
- Do not allow force pushes
- Do not allow deletions
- Require linear history (squash merges only)
