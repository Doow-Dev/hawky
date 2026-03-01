# API Contracts Guide

Hawky can enforce API contract consistency by detecting breaking changes in your OpenAPI specifications and validating documentation against specs.

## How It Works

The API contracts feature provides two types of checks:

1. **Breaking Change Detection** - Compares current OpenAPI spec against previous versions to catch breaking changes
2. **Documentation Drift Detection** - Cross-references `DATA_CONTRACTS.md` with OpenAPI spec to detect drift

## Configuration

Enable API contract checking in `.hawky.yml`:

```yaml
# API contract validation is part of coordination checks
coordination:
  enabled: true
  contract_divergence: true  # Detect conflicting API changes across PRs
```

## Breaking Change Detection

### What It Catches

**Breaking Changes (Errors):**

| Change Type | Description |
|-------------|-------------|
| `endpoint-removed` | An endpoint was deleted |
| `required-field-removed` | A required field was removed from request/response |
| `type-changed` | Field type changed (e.g., `string` to `number`) |
| `required-field-added-to-request` | New required field in request body |
| `parameter-removed` | URL/query parameter removed |
| `required-parameter-added` | New required URL/query parameter |
| `response-removed` | HTTP status code response removed |

**Non-Breaking Changes (Info):**

| Change Type | Description |
|-------------|-------------|
| `endpoint-added` | New endpoint added |
| `optional-field-added` | New optional field added |
| `optional-parameter-added` | New optional parameter added |
| `response-added` | New HTTP status code response added |
| `field-made-optional` | Required field became optional |

### Spec File Detection

Hawky automatically finds OpenAPI specs in these locations:

- `openapi.yaml` / `openapi.yml` / `openapi.json`
- `swagger.yaml` / `swagger.yml` / `swagger.json`
- `api/openapi.yaml`
- `docs/openapi.yaml`
- `spec/openapi.yaml`

### Example Violations

**Removed Endpoint:**
```
ERROR: Endpoint DELETE /api/users/{id} was removed
Breaking change - existing clients may depend on this endpoint
```

**Type Changed:**
```
ERROR: Response field "count" type changed
Before: number
After: string
Breaking change - clients expecting number will fail
```

**New Required Field:**
```
ERROR: Required request field "email" was added (breaking for existing clients)
Existing clients not sending this field will fail
```

## Documentation Drift Detection

### DATA_CONTRACTS.md Format

Hawky parses a markdown file documenting your API contracts. Supported locations:

- `DATA_CONTRACTS.md`
- `docs/DATA_CONTRACTS.md`
- `api/DATA_CONTRACTS.md`
- `API_CONTRACTS.md`
- `docs/API_CONTRACTS.md`
- `CONTRACTS.md`

### Supported Formats

**Endpoint Definition:**
```markdown
## GET /api/users/{id}

Description of the endpoint.

### Request

- `include` (string, optional): Fields to include

### Response

- `id` (string, required): User ID
- `name` (string, required): User name
- `email` (string, optional): User email

Status codes: 200, 404, 500
```

**Table Format:**
```markdown
## POST /api/users

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | User name |
| email | string | yes | User email |
| role | string | no | User role |
```

### Drift Types

| Drift Type | Severity | Description |
|------------|----------|-------------|
| `endpoint-missing-in-spec` | Error | Endpoint in docs but not in OpenAPI |
| `endpoint-missing-in-docs` | Warning | Endpoint in OpenAPI but not documented |
| `field-missing-in-spec` | Warning | Field documented but not in OpenAPI |
| `field-missing-in-docs` | Warning | Field in OpenAPI but not documented |
| `type-mismatch` | Warning | Field type differs between docs and spec |
| `required-mismatch` | Warning | Field requiredness differs |
| `status-code-missing` | Warning | Status code in one but not other |

### Example Drift Violations

```
ERROR: Endpoint GET /api/legacy/users is documented but not in OpenAPI spec
Line 42 in DATA_CONTRACTS.md

WARNING: Response field "created_at" is in spec but not documented
POST /api/users

WARNING: Request field "role" is documented but not in OpenAPI spec
Line 58 in DATA_CONTRACTS.md
```

## Contract Divergence Check

The `contract_divergence` coordination check (S036) detects when multiple PRs modify the same API contracts:

```yaml
coordination:
  contract_divergence: true  # BLOCK tier - will fail the action
```

### How It Works

1. Scans changed files in current PR for API spec changes
2. Queries GitHub API for other open PRs touching same files
3. Detects if changes conflict (e.g., both modifying same endpoint)
4. Reports conflicts so teams can coordinate

### Example Output

```
BLOCK: API contract divergence with 2 frontend PR(s)

This PR modifies POST /api/users response shape.
The following PRs also depend on this endpoint:

- PR #123 (fe/user-profile) by @Nova
  Modified: src/components/UserProfile.tsx

- PR #125 (fe/user-settings) by @Nova
  Modified: src/hooks/useUser.ts

Coordinate with these PRs before merging to avoid integration issues.
```

## OpenAPI Spec Requirements

### Supported Formats

- OpenAPI 3.0.x (YAML or JSON)
- OpenAPI 3.1.x (YAML or JSON)
- Swagger 2.0 (YAML or JSON)

### Recommended Structure

```yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0

paths:
  /api/users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

components:
  schemas:
    User:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
```

## Best Practices

### 1. Version Your API

Use semantic versioning in paths:
```
/api/v1/users
/api/v2/users
```

### 2. Document Breaking Changes

When making breaking changes, create a new version:
```yaml
paths:
  /api/v2/users:  # New version
    ...
  /api/v1/users:  # Deprecated, still works
    deprecated: true
    ...
```

### 3. Keep Docs in Sync

Update `DATA_CONTRACTS.md` whenever you change the OpenAPI spec. Hawky will catch drift automatically.

### 4. Use Git Refs for Comparison

Hawky compares against the base branch (usually `main`) by default. For comparing against specific commits:

```yaml
# In your workflow
- uses: the-crux-squad/hawky@v1
  env:
    HAWKY_API_BASE_REF: 'HEAD~5'  # Compare against 5 commits ago
```

## Troubleshooting

### "No OpenAPI spec found"

Ensure your spec file is in a supported location with a supported filename. Check the file detection list above.

### "Failed to parse spec"

Validate your OpenAPI spec:
```bash
npx @apidevtools/swagger-cli validate openapi.yaml
```

### "No DATA_CONTRACTS.md found"

This is only a warning if `requireContracts` is not set. The drift check will be skipped.

### False Positives in Drift Detection

Use path parameters consistently:
```markdown
# Good - matches OpenAPI
GET /api/users/{id}

# Bad - won't match
GET /api/users/:id
```

Hawky normalizes `:param` to `{param}` automatically, but explicit `{param}` syntax is preferred.
