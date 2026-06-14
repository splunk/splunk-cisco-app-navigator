# Contributing to Splunk Cisco App Navigator (SCAN)

Thank you for your interest in contributing to the Splunk Cisco App Navigator! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](.github/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [security@splunk.com](mailto:security@splunk.com).

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- Yarn (package manager)
- Splunk Enterprise (for testing)
- Git

### Repository Structure

```
splunk-cisco-app-navigator/
├── .github/              # GitHub configuration (CODEOWNERS, workflows, etc.)
├── docs/                 # Project documentation
├── packages/
│   └── splunk-cisco-app-navigator/  # Main Splunk app
│       ├── bin/          # Build scripts
│       ├── src/
│       │   ├── main/resources/splunk/default/  # Config files (products.conf, etc.)
│       │   └── webapp/pages/products/          # React components
│       └── package.json
├── scripts/              # Utility scripts for analysis and maintenance
└── package.json          # Root workspace configuration

```

## Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/splunk/splunk-cisco-app-navigator.git
cd splunk-cisco-app-navigator
yarn install
```

### 2. Configure Splunk

Symlink the app to your Splunk instance:

```bash
cd packages/splunk-cisco-app-navigator
ln -s "$(pwd)/stage" /opt/splunk/etc/apps/splunk-cisco-app-navigator
```

### 3. Build

```bash
# From the root directory
yarn run build

# Or from packages/splunk-cisco-app-navigator
cd packages/splunk-cisco-app-navigator
node bin/build.js build
```

## Making Changes

### Creating a Branch

```bash
# Update main branch
git checkout main
git pull origin main

# Create a feature branch
git checkout -b feature/your-feature-name
# or for bug fixes
git checkout -b fix/your-bug-name
# or for other work
git checkout -b chore/your-chore-name
```

### Branch Naming Conventions

- `feature/description` — New features or enhancements
- `fix/description` — Bug fixes
- `chore/description` — Maintenance, refactoring, governance
- `docs/description` — Documentation updates
- `security/description` — Security-related changes

### Commit Messages

Follow conventional commit format:

```
type(scope): subject

body (if needed)

footer (if needed)
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `chore` — Build, dependencies, maintenance
- `refactor` — Code structure without behavior change
- `test` — Test-related changes
- `security` — Security fixes

**Examples:**
```
feat(catalog): add new Cisco product to products.conf
fix(ui): escape HTML attributes to prevent XSS
docs(readme): update setup instructions
chore(deps): upgrade lerna to 9.0.7
```

## Submitting Changes

### Before Creating a Pull Request

1. **Update Main:**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run Tests & Linting:**
   ```bash
   yarn run lint
   yarn audit
   ```

3. **Build & Verify:**
   ```bash
   yarn run build
   ```

4. **Test Locally:**
   - Verify changes work in Splunk
   - Test in both light and dark themes
   - Test on multiple browsers if UI changes

### Creating a Pull Request

1. Push your branch:
   ```bash
   git push origin your-branch-name
   ```

2. Open a pull request on GitHub with:
   - Clear title describing the change
   - Description of what changed and why
   - Reference to any related issues (`Fixes #123`)
   - Screenshots for UI changes

3. **PR Checklist:**
   - [ ] Branch is up to date with `main`
   - [ ] Commits have clear, conventional messages
   - [ ] No hardcoded secrets, passwords, or credentials
   - [ ] Code follows project style guidelines
   - [ ] Documentation updated (if needed)
   - [ ] Tests pass (if applicable)
   - [ ] No new security vulnerabilities introduced
   - [ ] Changes work in light and dark themes

### Review Process

- At least 1-2 code reviews required before merging
- Address reviewer feedback by pushing new commits (don't force-push)
- Once approved, maintainers will merge the PR

## Coding Standards

### JavaScript/React

- Use ES6+ syntax
- Follow Airbnb style guide (enforced by ESLint)
- Prefer const/let over var
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and testable

### Splunk Configuration (INI Format)

- Use lowercase for stanza names and keys
- Use descriptive field names
- Comment complex or non-obvious settings
- Follow existing formatting conventions
- See [products.conf.spec](packages/splunk-cisco-app-navigator/src/main/resources/splunk/README/products.conf.spec) for product fields

### Python

- Follow PEP 8 style guide
- Add docstrings to functions and classes
- Use type hints where practical
- Test with Python 3.6+

### CSS/SCSS

- Follow existing style conventions
- Use CSS variables for theming
- Support both light and dark modes
- Mobile-responsive design
- BEM-style class naming when appropriate

### Security

- **No Hardcoded Secrets:** Never commit passwords, API keys, or tokens
- **Input Validation:** Validate and sanitize all inputs
- **HTML Escaping:** Use proper escaping for dynamic HTML (see `escAttr()` helper)
- **Dependencies:** Keep dependencies up to date and audit regularly
- **Code Review:** All changes reviewed for security issues

## Testing

### Unit Testing (if applicable)

```bash
yarn test
```

### Manual Testing

1. **Build the app:**
   ```bash
   yarn run build
   ```

2. **Reload Splunk:**
   - Navigate to SCAN app in Splunk
   - Perform a hard refresh (Cmd+Shift+R on Mac)
   - Test your changes thoroughly

3. **Test Coverage:**
   - Main functionality
   - Edge cases
   - Error handling
   - Both light and dark themes

## Documentation

### When to Update Docs

- New features should have corresponding documentation
- API changes require documentation updates
- Configuration changes should be documented in comments and specs
- Architecture changes warrant architecture guide updates

### Documentation Files

- **README.md** — Project overview and quick start
- **docs/SCAN_Architecture_Guide.md** — Technical deep dive
- **packages/splunk-cisco-app-navigator/README.md** — App-specific info
- **products.conf.spec** — Product catalog field reference
- **Inline comments** — Explain complex code logic

### Documentation Style

- Use clear, concise language
- Include code examples where helpful
- Update table of contents for new sections
- Link to related documentation

## Getting Help

- **Questions:** Open a GitHub discussion
- **Bugs:** Open a GitHub issue with reproduction steps
- **Security Issues:** Email [security@splunk.com](mailto:security@splunk.com)
- **General Help:** Check existing issues and discussions first

## Recognition

Contributors will be recognized in:
- Release notes (for features/fixes)
- GitHub contributor list
- Project documentation (if applicable)

## License

By contributing to this project, you agree that your contributions will be licensed under the project's license (see [LICENSE](LICENSE) in the repository).

---

Thank you for contributing to SCAN! Your efforts help make this project better for everyone.
