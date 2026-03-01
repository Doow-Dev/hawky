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
import type { Gate, Violation, Annotation } from './types';
/**
 * Frontend violation types
 */
type FrontendViolationType = 'unhandled-async-state' | 'missing-key-prop' | 'index-as-key' | 'missing-dependency' | 'rerender-trap' | 'server-client-boundary' | 'a11y-interactive' | 'bundle-size-delta' | 'image-missing-dimensions' | 'ts-strict-mode' | 'import-cycle' | 'component-graph-impact' | 'import-path-inconsistency';
/**
 * Extended violation with frontend-specific info
 */
interface FrontendViolation extends Violation {
    violationType: FrontendViolationType;
    hookName?: string;
    suggestion?: string;
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
export declare function scanForUnhandledAsyncState(content: string, filePath: string): FrontendViolation[];
/**
 * Scan for missing or problematic key props in list rendering
 *
 * Detects:
 * - Missing key prop in .map() JSX returns
 * - key={index} anti-pattern (warning)
 * - Potential duplicate keys from static values
 */
export declare function scanForMissingKeys(content: string, filePath: string): FrontendViolation[];
/**
 * Scan for missing dependencies in useEffect/useCallback/useMemo
 *
 * Detects:
 * - Variables used inside hook but not in deps array
 * - Functions referenced but not in deps (unless stable)
 *
 * Note: This complements eslint-plugin-react-hooks but catches some edge cases
 */
export declare function scanForMissingDependencies(content: string, filePath: string): FrontendViolation[];
/**
 * Scan for common React re-render traps:
 * - Objects/arrays created inline in JSX props
 * - Inline arrow functions in non-event JSX props
 * - Missing useMemo/useCallback for expensive computations
 */
export declare function scanForRerenderTraps(content: string, filePath: string): FrontendViolation[];
/**
 * Scan for Next.js server/client boundary issues
 */
export declare function scanForServerClientBoundary(content: string, filePath: string): FrontendViolation[];
/**
 * Scan for accessibility issues with interactive elements
 */
export declare function scanForA11yIssues(content: string, filePath: string): FrontendViolation[];
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
 * Calculate bundle size delta between two builds
 */
export declare function calculateBundleDelta(beforeDir: string, afterDir: string, thresholdBytes?: number): {
    deltas: BundleSizeDelta[];
    violations: FrontendViolation[];
};
/**
 * Scan for img/Image tags without width and height attributes
 */
export declare function scanForImageWithoutDimensions(content: string, filePath: string): FrontendViolation[];
/**
 * Scan for TypeScript strict mode violations
 */
export declare function scanForTypeScriptStrictIssues(content: string, filePath: string): FrontendViolation[];
/**
 * Build a dependency graph from import statements across all files
 */
export declare function buildDependencyGraph(files: string[], cwd: string): Map<string, Set<string>>;
/**
 * Detect cycles in the dependency graph using DFS
 */
export declare function detectCycles(graph: Map<string, Set<string>>): string[][];
/**
 * Scan for import cycles across all files
 */
export declare function scanForImportCycles(files: string[], cwd: string): FrontendViolation[];
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
export declare function buildComponentGraph(files: string[], cwd: string): Map<string, ComponentGraphEntry>;
/**
 * Generate blast radius violations for high-impact changed files
 */
export declare function analyzeComponentGraphImpact(changedFiles: string[], allFiles: string[], cwd: string, blastRadiusThreshold?: number): FrontendViolation[];
/**
 * Scan for inconsistent import paths (mixing aliases with relative paths, etc.)
 */
export declare function scanForImportPathInconsistency(content: string, filePath: string): FrontendViolation[];
/**
 * Convert violation to GitHub annotation
 */
export declare function violationToAnnotation(violation: FrontendViolation): Annotation;
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
export declare const frontendChecksGate: Gate;
export {};
//# sourceMappingURL=frontend-checks.d.ts.map