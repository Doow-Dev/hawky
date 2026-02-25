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

## Documentation

- [Full Spec](/.claude/work/features/hawky/spec/SPEC.md)
- [Backlog](/.claude/work/features/hawky/spec/BACKLOG.md)

## License

MIT
