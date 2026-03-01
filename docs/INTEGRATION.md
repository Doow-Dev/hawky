# Integration Guide

This guide covers how to integrate Hawky into your CI/CD pipeline.

## GitHub Actions Setup

### Basic Installation

Add Hawky to your repository's workflow:

```yaml
# .github/workflows/hawky.yml
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
```

That's all you need. Hawky uses sensible defaults for all gates.

### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `mode` | `check` | Operating mode: `check` (run gates) or `baseline` (generate baseline) |
| `fail_fast` | `true` | Stop on first blocking gate failure |
| `gates` | `typescript,eslint,semgrep,gitleaks` | Comma-separated gates to run |
| `config_path` | `.hawky.yml` | Path to configuration file |
| `github_token` | `${{ github.token }}` | Token for PR comments |
| `commit_baseline` | `false` | Auto-commit baseline files (baseline mode only) |
| `visual_enabled` | `false` | Enable visual regression testing |
| `visual_threshold` | `0.1` | Visual diff threshold (0.0-1.0) |
| `visual_routes` | `` | Comma-separated routes to test |
| `stacks` | `auto` | Stack detection: `auto` or comma-separated list |
| `llm_enabled` | `false` | Enable LLM code review |
| `llm_api_key` | `` | Azure AI Foundry API key |
| `llm_endpoint` | `` | Azure AI Foundry endpoint URL |
| `coordination_enabled` | `true` | Enable cross-agent coordination checks |
| `stale_branch_threshold` | `10` | Days before branch is marked stale |

### Action Outputs

| Output | Description |
|--------|-------------|
| `status` | Overall status: `pass` or `fail` |
| `gates_passed` | Number of gates that passed |
| `gates_failed` | Number of gates that failed |
| `report_url` | URL to full step summary report |
| `baseline_violations` | Total violations in baseline (baseline mode) |
| `baseline_path` | Path to generated baseline.json |
| `llm_review_summary` | LLM review summary (if enabled) |
| `visual_diff_count` | Visual differences found (if enabled) |
| `stacks_detected` | Detected technology stacks |
| `coordination_issues` | Coordination issues found |

## Configuration File

Create `.hawky.yml` in your repository root to customize Hawky:

```yaml
# Global settings
fail_fast: true

# Gate configuration
gates:
  typescript:
    enabled: true
    blocking: true
    timeout: 300

  eslint:
    enabled: true
    blocking: false  # Warnings only
    timeout: 300

  build:
    enabled: true
    blocking: true
    timeout: 600
    command: "npm run build"  # Override build command

  test:
    enabled: true
    blocking: true
    timeout: 600
    command: "npm run test:ci"  # Override test command

  semgrep:
    enabled: true
    blocking: true
    timeout: 600
    rulesets: "p/security-audit p/typescript"

  gitleaks:
    enabled: true
    blocking: true
    timeout: 300

  npm-audit:
    enabled: true
    blocking: true
    timeout: 300

  design-system:
    enabled: false  # Opt-in
    blocking: false
    timeout: 300

  frontend-checks:
    enabled: false  # Opt-in
    blocking: false
    timeout: 300

  visual:
    enabled: false  # Opt-in
    blocking: false
    timeout: 600

  llm-review:
    enabled: false  # Opt-in
    blocking: false
    timeout: 600
```

### Gate Options

Each gate supports these options:

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | boolean | Whether to run this gate |
| `blocking` | boolean | Whether failure blocks merge |
| `timeout` | number | Timeout in seconds |
| `command` | string | Override command (build/test gates) |
| `rulesets` | string | Semgrep rulesets (semgrep gate) |

## Example Workflows

### TypeScript Project

```yaml
name: Hawky
on: [pull_request]

jobs:
  hawky:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - uses: the-crux-squad/hawky@v1
        with:
          fail_fast: true
          gates: 'typescript,eslint,test,semgrep,gitleaks'
```

### Polyglot Project (TypeScript + Go)

```yaml
name: Hawky
on: [pull_request]

jobs:
  hawky:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - run: npm ci

      - uses: the-crux-squad/hawky@v1
        with:
          stacks: 'auto'  # Auto-detect TypeScript and Go
```

### With Visual Regression Testing

```yaml
name: Hawky
on: [pull_request]

jobs:
  hawky:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - uses: the-crux-squad/hawky@v1
        with:
          visual_enabled: true
          visual_routes: 'http://localhost:3000,http://localhost:3000/dashboard'
          visual_threshold: '0.1'
```

### With LLM Code Review

```yaml
name: Hawky
on: [pull_request]

jobs:
  hawky:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - uses: the-crux-squad/hawky@v1
        env:
          AZURE_AI_FOUNDRY_KEY: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
          AZURE_AI_FOUNDRY_ENDPOINT: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
        with:
          llm_enabled: true
```

### Baseline Generation

```yaml
name: Generate Hawky Baseline
on:
  workflow_dispatch:
    inputs:
      branch:
        description: 'Branch to generate baseline for'
        default: 'main'

jobs:
  baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.branch }}
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - uses: the-crux-squad/hawky@v1
        with:
          mode: 'baseline'
          commit_baseline: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AZURE_AI_FOUNDRY_KEY` | API key for LLM review |
| `AZURE_AI_FOUNDRY_ENDPOINT` | Endpoint URL for LLM review |
| `HAWKY_GITHUB_TOKEN` | Override GitHub token |
| `HAWKY_FAIL_FAST` | Override fail-fast setting |

## PR Comments

Hawky automatically posts a comment on each PR with:

- Gate results (pass/fail status)
- Violation counts (new vs. existing vs. ignored)
- Suppression tracking
- Coordination check results
- Links to detailed reports

The comment is updated on each push to the PR branch.

## Step Summary

Each run generates a GitHub Actions step summary with:

- Full violation details
- File-by-file breakdown
- Baseline and ignore status
- Timing information

Click **Details** on the Hawky check to view the full report.

## Permissions

Hawky needs these permissions:

| Permission | Usage |
|------------|-------|
| `contents: read` | Read repository files |
| `pull-requests: write` | Post PR comments |
| `checks: write` | Create check annotations |

The default `GITHUB_TOKEN` provides these permissions automatically.

For cross-repo access or custom tokens:

```yaml
- uses: the-crux-squad/hawky@v1
  with:
    github_token: ${{ secrets.HAWKY_GITHUB_TOKEN }}
```
