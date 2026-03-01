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
import type { Gate, Violation, Annotation } from './types';
/**
 * Design system violation types
 */
type DesignSystemViolationType = 'banned-class' | 'hardcoded-color' | 'spacing-scale' | 'font-size-scale' | 'component-duplication' | 'css-var-opacity' | 'token-blast-radius' | 'tailwind-conflict';
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
    structure: string;
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
 * Scan a single file for banned classes
 */
export declare function scanForBannedClasses(content: string, filePath: string, bannedPatterns: string[]): DesignSystemViolation[];
/**
 * Scan a single file for hardcoded colors
 */
export declare function scanForHardcodedColors(content: string, filePath: string): DesignSystemViolation[];
/**
 * Scan a single file for non-scale spacing values
 */
export declare function scanForSpacingViolations(content: string, filePath: string, spacingScale: number[]): DesignSystemViolation[];
/**
 * Scan a single file for non-scale font sizes
 */
export declare function scanForFontSizeViolations(content: string, filePath: string, fontSizeScale: number[]): DesignSystemViolation[];
/**
 * S030: Scan for component duplication
 * Finds similar JSX structures across the codebase
 */
export declare function scanForComponentDuplication(content: string, filePath: string, allStructures: Map<string, JsxStructure[]>, threshold: number): DesignSystemViolation[];
/**
 * S031: Suggest existing components for duplicated structures
 * Enhances S030 by suggesting specific components from the library
 */
export declare function suggestExistingComponent(structure: JsxStructure, componentIndex: ComponentIndexEntry[], threshold: number): {
    component: ComponentIndexEntry;
    similarity: number;
} | null;
/**
 * Scan for structures that match existing components
 */
export declare function scanForComponentSuggestions(content: string, filePath: string, componentIndex: ComponentIndexEntry[], threshold: number): DesignSystemViolation[];
/**
 * S032: Scan for CSS variable opacity anti-pattern
 */
export declare function scanForCssVarOpacity(content: string, filePath: string): DesignSystemViolation[];
/**
 * Token usage tracking
 */
interface TokenUsage {
    token: string;
    usedIn: {
        file: string;
        line: number;
    }[];
}
/**
 * S033: Analyze design token blast radius
 */
export declare function analyzeTokenBlastRadius(changedFiles: string[], allFiles: Map<string, string>, tokenPatterns: string[], _cwd: string): {
    tokenUsage: Map<string, TokenUsage>;
    changedTokens: string[];
};
/**
 * S033: Scan for token blast radius violations
 */
export declare function scanForTokenBlastRadius(tokenUsage: Map<string, TokenUsage>, changedTokens: string[], threshold: number, changedTokenFile: string): DesignSystemViolation[];
/**
 * S034: Scan for conflicting Tailwind classes
 */
export declare function scanForTailwindConflicts(content: string, filePath: string): DesignSystemViolation[];
/**
 * Convert a design system violation to a GitHub annotation
 */
export declare function violationToAnnotation(violation: DesignSystemViolation): Annotation;
/**
 * Design System Gate implementation
 */
export declare const designSystemGate: Gate;
export default designSystemGate;
//# sourceMappingURL=design-system.d.ts.map