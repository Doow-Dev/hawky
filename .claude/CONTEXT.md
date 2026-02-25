# Project Context: Hawky

## What Is This
AI-powered code review tool built for multi-agent development teams. Runs as a GitHub Action, enforces spec compliance, catches cross-agent conflicts, and integrates with sprint tracking.

## Tech Stack
- **Runtime:** Node.js 20+ / TypeScript
- **CI/CD:** GitHub Actions
- **Analysis Tools:** Semgrep, ESLint, TypeScript compiler
- **Visual Testing:** Playwright (optional)
- **Deployment:** GitHub Action (primary), Cloudflare Worker (future)

## Key Directories
```
/src                — Core Hawky source code
  /gates            — Build/type/test/lint gates
  /security         — Semgrep rules, secret scanning
  /contracts        — API contract validation
  /design-system    — Design token enforcement
  /coordination     — Cross-agent conflict detection
  /sprint           — SPRINT.md/ACTIVITY.md integration
  /frontend         — React/Next.js specific checks
  /visual           — Playwright screenshot diffing
/rules              — Custom Semgrep rules (.yaml)
/action             — GitHub Action entry point
/test               — Test suite
```

## Current State
Early development — spec complete, no code yet.

## Team Focus
Phase 1: Core Gate System (E001) + Security Scanning basics (E002)

## Verification Rules
Before ANY task is marked complete:
1. Run `npm run build` — must pass
2. Run `npm run typecheck` — must pass
3. Run `npm test` — must pass
4. Test the gate/check actually works on a sample PR

See `.claude/COMMANDS.md` for exact commands.

## Permissions

### Pre-approved (just do it)
- Run any command in COMMANDS.md
- Edit files in source directories
- Create/modify test files
- Install dev dependencies
- Create branches

### Ask Isaac first (60 second timeout, then proceed)
- Install production dependencies
- Delete files
- Modify .env or secrets
- Push to remote
- Merge to main
- Publish to GitHub Marketplace

**60 second rule:** If Isaac doesn't respond in 60 seconds, proceed with best judgment.
