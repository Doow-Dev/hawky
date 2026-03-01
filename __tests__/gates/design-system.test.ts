/**
 * Unit tests for Design System Gate
 *
 * Tests all four scanner functions:
 * - S026: Banned Class Scanner
 * - S027: Hardcoded Color Detection
 * - S028: Spacing Scale Enforcement
 * - S029: Arbitrary Font Size Detection
 */

import {
  scanForBannedClasses,
  scanForHardcodedColors,
  scanForSpacingViolations,
  scanForFontSizeViolations,
} from '../../src/gates/design-system';

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
