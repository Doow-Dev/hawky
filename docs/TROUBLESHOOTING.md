# Troubleshooting Guide

Common issues and solutions when using Hawky.

## General Issues

### "Hawky failed with an unknown error"

**Cause:** Unhandled exception during execution.

**Solution:**
1. Check the Actions log for detailed error messages
2. Ensure all dependencies are installed (`npm ci`)
3. Verify Node.js version is 20+
4. Check `.hawky.yml` syntax with a YAML validator

### "No .hawky.yml found - using defaults"

**Cause:** Configuration file not found (this is informational, not an error).

**Solution:** Create `.hawky.yml` in repository root to customize gates. If using defaults is intentional, no action needed.

### Action Takes Too Long

**Cause:** Gates timing out or running sequentially.

**Solutions:**
1. Use `fail_fast: true` to stop on first failure
2. Increase timeout for slow gates:
   ```yaml
   gates:
     build:
       timeout: 900  # 15 minutes
   ```
3. Disable unnecessary gates
4. Use baseline mode to skip known violations

## Gate-Specific Issues

### TypeScript Gate

#### "TypeScript gate error: Cannot find module"

**Cause:** Dependencies not installed or tsconfig.json missing.

**Solution:**
```yaml
steps:
  - run: npm ci
  - uses: the-crux-squad/hawky@v1
```

#### "TS2307: Cannot find module 'X'"

**Cause:** Type definitions missing.

**Solution:**
```bash
npm install --save-dev @types/X
```

### ESLint Gate

#### "ESLint not found"

**Cause:** ESLint not installed or not in PATH.

**Solution:**
```yaml
steps:
  - run: npm ci  # Installs eslint from package.json
```

#### "No ESLint configuration found"

**Cause:** Missing `.eslintrc.*` or `eslint.config.js`.

**Solution:** Create ESLint config:
```bash
npx eslint --init
```

### Semgrep Gate

#### "Semgrep not found"

**Cause:** Semgrep CLI not installed.

**Solution:** Hawky installs Semgrep automatically, but you can pre-install:
```yaml
steps:
  - run: pip install semgrep
```

#### "No rules found for ruleset"

**Cause:** Invalid ruleset name.

**Solution:** Use valid rulesets:
```yaml
gates:
  semgrep:
    rulesets: "p/security-audit"  # Or p/typescript, p/javascript
```

### Gitleaks Gate

#### "Gitleaks not found"

**Cause:** Gitleaks binary not installed.

**Solution:** Hawky installs it automatically. For manual install:
```yaml
- name: Install Gitleaks
  run: |
    wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz
    tar -xzf gitleaks_8.18.0_linux_x64.tar.gz
    sudo mv gitleaks /usr/local/bin/
```

#### "Fatal: not a git repository"

**Cause:** Git history not available.

**Solution:**
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # Full history required
```

### Design System Gate

#### "No files to scan"

**Cause:** No CSS/TSX/JSX files in repository or wrong paths.

**Solution:** Ensure design system files exist and are not gitignored.

#### False Positives on Valid Colors

**Cause:** Gate detecting colors that are intentionally hardcoded.

**Solution:** Suppress with `.hawkyignore`:
```
design-system:hardcoded-color:src/theme/constants.ts
```

Or allow hardcoded colors:
```yaml
gates:
  design-system:
    allowHardcodedColors: true
```

### Visual Gate

#### "No baseline found"

**Cause:** First run or baselines not committed.

**Solution:** This is expected on first run. Baseline will be created. Commit baselines to repository.

#### "Screenshot capture failed: timeout"

**Cause:** Page didn't load in time.

**Solutions:**
1. Increase timeout:
   ```yaml
   visual:
     timeout: 60000
   ```
2. Use `waitFor` selector:
   ```yaml
   visual:
     waitFor: "[data-ready]"
   ```
3. Ensure application is running:
   ```yaml
   - run: npm start &
   - run: npx wait-on http://localhost:3000
   ```

#### "Playwright not found"

**Cause:** Playwright browsers not installed.

**Solution:**
```yaml
- run: npx playwright install chromium
```

### LLM Review Gate

#### "LLM review skipped (no LLM client configured)"

**Cause:** Missing API credentials.

**Solution:**
```yaml
env:
  AZURE_AI_FOUNDRY_KEY: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
  AZURE_AI_FOUNDRY_ENDPOINT: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
```

#### "API error (401): Invalid API key"

**Cause:** Incorrect or expired API key.

**Solution:**
1. Verify key in Azure AI Foundry console
2. Update GitHub secret with correct value

#### "API error (429): Rate limited"

**Cause:** Too many requests.

**Solution:** Hawky retries automatically. If persistent, check Azure quota limits.

## Configuration Issues

### "Config warning: Unknown gate"

**Cause:** Typo in gate name or using unsupported gate.

**Solution:** Use valid gate names:
- `typescript`
- `build`
- `test`
- `eslint`
- `semgrep`
- `gitleaks`
- `npm-audit`
- `design-system`
- `frontend-checks`
- `visual`
- `llm-review`

### "Config warning: Invalid value"

**Cause:** Wrong type for configuration value.

**Solution:** Check types:
```yaml
gates:
  typescript:
    enabled: true      # boolean, not "true"
    blocking: true     # boolean
    timeout: 300       # number, not "300"
```

### Grace Period Not Working

**Cause:** Date format incorrect or expired.

**Solution:**
```yaml
grace_period:
  end_date: "2026-04-01"  # YYYY-MM-DD format
  # Or use sprints:
  sprints: 2  # 2 x 2-week sprints from today
```

## Baseline Issues

### "No baseline found - all violations treated as new"

**Cause:** Baseline not generated or not committed.

**Solution:**
1. Generate baseline:
   ```yaml
   - uses: the-crux-squad/hawky@v1
     with:
       mode: 'baseline'
       commit_baseline: true
   ```
2. Commit `.hawky/baseline.json` to repository

### "Failed to load baseline"

**Cause:** Corrupted or invalid baseline.json.

**Solution:**
1. Delete `.hawky/baseline.json`
2. Regenerate baseline
3. Commit the new file

### Baseline Not Filtering Violations

**Cause:** Code moved, changing violation hashes.

**Solution:** Regenerate baseline:
```bash
# In GitHub Actions
mode: 'baseline'
```

## Hawkyignore Issues

### "Hawkyignore warning: Invalid pattern"

**Cause:** Malformed ignore pattern.

**Solution:** Use correct syntax:
```
# File patterns
legacy/**
*.generated.ts

# Rule patterns
eslint:no-console
semgrep:rule.id

# Combined
eslint:no-console:scripts/**
```

### Patterns Not Matching

**Cause:** Glob pattern doesn't match file paths.

**Solution:**
- Use forward slashes: `src/legacy/**` not `src\legacy\**`
- Use `**` for recursive matching
- Use `*` for single directory level

## Coordination Issues

### "Contract divergence check failed"

**Cause:** GitHub API error or missing permissions.

**Solution:**
1. Ensure `github_token` has PR read access
2. Check rate limits
3. Verify repository access

### "Dependency enforcement: No SPRINT.md found"

**Cause:** Sprint file not at expected location.

**Solution:**
```yaml
# Ensure file exists at:
# .claude/work/SPRINT.md
```

Or skip the check:
```yaml
coordination:
  dependency_enforcement: false
```

## PR Comment Issues

### "Failed to post PR comment"

**Cause:** Missing permissions or not in PR context.

**Solutions:**
1. Verify token permissions:
   ```yaml
   permissions:
     pull-requests: write
   ```
2. Check you're running on `pull_request` event
3. Verify `github_token` input

### Comment Not Updating

**Cause:** Creating new comments instead of updating.

**Solution:** Hawky should update existing comments automatically. If not, check:
1. Comment is from the same workflow
2. Token has write permissions

## Step Summary Issues

### "Failed to write step summary"

**Cause:** `GITHUB_STEP_SUMMARY` not available.

**Solution:** This is a GitHub Actions feature. Ensure:
1. Running on GitHub Actions (not self-hosted without this feature)
2. Using a recent runner image

## Performance Issues

### Slow TypeScript Checking

**Solutions:**
1. Use project references
2. Exclude unnecessary files in `tsconfig.json`
3. Enable incremental builds

### Slow Semgrep

**Solutions:**
1. Limit rulesets:
   ```yaml
   gates:
     semgrep:
       rulesets: "p/security-audit"  # Instead of all rules
   ```
2. Use `.semgrepignore` to exclude files

### Large PR Diffs

**Solutions:**
1. Enable `fail_fast: true`
2. Disable non-essential gates for draft PRs
3. Use baseline mode to filter existing violations

## Getting Help

### Debug Mode

Enable verbose logging:
```yaml
- uses: the-crux-squad/hawky@v1
  env:
    ACTIONS_STEP_DEBUG: true
```

### Check Versions

Verify versions in Actions log:
```
Hawky starting...
Node version: 20.x
npm version: 10.x
```

### Report Issues

Open an issue at: https://github.com/the-crux-squad/hawky/issues

Include:
1. Full Actions log
2. `.hawky.yml` content
3. Error message
4. Expected vs actual behavior
