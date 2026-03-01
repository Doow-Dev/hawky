/**
 * Design System Gate
 *
 * Enforces design system compliance by detecting:
 * 1. Banned Tailwind classes (S026)
 * 2. Hardcoded colors (S027)
 * 3. Non-scale spacing values (S028)
 * 4. Arbitrary font sizes (S029)
 * 5. Component duplication (S030)
 * 6. Existing component suggestions (S031)
 * 7. CSS variable opacity anti-pattern (S032)
 * 8. Design token blast radius (S033)
 * 9. Tailwind class conflicts (S034)
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
type DesignSystemViolationType =
  | 'banned-class'
  | 'hardcoded-color'
  | 'spacing-scale'
  | 'font-size-scale'
  | 'component-duplication'
  | 'css-var-opacity'
  | 'token-blast-radius'
  | 'tailwind-conflict';

/**
 * Extended violation with design system specific info
 */
interface DesignSystemViolation extends Violation {
  violationType: DesignSystemViolationType;
  actualValue?: string | number;
  suggestion?: string;
}

/**
 * Component index entry for S031 suggestions
 */
interface ComponentIndexEntry {
  name: string;
  path: string;
  structure: string; // Serialized JSX structure for matching
}

/**
 * JSX structure representation for duplication detection (S030)
 */
interface JsxStructure {
  tagName: string;
  props: string[];
  children: JsxStructure[];
  line: number;
  column: number;
}

/**
 * Tailwind class conflict groups (S034)
 */
const TAILWIND_CONFLICT_GROUPS: Record<string, RegExp[]> = {
  // Display
  display: [/^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden|table|table-row|table-cell|contents|list-item|flow-root)$/],
  // Position
  position: [/^(static|fixed|absolute|relative|sticky)$/],
  // Padding
  padding: [/^p-\d+$/, /^p-\[.+\]$/, /^px-\d+$/, /^py-\d+$/, /^pt-\d+$/, /^pr-\d+$/, /^pb-\d+$/, /^pl-\d+$/],
  paddingX: [/^px-\d+$/, /^px-\[.+\]$/],
  paddingY: [/^py-\d+$/, /^py-\[.+\]$/],
  paddingTop: [/^pt-\d+$/, /^pt-\[.+\]$/],
  paddingRight: [/^pr-\d+$/, /^pr-\[.+\]$/],
  paddingBottom: [/^pb-\d+$/, /^pb-\[.+\]$/],
  paddingLeft: [/^pl-\d+$/, /^pl-\[.+\]$/],
  // Margin
  margin: [/^m-\d+$/, /^m-\[.+\]$/, /^m-auto$/, /^-m-\d+$/],
  marginX: [/^mx-\d+$/, /^mx-\[.+\]$/, /^mx-auto$/],
  marginY: [/^my-\d+$/, /^my-\[.+\]$/, /^my-auto$/],
  marginTop: [/^mt-\d+$/, /^mt-\[.+\]$/, /^mt-auto$/, /^-mt-\d+$/],
  marginRight: [/^mr-\d+$/, /^mr-\[.+\]$/, /^mr-auto$/, /^-mr-\d+$/],
  marginBottom: [/^mb-\d+$/, /^mb-\[.+\]$/, /^mb-auto$/, /^-mb-\d+$/],
  marginLeft: [/^ml-\d+$/, /^ml-\[.+\]$/, /^ml-auto$/, /^-ml-\d+$/],
  // Text color
  textColor: [/^text-(inherit|current|transparent|black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$/, /^text-\[.+\]$/],
  // Background color
  bgColor: [/^bg-(inherit|current|transparent|black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$/, /^bg-\[.+\]$/],
  // Font size
  fontSize: [/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/, /^text-\[\d+px\]$/],
  // Font weight
  fontWeight: [/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/],
  // Width
  width: [/^w-\d+$/, /^w-\[.+\]$/, /^w-(auto|full|screen|min|max|fit|px)$/, /^w-\d+\/\d+$/],
  // Height
  height: [/^h-\d+$/, /^h-\[.+\]$/, /^h-(auto|full|screen|min|max|fit|px)$/, /^h-\d+\/\d+$/],
  // Flex direction
  flexDirection: [/^flex-(row|row-reverse|col|col-reverse)$/],
  // Justify content
  justifyContent: [/^justify-(start|end|center|between|around|evenly|stretch)$/],
  // Align items
  alignItems: [/^items-(start|end|center|baseline|stretch)$/],
  // Gap
  gap: [/^gap-\d+$/, /^gap-\[.+\]$/, /^gap-x-\d+$/, /^gap-y-\d+$/],
  gapX: [/^gap-x-\d+$/, /^gap-x-\[.+\]$/],
  gapY: [/^gap-y-\d+$/, /^gap-y-\[.+\]$/],
  // Border radius
  borderRadius: [/^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/, /^rounded-\[.+\]$/],
  // Overflow
  overflow: [/^overflow-(auto|hidden|clip|visible|scroll)$/, /^overflow-x-(auto|hidden|clip|visible|scroll)$/, /^overflow-y-(auto|hidden|clip|visible|scroll)$/],
  // Z-index
  zIndex: [/^z-(\d+|auto)$/, /^z-\[.+\]$/],
  // Opacity
  opacity: [/^opacity-\d+$/, /^opacity-\[.+\]$/],
};

/**
 * Get design system gate configuration
 */
function getDesignSystemConfig(): {
  bannedClasses: string[];
  spacingScale: number[];
  fontSizeScale: number[];
  allowHardcodedColors: boolean;
  componentDuplicationThreshold: number;
  componentIndexPath: string | null;
  tokenBlastRadiusThreshold: number;
  tokenFilePaths: string[];
} {
  // Read from environment variables (set by index.ts from config)
  const bannedClassesRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_BANNED_CLASSES'];
  const spacingScaleRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_SPACING_SCALE'];
  const fontSizeScaleRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_FONT_SIZE_SCALE'];
  const allowHardcodedColorsRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_ALLOW_HARDCODED_COLORS'];
  const duplicationThresholdRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_DUPLICATION_THRESHOLD'];
  const componentIndexPathRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_COMPONENT_INDEX_PATH'];
  const blastRadiusThresholdRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_BLAST_RADIUS_THRESHOLD'];
  const tokenFilePathsRaw = process.env['HAWKY_GATE_DESIGN_SYSTEM_TOKEN_FILE_PATHS'];

  return {
    bannedClasses: bannedClassesRaw ? JSON.parse(bannedClassesRaw) : [],
    spacingScale: spacingScaleRaw
      ? JSON.parse(spacingScaleRaw)
      : [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384],
    fontSizeScale: fontSizeScaleRaw
      ? JSON.parse(fontSizeScaleRaw)
      : [10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128],
    allowHardcodedColors: allowHardcodedColorsRaw === 'true',
    componentDuplicationThreshold: duplicationThresholdRaw ? parseFloat(duplicationThresholdRaw) : 0.8,
    componentIndexPath: componentIndexPathRaw || null,
    tokenBlastRadiusThreshold: blastRadiusThresholdRaw ? parseInt(blastRadiusThresholdRaw, 10) : 10,
    tokenFilePaths: tokenFilePathsRaw ? JSON.parse(tokenFilePathsRaw) : ['**/tokens.css', '**/variables.css', '**/theme.css'],
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

// ============================================================================
// S030: Component Duplication Detection
// ============================================================================

/**
 * Regex-based JSX element extraction
 * Matches: <TagName prop1 prop2="value"> or <TagName />
 */
const JSX_ELEMENT_PATTERN = /<([A-Z][a-zA-Z0-9.]*)\s*([^>]*?)\s*(?:\/>|>)/g;

/**
 * Extract prop names from JSX attributes string
 */
function extractPropsFromString(attrString: string): string[] {
  const props: string[] = [];
  // Match prop names (identifiers before = or standalone)
  const propPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|(?=[>\s]|\/>))/g;
  let match;
  while ((match = propPattern.exec(attrString)) !== null) {
    if (match[1]) {
      props.push(match[1]);
    }
  }
  return props.sort();
}

/**
 * Serialize JSX structure to a normalized string for comparison
 */
function serializeJsxStructure(structure: JsxStructure): string {
  const propsStr = structure.props.join(',');
  const childrenStr = structure.children.map(serializeJsxStructure).join('|');
  return `${structure.tagName}[${propsStr}]{${childrenStr}}`;
}

/**
 * Calculate similarity between two strings (0-1) using Levenshtein distance
 */
function calculateStringSimilarity(strA: string, strB: string): number {
  if (strA === strB) return 1;

  const lenA = strA.length;
  const lenB = strB.length;

  if (lenA === 0) return lenB === 0 ? 1 : 0;
  if (lenB === 0) return 0;

  // For very long strings, use a simpler approach
  if (lenA > 500 || lenB > 500) {
    // Use common prefix/suffix ratio
    let common = 0;
    const minLen = Math.min(lenA, lenB);
    for (let i = 0; i < minLen; i++) {
      if (strA[i] === strB[i]) common++;
      else break;
    }
    for (let i = 0; i < minLen - common; i++) {
      if (strA[lenA - 1 - i] === strB[lenB - 1 - i]) common++;
      else break;
    }
    return common / Math.max(lenA, lenB);
  }

  // Levenshtein distance for shorter strings
  const matrix: number[][] = [];
  for (let i = 0; i <= lenB; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenA; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      const cost = strB[i - 1] === strA[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  const distance = matrix[lenB]![lenA]!;
  const maxLen = Math.max(lenA, lenB);
  return 1 - distance / maxLen;
}

/**
 * Calculate similarity between two JSX structures (0-1)
 */
function calculateStructureSimilarity(a: JsxStructure, b: JsxStructure): number {
  const strA = serializeJsxStructure(a);
  const strB = serializeJsxStructure(b);
  return calculateStringSimilarity(strA, strB);
}

/**
 * Extract all JSX structures from a file using regex (lightweight alternative to AST)
 */
function extractAllJsxStructures(content: string, _filePath: string): JsxStructure[] {
  const structures: JsxStructure[] = [];
  const lines = content.split('\n');

  // Track line numbers for matches
  let currentPos = 0;
  const lineStarts: number[] = [0];
  for (const line of lines) {
    currentPos += line.length + 1;
    lineStarts.push(currentPos);
  }

  function getLineFromPos(pos: number): number {
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i]! > pos) {
        return i;
      }
    }
    return lineStarts.length;
  }

  // Reset regex
  JSX_ELEMENT_PATTERN.lastIndex = 0;
  let match;

  while ((match = JSX_ELEMENT_PATTERN.exec(content)) !== null) {
    const tagName = match[1];
    const attrString = match[2] || '';

    if (!tagName) continue;

    const props = extractPropsFromString(attrString);
    const line = getLineFromPos(match.index);
    const column = match.index - (lineStarts[line - 1] || 0) + 1;

    // Only capture elements with props (non-trivial)
    if (props.length > 0) {
      structures.push({
        tagName,
        props,
        children: [], // Regex approach doesn't easily capture nested children
        line,
        column,
      });
    }
  }

  return structures;
}

/**
 * S030: Scan for component duplication
 * Finds similar JSX structures across the codebase
 */
export function scanForComponentDuplication(
  content: string,
  filePath: string,
  allStructures: Map<string, JsxStructure[]>,
  threshold: number
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const currentStructures = extractAllJsxStructures(content, filePath);

  // Compare current file structures with structures from other files
  for (const structure of currentStructures) {
    for (const [otherFile, otherStructures] of allStructures) {
      if (otherFile === filePath) continue;

      for (const otherStructure of otherStructures) {
        const similarity = calculateStructureSimilarity(structure, otherStructure);

        if (similarity >= threshold) {
          violations.push({
            ruleId: 'design-system/component-duplication',
            file: filePath,
            line: structure.line,
            column: structure.column,
            message: `Similar JSX structure (${(similarity * 100).toFixed(0)}% match) found in ${otherFile}:${otherStructure.line}. Consider extracting to a shared component.`,
            gate: 'design-system',
            severity: 'warning',
            violationType: 'component-duplication',
            actualValue: serializeJsxStructure(structure),
            suggestion: `Extract this pattern to a reusable component`,
          });
        }
      }
    }
  }

  // Also add current structures to the map for subsequent file comparisons
  allStructures.set(filePath, currentStructures);

  return violations;
}

// ============================================================================
// S031: Existing Component Suggestion
// ============================================================================

/**
 * Load component index from file
 */
function loadComponentIndex(indexPath: string, cwd: string): ComponentIndexEntry[] {
  const fullPath = path.join(cwd, indexPath);
  if (!fs.existsSync(fullPath)) {
    core.debug(`Component index not found at ${fullPath}`);
    return [];
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(content) as ComponentIndexEntry[];
  } catch (error) {
    core.debug(`Failed to parse component index: ${error}`);
    return [];
  }
}

/**
 * S031: Suggest existing components for duplicated structures
 * Enhances S030 by suggesting specific components from the library
 */
export function suggestExistingComponent(
  structure: JsxStructure,
  componentIndex: ComponentIndexEntry[],
  threshold: number
): { component: ComponentIndexEntry; similarity: number } | null {
  const structureSerialized = serializeJsxStructure(structure);

  let bestMatch: { component: ComponentIndexEntry; similarity: number } | null = null;

  for (const component of componentIndex) {
    // Simple string similarity between serialized structures
    const lenA = structureSerialized.length;
    const lenB = component.structure.length;

    if (lenA === 0 || lenB === 0) continue;

    // Quick similarity calculation using common subsequence ratio
    let common = 0;
    const minLen = Math.min(lenA, lenB);
    for (let i = 0; i < minLen; i++) {
      if (structureSerialized[i] === component.structure[i]) {
        common++;
      }
    }

    const similarity = common / Math.max(lenA, lenB);

    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { component, similarity };
    }
  }

  return bestMatch;
}

/**
 * Scan for structures that match existing components
 */
export function scanForComponentSuggestions(
  content: string,
  filePath: string,
  componentIndex: ComponentIndexEntry[],
  threshold: number
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const structures = extractAllJsxStructures(content, filePath);

  for (const structure of structures) {
    const suggestion = suggestExistingComponent(structure, componentIndex, threshold);

    if (suggestion) {
      violations.push({
        ruleId: 'design-system/use-existing-component',
        file: filePath,
        line: structure.line,
        column: structure.column,
        message: `Consider using <${suggestion.component.name}> from ${suggestion.component.path} (${(suggestion.similarity * 100).toFixed(0)}% structure match)`,
        gate: 'design-system',
        severity: 'warning',
        violationType: 'component-duplication',
        actualValue: serializeJsxStructure(structure),
        suggestion: `import { ${suggestion.component.name} } from '${suggestion.component.path}'`,
      });
    }
  }

  return violations;
}

// ============================================================================
// S032: CSS Variable Opacity Detection
// ============================================================================

/**
 * Pattern to detect rgba(var(--x), opacity) anti-pattern
 * This doesn't work because CSS variables expand after rgba() parsing
 */
const CSS_VAR_OPACITY_PATTERN = /rgba?\s*\(\s*var\s*\(\s*--[\w-]+\s*\)\s*,\s*[\d.]+\s*\)/gi;

/**
 * S032: Scan for CSS variable opacity anti-pattern
 */
export function scanForCssVarOpacity(
  content: string,
  filePath: string
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    // Reset pattern
    CSS_VAR_OPACITY_PATTERN.lastIndex = 0;
    let match;

    while ((match = CSS_VAR_OPACITY_PATTERN.exec(line)) !== null) {
      const matchedText = match[0];
      const matchIndex = match.index;

      // Skip if in comment
      if (isInAllowlistedContext(line, matchIndex)) {
        continue;
      }

      violations.push({
        ruleId: 'design-system/css-var-opacity',
        file: filePath,
        line: lineNum + 1,
        column: matchIndex + 1,
        message: `CSS variable in rgba() doesn't work as expected: "${matchedText}". The variable expands after rgba() parsing.`,
        gate: 'design-system',
        severity: 'error',
        violationType: 'css-var-opacity',
        actualValue: matchedText,
        suggestion: 'Use color-mix(in srgb, var(--color) 50%, transparent) or Tailwind opacity utilities like bg-primary/50',
      });
    }
  }

  return violations;
}

// ============================================================================
// S033: Design System File Blast Radius
// ============================================================================

/**
 * Token usage tracking
 */
interface TokenUsage {
  token: string;
  usedIn: { file: string; line: number }[];
}

/**
 * Extract CSS variable references from content
 */
function extractTokenReferences(content: string, _filePath: string): { token: string; line: number }[] {
  const references: { token: string; line: number }[] = [];
  const lines = content.split('\n');

  // Match var(--token-name) pattern
  const varPattern = /var\s*\(\s*(--[\w-]+)\s*\)/g;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';
    varPattern.lastIndex = 0;
    let match;

    while ((match = varPattern.exec(line)) !== null) {
      const token = match[1];
      if (token) {
        references.push({ token, line: lineNum + 1 });
      }
    }
  }

  return references;
}

/**
 * Check if a file is a token definition file
 */
function isTokenFile(filePath: string, tokenPatterns: string[]): boolean {
  return tokenPatterns.some((pattern) => {
    // Simple glob matching
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\//g, '[\\\\/]');
    return new RegExp(regexPattern).test(filePath);
  });
}

/**
 * S033: Analyze design token blast radius
 */
export function analyzeTokenBlastRadius(
  changedFiles: string[],
  allFiles: Map<string, string>,
  tokenPatterns: string[],
  _cwd: string
): { tokenUsage: Map<string, TokenUsage>; changedTokens: string[] } {
  const tokenUsage = new Map<string, TokenUsage>();
  const changedTokens: string[] = [];

  // Build token usage map from all files
  for (const [filePath, content] of allFiles) {
    if (isTokenFile(filePath, tokenPatterns)) {
      // Extract token definitions from token files
      const lines = content.split('\n');
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum] ?? '';
        const defMatch = line.match(/(--[\w-]+)\s*:/);
        if (defMatch && defMatch[1]) {
          const token = defMatch[1];
          if (!tokenUsage.has(token)) {
            tokenUsage.set(token, { token, usedIn: [] });
          }
        }
      }
      continue;
    }

    // Track where tokens are used
    const refs = extractTokenReferences(content, filePath);
    for (const ref of refs) {
      let usage = tokenUsage.get(ref.token);
      if (!usage) {
        usage = { token: ref.token, usedIn: [] };
        tokenUsage.set(ref.token, usage);
      }
      usage.usedIn.push({ file: filePath, line: ref.line });
    }
  }

  // Find tokens that were changed in this PR
  for (const file of changedFiles) {
    if (isTokenFile(file, tokenPatterns)) {
      const content = allFiles.get(file);
      if (content) {
        const lines = content.split('\n');
        for (const line of lines) {
          const defMatch = line.match(/(--[\w-]+)\s*:/);
          if (defMatch && defMatch[1]) {
            changedTokens.push(defMatch[1]);
          }
        }
      }
    }
  }

  return { tokenUsage, changedTokens };
}

/**
 * S033: Scan for token blast radius violations
 */
export function scanForTokenBlastRadius(
  tokenUsage: Map<string, TokenUsage>,
  changedTokens: string[],
  threshold: number,
  changedTokenFile: string
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];

  for (const token of changedTokens) {
    const usage = tokenUsage.get(token);
    if (usage && usage.usedIn.length > threshold) {
      const affectedFiles = [...new Set(usage.usedIn.map((u) => u.file))];
      violations.push({
        ruleId: 'design-system/token-blast-radius',
        file: changedTokenFile,
        line: 1,
        message: `Token "${token}" is used in ${usage.usedIn.length} places across ${affectedFiles.length} files. Changing it may have wide impact.`,
        gate: 'design-system',
        severity: 'warning',
        violationType: 'token-blast-radius',
        actualValue: usage.usedIn.length,
        suggestion: `Review all ${affectedFiles.length} affected files: ${affectedFiles.slice(0, 3).join(', ')}${affectedFiles.length > 3 ? '...' : ''}`,
      });
    }
  }

  return violations;
}

// ============================================================================
// S034: Tailwind Class Conflict Detection
// ============================================================================

/**
 * Find the conflict group for a Tailwind class
 */
function findConflictGroup(className: string): string | null {
  for (const [groupName, patterns] of Object.entries(TAILWIND_CONFLICT_GROUPS)) {
    for (const pattern of patterns) {
      if (pattern.test(className)) {
        return groupName;
      }
    }
  }
  return null;
}

/**
 * S034: Scan for conflicting Tailwind classes
 */
export function scanForTailwindConflicts(
  content: string,
  filePath: string
): DesignSystemViolation[] {
  const violations: DesignSystemViolation[] = [];
  const lines = content.split('\n');

  // Match className or class attributes
  const classNamePattern = /(?:className|class)\s*=\s*["'`]([^"'`]+)["'`]/g;
  // Also match template literal className with cn() or clsx()
  const templatePattern = /(?:cn|clsx|classNames|twMerge)\s*\(\s*["'`]([^"'`]+)["'`]/g;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    // Skip if in comment
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      continue;
    }

    const patterns = [classNamePattern, templatePattern];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const classString = match[1];
        if (!classString) continue;

        const classes = classString.split(/\s+/).filter((c) => c.length > 0);
        const groupMap = new Map<string, { className: string; index: number }[]>();

        // Group classes by conflict group
        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i]!;
          const group = findConflictGroup(cls);
          if (group) {
            if (!groupMap.has(group)) {
              groupMap.set(group, []);
            }
            groupMap.get(group)!.push({ className: cls, index: i });
          }
        }

        // Find conflicts (multiple classes in same group)
        for (const [group, groupClasses] of groupMap) {
          if (groupClasses.length > 1) {
            const conflictingClasses = groupClasses.map((c) => c.className).join(', ');
            violations.push({
              ruleId: 'design-system/tailwind-conflict',
              file: filePath,
              line: lineNum + 1,
              column: match.index + 1,
              message: `Conflicting Tailwind classes in ${group} group: ${conflictingClasses}. Last class wins but this is unpredictable.`,
              gate: 'design-system',
              severity: 'error',
              violationType: 'tailwind-conflict',
              actualValue: conflictingClasses,
              suggestion: `Remove redundant classes. Keep only: ${groupClasses[groupClasses.length - 1]!.className}`,
            });
          }
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

    // S030: Component duplication detection - collect all structures first
    const allJsxStructures = new Map<string, JsxStructure[]>();

    // S031: Load component index if configured
    const componentIndex = config.componentIndexPath
      ? loadComponentIndex(config.componentIndexPath, cwd)
      : [];

    // S033: Build file content map for token blast radius analysis
    const allFileContents = new Map<string, string>();

    // Scan each file
    for (const file of files) {
      const fullPath = path.join(cwd, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Normalize file path for consistent reporting
      const normalizedPath = file.replace(/\\/g, '/');

      // Store content for S033 analysis
      allFileContents.set(normalizedPath, content);

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

      // S030: Component duplication detection (JSX files only)
      if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.jsx')) {
        const duplicationViolations = scanForComponentDuplication(
          content,
          normalizedPath,
          allJsxStructures,
          config.componentDuplicationThreshold
        );
        allViolations.push(...duplicationViolations);

        // S031: Suggest existing components (if index is configured)
        if (componentIndex.length > 0) {
          const suggestionViolations = scanForComponentSuggestions(
            content,
            normalizedPath,
            componentIndex,
            config.componentDuplicationThreshold
          );
          allViolations.push(...suggestionViolations);
        }
      }

      // S032: CSS variable opacity anti-pattern (CSS/SCSS files)
      if (normalizedPath.endsWith('.css') || normalizedPath.endsWith('.scss')) {
        const opacityViolations = scanForCssVarOpacity(content, normalizedPath);
        allViolations.push(...opacityViolations);
      }

      // S034: Tailwind class conflicts (JSX/TSX files)
      if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.jsx')) {
        const conflictViolations = scanForTailwindConflicts(content, normalizedPath);
        allViolations.push(...conflictViolations);
      }
    }

    // S033: Token blast radius analysis (check if any token files were changed)
    const { tokenUsage, changedTokens } = analyzeTokenBlastRadius(
      files,
      allFileContents,
      config.tokenFilePaths,
      cwd
    );

    for (const file of files) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (isTokenFile(normalizedPath, config.tokenFilePaths)) {
        const blastRadiusViolations = scanForTokenBlastRadius(
          tokenUsage,
          changedTokens,
          config.tokenBlastRadiusThreshold,
          normalizedPath
        );
        allViolations.push(...blastRadiusViolations);
      }
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
      'component-duplication': allViolations.filter((v) => v.violationType === 'component-duplication').length,
      'css-var-opacity': allViolations.filter((v) => v.violationType === 'css-var-opacity').length,
      'token-blast-radius': allViolations.filter((v) => v.violationType === 'token-blast-radius').length,
      'tailwind-conflict': allViolations.filter((v) => v.violationType === 'tailwind-conflict').length,
    };

    const messageParts: string[] = [];
    if (byType['banned-class'] > 0) messageParts.push(`${byType['banned-class']} banned class(es)`);
    if (byType['hardcoded-color'] > 0) messageParts.push(`${byType['hardcoded-color']} hardcoded color(s)`);
    if (byType['spacing-scale'] > 0) messageParts.push(`${byType['spacing-scale']} spacing violation(s)`);
    if (byType['font-size-scale'] > 0) messageParts.push(`${byType['font-size-scale']} font size violation(s)`);
    if (byType['component-duplication'] > 0) messageParts.push(`${byType['component-duplication']} component duplication(s)`);
    if (byType['css-var-opacity'] > 0) messageParts.push(`${byType['css-var-opacity']} CSS var opacity issue(s)`);
    if (byType['token-blast-radius'] > 0) messageParts.push(`${byType['token-blast-radius']} token blast radius warning(s)`);
    if (byType['tailwind-conflict'] > 0) messageParts.push(`${byType['tailwind-conflict']} Tailwind conflict(s)`);

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
