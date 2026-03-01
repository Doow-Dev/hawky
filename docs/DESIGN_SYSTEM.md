# Design System Guide

Hawky's design system gate enforces design token compliance in your CSS and component code.

## Overview

The design system gate detects:

1. **Banned Tailwind Classes** (S026) - Deprecated or arbitrary utility classes
2. **Hardcoded Colors** (S027) - Raw hex/rgb values instead of design tokens
3. **Non-Scale Spacing** (S028) - Arbitrary spacing values outside your scale
4. **Arbitrary Font Sizes** (S029) - Font sizes not in your typography scale
5. **Component Duplication** (S030) - Similar component patterns that should be unified
6. **Existing Component Suggestions** (S031) - When existing components could be reused
7. **CSS Variable Opacity Anti-Pattern** (S032) - Improper opacity handling
8. **Design Token Blast Radius** (S033) - Changes to tokens that affect many components
9. **Tailwind Class Conflicts** (S034) - Conflicting utility classes

## Configuration

Enable the design system gate in `.hawky.yml`:

```yaml
gates:
  design-system:
    enabled: true
    blocking: false  # Set to true to block PRs on violations
    timeout: 300

    # Custom configuration
    bannedClasses:
      - "mt-8"        # Use spacing tokens
      - "text-red-*"  # Use color tokens
      - "p-[*px]"     # No arbitrary padding

    spacingScale:
      - 4
      - 8
      - 12
      - 16
      - 20
      - 24
      - 32
      - 40
      - 48
      - 64

    fontSizeScale:
      - 12
      - 14
      - 16
      - 18
      - 20
      - 24
      - 30
      - 36
      - 48
      - 60
      - 72

    allowHardcodedColors: false  # Set true during migration
```

## Scanned Files

The gate scans these file types:
- `.css`, `.scss` - Stylesheets
- `.tsx`, `.jsx` - React components
- `.ts`, `.js` - JavaScript/TypeScript files

## Violation Types

### Banned Classes

Detects use of deprecated or non-standard utility classes.

**Default Patterns:**
```
bg-[#......]     # Arbitrary background colors
text-[#......]   # Arbitrary text colors
border-[#......]  # Arbitrary border colors
p-[...px]        # Arbitrary padding
m-[...px]        # Arbitrary margin
gap-[...px]      # Arbitrary gap
w-[...px]        # Arbitrary width
h-[...px]        # Arbitrary height
```

**Example Violation:**
```tsx
// BAD
<div className="bg-[#FF5733] p-[13px]">

// GOOD
<div className="bg-error-500 p-4">
```

**PR Comment:**
```
src/components/Card.tsx:42
Banned class detected: bg-[#FF5733]
Use design tokens instead of arbitrary values
```

### Hardcoded Colors

Detects raw color values that should use design tokens.

**Detected Patterns:**
```css
/* Hex colors */
color: #ff5733;
background: #fff;

/* RGB/RGBA */
color: rgb(255, 87, 51);
background: rgba(0, 0, 0, 0.5);

/* HSL/HSLA */
color: hsl(9, 100%, 60%);
```

**Example Violation:**
```css
/* BAD */
.button {
  background-color: #FF0000;
  color: #FFFFFF;
}

/* GOOD */
.button {
  background-color: var(--color-error);
  color: var(--color-text-inverse);
}
```

**PR Comment:**
```
src/styles/button.css:15
Hardcoded hex color detected: #FF0000
Use CSS variable: var(--color-*)
```

### Non-Scale Spacing

Detects spacing values that don't match your spacing scale.

**Configuration:**
```yaml
spacingScale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
```

**Example Violation:**
```css
/* BAD - 13px not in scale */
.card {
  padding: 13px;
  margin-bottom: 15px;
}

/* GOOD - using scale values */
.card {
  padding: 12px;  /* or var(--space-3) */
  margin-bottom: 16px;  /* or var(--space-4) */
}
```

**PR Comment:**
```
src/styles/card.css:8
Non-scale spacing value: 13px
Use spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

### Arbitrary Font Sizes

Detects font sizes outside your typography scale.

**Configuration:**
```yaml
fontSizeScale: [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72]
```

**Example Violation:**
```css
/* BAD - 17px not in scale */
.heading {
  font-size: 17px;
}

/* GOOD - using scale value */
.heading {
  font-size: 18px;  /* or var(--font-size-lg) */
}
```

### Component Duplication

Detects similar component patterns that could be consolidated.

**Example:**
```tsx
// File 1: src/components/PrimaryButton.tsx
export function PrimaryButton({ children }) {
  return <button className="bg-blue-500 text-white px-4 py-2 rounded">{children}</button>
}

// File 2: src/components/SecondaryButton.tsx
export function SecondaryButton({ children }) {
  return <button className="bg-gray-500 text-white px-4 py-2 rounded">{children}</button>
}
```

**PR Comment:**
```
Component duplication detected

PrimaryButton and SecondaryButton share 80% of their implementation.
Consider consolidating into a single Button component with variant props.

Affected files:
- src/components/PrimaryButton.tsx
- src/components/SecondaryButton.tsx
```

### Tailwind Class Conflicts

Detects conflicting utility classes on the same element.

**Example Violation:**
```tsx
// BAD - conflicting padding classes
<div className="p-4 p-8 px-6">

// GOOD - single padding value
<div className="p-4">
```

**PR Comment:**
```
src/components/Layout.tsx:28
Conflicting Tailwind classes: p-4, p-8
Remove one of the conflicting classes
```

## Suppression

### File-Level Suppression

In `.hawkyignore`:
```
# Ignore all design system rules in legacy folder
design-system:*:legacy/**

# Ignore specific rule
design-system:hardcoded-color:src/theme/**
```

### Inline Suppression

```tsx
// hawk-ignore [design-system]: Legacy code, scheduled for refactor Q3
<div className="bg-[#FF0000]">
```

## Migration Strategy

### Phase 1: Baseline

Generate a baseline to track existing violations:

```bash
# In GitHub Actions
mode: 'baseline'
```

This creates `.hawky/baseline.json` with all current violations.

### Phase 2: Grace Period

Allow time for migration:

```yaml
grace_period:
  end_date: "2026-04-01"  # Or: sprints: 2

gates:
  design-system:
    enabled: true
    blocking: false  # Warnings only
```

### Phase 3: Enforcement

After grace period, enable blocking:

```yaml
gates:
  design-system:
    enabled: true
    blocking: true
```

Only NEW violations will block. Baseline violations are tracked but non-blocking.

## Best Practices

### 1. Define Your Scale First

Document your spacing and typography scales:

```css
:root {
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  /* ... */

  /* Typography */
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  /* ... */
}
```

### 2. Use Semantic Tokens

Instead of raw values:
```css
/* BAD */
color: #FF0000;

/* GOOD */
color: var(--color-error);
```

### 3. Configure Banned Classes

Add project-specific patterns:
```yaml
bannedClasses:
  - "text-xs"      # Use --font-size-xs
  - "leading-*"    # Use --line-height-*
  - "tracking-*"   # Use --letter-spacing-*
```

### 4. Enable During Development

Add to local pre-commit hooks for immediate feedback.

## Example Output

```
---------------------------------------------------
DESIGN SYSTEM REPORT
---------------------------------------------------

Status: FAIL (5 violations)

Violations by Type:
- Hardcoded colors: 3
- Non-scale spacing: 1
- Banned classes: 1

Files Affected:
- src/components/Card.tsx (2 violations)
- src/styles/button.css (2 violations)
- src/pages/Home.tsx (1 violation)

Details:

src/components/Card.tsx:42
  [hardcoded-color] Hardcoded hex color: #FF5733
  Suggestion: Use var(--color-warning)

src/components/Card.tsx:58
  [banned-class] Arbitrary padding: p-[13px]
  Suggestion: Use p-3 (12px) or p-4 (16px)

src/styles/button.css:15
  [hardcoded-color] Hardcoded hex color: #FF0000
  Suggestion: Use var(--color-error)

src/styles/button.css:23
  [non-scale-spacing] Non-scale spacing: 15px
  Suggestion: Use 16px (--space-4)

src/pages/Home.tsx:89
  [hardcoded-color] Hardcoded RGB color: rgb(255, 255, 255)
  Suggestion: Use var(--color-white)
```
