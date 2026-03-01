/**
 * Frontend Checks Gate
 *
 * React/Next.js specific pattern detection:
 * 1. Unhandled Async State Detection (S054)
 * 2. Key Prop Analysis (S055)
 * 3. useEffect Dependency Analysis (S056)
 * 4. Re-render Trap Detection (S057)
 * 5. Server/Client Boundary Check (S058)
 * 6. Accessibility Interactive Element Check (S059)
 * 7. Bundle Size Delta (S060)
 * 8. Image Without Dimensions (S061)
 * 9. TypeScript Strict Mode Checks (S062)
 * 10. Import Cycle Detection (S063)
 * 11. Component Graph Impact (S064)
 * 12. Import Path Consistency (S065)
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
  | 'missing-dependency'
  | 'rerender-trap'
  | 'server-client-boundary'
  | 'a11y-interactive'
  | 'bundle-size-delta'
  | 'image-missing-dimensions'
  | 'ts-strict-mode'
  | 'import-cycle'
  | 'component-graph-impact'
  | 'import-path-inconsistency';

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
// S057: Re-render Trap Detection
// ============================================================================

/**
 * Scan for common React re-render traps:
 * - Objects/arrays created inline in JSX props
 * - Inline arrow functions in non-event JSX props
 * - Missing useMemo/useCallback for expensive computations
 */
export function scanForRerenderTraps(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Detect inline object literals in JSX props: prop={{ key: value }}
    const inlineObjectPattern = /(\w+)\s*=\s*\{\s*\{[^}]*:[^}]*\}\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = inlineObjectPattern.exec(line)) !== null) {
      const propName = m[1] || '';
      // Allow style={{}} — common and expected
      if (propName !== 'style') {
        violations.push({
          ruleId: 'frontend/rerender-trap',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `Inline object literal in JSX prop "${propName}" creates a new object on every render, causing unnecessary re-renders.`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'rerender-trap',
          suggestion: 'Move this object outside the component or wrap with useMemo(() => ({ ... }), [deps])',
        });
      }
    }

    // Detect inline array literals in JSX props: prop={[...]}
    const inlineArrayPattern = /(\w+)\s*=\s*\{\s*\[[^\]]*\]\s*\}/g;
    while ((m = inlineArrayPattern.exec(line)) !== null) {
      violations.push({
        ruleId: 'frontend/rerender-trap',
        file: filePath,
        line: lineNum,
        column: m.index + 1,
        message: `Inline array literal in JSX prop "${m[1]}" creates a new array on every render, causing unnecessary re-renders.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'rerender-trap',
        suggestion: 'Move this array outside the component or wrap with useMemo(() => [...], [deps])',
      });
    }

    // Detect inline arrow functions in non-event JSX props
    const inlineArrowPattern = /(\w+)\s*=\s*\{\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g;
    // Common event handler props are expected to be inline
    const allowedEventProps = new Set([
      'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus', 'onKeyDown',
      'onKeyUp', 'onKeyPress', 'onMouseEnter', 'onMouseLeave', 'onMouseDown',
      'onMouseUp', 'onInput', 'onScroll', 'onResize', 'onLoad', 'onError',
      'onContextMenu', 'onDoubleClick', 'onDrag', 'onDrop', 'onSelect',
      'onTouchStart', 'onTouchEnd', 'onTouchMove', 'onPointerDown', 'onPointerUp',
    ]);
    while ((m = inlineArrowPattern.exec(line)) !== null) {
      const propName = m[1] || '';
      if (!allowedEventProps.has(propName)) {
        violations.push({
          ruleId: 'frontend/rerender-trap',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `Inline arrow function in JSX prop "${propName}" creates a new function reference on every render.`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'rerender-trap',
          suggestion: `Wrap with useCallback: const handler = useCallback(() => { ... }, [deps]); and pass handler as prop.`,
        });
      }
    }
  });

  // Detect expensive array operations without useMemo
  const chainPattern = /(?:const|let)\s+(\w+)\s*=\s*\w+(?:\.\w+)*\.(?:filter|reduce|sort)\s*\(/g;
  let chainMatch: RegExpExecArray | null;
  while ((chainMatch = chainPattern.exec(content)) !== null) {
    const beforeMatch = content.substring(0, chainMatch.index);
    const lineNum = beforeMatch.split('\n').length;
    const varName = chainMatch[1] || 'result';

    // Check if inside useMemo
    const surroundingContext = content.substring(Math.max(0, chainMatch.index - 200), chainMatch.index);
    const isInsideUseMemo = /useMemo\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*$/.test(surroundingContext);

    if (!isInsideUseMemo) {
      violations.push({
        ruleId: 'frontend/rerender-trap',
        file: filePath,
        line: lineNum,
        column: (lines[lineNum - 1]?.indexOf(varName) ?? 0) + 1,
        message: `Expensive array operation for "${varName}" runs on every render. Consider wrapping with useMemo.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'rerender-trap',
        suggestion: `const ${varName} = useMemo(() => data.filter(...).map(...), [data]);`,
      });
    }
  }

  return violations;
}

// ============================================================================
// S058: Server/Client Boundary Check
// ============================================================================

/**
 * React hooks that require client-side execution
 */
const CLIENT_ONLY_HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useReducer',
  'useContext', 'useCallback', 'useMemo', 'useImperativeHandle',
  'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
  'useSyncExternalStore', 'useInsertionEffect',
]);

/**
 * Packages that are client-only
 */
const CLIENT_ONLY_PACKAGES = [
  'framer-motion',
  'react-spring',
  'react-dnd',
  'react-beautiful-dnd',
  'react-virtualized',
  'react-window',
  'react-select',
  'react-datepicker',
  '@radix-ui/react-',
  'sonner',
  'react-hot-toast',
  'notistack',
];

/**
 * Scan for Next.js server/client boundary issues
 */
export function scanForServerClientBoundary(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  const hasUseClientDirective = /^\s*['"]use client['"]/m.test(content);
  const hasUseServerDirective = /^\s*['"]use server['"]/m.test(content);

  if (!hasUseClientDirective) {
    // Check for client-only hook usage without 'use client'
    for (const hook of CLIENT_ONLY_HOOKS) {
      const hookPattern = new RegExp(`\\b${hook}\\s*\\(`, 'g');
      let m: RegExpExecArray | null;
      while ((m = hookPattern.exec(content)) !== null) {
        const beforeMatch = content.substring(0, m.index);
        const lineNum = beforeMatch.split('\n').length;
        const lineContent = lines[lineNum - 1] || '';

        // Skip if this is a custom hook definition (not a call)
        if (/^(?:export\s+)?(?:function|const|let|var)\s+use[A-Z]/.test(lineContent.trim())) {
          continue;
        }

        violations.push({
          ruleId: 'frontend/server-client-boundary',
          file: filePath,
          line: lineNum,
          column: m.index - beforeMatch.lastIndexOf('\n'),
          message: `React hook "${hook}" used without 'use client' directive. Add "use client" at the top of this file.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'server-client-boundary',
          suggestion: `Add "use client"; as the first line of this file.`,
        });
        break; // One violation per hook type per file
      }
    }

    // Check client-only package imports
    for (const pkg of CLIENT_ONLY_PACKAGES) {
      const escapedPkg = pkg.replace(/[-/]/g, '[-/]');
      const importPattern = new RegExp(`from\\s+['"]${escapedPkg}`, 'g');
      let m: RegExpExecArray | null;
      while ((m = importPattern.exec(content)) !== null) {
        const beforeMatch = content.substring(0, m.index);
        const lineNum = beforeMatch.split('\n').length;

        violations.push({
          ruleId: 'frontend/server-client-boundary',
          file: filePath,
          line: lineNum,
          column: 1,
          message: `Client-only package "${pkg}" imported without 'use client' directive.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'server-client-boundary',
          suggestion: `Add "use client"; as the first line of this file.`,
        });
        break; // One per package
      }
    }

    // Check window/document access in component files without 'use client'
    const isComponentFile = /\.(tsx|jsx)$/.test(filePath);
    if (isComponentFile) {
      const browserGlobalsPattern = /\b(window|document|navigator|localStorage|sessionStorage)\s*\./g;
      let m: RegExpExecArray | null;
      while ((m = browserGlobalsPattern.exec(content)) !== null) {
        const beforeMatch = content.substring(0, m.index);
        const lineNum = beforeMatch.split('\n').length;

        // Skip if guarded by typeof check on this line or nearby (within 3 lines)
        const nearbyContext = lines.slice(Math.max(0, lineNum - 4), lineNum + 1).join('\n');
        if (/typeof\s+(window|document)/.test(nearbyContext)) continue;

        violations.push({
          ruleId: 'frontend/server-client-boundary',
          file: filePath,
          line: lineNum,
          column: m.index - beforeMatch.lastIndexOf('\n'),
          message: `Browser global "${m[1]}" accessed without 'use client' directive. This will fail during SSR.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'server-client-boundary',
          suggestion: `Add "use client"; directive or guard with: if (typeof window !== 'undefined') { ... }`,
        });
        break; // One per file
      }
    }

    // Heuristic: server component importing .client files
    if (!hasUseServerDirective) {
      const clientImportPattern = /from\s+['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = clientImportPattern.exec(content)) !== null) {
        const importPath = m[1] || '';
        if (/[/\\-]client[/\\-]/.test(importPath) || importPath.endsWith('.client')) {
          const beforeMatch = content.substring(0, m.index);
          const lineNum = beforeMatch.split('\n').length;

          violations.push({
            ruleId: 'frontend/server-client-boundary',
            file: filePath,
            line: lineNum,
            column: 1,
            message: `Server component may be importing client-only module "${importPath}". Ensure this is intentional.`,
            gate: 'frontend-checks',
            severity: 'warning',
            violationType: 'server-client-boundary',
            suggestion: `If this is a Client Component, add "use client"; to the top.`,
          });
        }
      }
    }
  }

  return violations;
}

// ============================================================================
// S059: Accessibility Interactive Element Check
// ============================================================================

/**
 * Scan for accessibility issues with interactive elements
 */
export function scanForA11yIssues(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  // Only scan JSX files
  if (!/\.(tsx|jsx)$/.test(filePath)) return violations;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    let m: RegExpExecArray | null;

    // Detect div/span with onClick but missing role and/or tabIndex
    const divOnClickPattern = /<(?:div|span)\s[^>]*onClick\s*=/g;
    while ((m = divOnClickPattern.exec(line)) !== null) {
      const hasRole = /role\s*=/.test(line);
      const hasTabIndex = /tabIndex\s*=/.test(line);

      if (!hasRole || !hasTabIndex) {
        const missing: string[] = [];
        if (!hasRole) missing.push('role');
        if (!hasTabIndex) missing.push('tabIndex');

        violations.push({
          ruleId: 'frontend/a11y-interactive',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `Interactive div/span with onClick is missing: ${missing.join(', ')}. Screen readers cannot interact with this element.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'a11y-interactive',
          suggestion: `Add role="button" tabIndex={0} and onKeyDown handler, or use a <button> element instead.`,
        });
      }
    }

    // Detect icon-only buttons without accessible label
    const iconButtonPattern = /<button(?:\s[^>]*)?>(?:\s*<(?:svg|img|[A-Z]\w*Icon)[^>]*\/?>)\s*<\/button>/g;
    while ((m = iconButtonPattern.exec(line)) !== null) {
      const hasAriaLabel = /aria-label\s*=/.test(line);
      const hasAriaLabelledBy = /aria-labelledby\s*=/.test(line);
      const hasTitle = /title\s*=/.test(line);

      if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
        violations.push({
          ruleId: 'frontend/a11y-interactive',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `Icon button without accessible label. Screen readers cannot describe this button's purpose.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'a11y-interactive',
          suggestion: `Add aria-label="Descriptive action name" to the button.`,
        });
      }
    }

    // Detect nested buttons (invalid HTML)
    const nestedButtonPattern = /<button[^>]*>(?:[^<]|<(?!\/button)[^>]*>)*<button/g;
    while ((m = nestedButtonPattern.exec(line)) !== null) {
      violations.push({
        ruleId: 'frontend/a11y-interactive',
        file: filePath,
        line: lineNum,
        column: m.index + 1,
        message: `Nested <button> elements are invalid HTML and cause accessibility issues.`,
        gate: 'frontend-checks',
        severity: 'error',
        violationType: 'a11y-interactive',
        suggestion: `Remove nested buttons. Restructure to avoid nesting interactive elements.`,
      });
    }

    // Detect nested anchor links (invalid HTML)
    const nestedLinkPattern = /<a\s[^>]*>(?:[^<]|<(?!\/a)[^>]*>)*<a\s/g;
    while ((m = nestedLinkPattern.exec(line)) !== null) {
      violations.push({
        ruleId: 'frontend/a11y-interactive',
        file: filePath,
        line: lineNum,
        column: m.index + 1,
        message: `Nested <a> elements are invalid HTML and cause accessibility issues.`,
        gate: 'frontend-checks',
        severity: 'error',
        violationType: 'a11y-interactive',
        suggestion: `Remove nested anchor links. Only one interactive element should wrap content.`,
      });
    }

    // Detect button nested inside anchor
    const buttonInLinkPattern = /<a\s[^>]*>(?:[^<]|<(?!\/a)[^>]*>)*<button/g;
    while ((m = buttonInLinkPattern.exec(line)) !== null) {
      violations.push({
        ruleId: 'frontend/a11y-interactive',
        file: filePath,
        line: lineNum,
        column: m.index + 1,
        message: `<button> nested inside <a> is invalid HTML. Interactive elements should not be nested.`,
        gate: 'frontend-checks',
        severity: 'error',
        violationType: 'a11y-interactive',
        suggestion: `Use either a <button> or an <a>, not both.`,
      });
    }
  });

  return violations;
}

// ============================================================================
// S060: Bundle Size Delta
// ============================================================================

/**
 * Bundle size delta result
 */
export interface BundleSizeDelta {
  chunk: string;
  before: number;
  after: number;
  delta: number;
  deltaPercent: number;
}

/**
 * Read build output sizes from a build directory
 */
function readBuildStats(buildDir: string): Map<string, number> {
  const sizes = new Map<string, number>();

  try {
    // Try Next.js build manifest
    const manifestPath = path.join(buildDir, 'build-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        pages?: Record<string, string[]>;
      };
      if (manifest.pages) {
        for (const assets of Object.values(manifest.pages)) {
          for (const asset of assets) {
            const assetPath = path.join(buildDir, 'static', asset);
            if (fs.existsSync(assetPath)) {
              const stat = fs.statSync(assetPath);
              const current = sizes.get(asset) ?? 0;
              sizes.set(asset, Math.max(current, stat.size));
            }
          }
        }
      }
    }

    // Try webpack stats.json
    const statsPath = path.join(buildDir, 'stats.json');
    if (fs.existsSync(statsPath)) {
      const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8')) as {
        assets?: Array<{ name: string; size: number }>;
      };
      if (stats.assets && Array.isArray(stats.assets)) {
        for (const asset of stats.assets) {
          if (asset.name && asset.size) {
            sizes.set(asset.name, asset.size);
          }
        }
      }
    }

    // Fallback: scan static directory for JS/CSS files
    const staticDir = path.join(buildDir, 'static');
    if (fs.existsSync(staticDir)) {
      const scanDir = (dir: string): void => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(fullPath);
            } else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
              const stat = fs.statSync(fullPath);
              const relPath = path.relative(buildDir, fullPath).replace(/\\/g, '/');
              sizes.set(relPath, stat.size);
            }
          }
        } catch {
          // Skip unreadable directories
        }
      };
      scanDir(staticDir);
    }
  } catch {
    // Build stats not available
  }

  return sizes;
}

/**
 * Calculate bundle size delta between two builds
 */
export function calculateBundleDelta(
  beforeDir: string,
  afterDir: string,
  thresholdBytes: number = 50 * 1024
): { deltas: BundleSizeDelta[]; violations: FrontendViolation[] } {
  const violations: FrontendViolation[] = [];
  const deltas: BundleSizeDelta[] = [];

  const beforeStats = readBuildStats(beforeDir);
  const afterStats = readBuildStats(afterDir);

  for (const [chunk, afterSize] of afterStats) {
    const beforeSize = beforeStats.get(chunk) ?? 0;
    const delta = afterSize - beforeSize;
    const deltaPercent = beforeSize > 0 ? (delta / beforeSize) * 100 : 100;

    deltas.push({ chunk, before: beforeSize, after: afterSize, delta, deltaPercent });

    if (delta > thresholdBytes) {
      violations.push({
        ruleId: 'frontend/bundle-size-delta',
        file: chunk,
        line: 1,
        message: `Bundle chunk "${chunk}" grew by ${(delta / 1024).toFixed(1)}KB (${deltaPercent.toFixed(1)}%). Exceeds ${(thresholdBytes / 1024).toFixed(0)}KB threshold.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'bundle-size-delta',
        suggestion: `Analyze what was added to this chunk. Consider code-splitting or lazy loading.`,
      });
    }
  }

  return { deltas, violations };
}

// ============================================================================
// S061: Image Without Dimensions
// ============================================================================

/**
 * Scan for img/Image tags without width and height attributes
 */
export function scanForImageWithoutDimensions(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  if (!/\.(tsx|jsx)$/.test(filePath)) return violations;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    let m: RegExpExecArray | null;

    // Native <img> tag
    const imgPattern = /<img\s([^>]*)\/?>/g;
    while ((m = imgPattern.exec(line)) !== null) {
      const attrs = m[1] || '';
      const hasWidth = /\bwidth\s*=/.test(attrs);
      const hasHeight = /\bheight\s*=/.test(attrs);

      if (!hasWidth || !hasHeight) {
        const missing: string[] = [];
        if (!hasWidth) missing.push('width');
        if (!hasHeight) missing.push('height');

        violations.push({
          ruleId: 'frontend/image-missing-dimensions',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `<img> tag missing ${missing.join(' and ')} attribute(s). Missing dimensions cause Cumulative Layout Shift (CLS).`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'image-missing-dimensions',
          suggestion: `Add width and height: <img src="..." width={800} height={600} alt="..." />`,
        });
      }
    }

    // Next.js <Image> component
    const nextImagePattern = /<Image\s([^>]*)(?:\/>|>)/g;
    while ((m = nextImagePattern.exec(line)) !== null) {
      const attrs = m[1] || '';
      const hasWidth = /\bwidth\s*=/.test(attrs);
      const hasHeight = /\bheight\s*=/.test(attrs);
      const hasFill = /\bfill\b/.test(attrs);

      // fill mode doesn't require explicit dimensions
      if (!hasFill && (!hasWidth || !hasHeight)) {
        const missing: string[] = [];
        if (!hasWidth) missing.push('width');
        if (!hasHeight) missing.push('height');

        violations.push({
          ruleId: 'frontend/image-missing-dimensions',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `Next.js <Image> missing ${missing.join(' and ')} attribute(s). Required by Next.js and causes layout shift.`,
          gate: 'frontend-checks',
          severity: 'error',
          violationType: 'image-missing-dimensions',
          suggestion: `Add dimensions: <Image src="..." width={800} height={600} alt="..." /> or use fill prop.`,
        });
      }
    }
  });

  return violations;
}

// ============================================================================
// S062: TypeScript Strict Mode Checks
// ============================================================================

/**
 * Scan for TypeScript strict mode violations
 */
export function scanForTypeScriptStrictIssues(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  if (!/\.(ts|tsx)$/.test(filePath)) return violations;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmedLine = line.trim();

    // Skip comment lines
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
      return;
    }

    let m: RegExpExecArray | null;

    // Detect implicit any in function parameters (heuristic)
    const implicitAnyPattern = /(?:function\s+\w+\s*\(|(?:^|\s)\()\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:,\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*)*\)\s*(?:=>|\{)/g;
    while ((m = implicitAnyPattern.exec(line)) !== null) {
      const paramSection = m[0];
      if (!/:\s*\w/.test(paramSection) && !/:\s*[A-Z]/.test(paramSection)) {
        const isFunctionDecl = /function\s+[A-Z]/.test(paramSection);
        if (!isFunctionDecl) {
          violations.push({
            ruleId: 'frontend/ts-strict-implicit-any',
            file: filePath,
            line: lineNum,
            column: m.index + 1,
            message: `Parameter without type annotation may result in implicit "any". Add explicit types.`,
            gate: 'frontend-checks',
            severity: 'warning',
            violationType: 'ts-strict-mode',
            suggestion: `Add type annotations: (param: ParameterType) => { ... }`,
          });
        }
      }
    }

    // Detect non-null assertions (!) without justification comment
    const nonNullPattern = /(\w+)!\s*(?:[.[(,;]|$)/g;
    while ((m = nonNullPattern.exec(line)) !== null) {
      const varName = m[1] || '';
      if (['', 'return', 'if', 'while', 'for'].includes(varName)) continue;

      const prevLine = lines[idx - 1] || '';
      const hasJustification = /\/\/\s*(?:safe|guaranteed|non-null|always defined|exists|trust)/i.test(prevLine);

      if (!hasJustification) {
        violations.push({
          ruleId: 'frontend/ts-strict-non-null-assertion',
          file: filePath,
          line: lineNum,
          column: m.index + 1,
          message: `Non-null assertion on "${varName}!" without justification comment. This bypasses type safety.`,
          gate: 'frontend-checks',
          severity: 'warning',
          violationType: 'ts-strict-mode',
          suggestion: `Add a justification comment, use optional chaining (?.), or add a proper null check.`,
        });
      }
    }

    // Detect type assertions to any
    const asAnyPattern = /(?:as\s+any\b|<any>\s*\w)/g;
    while ((m = asAnyPattern.exec(line)) !== null) {
      violations.push({
        ruleId: 'frontend/ts-strict-as-any',
        file: filePath,
        line: lineNum,
        column: m.index + 1,
        message: `Type assertion to "any" disables TypeScript's type checking for this expression.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'ts-strict-mode',
        suggestion: `Use a specific type instead of "any". If unavoidable, use "unknown" and add type guards.`,
      });
    }
  });

  return violations;
}

// ============================================================================
// S063: Import Cycle Detection
// ============================================================================

/**
 * Build a dependency graph from import statements across all files
 */
export function buildDependencyGraph(
  files: string[],
  cwd: string
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const filePath of files) {
    const relPath = path.relative(cwd, filePath).replace(/\\/g, '/');
    if (!graph.has(relPath)) {
      graph.set(relPath, new Set());
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const importPattern = /(?:import|require)\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))?\s*(?:from\s*)?['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;

      while ((m = importPattern.exec(content)) !== null) {
        const importPath = m[1] || '';

        if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')) {
          continue;
        }

        let resolved = importPath;
        if (importPath.startsWith('.')) {
          resolved = path.resolve(path.dirname(filePath), importPath);
        } else if (importPath.startsWith('@/')) {
          resolved = path.resolve(cwd, 'src', importPath.slice(2));
        } else if (importPath.startsWith('~/')) {
          resolved = path.resolve(cwd, importPath.slice(2));
        }

        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
        let resolvedPath: string | null = null;

        if (fs.existsSync(resolved)) {
          resolvedPath = resolved;
        } else {
          for (const ext of extensions) {
            const candidate = resolved + ext;
            if (fs.existsSync(candidate)) {
              resolvedPath = candidate;
              break;
            }
          }
        }

        if (resolvedPath) {
          const relResolved = path.relative(cwd, resolvedPath).replace(/\\/g, '/');
          graph.get(relPath)?.add(relResolved);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return graph;
}

/**
 * Detect cycles in the dependency graph using DFS
 */
export function detectCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) ?? new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        const cycleStart = pathStack.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = [...pathStack.slice(cycleStart), neighbor];
          cycles.push(cycle);
        }
      }
    }

    pathStack.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Scan for import cycles across all files
 */
export function scanForImportCycles(
  files: string[],
  cwd: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const graph = buildDependencyGraph(files, cwd);
  const cycles = detectCycles(graph);

  for (const cycle of cycles) {
    const cyclePath = cycle.join(' -> ');
    const entryFile = cycle[0] || 'unknown';

    violations.push({
      ruleId: 'frontend/import-cycle',
      file: entryFile,
      line: 1,
      message: `Circular import detected: ${cyclePath}`,
      gate: 'frontend-checks',
      severity: 'warning',
      violationType: 'import-cycle',
      suggestion: `Break the cycle by extracting shared code to a separate module or using dependency injection.`,
    });
  }

  return violations;
}

// ============================================================================
// S064: Component Graph Impact
// ============================================================================

/**
 * Component dependency graph entry
 */
export interface ComponentGraphEntry {
  file: string;
  imports: string[];
  importedBy: string[];
  blastRadius: number;
}

/**
 * Build a component graph with forward and reverse edges
 */
export function buildComponentGraph(
  files: string[],
  cwd: string
): Map<string, ComponentGraphEntry> {
  const graph = new Map<string, ComponentGraphEntry>();
  const forwardDeps = buildDependencyGraph(files, cwd);

  for (const file of files) {
    const relPath = path.relative(cwd, file).replace(/\\/g, '/');
    graph.set(relPath, {
      file: relPath,
      imports: [...(forwardDeps.get(relPath) ?? [])],
      importedBy: [],
      blastRadius: 0,
    });
  }

  // Build reverse edges
  for (const [file, deps] of forwardDeps) {
    for (const dep of deps) {
      const entry = graph.get(dep);
      if (entry && !entry.importedBy.includes(file)) {
        entry.importedBy.push(file);
      }
    }
  }

  // Calculate blast radius (BFS via reverse edges)
  for (const [file, entry] of graph) {
    const affected = new Set<string>();
    const queue = [file];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentEntry = graph.get(current);
      if (!currentEntry) continue;

      for (const importer of currentEntry.importedBy) {
        if (!affected.has(importer)) {
          affected.add(importer);
          queue.push(importer);
        }
      }
    }

    entry.blastRadius = affected.size;
  }

  return graph;
}

/**
 * Generate blast radius violations for high-impact changed files
 */
export function analyzeComponentGraphImpact(
  changedFiles: string[],
  allFiles: string[],
  cwd: string,
  blastRadiusThreshold: number = 20
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const graph = buildComponentGraph(allFiles, cwd);

  for (const changedFile of changedFiles) {
    const relPath = path.relative(cwd, changedFile).replace(/\\/g, '/');
    const entry = graph.get(relPath);

    if (entry && entry.blastRadius > blastRadiusThreshold) {
      violations.push({
        ruleId: 'frontend/component-graph-impact',
        file: relPath,
        line: 1,
        message: `High blast radius: changing "${relPath}" affects ${entry.blastRadius} other component(s). Review carefully.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'component-graph-impact',
        suggestion: `Affected by: ${entry.importedBy.slice(0, 5).join(', ')}${entry.importedBy.length > 5 ? ` and ${entry.importedBy.length - 5} more` : ''}`,
      });
    }
  }

  return violations;
}

// ============================================================================
// S065: Import Path Consistency
// ============================================================================

/**
 * Scan for inconsistent import paths (mixing aliases with relative paths, etc.)
 */
export function scanForImportPathInconsistency(
  content: string,
  filePath: string
): FrontendViolation[] {
  const violations: FrontendViolation[] = [];
  const lines = content.split('\n');

  const imports: {
    path: string;
    line: number;
    isAlias: boolean;
    isRelative: boolean;
    isIndex: boolean;
  }[] = [];

  lines.forEach((line, idx) => {
    const importMatch = line.match(/(?:import|from)\s+['"]([^'"]+)['"]/);
    if (!importMatch) return;

    const importPath = importMatch[1] || '';
    if (!importPath) return;

    if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')) {
      return; // Skip node_modules
    }

    const isAlias = importPath.startsWith('@/') || importPath.startsWith('~/');
    const isRelative = importPath.startsWith('.') || importPath.startsWith('..');
    const isIndex = importPath.endsWith('/index') ||
      importPath.endsWith('/index.ts') ||
      importPath.endsWith('/index.tsx') ||
      importPath.endsWith('/index.js');

    imports.push({ path: importPath, line: idx + 1, isAlias, isRelative, isIndex });
  });

  // Check 1: Mixing @/ aliases with relative paths
  const aliasImports = imports.filter((i) => i.isAlias);
  const relativeImports = imports.filter((i) => i.isRelative);

  if (aliasImports.length > 0 && relativeImports.length > 0) {
    for (const relImport of relativeImports) {
      violations.push({
        ruleId: 'frontend/import-path-consistency',
        file: filePath,
        line: relImport.line,
        message: `Inconsistent import style: mixing @/ alias imports with relative path "${relImport.path}". Use consistent import style.`,
        gate: 'frontend-checks',
        severity: 'warning',
        violationType: 'import-path-inconsistency',
        suggestion: `Standardize all imports to use either @/ aliases or relative paths consistently.`,
      });
    }
  }

  // Check 2: Mixing index imports with direct file imports for the same module
  const importsByModule = new Map<string, { line: number; path: string; isIndex: boolean }[]>();

  for (const imp of imports) {
    const normalized = imp.path
      .replace(/\/index(?:\.(?:ts|tsx|js|jsx))?$/, '')
      .replace(/\.(?:ts|tsx|js|jsx)$/, '');

    if (!importsByModule.has(normalized)) {
      importsByModule.set(normalized, []);
    }
    importsByModule.get(normalized)?.push({ line: imp.line, path: imp.path, isIndex: imp.isIndex });
  }

  for (const [, group] of importsByModule) {
    if (group.length > 1) {
      const hasIndex = group.some((g) => g.isIndex);
      const hasDirect = group.some((g) => !g.isIndex);

      if (hasIndex && hasDirect) {
        for (const imp of group) {
          violations.push({
            ruleId: 'frontend/import-path-consistency',
            file: filePath,
            line: imp.line,
            message: `Inconsistent imports: mixing index imports with direct file imports for "${imp.path}".`,
            gate: 'frontend-checks',
            severity: 'warning',
            violationType: 'import-path-inconsistency',
            suggestion: `Use either the index import or direct file import consistently.`,
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
  enableRerenderTrapCheck: boolean;
  enableServerClientCheck: boolean;
  enableA11yCheck: boolean;
  enableBundleSizeCheck: boolean;
  bundleSizeThresholdKb: number;
  enableImageDimensionsCheck: boolean;
  enableTsStrictCheck: boolean;
  enableImportCycleCheck: boolean;
  enableComponentGraphCheck: boolean;
  componentGraphBlastRadiusThreshold: number;
  enableImportPathConsistencyCheck: boolean;
} {
  return {
    enableAsyncStateCheck: process.env['HAWKY_GATE_FRONTEND_ASYNC_STATE'] !== 'false',
    enableKeyPropCheck: process.env['HAWKY_GATE_FRONTEND_KEY_PROP'] !== 'false',
    enableDependencyCheck: process.env['HAWKY_GATE_FRONTEND_DEPENDENCY'] !== 'false',
    enableRerenderTrapCheck: process.env['HAWKY_GATE_FRONTEND_RERENDER_TRAP'] !== 'false',
    enableServerClientCheck: process.env['HAWKY_GATE_FRONTEND_SERVER_CLIENT'] !== 'false',
    enableA11yCheck: process.env['HAWKY_GATE_FRONTEND_A11Y'] !== 'false',
    enableBundleSizeCheck: process.env['HAWKY_GATE_FRONTEND_BUNDLE_SIZE'] !== 'false',
    bundleSizeThresholdKb: parseInt(process.env['HAWKY_GATE_FRONTEND_BUNDLE_THRESHOLD_KB'] || '50', 10),
    enableImageDimensionsCheck: process.env['HAWKY_GATE_FRONTEND_IMAGE_DIMS'] !== 'false',
    enableTsStrictCheck: process.env['HAWKY_GATE_FRONTEND_TS_STRICT'] !== 'false',
    enableImportCycleCheck: process.env['HAWKY_GATE_FRONTEND_IMPORT_CYCLES'] !== 'false',
    enableComponentGraphCheck: process.env['HAWKY_GATE_FRONTEND_COMPONENT_GRAPH'] !== 'false',
    componentGraphBlastRadiusThreshold: parseInt(process.env['HAWKY_GATE_FRONTEND_BLAST_RADIUS_THRESHOLD'] || '20', 10),
    enableImportPathConsistencyCheck: process.env['HAWKY_GATE_FRONTEND_IMPORT_PATHS'] !== 'false',
  };
}

/**
 * Frontend Checks Gate
 *
 * Scans React/Next.js code for common issues:
 * - Missing loading/error state handling (S054)
 * - Missing or incorrect key props (S055)
 * - Missing hook dependencies (S056)
 * - Re-render traps (S057)
 * - Server/client boundary issues (S058)
 * - Accessibility interactive element issues (S059)
 * - Bundle size delta (S060)
 * - Image without dimensions (S061)
 * - TypeScript strict mode violations (S062)
 * - Import cycles (S063)
 * - Component graph impact (S064)
 * - Import path consistency (S065)
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

          // Run enabled per-file scanners
          if (config.enableAsyncStateCheck) {
            violations.push(...scanForUnhandledAsyncState(content, relativePath));
          }

          if (config.enableKeyPropCheck) {
            violations.push(...scanForMissingKeys(content, relativePath));
          }

          if (config.enableDependencyCheck) {
            violations.push(...scanForMissingDependencies(content, relativePath));
          }

          if (config.enableRerenderTrapCheck) {
            violations.push(...scanForRerenderTraps(content, relativePath));
          }

          if (config.enableServerClientCheck) {
            violations.push(...scanForServerClientBoundary(content, relativePath));
          }

          if (config.enableA11yCheck) {
            violations.push(...scanForA11yIssues(content, relativePath));
          }

          if (config.enableImageDimensionsCheck) {
            violations.push(...scanForImageWithoutDimensions(content, relativePath));
          }

          if (config.enableTsStrictCheck) {
            violations.push(...scanForTypeScriptStrictIssues(content, relativePath));
          }

          if (config.enableImportPathConsistencyCheck) {
            violations.push(...scanForImportPathInconsistency(content, relativePath));
          }
        } catch (err) {
          core.debug(`Failed to scan ${file}: ${err}`);
        }
      }

      // S060: Bundle size delta — requires before/after build directories
      if (config.enableBundleSizeCheck) {
        const beforeDir = path.join(options.cwd, '.hawky-bundle-before');
        const afterDir = path.join(options.cwd, '.next');
        if (fs.existsSync(beforeDir) && fs.existsSync(afterDir)) {
          const { violations: bundleViolations } = calculateBundleDelta(
            beforeDir,
            afterDir,
            config.bundleSizeThresholdKb * 1024
          );
          violations.push(...bundleViolations);
        } else {
          core.debug('Bundle size check skipped: no before/after build dirs found');
        }
      }

      // S063: Import cycle detection (cross-file analysis)
      if (config.enableImportCycleCheck) {
        violations.push(...scanForImportCycles(files, options.cwd));
      }

      // S064: Component graph impact analysis
      if (config.enableComponentGraphCheck) {
        violations.push(...analyzeComponentGraphImpact(
          files, // In production this should be filtered to PR-changed files
          files,
          options.cwd,
          config.componentGraphBlastRadiusThreshold
        ));
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
