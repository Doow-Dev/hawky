# LLM Review Guide

Hawky includes an AI-powered code review gate that uses large language models to perform semantic analysis of your code changes.

## Overview

The LLM review gate analyzes your PR diff and provides feedback on:

- Security vulnerabilities
- Performance issues
- Type safety concerns
- API contract violations
- Code quality and maintainability
- Best practices

## Setup

### 1. Enable the Gate

In `.hawky.yml`:

```yaml
gates:
  llm-review:
    enabled: true
    blocking: false  # Typically non-blocking for visibility
    timeout: 600     # 10 minutes (LLM calls can be slow)
```

### 2. Configure Credentials

Hawky uses Azure AI Foundry-hosted Kimi (kimi-2.5) for LLM analysis.

**GitHub Actions Secrets:**

Add these secrets to your repository:
- `AZURE_AI_FOUNDRY_KEY` - Your API key
- `AZURE_AI_FOUNDRY_ENDPOINT` - Your deployment endpoint URL

**Workflow Configuration:**

```yaml
- uses: the-crux-squad/hawky@v1
  env:
    AZURE_AI_FOUNDRY_KEY: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
    AZURE_AI_FOUNDRY_ENDPOINT: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
  with:
    llm_enabled: true
```

### 3. Get Azure AI Foundry Credentials

1. Go to [Azure AI Foundry](https://ai.azure.com)
2. Create or select a project
3. Deploy the Kimi model (kimi-2.5)
4. Copy the endpoint URL and API key
5. Add them as GitHub secrets

## How It Works

### Context Assembly

The LLM gate assembles context from your PR:

1. **Diff content** - Changed lines with surrounding context
2. **Full file contents** - For modified files (optional, configurable)
3. **File metadata** - Paths, languages, change types

### Review Process

1. Context is formatted as a structured prompt
2. Request is sent to Azure AI Foundry (kimi-2.5)
3. Response is parsed for structured issues
4. Issues are converted to violations with severity

### Output Format

The LLM returns structured JSON:

```json
{
  "issues": [
    {
      "file": "src/api/auth.ts",
      "line": 42,
      "severity": "error",
      "message": "SQL injection vulnerability",
      "suggestion": "Use parameterized queries",
      "category": "security"
    }
  ],
  "summary": "Found 1 security issue that should be addressed",
  "confidence": 0.85
}
```

## Configuration Options

### Gate Configuration

```yaml
gates:
  llm-review:
    enabled: true
    blocking: false
    timeout: 600
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AZURE_AI_FOUNDRY_KEY` | API key | Required |
| `AZURE_AI_FOUNDRY_ENDPOINT` | Endpoint URL | Required |
| `HAWKY_LLM_MODEL` | Model name | `kimi-2.5` |
| `HAWKY_LLM_TEMPERATURE` | Temperature (0-1) | `0.3` |
| `HAWKY_LLM_MAX_TOKENS` | Max response tokens | `4096` |
| `HAWKY_LLM_TIMEOUT` | Request timeout (ms) | `60000` |

### Action Inputs

```yaml
- uses: the-crux-squad/hawky@v1
  with:
    llm_enabled: true
    llm_api_key: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
    llm_endpoint: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
```

## Issue Categories

The LLM categorizes issues into:

| Category | Description |
|----------|-------------|
| `security` | Security vulnerabilities (injection, auth issues) |
| `performance` | Performance problems (N+1 queries, memory leaks) |
| `type-safety` | TypeScript/type issues |
| `api-contract` | API contract violations |
| `code-quality` | Maintainability, readability issues |
| `other` | Other issues |

## Severity Levels

| Severity | Description | Blocking |
|----------|-------------|----------|
| `error` | Must fix - critical issues | Yes (if gate is blocking) |
| `warning` | Should fix - important issues | No |
| `info` | Suggestion - nice to have | No |

## Confidence Threshold

The LLM provides a confidence score (0-1) for its review. You can configure a minimum threshold:

```yaml
# In .hawky.yml (advanced config)
llm:
  min_confidence: 0.5  # Skip results below 50% confidence
```

If confidence is below threshold, the gate returns "skip" status.

## Cost Considerations

### Token Costs

Approximate costs for kimi-2.5 via Azure AI Foundry:

| Token Type | Cost per 1K tokens |
|------------|-------------------|
| Input | $0.012 |
| Output | $0.012 |

### Typical Usage

| PR Size | Input Tokens | Output Tokens | Estimated Cost |
|---------|--------------|---------------|----------------|
| Small (< 100 lines) | ~2,000 | ~500 | ~$0.03 |
| Medium (100-500 lines) | ~8,000 | ~1,000 | ~$0.11 |
| Large (500+ lines) | ~15,000 | ~2,000 | ~$0.20 |

### Cost Control

1. **Set blocking: false** - Review LLM feedback without blocking PRs
2. **Use timeout** - Limit execution time
3. **Enable for specific files** - Use `.hawkyignore` to skip certain paths

```
# Skip LLM review for generated files
llm-review:*:*.generated.ts
llm-review:*:src/generated/**
```

## Rate Limiting

The LLM client includes built-in rate limiting:

- Token bucket algorithm
- Default: 60 requests per minute
- Automatic backoff on 429 errors

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `MISSING_CONFIG` | No API key/endpoint | Set environment variables |
| `INVALID_API_KEY` | Invalid credentials | Check API key |
| `RATE_LIMITED` | Too many requests | Wait and retry (automatic) |
| `TIMEOUT` | Request took too long | Increase timeout |
| `QUOTA_EXCEEDED` | Account quota reached | Check Azure billing |

### Retry Behavior

- Max retries: 3
- Exponential backoff: 1s, 2s, 4s
- Retryable errors: `RATE_LIMITED`, `TIMEOUT`, `SERVER_ERROR`, `NETWORK_ERROR`

## PR Comment Output

LLM review results appear as a collapsible section in the PR comment:

```markdown
<details>
<summary>LLM Code Review (3 issues)</summary>

**Confidence:** 85%

### Errors (1)

**src/api/auth.ts:42**
SQL injection vulnerability in user query.
*Suggestion:* Use parameterized queries instead of string concatenation.

### Warnings (2)

**src/utils/cache.ts:15**
Potential memory leak - cache entries are never evicted.
*Suggestion:* Add TTL or max size limit to cache.

**src/components/List.tsx:28**
Missing key prop in list iteration.
*Suggestion:* Add unique key prop to list items.

</details>
```

## Focus Areas

You can configure specific areas for the LLM to focus on:

```yaml
# Advanced configuration
llm:
  focus_areas:
    - "Security vulnerabilities"
    - "Performance issues"
    - "Type safety"
```

## Best Practices

### 1. Start Non-Blocking

Begin with `blocking: false` to evaluate LLM feedback quality:

```yaml
gates:
  llm-review:
    enabled: true
    blocking: false
```

### 2. Review False Positives

LLMs can produce false positives. Review findings before enabling blocking mode.

### 3. Use for Visibility

LLM review works best as an additional reviewer, not a replacement for human review.

### 4. Combine with Static Analysis

Use LLM review alongside static analysis gates (ESLint, Semgrep) for comprehensive coverage.

### 5. Cost Monitoring

Track costs via Azure AI Foundry dashboard. Consider limiting to critical branches only.

## Example Workflow

```yaml
name: Hawky with LLM Review
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

      - name: Run Hawky
        uses: the-crux-squad/hawky@v1
        env:
          AZURE_AI_FOUNDRY_KEY: ${{ secrets.AZURE_AI_FOUNDRY_KEY }}
          AZURE_AI_FOUNDRY_ENDPOINT: ${{ secrets.AZURE_AI_FOUNDRY_ENDPOINT }}
        with:
          gates: 'typescript,eslint,semgrep,gitleaks,llm-review'
          llm_enabled: true
```

## Troubleshooting

### "LLM review skipped (no LLM client configured)"

Missing credentials. Ensure both `AZURE_AI_FOUNDRY_KEY` and `AZURE_AI_FOUNDRY_ENDPOINT` are set.

### "LLM review skipped (confidence below threshold)"

The LLM wasn't confident in its analysis. This can happen with very small diffs or unfamiliar code patterns.

### "LLM review failed: API error (429)"

Rate limited. The client will retry automatically. If persistent, check your Azure quota.

### "LLM review failed: Request timed out"

Increase the timeout:

```yaml
gates:
  llm-review:
    timeout: 900  # 15 minutes
```

### Empty or Malformed Response

If the LLM returns invalid JSON, Hawky reports:
```
Failed to parse LLM response. Raw response may contain useful information.
```

Check the step summary for the raw response to diagnose.
