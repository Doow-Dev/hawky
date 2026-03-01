/**
 * Visual Gate
 *
 * Performs visual regression testing by comparing screenshots
 * of the PR branch against the base branch.
 *
 * S071: Visual Gate
 */
import type { Gate, GateResult, GateRunOptions, Annotation } from './types';
import type { VisualConfig } from '../config/types';
import type { VisualTestResult } from '../visual/types';
/**
 * Convert visual test result to annotation
 */
export declare function resultToAnnotation(result: VisualTestResult): Annotation;
/**
 * Visual regression gate implementation
 */
export declare const visualGate: Gate;
/**
 * Run visual gate with explicit config
 *
 * Alternative entry point for use with parsed config
 */
export declare function runVisualGate(config: VisualConfig, baselineDir: string, currentDir: string, options: GateRunOptions): Promise<GateResult>;
//# sourceMappingURL=visual.d.ts.map