# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-01

### Added

#### Core Gates
- **TypeScript Gate** - Type checking via `tsc --noEmit` with violation extraction and annotation support
- **ESLint Gate** - Linting with configurable rules, JSON output parsing, and severity mapping
- **Semgrep Gate** - Security scanning with customizable rulesets (default: `p/security-audit`)
- **Gitleaks Gate** - Secret detection to prevent API keys and credentials in commits
- **npm-audit Gate** - Dependency vulnerability scanning for known security issues
- **Build Gate** - Build verification with configurable commands and timeout
- **Test Gate** - Test suite execution with configurable commands and timeout

#### Design System Gate
- **Banned Classes Detection** - Flag deprecated utility classes with configurable blocklist
- **Hardcoded Color Detection** - Ensure colors use design tokens (hex, rgb, hsl patterns)
- **Spacing Enforcement** - Validate spacing values against design system scale
- **Font Size Enforcement** - Validate font sizes against design system scale

#### Frontend Checks Gate (12 React/Next.js Patterns)
- **Unhandled Async State Detection** - Catch missing loading/error states in useQuery, useMutation, useSWR
- **Key Prop Analysis** - Detect missing or index-based keys in list rendering
- **useEffect Dependency Analysis** - Find missing or stale dependencies in effect hooks
- **Re-render Trap Detection** - Catch unnecessary re-renders from inline objects/functions
- **Server/Client Boundary Check** - Validate proper use of 'use client' directives in Next.js
- **Accessibility Interactive Element Check** - Detect a11y violations on interactive elements
- **Bundle Size Delta** - Monitor JavaScript bundle size changes between commits
- **Image Without Dimensions** - Flag images missing width/height attributes
- **TypeScript Strict Mode Checks** - Enforce strict TypeScript patterns
- **Import Cycle Detection** - Find circular import dependencies
- **Component Graph Impact** - Analyze component dependency chains for blast radius
- **Import Path Consistency** - Ensure consistent import patterns across codebase

#### Visual Regression Testing
- **Playwright Screenshot Diffing** - Automated visual testing with configurable thresholds
- **Baseline Management** - Store and compare visual baselines across branches
- **Threshold Configuration** - Set tolerance for visual changes (default: 0.1% pixel difference)
- **Headless Mode** - Run browser tests in CI without display

#### LLM-Powered Code Review
- **Semantic Code Analysis** - AI reviews code for logical issues, security, and patterns
- **Azure AI Foundry Integration** - Uses kimi-2.5 model via Azure AI Foundry
- **Context Assembly Pipeline** - Builds relevant context from PR diff and codebase
- **Confidence Scoring** - Rates review findings by confidence level
- **Auto-Fix Suggestions** - Generates actionable fix suggestions for violations
- **Change Request Generation** - Creates structured change requests from LLM findings
- **Spec Compliance Analysis** - Checks code against API specs and contracts
- **Feedback Learning Loop** - Improves suggestions based on developer feedback

#### Baseline Management
- **Baseline Generation** - Create baseline.json via workflow_dispatch to track existing violations
- **Onboarding Report** - Auto-generated tech debt summary with violation breakdown by category
- **New vs Existing Violation Tracking** - Only new violations block merge; existing ones are tracked
- **Violation Hashing** - Content-aware hashing to identify violations across file changes
- **Baseline Mode** - Special mode to generate baselines from clean branches

#### Suppression System
- **.hawkyignore File** - Pattern-based permanent suppressions with glob support
- **Inline Suppressions** - `// hawk-ignore: reason` comments for per-violation suppression
- **Rule-Specific Ignores** - Target specific rules with `eslint:rule-name` or `semgrep:rule-id` syntax
- **Path-Based Ignores** - Ignore violations in specific directories (e.g., `legacy/**`)
- **Suppression Dashboard** - PR comment shows all suppressions with justification status

#### Coordination Checks
- **Concurrent PR Detection (S035)** - Warn when multiple PRs modify the same files
- **Contract Divergence Detection (S036)** - Block when API contract changes conflict with frontend PRs
- **Parallel Migration Detection (S037)** - Block when multiple PRs contain database migrations
- **Stale Branch Warning (S038)** - Warn when branch is significantly behind main (configurable threshold)
- **Spec Version Mismatch (S039)** - Detect drift between specs and implementation
- **Ownership Collision Detection (S040)** - Warn when cross-team file modifications detected
- **Dependency Enforcement (S041)** - Block PRs until dependent stories are merged
- **Session Handoff Notifications (S042)** - Generate handoff notifications on merge (opt-in)
- **Test Count Regression (S043)** - Warn when test count decreases
- **Authorship Attribution (S045)** - Track mixed human/AI authorship (opt-in)

#### Sprint Integration
- **Story ID Validation** - Verify PR references valid sprint story from SPRINT.md
- **Auto-Labeling** - Automatically tag PRs based on scope and files changed
- **Scope Creep Detection** - Flag when PR changes exceed expected story scope
- **Protocol Sequence Detection** - Validate review workflow sequence
- **PR Status on Open/Merge** - Update sprint status on PR lifecycle events
- **Activity Logging** - Auto-log PR events to ACTIVITY.md
- **Notifications Routing** - Route PR events to NOTIFICATIONS.md for team awareness

#### Multi-Stack Support
- **Auto-Detection** - Automatically detect TypeScript, Go, Rust, Python, Terraform, Docker, Kubernetes
- **Stack-Specific Gates** - Run appropriate gates based on detected tech stack
- **Registry System** - Extensible stack module registry for custom stacks
- **Polyglot Support** - Handle monorepos with multiple tech stacks

#### Reporting
- **PR Comments** - Rich PR comments with gate summaries, violations table, and coordination findings
- **Step Summaries** - Detailed GitHub Actions step summary with full report
- **GitHub Annotations** - Inline file annotations for violations at specific lines
- **Fail-Fast Mode** - Stop on first blocking failure (configurable)

#### Configuration
- **.hawky.yml** - YAML configuration file with sensible defaults
- **Grace Period Mode** - Make all violations warnings during adoption (configurable end date or sprints)
- **Per-Gate Configuration** - Enable/disable, blocking/non-blocking, timeout per gate
- **Environment Variables** - Support for `AZURE_AI_FOUNDRY_KEY`, `AZURE_AI_FOUNDRY_ENDPOINT`
- **Action Inputs** - Full control via GitHub Action inputs

#### API Contracts
- **OpenAPI Spec Parser** - Parse and validate OpenAPI/Swagger specifications
- **Response Shape Validation** - Detect breaking changes in API response structures
- **Breaking Change Detection** - Warn when endpoints alter request/response contracts
- **Error Code Coverage** - Track error response documentation coverage
- **Spec Freshness Checks** - Detect stale API specifications
- **DATA_CONTRACTS.md Integration** - Read contract definitions from documentation
- **Test Generator** - Generate endpoint tests from OpenAPI specs

### Security
- MIT License for open source distribution
- Secrets detection warns when baseline contains secrets (should be rotated, not grandfathered)
- Environment variable handling for sensitive API keys

### Documentation
- Comprehensive README with quick start and full configuration reference
- Integration guide for different tech stacks
- API contracts guide
- Design system guide
- LLM review setup guide
- Visual regression guide
- Troubleshooting guide
- Example workflow files

[1.0.0]: https://github.com/the-crux-squad/hawky/releases/tag/v1.0.0
