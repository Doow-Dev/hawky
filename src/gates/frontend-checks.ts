/**
 * Frontend Checks Gate
 *
 * React/Next.js specific pattern detection:
 * 1. Unhandled Async State Detection (S054)
 * 2. Key Prop Analysis (S055)
 * 3. useEffect Dependency Analysis (S056)
 *
 * Scans TSX, JSX files for violations.
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * File extensions to scan for frontend violations
 */
const SCANNABLE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];

/**
 * Frontend violation types
 */
type FrontendViolationType =
  | 'unhandled-async-state'
  | 'missing-key-prop'
  | 'index-as-key'
  | 'missing-dependency';

/**
 * Extended violation with frontend-specific info
 */
interface FrontendViolation extends Violation {
  violationType: FrontendViolationType;
  hookName?: string;
  suggestion?: string;
}

// ============================================================================
// S054: Unhandled Async State Detection
// ============================================================================

/**
 * Patterns for async hooks that require loading/error handling
 */
const ASYNC_HOOK_PATTERNS = [
  // React Query
  {
    name: 'useQuery',
    pattern: /(?:const|let)\s*(?:\{[^}]*\}|\w+)\s*=\s*useQuery\s*\(/g,
    requiredStates: ['isLoading', 'isError', 'error', 'isPending'],
    type: 'react-query',
  },
  {
    name: 'useMutation',
    pattern: /(?:const|let)\s*(?:\{[^}]*\}|\w+)\s*=\s*useMutation\s*\(/g,
    requiredStates: ['isLoading', 'isPending', 'isError', 'error'],
    type: 'react-query',
  },
  // SWR
  {
    name: 'useSWR',
    pattern: /(?:const|let)\s*(?:\{[^}]*\}|\w+)\s*=\s*useSWR\s*\(/g,
    requiredStates: ['isLoading', 'isValidating', 'error'],
    type: 'swr',
  },
  // Apollo
  {
    name: 'useQuery (Apollo)',
    pattern: /(?:const|let)\s*(?:\{[^}]*\}|\w+)\s*=\s*useQuery\s*\(/g,
    requiredStates: ['loading', 'error'],
    type: 'apollo',
  },
  {
    name: 'useMutation (Apollo)',
    pattern: /(?:const|let)\s*(?:\{[^}]*\}|\w+)\s*=\s*useMutation\s*\(/g,
    requiredStates: ['loading', 'error'],
    type: 'apollo',
  },
];

/**
 * Pattern for native fetch in useEffect
 * Uses [\s\S] to match across lines within the effect body
 */
const FETCH_IN_EFFECT_PATTERN = /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[/g;

/**
 * Extract destructured properties from a hook call
 */
function extractDestructuredProps(line: string): string[] {
  const destructureMatch = line.match(/(?:const|let)\s*\{\s*([^}]+)\s*\}/);
  if (!destructureMatch || !destructureMatch[1]) {
    return [];
  }
  return destructureMatch[1]
    .split(',')
    .map((p) => {
      const parts = p.trim().split(':');
      return parts[0]?.trim() ?? '';
    })
    .filter(Boolean);
}

/**
 * Check if the component has proper loading/error handling
 * by looking ahead in the content for conditional rendering
 */
function hasStateHandling(content: string, startLine: number, states: string[]): { hasLoading: boolean; hasError: boolean } {
  const lines = content.split('\n');
  const searchWindow = lines.slice(startLine, startLine + 50).join('\n');

  // Check for loading state handling patterns
  const loadingPatterns = [
    /if\s*\(\s*(?:isLoading|loading|isPending|isValidating)\s*\)/,
    /\?\s*(?:<[^>]+Loading|<Spinner|<Skeleton|<LoadingSpinner|"Loading"|'Loading')/,
    /(?:isLoading|loading|isPending|isValidating)\s*\?\s*/,
    /(?:isLoading|loading|isPending|isValidating)\s*&&\s*(?:<|return)/,
  ];

  // Check for error state handling patterns
  const errorPatterns = [
    /if\s*\(\s*(?:isError|error)\s*\)/,
    /\?\s*(?:<[^>]+Error|"Error"|'Error')/,
    /(?:isError|error)\s*\?\s*/,
    /(?:isError|error)\s*&&\s*(?:<|return)/,
    /\.catch\s*\(/,
    /try\s*\{/,
  ];

  const hasLoading = loadingPatterns.some((p) => p.test(searchWindow)) ||
    states.some((s) => ['isLoading', 'loading', 'isPending', 'isValidating'].includes(s));
  const hasError = errorPatterns.some((p) => p.test(searchWindow)) ||
    states.some((s) => ['isError', 'error'].includes(s));

  return { hasLoading, hasError };
}

/**
 * Scan for unhandled async state in React hooks
 *
 * Detects:
 * - useQuery/useMutation (React Query) without loading/error destructured
 * - useSWR without loading/error destructured
 * - useQuery/useMutation (Apollo) without loading/error destructured
 * - fetch/axios in useEffect without error handling
 */
export function scanForUnhandledAsyncState(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  // Check each async hook pattern
  for (const hookConfig of ASYNC_HOOK_PATTERNS) {
    const pattern = new RegExp(hookConfig.pattern.source, 'g');
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const matchedText = match[0];

      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;
      const line = lines[lineNum - 1] || '';

      // Extract destructured properties
      const destructuredProps = extractDestructuredProps(matchedText);

      // Check if loading state is destructured or handled
      const hasLoadingProp = destructuredProps.some((p) =>
        ['isLoading', 'loading', 'isPending', 'isValidating'].includes(p)
      );
      const hasErrorProp = destructuredProps.some((p) =>
        ['isError', 'error'].includes(p)
      );

      // Look for handling in surrounding code
      const { hasLoading, hasError } = hasStateHandling(content, lineNum - 1, destructuredProps);

      // Report missing loading state
      if (!hasLoadingProp && !hasLoading) {
        violations.push({
          ruleId: 'frontend/unhandled-async-state',
          file: filePath,
          line: lineNum,
          column: (line.indexOf(hookConfig.name.split(' ')[0] || '') + 1) || 1,
          message: `${hookConfig.name} missing loading state handling. Destructure isLoading/loading and render a loading indicator.`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'unhandled-async-state',
          hookName: hookConfig.name,
          suggestion: `Add loading state: const { data, isLoading } = ${hookConfig.name.split(' ')[0]}(...); if (isLoading) return <Loading />;`,
        });
      }

      // Report missing error state
      if (!hasErrorProp && !hasError) {
        violations.push({
          ruleId: 'frontend/unhandled-async-state',
          file: filePath,
          line: lineNum,
          column: (line.indexOf(hookConfig.name.split(' ')[0] || '') + 1) || 1,
          message: `${hookConfig.name} missing error state handling. Destructure error/isError and handle errors gracefully.`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'unhandled-async-state',
          hookName: hookConfig.name,
          suggestion: `Add error handling: const { data, error } = ${hookConfig.name.split(' ')[0]}(...); if (error) return <Error />;`,
        });
      }
    }
  }

  // Check for fetch in useEffect without error handling
  const fetchPattern = new RegExp(FETCH_IN_EFFECT_PATTERN.source, 'g');
  let fetchMatch;

  while ((fetchMatch = fetchPattern.exec(content)) !== null) {
    const effectBody = fetchMatch[1] || fetchMatch[0];
    const beforeMatch = content.substring(0, fetchMatch.index);
    const lineNum = beforeMatch.split('\n').length;

    // Only check effects that contain fetch/axios calls
    const hasFetchCall = /fetch\s*\(|axios\.|\.get\(|\.post\(/.test(effectBody);
    if (!hasFetchCall) {
      continue;
    }

    // Check if there's error handling
    const hasErrorHandling = /\.catch\s*\(|try\s*\{[\s\S]*?catch\s*\(|catch\s*\(/.test(effectBody);

    if (!hasErrorHandling) {
      violations.push({
        ruleId: 'frontend/unhandled-async-state',
        file: filePath,
        line: lineNum,
        column: 1,
        message: 'fetch/axios in useEffect without error handling. Add .catch() or try/catch block.',
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'unhandled-async-state',
        hookName: 'useEffect',
        suggestion: 'Add error handling: fetch(...).then(...).catch(err => setError(err)); or use try/catch with async/await',
      });
    }
  }

  return violations;
}

// ============================================================================
// S055: Key Prop Analysis
// ============================================================================

/**
 * Pattern to match .map() calls that return JSX
 */
const MAP_JSX_PATTERN = /\.map\s*\(\s*(?:\(\s*)?([^,)]+)(?:\s*,\s*([^)]+))?\s*\)?\s*=>\s*(?:\{[^}]*return\s*)?(<[A-Z][a-zA-Z0-9.]*[^>]*>|<[a-z]+[^>]*>|\([^)]*<)/g;

/**
 * Pattern to detect key prop (handles both {expression} and "string" formats)
 */
const KEY_PROP_PATTERN = /key\s*=\s*(?:\{([^}]+)\}|"([^"]+)"|'([^']+)')/;

/**
 * Scan for missing or problematic key props in list rendering
 *
 * Detects:
 * - Missing key prop in .map() JSX returns
 * - key={index} anti-pattern (warning)
 * - Potential duplicate keys from static values
 */
export function scanForMissingKeys(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  // Track all map calls and their JSX returns
  const processedLines = new Set<number>();

  // Pattern 1: Single-line map with JSX
  const singleLinePattern = new RegExp(MAP_JSX_PATTERN.source, 'g');
  let match;

  while ((match = singleLinePattern.exec(content)) !== null) {
    const beforeMatch = content.substring(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    if (processedLines.has(lineNum)) continue;
    processedLines.add(lineNum);

    const matchedText = match[0];
    const itemVar = match[1]?.trim() || 'item';
    const indexVar = match[2]?.trim();

    // Find the JSX element and check for key
    const jsxStart = matchedText.indexOf('<');
    const jsxPortion = matchedText.substring(jsxStart);

    // Check for key prop
    const keyMatch = jsxPortion.match(KEY_PROP_PATTERN);

    if (!keyMatch) {
      // Missing key
      violations.push({
        ruleId: 'frontend/missing-key-prop',
        file: filePath,
        line: lineNum,
        column: (lines[lineNum - 1]?.indexOf('.map') ?? 0) + 1,
        message: 'Missing key prop in .map() JSX return. Add a unique, stable key prop.',
        gate: 'frontend-checks',
        severity: 'error',
        violationType: 'missing-key-prop',
        suggestion: `Add key prop: key={${itemVar}.id} or another unique identifier`,
      });
    } else {
      // Extract key value - could be in {braces}, "quotes", or 'quotes'
      const keyValue = (keyMatch[1] || keyMatch[2] || keyMatch[3] || '').trim();
      const isStringLiteral = !keyMatch[1]; // If match is from group 2 or 3, it's a string literal

      if (indexVar && (keyValue === indexVar || keyValue.includes(indexVar))) {
        violations.push({
          ruleId: 'frontend/index-as-key',
          file: filePath,
          line: lineNum,
          column: (lines[lineNum - 1]?.indexOf('key') ?? 0) + 1,
          message: `Using array index as key (key={${keyValue}}) can cause issues with reordering and state preservation.`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'index-as-key',
          suggestion: `Use a unique, stable identifier instead: key={${itemVar}.id}`,
        });
      }

      // Check for static/duplicate key values (string literals or plain numbers)
      if (isStringLiteral || /^\d+$/.test(keyValue)) {
        violations.push({
          ruleId: 'frontend/missing-key-prop',
          file: filePath,
          line: lineNum,
          column: (lines[lineNum - 1]?.indexOf('key') ?? 0) + 1,
          message: `Static key value (key="${keyValue}") will cause duplicate keys. Use a unique identifier from the item.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'missing-key-prop',
          suggestion: `Use a unique identifier: key={${itemVar}.id}`,
        });
      }
    }
  }

  // Pattern 2: Multi-line map with return statement
  // Look for .map( patterns and analyze the following lines
  const mapCallPattern = /\.map\s*\(\s*(?:\(\s*)?([^,)]+)(?:\s*,\s*(\w+))?\s*\)?\s*=>/g;
  let mapMatch;

  while ((mapMatch = mapCallPattern.exec(content)) !== null) {
    const beforeMatch = content.substring(0, mapMatch.index);
    const lineNum = beforeMatch.split('\n').length;

    if (processedLines.has(lineNum)) continue;

    const itemVar = mapMatch[1]?.trim() || 'item';
    const indexVar = mapMatch[2]?.trim();

    // Look ahead for JSX in the next 20 lines
    const searchWindow = lines.slice(lineNum - 1, lineNum + 20).join('\n');

    // Find JSX elements in the map body
    const jsxElementPattern = /<([A-Z][a-zA-Z0-9.]*|[a-z]+)[^>]*>/g;
    let jsxMatch;
    let foundJsx = false;
    let hasKey = false;
    let keyValue = '';

    while ((jsxMatch = jsxElementPattern.exec(searchWindow)) !== null) {
      foundJsx = true;
      const element = jsxMatch[0];
      const elementKeyMatch = element.match(KEY_PROP_PATTERN);

      if (elementKeyMatch) {
        hasKey = true;
        keyValue = elementKeyMatch[1]?.trim() || '';
        break;
      }

      // Only check the first JSX element (the one that should have the key)
      break;
    }

    if (foundJsx && !hasKey) {
      processedLines.add(lineNum);
      violations.push({
        ruleId: 'frontend/missing-key-prop',
        file: filePath,
        line: lineNum,
        column: (lines[lineNum - 1]?.indexOf('.map') ?? 0) + 1,
        message: 'Missing key prop in .map() JSX return. Add a unique, stable key prop.',
        gate: 'frontend-checks',
        severity: 'error',
        violationType: 'missing-key-prop',
        suggestion: `Add key prop: key={${itemVar}.id} or another unique identifier`,
      });
    } else if (foundJsx && hasKey && indexVar && (keyValue === indexVar || keyValue.includes(indexVar))) {
      processedLines.add(lineNum);
      violations.push({
        ruleId: 'frontend/index-as-key',
        file: filePath,
        line: lineNum,
        column: (lines[lineNum - 1]?.indexOf('.map') ?? 0) + 1,
        message: `Using array index as key (key={${keyValue}}) can cause issues with reordering and state preservation.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'index-as-key',
        suggestion: `Use a unique, stable identifier instead: key={${itemVar}.id}`,
      });
    }
  }

  return violations;
}

// ============================================================================
// S056: useEffect Dependency Analysis
// ============================================================================

/**
 * Pattern to match useEffect/useCallback/useMemo hooks
 */
const HOOK_PATTERNS = [
  { name: 'useEffect', pattern: /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([\s\S]*?)\]\s*\)/g },
  { name: 'useCallback', pattern: /useCallback\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:\{([\s\S]*?)\}|([\s\S]*?))\s*,\s*\[([\s\S]*?)\]\s*\)/g },
  { name: 'useMemo', pattern: /useMemo\s*\(\s*\(\s*\)\s*=>\s*(?:\{([\s\S]*?)\}|([\s\S]*?))\s*,\s*\[([\s\S]*?)\]\s*\)/g },
];

/**
 * Variables that should not be flagged as missing dependencies
 */
const STABLE_REFS = new Set([
  // React refs and built-ins
  'ref', 'refs', 'inputRef', 'formRef', 'containerRef',
  'console', 'window', 'document', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage', 'JSON', 'Math', 'Date', 'Array', 'Object',
  'Promise', 'Error', 'undefined', 'null', 'true', 'false',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'fetch', 'AbortController',
  // Common stable functions
  'dispatch', 'navigate', // Usually from Redux/React Router - stable by convention
]);

/**
 * Pattern to extract variable references from code
 */
function extractVariableReferences(code: string): string[] {
  const refs: string[] = [];

  // Match identifiers (excluding keywords and function declarations)
  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match;

  while ((match = identifierPattern.exec(code)) !== null) {
    const identifier = match[1];
    if (identifier && !STABLE_REFS.has(identifier)) {
      // Skip common keywords
      const keywords = new Set([
        'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
        'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally',
        'throw', 'new', 'this', 'class', 'extends', 'import', 'export', 'default',
        'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'void',
        'delete', 'get', 'set', 'static', 'public', 'private', 'protected',
      ]);

      if (!keywords.has(identifier)) {
        refs.push(identifier);
      }
    }
  }

  return [...new Set(refs)];
}

/**
 * Parse dependency array from hook call
 */
function parseDependencyArray(depsString: string): string[] {
  if (!depsString.trim()) {
    return [];
  }

  // Split by comma, handling nested structures
  const deps: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of depsString) {
    if (char === '[' || char === '{' || char === '(') {
      depth++;
      current += char;
    } else if (char === ']' || char === '}' || char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        // Extract the base identifier
        const baseMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (baseMatch && baseMatch[1]) {
          deps.push(baseMatch[1]);
        }
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Don't forget the last item
  const trimmed = current.trim();
  if (trimmed) {
    const baseMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (baseMatch && baseMatch[1]) {
      deps.push(baseMatch[1]);
    }
  }

  return deps;
}

/**
 * Check if a variable is likely a state setter (starts with set)
 */
function isStateSetter(name: string): boolean {
  return /^set[A-Z]/.test(name);
}

/**
 * Check if a variable is likely from props or external (should be in deps)
 */
function isLikelyExternalVariable(name: string, hookBody: string): boolean {
  // Skip state setters (stable from useState)
  if (isStateSetter(name)) {
    return false;
  }

  // Skip if it's defined within the hook body
  const defPattern = new RegExp(`(?:const|let|var)\\s+(?:\\{[^}]*)?\\b${name}\\b`, 'g');
  if (defPattern.test(hookBody)) {
    return false;
  }

  // Skip if it looks like a function declaration within the body
  const funcPattern = new RegExp(`(?:function\\s+${name}|const\\s+${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[^=])\\s*=>)`, 'g');
  if (funcPattern.test(hookBody)) {
    return false;
  }

  return true;
}

/**
 * Scan for missing dependencies in useEffect/useCallback/useMemo
 *
 * Detects:
 * - Variables used inside hook but not in deps array
 * - Functions referenced but not in deps (unless stable)
 *
 * Note: This complements eslint-plugin-react-hooks but catches some edge cases
 */
export function scanForMissingDependencies(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  for (const hookConfig of HOOK_PATTERNS) {
    const pattern = new RegExp(hookConfig.pattern.source, 'g');
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      // Extract hook body and deps
      let hookBody: string;
      let depsString: string;

      if (hookConfig.name === 'useEffect') {
        hookBody = match[1] || '';
        depsString = match[2] || '';
      } else {
        // useCallback/useMemo can have body with or without braces
        hookBody = match[1] || match[2] || '';
        depsString = match[3] || '';
      }

      // Parse declared dependencies
      const declaredDeps = new Set(parseDependencyArray(depsString));

      // Extract variable references from hook body
      const referencedVars = extractVariableReferences(hookBody);

      // Find missing dependencies
      const missingDeps: string[] = [];

      for (const ref of referencedVars) {
        if (!declaredDeps.has(ref) && isLikelyExternalVariable(ref, hookBody)) {
          missingDeps.push(ref);
        }
      }

      // Report violations
      if (missingDeps.length > 0) {
        // Deduplicate
        const uniqueMissing = [...new Set(missingDeps)];

        // Only report if we have a reasonable number of missing deps (avoid false positives)
        if (uniqueMissing.length <= 5) {
          violations.push({
            ruleId: 'frontend/missing-dependency',
            file: filePath,
            line: lineNum,
            column: (lines[lineNum - 1]?.indexOf(hookConfig.name) ?? 0) + 1,
            message: `${hookConfig.name} may be missing dependencies: ${uniqueMissing.join(', ')}`,
            gate: 'frontend-checks',
            severity: 'warning',
            violationType: 'missing-dependency',
            hookName: hookConfig.name,
            suggestion: `Add to dependency array: [${[...declaredDeps, ...uniqueMissing].join(', ')}]`,
          });
        }
      }

      // Check for empty dependency array when there are references
      if (depsString.trim() === '' && referencedVars.length > 0) {
        const externalRefs = referencedVars.filter((r) => isLikelyExternalVariable(r, hookBody));

        if (externalRefs.length > 0 && externalRefs.length <= 5) {
          violations.push({
            ruleId: 'frontend/missing-dependency',
            file: filePath,
            line: lineNum,
            column: (lines[lineNum - 1]?.indexOf('[]') ?? 0) + 1,
            message: `${hookConfig.name} has empty dependency array but references: ${externalRefs.join(', ')}`,
            gate: 'frontend-checks',
            severity: 'warning',
            violationType: 'missing-dependency',
            hookName: hookConfig.name,
            suggestion: `Add dependencies or verify this is intentional: [${externalRefs.join(', ')}]`,
          });
        }
      }
    }
  }

  return violations;
}

// ============================================================================
// Gate Implementation
// ============================================================================

/**
 * Convert violation to GitHub annotation
 */
export function violationToAnnotation(violation: FrontendViolation): Annotation {
  const annotation: Annotation = {
    file: violation.file,
    line: violation.line,
    message: violation.message + (violation.suggestion ? ` Suggestion: ${violation.suggestion}` : ''),
    severity: violation.severity === 'error' ? 'error' : 'warning',
    ruleId: violation.ruleId,
    title: violation.ruleId.split('/')[1]?.replace(/-/g, ' ') || violation.ruleId,
  };

  if (violation.column !== undefined) {
    annotation.column = violation.column;
  }

  return annotation;
}

/**
 * Recursively find files with given extensions
 */
async function findFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await findFiles(fullPath, extensions);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory not accessible
  }

  return files;
}

/**
 * Get frontend checks gate configuration
 */
function getFrontendChecksConfig(): {
  enableAsyncStateCheck: boolean;
  enableKeyPropCheck: boolean;
  enableDependencyCheck: boolean;
} {
  return {
    enableAsyncStateCheck: process.env['HAWKY_GATE_FRONTEND_ASYNC_STATE'] !== 'false',
    enableKeyPropCheck: process.env['HAWKY_GATE_FRONTEND_KEY_PROP'] !== 'false',
    enableDependencyCheck: process.env['HAWKY_GATE_FRONTEND_DEPENDENCY'] !== 'false',
  };
}

/**
 * Frontend Checks Gate
 *
 * Scans React/Next.js code for common issues:
 * - Missing loading/error state handling
 * - Missing or incorrect key props
 * - Missing hook dependencies
 */
export const frontendChecksGate: Gate = {
  name: 'frontend-checks',
  displayName: 'Frontend Checks',

  async canRun(cwd: string): Promise<boolean> {
    // Check if this is a React/Next.js project
    try {
      const packageJsonPath = path.join(cwd, 'package.json');
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return Boolean(deps.react || deps.next || deps['@types/react']);
    } catch {
      // No package.json or not parseable
      return false;
    }
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const violations: FrontendViolation[] = [];
    const config = getFrontendChecksConfig();

    try {
      // Find all TSX/JSX files
      const files = await findFiles(options.cwd, SCANNABLE_EXTENSIONS);

      core.info(`Scanning ${files.length} files for frontend issues...`);

      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file, 'utf-8');
          const relativePath = path.relative(options.cwd, file).replace(/\\/g, '/');

          // Run enabled scanners
          if (config.enableAsyncStateCheck) {
            violations.push(...scanForUnhandledAsyncState(content, relativePath));
          }

          if (config.enableKeyPropCheck) {
            violations.push(...scanForMissingKeys(content, relativePath));
          }

          if (config.enableDependencyCheck) {
            violations.push(...scanForMissingDependencies(content, relativePath));
          }
        } catch (err) {
          core.debug(`Failed to scan ${file}: ${err}`);
        }
      }

      // Create annotations
      const annotations = options.createAnnotations
        ? violations.map(violationToAnnotation)
        : [];

      // Emit annotations
      for (const annotation of annotations) {
        const annotationProps: { file: string; startLine: number; startColumn?: number } = {
          file: annotation.file,
          startLine: annotation.line,
        };
        if (annotation.column !== undefined) {
          annotationProps.startColumn = annotation.column;
        }

        if (annotation.severity === 'error') {
          core.error(annotation.message, annotationProps);
        } else {
          core.warning(annotation.message, annotationProps);
        }
      }

      const errorCount = violations.filter((v) => v.severity === 'error').length;
      const warningCount = violations.filter((v) => v.severity === 'warning').length;

      return {
        gate: 'frontend-checks',
        status: errorCount > 0 ? 'fail' : 'pass',
        totalViolations: violations.length,
        newViolations: violations.length, // Baseline not supported yet
        existingViolations: 0,
        ignoredViolations: 0,
        annotations,
        violations: violations.map((v) => {
          const violation: Violation = {
            ruleId: v.ruleId,
            file: v.file,
            line: v.line,
            message: v.message,
            gate: v.gate,
          };
          if (v.column !== undefined) {
            violation.column = v.column;
          }
          if (v.severity !== undefined) {
            violation.severity = v.severity;
          }
          return violation;
        }),
        timeMs: Date.now() - startTime,
        message: violations.length === 0
          ? 'No frontend issues detected'
          : `Found ${errorCount} error(s) and ${warningCount} warning(s)`,
      };
    } catch (err) {
      return {
        gate: 'frontend-checks',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'Frontend checks gate failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
