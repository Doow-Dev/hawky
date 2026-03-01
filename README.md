# Hawky

AI-powered code review tool built for multi-agent development teams.

## Features

- **Gate System** — Block PRs until build/types/tests pass
- **Security Scanning** — Custom Semgrep rules for auth, injection, secrets
- **API Contract Validation** — Diff response shapes against specs
- **Design System Enforcement** — Catch banned classes, hardcoded tokens
- **Cross-Agent Coordination** — Detect concurrent PRs on same contracts
- **Sprint Integration** — Auto-update SPRINT.md on PR events

## Status

Early development. See `.claude/work/SPRINT.md` for current progress.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## Usage

Add to your repo's `.github/workflows/hawky.yml`:

```yaml
name: Hawky Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: the-crux/hawky@v1
```

## Configuration

Create `.hawky.yml` in your repo root:

```yaml
gates:
  typescript: true
  build: true
  test: true
  lint: true

security:
  semgrep: true
  secrets: true

design_system:
  banned_classes: true
  hardcoded_colors: true
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

## Documentation

- [Full Spec](/.claude/work/features/hawky/spec/SPEC.md)
- [Backlog](/.claude/work/features/hawky/spec/BACKLOG.md)

## License

MIT
