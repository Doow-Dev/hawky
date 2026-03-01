# Visual Regression Guide

Hawky includes visual regression testing to catch unintended UI changes by comparing screenshots.

## Overview

The visual regression gate:

1. Captures screenshots of configured routes
2. Compares against baseline screenshots
3. Reports pixel differences above threshold
4. Posts diff images in PR comments

## Setup

### 1. Enable the Gate

In `.hawky.yml`:

```yaml
gates:
  visual:
    enabled: true
    blocking: false  # Set true to block on visual changes
    timeout: 600     # 10 minutes for screenshot capture

visual:
  enabled: true
  threshold: 0.1     # 0.1% pixel difference tolerance
  routes:
    - "http://localhost:3000"
    - "http://localhost:3000/dashboard"
    - "http://localhost:3000/settings"
  viewports:
    - width: 1920
      height: 1080
      name: "desktop"
    - width: 375
      height: 667
      name: "mobile"
  waitFor: "[data-ready]"  # CSS selector to wait for
  timeout: 30000           # Wait timeout in ms
```

### 2. Start Your Application

The visual gate needs your application running. Add a setup step:

```yaml
- name: Start Application
  run: |
    npm run build
    npm start &
    npx wait-on http://localhost:3000

- uses: the-crux-squad/hawky@v1
  with:
    visual_enabled: true
    visual_routes: 'http://localhost:3000,http://localhost:3000/dashboard'
```

### 3. Install Playwright

Hawky uses Playwright for screenshot capture:

```yaml
- name: Install Playwright
  run: npx playwright install chromium
```

## Configuration

### Visual Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable visual testing |
| `threshold` | number | `0.1` | Pixel diff tolerance (%) |
| `viewports` | array | `[{1920x1080}]` | Viewport sizes to test |
| `routes` | array | `[]` | URLs to capture |
| `waitFor` | string | - | CSS selector to wait for |
| `timeout` | number | `30000` | Wait timeout (ms) |

### Viewport Configuration

```yaml
viewports:
  - width: 1920
    height: 1080
    name: "desktop"
  - width: 1280
    height: 720
    name: "laptop"
  - width: 768
    height: 1024
    name: "tablet"
  - width: 375
    height: 667
    name: "mobile"
```

### Default Viewports

If no viewports configured, Hawky uses:

| Name | Width | Height |
|------|-------|--------|
| desktop | 1920 | 1080 |
| laptop | 1280 | 720 |
| tablet | 768 | 1024 |
| mobile | 375 | 667 |

## Baseline Management

### Initial Setup

On first run without baselines, Hawky captures screenshots and passes (no comparison possible):

```
No baseline found for http://localhost:3000 at desktop, capturing initial screenshot
```

### Updating Baselines

To update baselines after intentional changes:

1. **Manual Workflow:**

```yaml
name: Update Visual Baselines
on:
  workflow_dispatch:

jobs:
  update-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm start &
      - run: npx wait-on http://localhost:3000

      - uses: the-crux-squad/hawky@v1
        with:
          mode: 'baseline'
          visual_enabled: true
          visual_routes: 'http://localhost:3000'
```

2. **Auto-approve workflow:**

When a visual change is intentional, approve by committing new baselines:

```yaml
- name: Commit Updated Baselines
  if: failure()
  run: |
    git config user.name github-actions
    git config user.email github-actions@github.com
    git add .hawky/visual/
    git commit -m "chore: update visual baselines"
    git push
```

### Baseline Storage

Baselines are stored in:
```
.hawky/visual/baseline/
  baseline-localhost-3000-desktop.png
  baseline-localhost-3000-mobile.png
  baseline-localhost-3000-dashboard-desktop.png
```

Current screenshots are captured to a temp directory during testing.

## Screenshot Capture

### Wait Strategies

Use `waitFor` to ensure the page is ready:

```yaml
visual:
  waitFor: "[data-ready]"  # Wait for this selector to appear
```

Common patterns:
- `[data-ready]` - Custom ready attribute
- `#app` - Main app container
- `.loaded` - Loading complete class
- `[data-testid="content"]` - Test ID

### Authentication

For authenticated pages, provide auth headers:

```yaml
# In workflow
env:
  HAWKY_VISUAL_AUTH_HEADER: "Authorization: Bearer ${{ secrets.TEST_TOKEN }}"
```

### API Mocking

For consistent screenshots, mock API responses:

```yaml
visual:
  routes:
    - url: "http://localhost:3000/users"
      mocks:
        - route: "/api/users"
          response: { "users": [] }
          status: 200
```

## Diff Algorithm

Hawky uses pixel-by-pixel comparison with:

- **Color tolerance** - Slight color variations are ignored
- **Anti-aliasing detection** - Font rendering differences are reduced
- **Threshold-based pass/fail** - Only differences above threshold fail

### Threshold Guidelines

| Threshold | Use Case |
|-----------|----------|
| `0.01` (0.01%) | Critical UI, no changes tolerated |
| `0.1` (0.1%) | Default, catches significant changes |
| `0.5` (0.5%) | Lenient, only major changes |
| `1.0` (1%) | Very lenient, layout changes only |

### Diff Output

When differences exceed threshold:

```
Visual regression at http://localhost:3000 (desktop): 2.34% difference
```

A diff image is generated highlighting changed pixels:
- **Red** - Pixels only in baseline
- **Green** - Pixels only in current
- **Yellow** - Changed pixels

## PR Comment Output

Visual results appear in the PR comment:

```markdown
## Visual Regression

**Status:** 2 regressions detected

| Route | Viewport | Diff | Status |
|-------|----------|------|--------|
| /dashboard | desktop | 2.34% | FAIL |
| /dashboard | mobile | 0.05% | PASS |
| /settings | desktop | 0.00% | PASS |

<details>
<summary>View Diff Images</summary>

### /dashboard (desktop) - 2.34% difference

![Baseline](baseline-dashboard-desktop.png)
![Current](current-dashboard-desktop.png)
![Diff](diff-dashboard-desktop.png)

</details>
```

## Example Workflow

```yaml
name: Visual Regression Tests
on: [pull_request]

jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Build Application
        run: npm run build

      - name: Start Application
        run: |
          npm start &
          npx wait-on http://localhost:3000

      - name: Run Hawky Visual Tests
        uses: the-crux-squad/hawky@v1
        with:
          gates: 'visual'
          visual_enabled: true
          visual_routes: |
            http://localhost:3000
            http://localhost:3000/dashboard
            http://localhost:3000/settings
          visual_threshold: '0.1'
```

## Best Practices

### 1. Use Stable Data

Mock API responses for consistent screenshots:

```tsx
// In your test setup
if (process.env.VISUAL_TEST) {
  return mockData;
}
```

### 2. Disable Animations

Animations cause false positives. Disable them during visual tests:

```css
/* In test mode */
*, *::before, *::after {
  animation-duration: 0s !important;
  transition-duration: 0s !important;
}
```

### 3. Use Data Attributes for Ready State

```tsx
function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // After data loads
    setReady(true);
  }, []);

  return <div data-ready={ready}>...</div>;
}
```

### 4. Test Critical Pages Only

Focus on pages where visual changes matter most:
- Landing page
- Key user flows
- Component library pages

### 5. Review Diffs Before Approval

Always review diff images before approving baselines. The diff highlights what changed.

## Troubleshooting

### "Baseline screenshot not found"

First run or baseline was deleted. Run will pass and capture initial baseline.

### "Screenshot capture failed"

Check that:
1. Application is running at the specified URL
2. `waitFor` selector exists on the page
3. Playwright is installed
4. Timeout is sufficient

### "Visual test error: timeout"

Page didn't load in time. Increase timeout:

```yaml
visual:
  timeout: 60000  # 60 seconds
```

### Inconsistent Screenshots

Common causes:
- Animations (disable them)
- Dynamic content (mock it)
- Font loading (wait for fonts)
- Date/time displays (mock dates)

### High False Positive Rate

Increase threshold for lenient comparison:

```yaml
visual:
  threshold: 0.5  # 0.5% tolerance
```

Or exclude problematic routes:

```yaml
visual:
  routes:
    - "http://localhost:3000"  # Keep
    # - "http://localhost:3000/dynamic-page"  # Exclude
```

## Advanced Configuration

### Multiple Environments

Test across environments:

```yaml
name: Visual Tests
on: [pull_request]

jobs:
  visual:
    strategy:
      matrix:
        env: [staging, production]
    steps:
      - uses: the-crux-squad/hawky@v1
        with:
          visual_enabled: true
          visual_routes: "https://${{ matrix.env }}.example.com"
```

### Parallel Viewports

Run viewports in parallel for faster execution:

```yaml
jobs:
  visual:
    strategy:
      matrix:
        viewport: [desktop, mobile, tablet]
    steps:
      - uses: the-crux-squad/hawky@v1
        env:
          HAWKY_VISUAL_VIEWPORT: ${{ matrix.viewport }}
```

### Custom Screenshots Directory

```yaml
env:
  HAWKY_VISUAL_BASELINE_DIR: ".hawky/visual/baseline"
  HAWKY_VISUAL_CURRENT_DIR: ".hawky/visual/current"
```
