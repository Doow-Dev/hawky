/**
 * Baseline Generator
 *
 * Scans the FULL repository for violations and generates a baseline file.
 * This is used during initial onboarding to capture existing technical debt.
 *
 * Triggered via workflow_dispatch with mode: baseline
 *
 * Outputs:
 * - .hawky/baseline.json: Violations database with stable hashes
 * - .hawky/onboarding-report.md: Human-readable summary for team review
 */
import type { Baseline } from './types';
import type { HawkyConfig } from '../config/types';
import type { GateResult } from '../gates/types';
/**
 * Options for baseline generation
 */
export interface GeneratorOptions {
    /** Working directory (repo root) */
    cwd: string;
    /** Branch name for baseline metadata */
    branch: string;
    /** Commit SHA for baseline metadata */
    commit: string;
    /** Hawky configuration */
    config: HawkyConfig;
    /** Whether to commit and push baseline files */
    commitAndPush?: boolean;
    /** GitHub token for pushing (required if commitAndPush is true) */
    githubToken?: string;
}
/**
 * Result of baseline generation
 */
export interface GeneratorResult {
    /** Whether generation succeeded */
    success: boolean;
    /** The generated baseline */
    baseline: Baseline | null;
    /** Path to baseline.json */
    baselinePath: string | null;
    /** Path to onboarding-report.md */
    reportPath: string | null;
    /** Error message if failed */
    error?: string;
    /** Summary of violations by gate */
    summary: {
        total: number;
        typescript: number;
        eslint: number;
        semgrep: number;
        gitleaks: number;
    };
    /** Gate results for reporting */
    gateResults: GateResult[];
}
/**
 * Generate baseline by scanning the full repository
 */
export declare function generateBaseline(options: GeneratorOptions): Promise<GeneratorResult>;
/**
 * Generate baseline with auto-detected branch and commit
 */
export declare function generateBaselineFromCwd(config: HawkyConfig, commitAndPush?: boolean, githubToken?: string): Promise<GeneratorResult>;
//# sourceMappingURL=generator.d.ts.map