/**
 * Design System Gate
 *
 * Enforces design system compliance by detecting:
 * 1. Banned Tailwind classes (S026)
 * 2. Hardcoded colors (S027)
 * 3. Non-scale spacing values (S028)
 * 4. Arbitrary font sizes (S029)
 *
 * Scans CSS, SCSS, TSX, JSX files for violations.
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * File extensions to scan for design system violations
 */
const SCANNABLE_EXTENSIONS = ['.css', '.scss', '.tsx', '.jsx', '.ts', '.js'];

/**
 * Default banned class patterns (common anti-patterns)
 */
const DEFAULT_BANNED_PATTERNS = [
  // Arbitrary color classes — should use design tokens
  'bg-\\[#[0-9a-fA-F]{3,8}\\]',
  'text-\\[#[0-9a-fA-F]{3,8}\\]',
  'border-\\[#[0-9a-fA-F]{3,8}\\]',
  // Arbitrary spacing — should use scale
  'p-\\[\\d+px\\]',
  'm-\\[\\d+px\\]',
  'gap-\\[\\d+px\\]',
  // Arbitrary sizing
  'w-\\[\\d+px\\]',
  'h-\\[\\d+px\\]',
];

/**
 * Regex patterns for hardcoded colors
 */
const COLOR_PATTERNS = [
  // Hex colors: #fff, #ffffff, #ffffffff
  { pattern: /#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b/, name: 'hex color' },
  // RGB/RGBA: rgb(255, 255, 255), rgba(255, 255, 255, 0.5)
  { pattern: /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/, name: 'rgb color' },
  // HSL/HSLA: hsl(360, 100%, 50%), hsla(360, 100%, 50%, 0.5)
  { pattern: /hsla?\s*\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+\s*)?\)/, name: 'hsl color' },
];

// Note: color allowlist contexts are handled inline in isInAllowlistedContext()

/**
 * Regex patterns for spacing values
 */
const SPACING_PATTERNS = [
  // CSS properties with px values
  { pattern: /(?:padding|margin|gap|top|right|bottom|left|inset):\s*(\d+)px/, property: 'spacing' },
  { pattern: /(?:padding|margin|gap|top|right|bottom|left|inset)-(?:top|right|bottom|left|x|y):\s*(\d+)px/, property: 'spacing' },
  // Tailwind arbitrary values
  { pattern: /(?:p|m|gap|inset|top|right|bottom|left)-\[(\d+)px\]/, property: 'tailwind spacing' },
  { pattern: /(?:pt|pr|pb|pl|px|py|mt|mr|mb|ml|mx|my)-\[(\d+)px\]/, property: 'tailwind spacing' },
];

/**
 * Regex patterns for font sizes
 */
const FONT_SIZE_PATTERNS = [
  // CSS font-size property
  { pattern: /font-size:\s*(\d+)px/, property: 'font-size' },
  // Tailwind arbitrary font sizes
  { pattern: /text-\[(\d+)px\]/, property: 'tailwind text' },
];

/**
 * Design system violation types
 */
type DesignSystemViolationType = 'banned-class' | 'hardcoded-color' | 'spacing-scale' | 'font-size-scale';

/**
 * Extended violation with design system specific info
 */
interface DesignSystemViolation extends Violation {
  violationType: DesignSystemViolationType;
  actualValue?: string | number;
  suggestion?: string;
}

/**
 * Get design system gate configuration
 */
function getDesignSystemConfig(): {
  bannedClasses: string[];
  spacingScale: number[];
  fontSizeScale: number[];
  allowHardcodedColors: boolean;
} {
  // Read from environment variables (set by index.ts from config)
  const bannedClassesRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_BANNED_CLASSES'];
  const spacingScaleRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_SPACING_SCALE'];
  const fontSizeScaleRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_FONT_SIZE_SCALE'];
  const allowHardcodedColorsRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_ALLOW_HARDCODED_COLORS'];

  return {
    bannedClasses: bannedClassesRaw ? JSON.parse(bannedClassesRaw) : [],
    spacingScale: spacingScaleRaw
      ? JSON.parse(spacingScaleRaw)
      : [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384],
    fontSizeScale: fontSizeScaleRaw
      ? JSON.parse(fontSizeScaleRaw)
      : [10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128],
    allowHardcodedColors: allowHardcodedColorsRaw === 'true',
  };
}

/**
 * Convert glob pattern to regex
 * Supports * as wildcard
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '[\\w-]*'); // Convert * to word chars + hyphen
  return new RegExp(`\\b${escaped}\\b`);
}

/**
 * Find the nearest value in a scale
 */
function findNearestInScale(value: number, scale: number[]): number {
  return scale.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * Check if a line is inside a comment or allowlisted context
 */
function isInAllowlistedContext(line: string, matchIndex: number): boolean {
  // Check if the match is inside a comment
  const beforeMatch = line.substring(0, matchIndex);

  // Single-line comment check
  if (beforeMatch.includes('//')) {
    return true;
  }

  // Block comment check (simple — doesn't handle multi-line)
  const lastBlockOpen = beforeMatch.lastIndexOf('/*');
  const lastBlockClose = beforeMatch.lastIndexOf('*/');
  if (lastBlockOpen > lastBlockClose) {
    return true;
  }

  return false;
}

/**
 * Scan a single file for banned classes
 */
export function scanForBannedClasses(
  content: string,
  filePath: string,
  bannedPatterns: string[]
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const lines = content.split('\n');

  // Compile patterns (user-provided + defaults)
  const patterns = [...bannedPatterns, ...DEFAULT_BANNED_PATTERNS].map((p) => {
    try {
      // If it looks like a glob pattern (has *), convert it
      if (p.includes('*') && !p.includes('\\*')) {
        return globToRegex(p);
      }
      // Otherwise treat as regex
      return new RegExp(p, 'g');
    } catch {
      core.debug(`Invalid pattern: ${p}`);
      return null;
    }
  }).filter((p): p is RegExp => p !== null);

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    for (const pattern of patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const matchedText = match[0];
        const matchIndex = match.index;

        // Skip if in comment
        if (isInAllowlistedContext(line, matchIndex)) {
          continue;
        }

        violations.push({
          ruleId: 'design-system/banned-class',
          file: filePath,
          line: lineNum + 1,
          column: matchIndex + 1,
          message: `Banned class "${matchedText}" detected. Use design system tokens instead.`,
          gate: 'design-system',
          severity: 'error',
          violationType: 'banned-class',
          actualValue: matchedText,
          suggestion: 'Replace with design system token class',
        });
      }
    }
  }

  return violations;
}

/**
 * Scan a single file for hardcoded colors
 */
export function scanForHardcodedColors(
  content: string,
  filePath: string
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    // Skip CSS variable definitions (defining tokens is OK)
    if (/--[\w-]+:/.test(line)) {
      continue;
    }

    for (const { pattern, name } of COLOR_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, 'gi');
      let match;

      while ((match = globalPattern.exec(line)) !== null) {
        const matchedText = match[0];
        const matchIndex = match.index;

        // Skip if in comment
        if (isInAllowlistedContext(line, matchIndex)) {
          continue;
        }

        violations.push({
          ruleId: 'design-system/hardcoded-color',
          file: filePath,
          line: lineNum + 1,
          column: matchIndex + 1,
          message: `Hardcoded ${name} "${matchedText}" detected. Use CSS variables or design tokens instead.`,
          gate: 'design-system',
          severity: 'error',
          violationType: 'hardcoded-color',
          actualValue: matchedText,
          suggestion: 'Replace with CSS variable (e.g., var(--color-primary)) or Tailwind token',
        });
      }
    }
  }

  return violations;
}

/**
 * Scan a single file for non-scale spacing values
 */
export function scanForSpacingViolations(
  content: string,
  filePath: string,
  spacingScale: number[]
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    for (const { pattern, property } of SPACING_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, 'gi');
      let match;

      while ((match = globalPattern.exec(line)) !== null) {
        const matchIndex = match.index;
        const capturedValue = match[1];

        // Skip if in comment or no captured group
        if (isInAllowlistedContext(line, matchIndex) || !capturedValue) {
          continue;
        }

        const value = parseInt(capturedValue, 10);

        // Check if value is in scale
        if (!spacingScale.includes(value)) {
          const nearest = findNearestInScale(value, spacingScale);
          violations.push({
            ruleId: 'design-system/spacing-scale',
            file: filePath,
            line: lineNum + 1,
            column: matchIndex + 1,
            message: `${property} value ${value}px is not in spacing scale. Nearest scale value: ${nearest}px`,
            gate: 'design-system',
            severity: 'error',
            violationType: 'spacing-scale',
            actualValue: value,
            suggestion: `Use ${nearest}px instead, or add ${value} to your spacing scale config`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Scan a single file for non-scale font sizes
 */
export function scanForFontSizeViolations(
  content: string,
  filePath: string,
  fontSizeScale: number[]
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    for (const { pattern, property } of FONT_SIZE_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, 'gi');
      let match;

      while ((match = globalPattern.exec(line)) !== null) {
        const matchIndex = match.index;
        const capturedValue = match[1];

        // Skip if in comment or no captured group
        if (isInAllowlistedContext(line, matchIndex) || !capturedValue) {
          continue;
        }

        const value = parseInt(capturedValue, 10);

        // Check if value is in scale
        if (!fontSizeScale.includes(value)) {
          const nearest = findNearestInScale(value, fontSizeScale);
          violations.push({
            ruleId: 'design-system/font-size-scale',
            file: filePath,
            line: lineNum + 1,
            column: matchIndex + 1,
            message: `${property} value ${value}px is not in font size scale. Nearest scale value: ${nearest}px`,
            gate: 'design-system',
            severity: 'error',
            violationType: 'font-size-scale',
            actualValue: value,
            suggestion: `Use ${nearest}px or Tailwind class like text-sm, text-base, text-lg`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Convert a design system violation to a GitHub annotation
 */
export function violationToAnnotation(violation: DesignSystemViolation): Annotation {
  const annotation: Annotation = {
    file: violation.file,
    line: violation.line,
    message: violation.message,
    severity: 'error',
    ruleId: violation.ruleId,
    title: `Design System: ${violation.violationType}`,
  };
  if (violation.column !== undefined) {
    annotation.column = violation.column;
  }
  return annotation;
}

/**
 * Get changed files that are scannable
 */
async function getScannableFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];
  let output = '';

  const base = process.env['GITHUB_BASE_REF'] || 'main';

  try {
    await exec.exec('git', ['diff', '--name-only', '--diff-filter=ACMR', `origin/${base}...HEAD`], {
      cwd,
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });

    const changedFiles = output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .filter((f) => SCANNABLE_EXTENSIONS.some((ext) => f.endsWith(ext)));

    // Filter to only existing files
    for (const file of changedFiles) {
      const fullPath = path.join(cwd, file);
      if (fs.existsSync(fullPath)) {
        files.push(file);
      }
    }
  } catch (error) {
    core.debug(`Failed to get changed files: ${error}`);
  }

  return files;
}

/**
 * Design System Gate implementation
 */
export const designSystemGate: Gate = {
  name: 'design-system',
  displayName: 'Design System',

  async canRun(cwd: string): Promise<boolean> {
    // Gate can always run — it's static analysis
    // But we need scannable files to exist
    const files = await getScannableFiles(cwd);
    return files.length > 0;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const { cwd, createAnnotations } = options;

    // Get configuration
    const config = getDesignSystemConfig();

    // Get changed files
    const files = await getScannableFiles(cwd);

    if (files.length === 0) {
      return {
        gate: 'design-system',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No CSS/JS/TS files changed in PR',
      };
    }

    core.info(`Scanning ${files.length} file(s) for design system violations...`);

    const allViolations: DesignSystemViolation[] = [];

    // Scan each file
    for (const file of files) {
      const fullPath = path.join(cwd, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Normalize file path for consistent reporting
      const normalizedPath = file.replace(/\\/g, '/');

      // S026: Banned classes
      if (config.bannedClasses.length > 0 || DEFAULT_BANNED_PATTERNS.length > 0) {
        const bannedViolations = scanForBannedClasses(content, normalizedPath, config.bannedClasses);
        allViolations.push(...bannedViolations);
      }

      // S027: Hardcoded colors
      if (!config.allowHardcodedColors) {
        const colorViolations = scanForHardcodedColors(content, normalizedPath);
        allViolations.push(...colorViolations);
      }

      // S028: Spacing scale
      const spacingViolations = scanForSpacingViolations(content, normalizedPath, config.spacingScale);
      allViolations.push(...spacingViolations);

      // S029: Font size scale
      const fontSizeViolations = scanForFontSizeViolations(content, normalizedPath, config.fontSizeScale);
      allViolations.push(...fontSizeViolations);
    }

    const timeMs = Date.now() - startTime;

    // If no violations, gate passes
    if (allViolations.length === 0) {
      return {
        gate: 'design-system',
        status: 'pass',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs,
        message: 'No design system violations found',
      };
    }

    // Create annotations
    const annotations: Annotation[] = [];
    if (createAnnotations) {
      for (const violation of allViolations) {
        annotations.push(violationToAnnotation(violation));
      }
    }

    // Group violations by type for summary
    const byType = {
      'banned-class': allViolations.filter((v) => v.violationType === 'banned-class').length,
      'hardcoded-color': allViolations.filter((v) => v.violationType === 'hardcoded-color').length,
      'spacing-scale': allViolations.filter((v) => v.violationType === 'spacing-scale').length,
      'font-size-scale': allViolations.filter((v) => v.violationType === 'font-size-scale').length,
    };

    const messageParts: string[] = [];
    if (byType['banned-class'] > 0) messageParts.push(`${byType['banned-class']} banned class(es)`);
    if (byType['hardcoded-color'] > 0) messageParts.push(`${byType['hardcoded-color']} hardcoded color(s)`);
    if (byType['spacing-scale'] > 0) messageParts.push(`${byType['spacing-scale']} spacing violation(s)`);
    if (byType['font-size-scale'] > 0) messageParts.push(`${byType['font-size-scale']} font size violation(s)`);

    return {
      gate: 'design-system',
      status: 'fail',
      totalViolations: allViolations.length,
      newViolations: allViolations.length, // Caller updates after filtering
      existingViolations: 0,
      ignoredViolations: 0,
      annotations,
      violations: allViolations,
      timeMs,
      message: messageParts.join(', '),
    };
  },
};

export default designSystemGate;
