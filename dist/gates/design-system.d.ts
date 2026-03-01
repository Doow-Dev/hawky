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
import type { Gate, Violation, Annotation } from './types';
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
 * Convert a design system violation to a GitHub annotation
 */
export declare function violationToAnnotation(violation: DesignSystemViolation): Annotation;
/**
 * Design System Gate implementation
 */
export declare const designSystemGate: Gate;
export default designSystemGate;
//# sourceMappingURL=design-system.d.ts.map