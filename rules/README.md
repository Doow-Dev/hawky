# Hawky Custom Semgrep Rules

Custom security rules for the Hawky PR review action.

## Rules Included

| Rule ID | Story | Description | Severity |
|---------|-------|-------------|----------|
| `hawky-math-random-in-auth` | S010 | Math.random() in auth code | ERROR |
| `hawky-math-random-in-auth-file` | S010 | Math.random() in auth files | ERROR |
| `hawky-raw-sql-injection` | S011 | SQL string concatenation | ERROR |
| `hawky-jwt-decode-without-verify` | S012 | JWT decode without verify | ERROR |
| `hawky-jwt-decode-library` | S012 | jwt-decode library usage | WARNING |
| `hawky-commented-auth-check` | S013 | Commented auth checks | ERROR |
| `hawky-commented-middleware` | S013 | Commented middleware | WARNING |
| `hawky-dangerous-innerhtml` | S014 | dangerouslySetInnerHTML | ERROR |
| `hawky-innerhtml-assignment` | S014 | innerHTML assignment | ERROR |
| `hawky-unprotected-route` | S017 | Routes without auth | WARNING |
| `hawky-nextjs-unprotected-api` | S017 | Next.js API no auth | WARNING |
| `hawky-idor-user-id` | S018 | IDOR via user ID | ERROR |
| `hawky-idor-no-ownership` | S018 | No ownership check | WARNING |

## Usage

Add the rules directory to your Hawky configuration:

```yaml
# In your workflow
- uses: your-org/hawky@v1
  with:
    semgrep_rulesets: 'p/security-audit rules/'
```

Or set the environment variable:

```bash
HAWKY_GATE_SEMGREP_RULESETS="p/security-audit rules/"
```

## Testing Rules Locally

```bash
# Validate rules syntax
semgrep --validate --config rules/hawky-security.yaml

# Test against fixtures
semgrep --config rules/hawky-security.yaml __tests__/fixtures/semgrep/

# Test a specific rule
semgrep --config rules/hawky-security.yaml --include "*.ts" .
```

## Rule Categories

### S010: Math.random in Auth
Detects use of `Math.random()` in authentication/security contexts. `Math.random()` is not cryptographically secure.

**Bad:**
```javascript
function generateToken() {
  return Math.random().toString(36);
}
```

**Good:**
```javascript
import crypto from 'crypto';
function generateToken() {
  return crypto.randomUUID();
}
```

### S011: Raw SQL Unsafe
Detects string concatenation in SQL queries (SQL injection risk).

**Bad:**
```javascript
db.query(`SELECT * FROM users WHERE id = ${userId}`);
```

**Good:**
```javascript
db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### S012: Decode vs Verify Token
Detects JWT decode without verification.

**Bad:**
```javascript
const payload = jwt.decode(token);
```

**Good:**
```javascript
const payload = jwt.verify(token, secret);
```

### S013: Commented Guards
Detects commented-out security checks.

**Bad:**
```javascript
// if (!isAuthenticated(user)) return;
doSensitiveOperation();
```

### S014: dangerouslySetInnerHTML
React XSS vulnerability.

**Bad:**
```jsx
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

**Good:**
```jsx
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### S017: Auth Guard Completeness
Routes without authentication middleware.

**Bad:**
```javascript
router.get('/api/users/:id', async (req, res) => { ... });
```

**Good:**
```javascript
router.get('/api/users/:id', requireAuth, async (req, res) => { ... });
```

### S018: IDOR Patterns
Direct object reference without authorization.

**Bad:**
```javascript
const user = await User.findById(req.params.userId);
res.json(user);
```

**Good:**
```javascript
const user = await User.findById(req.params.userId);
if (user.id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
res.json(user);
```
