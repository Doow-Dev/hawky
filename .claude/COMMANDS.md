# Build Commands — Hawky

Commands for building, testing, and running this project.

**Keep this updated!** If you discover a command we need, add it here.

---

## Verification (run before marking work complete)

| Action | Command |
|--------|---------|
| Build | `npm run build` |
| Type check | `npm run typecheck` |
| Tests | `npm test` |
| Lint | `npm run lint` |

## Development

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev (watch mode) | `npm run dev` |
| Test single file | `npm test -- path/to/file.test.ts` |

## GitHub Action Testing

| Action | Command |
|--------|---------|
| Test action locally | `act pull_request` |
| Validate action.yml | `actionlint` |

## Semgrep

| Action | Command |
|--------|---------|
| Run rules | `semgrep --config rules/ .` |
| Test rules | `semgrep --test rules/` |
| Validate rules | `semgrep --validate --config rules/` |

## Other

| Action | Command |
|--------|---------|
| Format | `npm run format` |
| Format check | `npm run format:check` |

---

*Commands will be finalized once package.json is created.*
