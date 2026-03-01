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
import type { Gate, Violation, Annotation } from './types';
/**
 * Frontend violation types
 */
type FrontendViolationType = 'unhandled-async-state' | 'missing-key-prop' | 'index-as-key' | 'missing-dependency';
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
 * Convert violation to GitHub annotation
 */
export declare function violationToAnnotation(violation: FrontendViolation): Annotation;
/**
 * Frontend Checks Gate
 *
 * Scans React/Next.js code for common issues:
 * - Missing loading/error state handling
 * - Missing or incorrect key props
 * - Missing hook dependencies
 */
export declare const frontendChecksGate: Gate;
export {};
//# sourceMappingURL=frontend-checks.d.ts.map