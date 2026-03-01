/**
 * Unit tests for Design System Gate
 *
 * Tests all scanner functions:
 * - S026: Banned Class Scanner
 * - S027: Hardcoded Color Detection
 * - S028: Spacing Scale Enforcement
 * - S029: Arbitrary Font Size Detection
 * - S030: Component Duplication Detection
 * - S031: Existing Component Suggestion
 * - S032: CSS Variable Opacity Detection
 * - S033: Design System File Blast Radius
 * - S034: Tailwind Class Conflict Detection
 */

import {
  scanForBannedClasses,
  scanForHardcodedColors,
  scanForSpacingViolations,
  scanForFontSizeViolations,
  scanForCssVarOpacity,
  scanForTailwindConflicts,
} from '../../src/gates/design-system';

// ============================================================================
// S026: Banned Class Scanner
// ============================================================================

describe('scanForBannedClasses', () => {
  it('detects default banned patterns', () => {
    const violations = scanForBannedClasses('<div className="bg-[#ff0000]">Hello</div>', 'test.tsx', []);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('design-system/banned-class');
  });

  it('ignores valid design system classes', () => {
    const violations = scanForBannedClasses('<div className="bg-primary p-4">Hello</div>', 'test.tsx', []);
    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S027: Hardcoded Color Detection
// ============================================================================

describe('scanForHardcodedColors', () => {
  it('detects hex colors', () => {
    const violations = scanForHardcodedColors('.button { color: #fff; }', 'test.css');
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe('design-system/hardcoded-color');
  });

  it('allows CSS variable definitions', () => {
    const violations = scanForHardcodedColors(':root { --color-primary: #ff5500; }', 'test.css');
    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S028: Spacing Scale Enforcement
// ============================================================================

describe('scanForSpacingViolations', () => {
  it('detects non-scale values', () => {
    const violations = scanForSpacingViolations('.button { padding: 13px; }', 'test.css', [4, 8, 12, 16]);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe('design-system/spacing-scale');
  });

  it('allows scale values', () => {
    const violations = scanForSpacingViolations('.button { padding: 16px; }', 'test.css', [4, 8, 12, 16]);
    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S029: Arbitrary Font Size Detection
// ============================================================================

describe('scanForFontSizeViolations', () => {
  it('detects non-scale values', () => {
    const violations = scanForFontSizeViolations('.h1 { font-size: 15px; }', 'test.css', [12, 14, 16, 18]);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe('design-system/font-size-scale');
  });

  it('allows scale values', () => {
    const violations = scanForFontSizeViolations('.h1 { font-size: 16px; }', 'test.css', [12, 14, 16, 18]);
    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S032: CSS Variable Opacity Detection
// ============================================================================

describe('scanForCssVarOpacity', () => {
  it('detects rgba with CSS variable anti-pattern', () => {
    const content = `.overlay { background: rgba(var(--color-primary), 0.5); }`;
    const violations = scanForCssVarOpacity(content, 'test.css');

    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe('design-system/css-var-opacity');
    expect(violations[0].suggestion).toContain('color-mix');
  });

  it('allows proper CSS variable usage', () => {
    const content = `.overlay { background: var(--color-primary); }`;
    const violations = scanForCssVarOpacity(content, 'test.css');

    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S034: Tailwind Class Conflict Detection
// ============================================================================

describe('scanForTailwindConflicts', () => {
  it('detects conflicting padding classes', () => {
    const content = '<div className="p-4 p-8">Content</div>';
    const violations = scanForTailwindConflicts(content, 'test.tsx');

    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe('design-system/tailwind-conflict');
    expect(violations[0].message).toContain('padding');
  });

  it('detects conflicting text color classes', () => {
    const content = '<span className="text-red-500 text-blue-500">Error</span>';
    const violations = scanForTailwindConflicts(content, 'test.tsx');

    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('textColor');
  });

  it('detects conflicting display classes', () => {
    const content = '<div className="flex block">Content</div>';
    const violations = scanForTailwindConflicts(content, 'test.tsx');

    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('display');
  });

  it('allows non-conflicting classes', () => {
    const content = '<div className="flex items-center justify-between p-4 text-white bg-blue-500">Content</div>';
    const violations = scanForTailwindConflicts(content, 'test.tsx');

    expect(violations.length).toBe(0);
  });

  it('handles cn() and clsx() utilities', () => {
    const content = `const cls = cn("p-4 p-8 flex");`;
    const violations = scanForTailwindConflicts(content, 'test.tsx');

    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('p-4');
  });
});
