# Hawky 🦅

[![CI](https://github.com/the-crux-squad/hawky/actions/workflows/hawky.yml/badge.svg)](https://github.com/the-crux-squad/hawky/actions)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/the-crux-squad/hawky/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-20+-green)](https://nodejs.org)

**AI-powered code quality gates for GitHub PRs.** Runs as a GitHub Action. Built for multi-agent development teams but works for any repo.

Hawky enforces quality standards across your codebase by automatically validating pull requests against 10 categories of gates—from TypeScript type safety and ESLint compliance to security scanning, design system enforcement, frontend checks, and more. Uses AI for semantic code review and supports visual regression testing.

Perfect for teams that need **consistent, automated, cross-functional collaboration** on pull requests.

---

## ✨ Features

### Core Gates
- **TypeScript Type Checking** — Catch type errors before merge
- **ESLint Linting** — Enforce code style and best practices
- **Build Verification** — Ensure your build succeeds
- **Test Execution** — Require passing tests before merge

### Security
- **Semgrep Security Scanning** — Custom rules for auth, injection, secrets (p/security-audit ruleset)
- **Gitleaks Secret Detection** — Prevent API keys and credentials in commits
- **npm Audit** — Scan dependencies for known vulnerabilities

### API & Contracts
- **Response Shape Validation** — Detect breaking changes in API responses
- **Breaking Change Detection** — Warn when endpoints alter request/response contracts

### Design System Compliance
- **Banned Classes Detection** — Flag use of deprecated utility classes
- **Hardcoded Color Detection** — Ensure colors use design tokens
- **Spacing Enforcement** — Validate spacing values against design system

### Coordination
- **Concurrent PR Detection** — Warn when multiple PRs modify the same contract/file
- **Stale Branch Warnings** — Alert when branch is significantly behind main
- **Ownership Collision Detection** — Prevent uncoordinated changes to shared code

### Sprint Integration
- **Story ID Validation** — Verify PR references valid sprint story
- **Auto-Labeling** — Automatically tag PRs based on scope
- **Scope Creep Detection** — Flag when PR changes exceed story scope

### Frontend Checks (12 React/Next.js Patterns)
- **Unhandled Async State Detection** — Catch missing loading/error states in async operations
- **Key Prop Analysis** — Detect missing or index-based keys in lists
- **useEffect Dependency Analysis** — Find missing or stale dependencies
- **Re-render Trap Detection** — Catch unnecessary React re-renders
- **Server/Client Boundary Check** — Validate proper use of 'use client' directives
- **Accessibility Interactive Element Check** — Detect a11y violations on interactive elements
- **Bundle Size Delta** — Monitor JavaScript bundle size changes
- **Image Without Dimensions** — Flag images missing width/height attributes
- **TypeScript Strict Mode Checks** — Enforce strict TypeScript patterns
- **Import Cycle Detection** — Find circular import dependencies
- **Component Graph Impact** — Analyze component dependency chains
- **Import Path Consistency** — Ensure consistent import patterns

### Visual Regression
- **Screenshot Diffing** — Automated visual testing via Playwright
- **Configurable Thresholds** — Set tolerance for visual changes

### AI Code Review (LLM-Powered)
- **Semantic Review** — AI analyzes code for logical issues, patterns, security
- **Powered by Kimi** — Uses kimi-2.5 via Azure AI Foundry for optional LLM analysis
- **Context-Aware** — Understands your team's code patterns and style

### Baseline Mode
- **Onboarding Existing Repos** — Generate baseline to track only new violations
- **Tech Debt Dashboard** — Automatic onboarding report shows violations by category
- **Hawkyignore File** — Permanently suppress false positives or intentional exceptions

### Multi-Stack Support
- **Auto-Detection** — Automatically detects TypeScript, Go, Rust, Python, Terraform, Docker, Kubernetes
- **Stack-Specific Checks** — Runs appropriate gates based on tech stack

---

## 🚀 Quick Start

### Installation

Add to your repository's `.github/workflows/hawky.yml`:

```yaml
name: Hawky Code Review
on: [pull_request]

jobs:
  hawky:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: the-crux-squad/hawky@v1
```

That's it. Hawky uses sensible defaults for all gates.

### Configuration (Optional)

Create `.hawky.yml` in your repository root to customize gates:

```yaml
fail_fast: true

gates:
  typescript:
    enabled: true
    blocking: true
    timeout: 300

  eslint:
    enabled: true
    blocking: true   # Blocking by default (set to false for warnings-only)

  build:
    enabled: true
    blocking: true
    timeout: 600
    # command: "yarn build"  # Optional: override build command

  test:
    enabled: true
    blocking: true
    timeout: 600

  semgrep:
    enabled: true
    blocking: true
    timeout: 600
    # rulesets: "p/security-audit p/typescript"

  gitleaks:
    enabled: true
    blocking: true
    timeout: 300
```

All settings are optional. If not specified, Hawky uses sensible defaults. Core gates (typescript, build, test, eslint, semgrep, gitleaks, npm-audit) are enabled and blocking by default. Optional gates (design-system, frontend-checks, visual) are disabled by default and must be explicitly enabled.

---

## 📋 Gates Reference

Complete reference of all available gates and their configuration:

| Gate | Type | Default Enabled | Default Blocking | Timeout | Description |
|------|------|-----------------|------------------|---------|-------------|
| `typescript` | Core | ✓ | ✓ | 300s | TypeScript type checking |
| `build` | Core | ✓ | ✓ | 600s | Build verification (npm run build, etc) |
| `test` | Core | ✓ | ✓ | 600s | Test suite execution |
| `eslint` | Core | ✓ | ✓ | 300s | ESLint linting |
| `semgrep` | Security | ✓ | ✓ | 600s | Semgrep security scanning |
| `gitleaks` | Security | ✓ | ✓ | 300s | Secret detection |
| `npm-audit` | Security | ✓ | ✓ | 300s | Dependency vulnerability scan |
| `design-system` | Compliance | ✗ | ✗ | 300s | Design system enforcement (opt-in) |
| `frontend-checks` | QA | ✗ | ✗ | 300s | React/Next.js pattern detection (12 checks) |
| `visual` | QA | ✗ | ✗ | 600s | Visual regression testing |

### Gate Configuration

Each gate supports these options:

```yaml
gates:
  <gate_name>:
    enabled: boolean       # Run this gate? (default: per gate)
    blocking: boolean      # Block merge on failure? (default: per gate)
    timeout: number        # Timeout in seconds (default: per gate)
    command: string        # Override command (build/test gates only)
```

### Coordination Configuration

The coordination module detects conflicts between concurrent work across agents and PRs. Configure in `.hawky.yml`:

```yaml
coordination:
  enabled: true  # Master toggle (default: true)

  # Individual checks — BLOCK tier (can fail the action)
  contract_divergence: true   # S036 - Detect conflicting API contract changes
  parallel_migrations: true   # S037 - Detect concurrent DB migrations
  dependency_enforcement: true # S041 - Enforce dependency ordering

  # Individual checks — WARN tier (non-blocking)
  concurrent_prs: true        # S035 - Detect PRs modifying same files
  stale_branch: true          # S038 - Warn when branch is behind main
  spec_mismatch: true         # S039 - Detect spec/implementation drift
  ownership_collision: true   # S040 - Detect ownership conflicts
  session_handoff: false      # S042 - Generate handoff notes (opt-in)
  test_count_regression: true # S043 - Detect test count drops
  authorship_attribution: false # S045 - Track mixed authorship (opt-in)

  # Thresholds
  stale_branch_commits: 10    # Commits behind main to trigger warning
  stale_branch_days: 2        # Days since last sync to trigger warning
```

#### Coordination Checks Reference

| Check | Story | Tier | Default | Description |
|-------|-------|------|---------|-------------|
| `concurrent_prs` | S035 | WARN | on | Detects other open PRs modifying the same files |
| `contract_divergence` | S036 | BLOCK | on | Detects conflicting API contract changes |
| `parallel_migrations` | S037 | BLOCK | on | Detects concurrent database migrations |
| `stale_branch` | S038 | WARN | on | Warns when branch is significantly behind main |
| `spec_mismatch` | S039 | WARN | on | Detects drift between specs and implementation |
| `ownership_collision` | S040 | WARN | on | Detects files owned by multiple teams being modified |
| `dependency_enforcement` | S041 | BLOCK | on | Enforces PR dependency ordering |
| `session_handoff` | S042 | WARN | off | Generates handoff notifications for team context |
| `test_count_regression` | S043 | WARN | on | Detects when test count decreases |
| `authorship_attribution` | S045 | WARN | off | Tracks mixed human/AI authorship |

**BLOCK tier** checks will fail the GitHub Action if violations are found.
**WARN tier** checks add warnings to the PR comment but do not block merge.

**Opt-in checks** (`session_handoff`, `authorship_attribution`) require additional team configuration and are disabled by default.

---

## 🔧 Configuration Reference

### Full `.hawky.yml` Example

```yaml
# Global fail-fast setting
fail_fast: true

# Gate configuration
gates:
  typescript:
    enabled: true
    blocking: true
    timeout: 300

  build:
    enabled: true
    blocking: true
    timeout: 600
    # command: "yarn build"  # Optional: override

  test:
    enabled: true
    blocking: true
    timeout: 600
    # command: "yarn test:ci"  # Optional: override

  eslint:
    enabled: true
    blocking: true         # Blocking by default
    timeout: 300

  semgrep:
    enabled: true
    blocking: true
    timeout: 600
    # rulesets: "p/security-audit p/typescript"  # Custom rulesets

  gitleaks:
    enabled: true
    blocking: true
    timeout: 300

  npm-audit:
    enabled: true          # Enabled by default
    blocking: true         # Blocking by default
    timeout: 300

  design-system:
    enabled: false         # Opt-in: disabled by default
    blocking: false
    timeout: 300

  frontend-checks:
    enabled: false         # Opt-in: disabled by default
    blocking: false
    timeout: 300

  visual:
    enabled: false         # Opt-in: disabled by default
    blocking: false
    timeout: 600
    # threshold: 0.1  # 0.1% pixel difference tolerance

# Grace period mode (optional)
# Makes all violations warnings during adoption phase
grace_period:
  end_date: "2026-04-01"  # or use: sprints: 2

# Baseline mode (optional)
# Only NEW violations block merge; existing ones are tracked
# baseline_enabled: true  # Generated via workflow_dispatch
```

### Environment Variables

Hawky respects these optional environment variables:

```bash
# LLM API key for AI code review (if llm-review gate enabled)
AZURE_AI_FOUNDRY_KEY=your_key_here
AZURE_AI_FOUNDRY_ENDPOINT=https://your-endpoint.azure.com

# GitHub token for cross-repo access (usually not needed)
HAWKY_GITHUB_TOKEN=ghp_...

# Fail-fast mode (stop on first blocking failure)
HAWKY_FAIL_FAST=true
```

---

## 🌍 Multi-Stack Support

Hawky auto-detects your tech stack and runs appropriate gates:

| Stack | Detected By | Gates |
|-------|-------------|-------|
| **TypeScript/JavaScript** | `tsconfig.json`, `package.json` | TypeScript, ESLint, Build, Test |
| **Go** | `go.mod` | Build, Test, Semgrep |
| **Rust** | `Cargo.toml` | Build, Test, Clippy |
| **Python** | `setup.py`, `requirements.txt`, `pyproject.toml` | Type checking, Linting, Test, Semgrep |
| **Terraform** | `*.tf` files | Validation, Security scanning |
| **Docker** | `Dockerfile` | Validation, Security scanning |
| **Kubernetes** | `*.yaml` in `k8s/` or `kubernetes/` | Validation, Security scanning |

Detection is **automatic** — just enable the gates you want. Hawky intelligently skips gates that don't apply to your stack.

**Example:** A TypeScript monorepo with Terraform modules will run TypeScript gates on `.ts` files and Terraform gates on `.tf` files.

---

## 🤖 AI Code Review (LLM Gate)

Enable AI-powered semantic code review:

```yaml
gates:
  llm-review:
    enabled: true
    blocking: false  # Typically non-blocking, for visibility
    timeout: 600
```

Then set the Azure AI Foundry credentials:

```yaml
# In your GitHub Actions workflow
env:
  AZURE_AI_FOUNDRY_KEY: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
  AZURE_AI_FOUNDRY_ENDPOINT: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
```

The LLM gate uses kimi-2.5 via Azure AI Foundry to analyze your code for:
- Logical correctness and potential bugs
- Security vulnerabilities and anti-patterns
- Performance issues and optimization opportunities
- Code clarity and maintainability
- Architectural concerns

Results are posted as a collapsible section in the PR comment for review.

---

## 📸 Visual Regression Testing

Enable visual regression detection:

```yaml
gates:
  visual:
    enabled: true
    blocking: false
    timeout: 600
    # threshold: 0.1  # Allow up to 0.1% pixel difference
```

Hawky uses **Playwright** to screenshot components/pages and detect visual changes.

Configure in `.hawky.yml`:

```yaml
visual:
  enabled: true
  threshold: 0.1  # 0.1% pixel difference tolerance (default)
  headless: true  # Run browser headless (default: true)
```

Visual diffs are posted as image comparisons in the PR comment.

---

## 👥 For Multi-Agent Teams

Hawky includes features designed specifically for teams where multiple engineers work on shared code:

### Concurrent PR Detection
Warns when multiple PRs modify the same API contract or shared component.

```
⚠️ Concurrent modifications detected
PR #123 is also modifying POST /api/users response shape
Coordinate with @Luna before merging
```

### Stale Branch Warnings
Alerts when your branch falls too far behind main (common conflict source).

```
⚠️ Your branch is 15 commits behind main
Rebase to avoid merge conflicts
```

### Sprint Integration
Auto-validates that PR references a valid story ID and flags scope creep:

```
✓ Story S102 found
⚠️ PR modifies 8 files; S102 scope is "Login form" (typically 3-5 files)
```

### Design System Enforcement
Prevents one team member from using banned utility classes or hardcoded colors.

```
❌ 2 design system violations
- src/Button.tsx:42: Banned class '.mt-8' (use spacing tokens)
- src/Card.tsx:15: Hardcoded color '#FF0000' (use $color-error)
```

---

## 📊 Baseline Mode (Onboarding Existing Repos)

For existing codebases with technical debt, use **baseline mode** to onboard Hawky gradually:

### Generate a Baseline

Go to **Actions** → **Hawky Code Review** → **Run workflow**

Select:
- **Mode:** `baseline` (creates new) or `baseline-update` (updates existing)
- **Branch:** `main` (usually)

Click **Run**. This creates:

```
.hawky/baseline.json         # Hash of existing violations
.hawky/onboarding-report.md  # Human-readable tech debt summary
.hawky/onboarding-report.json # Machine-readable data
```

### What This Means

After baseline is created:
- **Existing violations** (in baseline) are non-blocking ✓
- **New violations** (not in baseline) are blocking ✗
- Your team has time to fix baseline violations gradually

Example:

```
PR adds 2 new ESLint violations + 50 existing violations in modified file
↓
Only the 2 NEW violations block merge
The 50 existing ones are already tracked
```

### Onboarding Report

Automatically generated report shows:

```
# Hawky Onboarding Report

## Overview
Total violations: 1,247
- Security: 43
- TypeScript: 156
- ESLint: 801
- Other: 247

## Top 10 Files (Hot Spots)
1. src/api/auth.ts: 67 violations
2. src/db/queries.ts: 54 violations
...

## Estimated Effort
~80 hours to resolve all issues

## Recommendations
1. Focus on security violations first (high impact, medium effort)
2. Run ESLint auto-fix on 5 most common rules
3. Schedule tech debt sprints every other week
```

---

## 🚫 Suppress Violations

### `.hawkyignore` File (Permanent Suppressions)

Create `.hawkyignore` to permanently suppress violations:

```
# Ignore all rules in legacy folder
legacy/**

# Ignore specific rule everywhere
eslint:no-console
typescript:TS2345

# Ignore rule in specific folder
semgrep:*:test/fixtures/**
gitleaks:*:test/fixtures/**

# Ignore generated files
*.generated.ts
src/generated/**
```

### Inline Suppressions (Per-Violation)

Use `hawk-ignore` comments in code:

```typescript
// hawk-ignore: This is a workaround for legacy API
const result = eval(userCode);

// hawk-ignore [semgrep:dangerous-eval]: Evaluated in sandbox context
const sandbox = eval('(' + untrusted + ')');
```

Supported formats:
```
// hawk-ignore: reason
// hawk-ignore [rule]: reason
// hawk-ignore [rule]  (missing reason — flagged in review)
// hawk-ignore         (missing reason — flagged in review)
```

Suppressions appear in PR comments for team review:

```
### Suppressions
✨ This PR adds 3 new suppression(s)
⚠️ 1 suppression(s) missing justification

| File | Line | Rule | Reason | Status |
|------|------|------|--------|--------|
| src/api.ts | 42 | semgrep:eval | Sandbox context | 🆕 New |
| src/db.ts | 15 | eslint:no-console | Debug logging | Existing |
```

---

## 💡 Examples

### Minimal Configuration

```yaml
# .hawky.yml
fail_fast: true
```

All defaults: every gate enabled and blocking.

### Non-Blocking ESLint (Warnings Only)

```yaml
gates:
  eslint:
    blocking: false  # Violations don't block merge
```

### Custom Test Command

```yaml
gates:
  test:
    command: "npm run test:ci -- --coverage"
```

### TypeScript-Only Repo

```yaml
gates:
  typescript:
    enabled: true
    blocking: true

  eslint:
    enabled: false    # Disabled for this repo

  build:
    enabled: false

  test:
    enabled: false
```

### Polyglot Repo (TypeScript + Go)

```yaml
fail_fast: true

gates:
  typescript:
    enabled: true

  # Go build is auto-detected and will run on .go files
  build:
    enabled: true
    # No command needed - auto-detects 'go build' for Go code
```

### Grace Period (Adoption Phase)

```yaml
# All violations become warnings for 2 weeks
grace_period:
  sprints: 2  # or: end_date: "2026-03-15"
```

During grace period, violations are reported but don't block. Perfect for team onboarding.

---

## 🔒 Permissions & Secrets

### GitHub Token

Hawky uses the default `github.token` for:
- Reading PR metadata
- Posting PR comments
- Reading issues

**You don't need to set anything** — it's automatic.

Only add a custom token if you need **cross-repo access**:

```yaml
- uses: the-crux-squad/hawky@v1
  with:
    github_token: ${{ secrets.HAWKY_GITHUB_TOKEN }}
```

### LLM API Key

If using the `llm-review` gate, add your Azure AI Foundry credentials as secrets:

```yaml
- uses: the-crux-squad/hawky@v1
  env:
    AZURE_AI_FOUNDRY_KEY: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
    AZURE_AI_FOUNDRY_ENDPOINT: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
```

Get your credentials from [Azure AI Foundry](https://ai.azure.com). Hawky uses kimi-2.5 as the default model.

### Baseline Commits

If using baseline mode with auto-commit, the action needs `contents: write` permission (default in Hawky workflow).

---

## 🔍 Debugging

### View Full Report

Each PR gets a **step summary** with full details. Click **Details** on the Hawky check to see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HAWKY CODE REVIEW REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ TypeScript       (3s)
✓ Build          (12s)
✓ Test           (8s)
❌ ESLint         (2s) - 5 violations
⚠️  Semgrep       (18s) - 1 warning

[Full violations table...]
```

### Re-run a Gate

Push a new commit to your PR to re-run all gates. Or check **Workflow Runs** to manually trigger:

```
Actions > Hawky Code Review > Run workflow > Select run
```

### Check Logs

View detailed gate logs in **Actions** > Your PR Run > **hawky** job.

---

## 🛠️ Installation Methods

### GitHub Marketplace (Recommended)

```yaml
- uses: the-crux-squad/hawky@v1
```

### Specific Version

```yaml
- uses: the-crux-squad/hawky@v1.0.0
```

### From Source (Development)

```yaml
- uses: the-crux-squad/hawky@main
```

---

## 📚 Documentation

- **[Full Configuration Reference](.hawky.example.yml)** — All `.hawky.yml` options
- **[Integration Guide](docs/INTEGRATION.md)** — Step-by-step setup for different stacks
- **[API Contracts Guide](docs/API_CONTRACTS.md)** — Configure contract validation
- **[Design System Guide](docs/DESIGN_SYSTEM.md)** — Enforce design tokens
- **[LLM Review Setup](docs/LLM_REVIEW.md)** — Configure AI code review
- **[Visual Regression Guide](docs/VISUAL_REGRESSION.md)** — Set up screenshot testing
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** — Common issues and solutions

---

## 📊 Example Workflow

### Workflow File

```yaml
name: Hawky Code Review
on: [pull_request]

jobs:
  hawky:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for Gitleaks

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm ci

      - name: Run Hawky
        uses: the-crux-squad/hawky@v1
        with:
          config_path: .hawky.yml
          fail_fast: true
```

### Configuration File

```yaml
# .hawky.yml
fail_fast: true

gates:
  typescript:
    enabled: true
    blocking: true
    timeout: 300

  build:
    enabled: true
    blocking: true
    timeout: 600

  test:
    enabled: true
    blocking: true
    timeout: 600

  eslint:
    enabled: true
    blocking: false

  semgrep:
    enabled: true
    blocking: true
    rulesets: "p/security-audit"

  gitleaks:
    enabled: true
    blocking: true
```

### What Happens

1. Developer opens PR
2. **Hawky runs automatically** on pull request (via `on: [pull_request]`)
3. Each gate executes in sequence
4. Failed gates post detailed comments with violations
5. Developer fixes issues and pushes a new commit
6. **Hawky re-runs automatically**
7. Once all gates pass, PR can be merged

---

## 🤝 Contributing

We welcome contributions! Areas looking for help:

- **New gates** — Add support for additional tools (Clippy, pylint, etc.)
- **Stack detection** — Improve detection for edge cases
- **Documentation** — Expand guides and examples
- **Bug fixes** — Report and fix issues

### Development Setup

```bash
# Clone
git clone https://github.com/the-crux-squad/hawky.git
cd hawky

# Install
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Type check
npm run typecheck
```

### Testing Your Changes

Create a test workflow in a branch:

```yaml
# .github/workflows/test-hawky.yml
name: Test Hawky
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./  # Uses local version, not marketplace
```

---

## 📄 License

MIT License — See [LICENSE](LICENSE) file for details.

---

## 🦅 Built for Teams

Hawky is built by **The Crux**, a team of six engineers. We use Hawky ourselves and refine it continuously.

**Questions?** Open an [issue](https://github.com/the-crux-squad/hawky/issues) or start a [discussion](https://github.com/the-crux-squad/hawky/discussions).

**Feature request?** We'd love to hear what your team needs. Open a [feature request](https://github.com/the-crux-squad/hawky/issues/new?labels=enhancement).

---

<div align="center">

Made with ❤️ by [The Crux Squad](https://github.com/the-crux-squad)

[⭐ Star us on GitHub](https://github.com/the-crux-squad/hawky) | [📧 Email us](mailto:hello@thecrux.dev) | [🐦 Follow us](https://twitter.com/thecruxsquad)

</div>
