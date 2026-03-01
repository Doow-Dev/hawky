/**
 * Stack Module Types
 *
 * S087: Core type definitions for the stack detection and execution system.
 * Hawky's stack module architecture enables language-agnostic code quality gates.
 */

import type { GateResult, GateStatus } from '../gates/types';

/**
 * Supported stack types
 */
export type StackType =
  | 'typescript'
  | 'go'
  | 'rust'
  | 'python'
  | 'terraform'
  | 'docker'
  | 'kubernetes';

/**
 * All valid stack types
 */
export const STACK_TYPES: StackType[] = [
  'typescript',
  'go',
  'rust',
  'python',
  'terraform',
  'docker',
  'kubernetes',
];

/**
 * Package managers for TypeScript/Node.js projects
 */
export type NodePackageManager = 'npm' | 'yarn' | 'pnpm';

/**
 * Package managers for Python projects
 */
export type PythonPackageManager = 'pip' | 'poetry' | 'pipenv' | 'uv';

/**
 * Result of stack detection with confidence scoring
 */
export interface DetectedStack {
  /** Stack type identified */
  type: StackType;

  /** Confidence score (0-1) based on marker file strength */
  confidence: number;

  /** Human-readable reason for detection */
  reason: string;

  /** Marker files that triggered detection */
  markers: string[];

  /** Detected package manager (for stacks that use them) */
  packageManager?: NodePackageManager | PythonPackageManager | string;

  /** Root directory for this stack (may differ from repo root for monorepos) */
  rootDir: string;
}

/**
 * Result of running a stack command (build/test)
 */
export interface StackCommandResult {
  /** Exit code from the command */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Whether the command timed out */
  timedOut: boolean;

  /** Execution time in milliseconds */
  timeMs: number;

  /** Whether the tool was found/available */
  toolAvailable: boolean;

  /** Error message if tool not available */
  toolError?: string;
}

/**
 * Stack gate result extends GateResult with stack-specific info
 */
export interface StackGateResult extends Omit<GateResult, 'gate'> {
  /** Stack type that produced this result */
  stack: StackType;

  /** Gate type (build or test) */
  gateType: 'build' | 'test' | 'lint' | 'security';

  /** Combined gate name for reporting */
  gate: `${StackType}-${string}`;

  /** Command that was executed */
  command: string;
}

/**
 * Interface for stack module implementations
 *
 * Each stack module handles detection, command generation, and execution
 * for a specific language/technology stack.
 */
export interface StackModule {
  /** Stack identifier */
  name: StackType;

  /** Human-readable display name */
  displayName: string;

  /**
   * Detect if this stack is present in the given directory
   * @param rootDir - Directory to check
   * @returns Detection result with confidence
   */
  detect(rootDir: string): Promise<DetectedStack | null>;

  /**
   * Get the build command for this stack
   * @param rootDir - Project root directory
   * @returns Build command or null if not applicable
   */
  getBuildCommand(rootDir: string): Promise<string | null>;

  /**
   * Get the test command for this stack
   * @param rootDir - Project root directory
   * @returns Test command or null if not applicable
   */
  getTestCommand(rootDir: string): Promise<string | null>;

  /**
   * Get the lint command for this stack
   * MVP: Returns null (lint gates in future epic)
   * @param rootDir - Project root directory
   * @returns Lint command or null if not applicable
   */
  getLintCommand(rootDir: string): Promise<string | null>;

  /**
   * Get the security scanning command for this stack
   * MVP: Returns null (security gates in future epic)
   * @param rootDir - Project root directory
   * @returns Security command or null if not applicable
   */
  getSecurityCommand(rootDir: string): Promise<string | null>;

  /**
   * Run the build command and return results
   * @param rootDir - Project root directory
   * @param timeoutMs - Timeout in milliseconds
   * @returns Gate result with build status
   */
  runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult>;

  /**
   * Run the test command and return results
   * @param rootDir - Project root directory
   * @param timeoutMs - Timeout in milliseconds
   * @returns Gate result with test status
   */
  runTests(rootDir: string, timeoutMs: number): Promise<StackGateResult>;
}

/**
 * Options for stack detection
 */
export interface StackDetectionOptions {
  /** Only detect these stacks (default: all) */
  enabled?: StackType[] | 'auto';

  /** Skip these stacks even if detected */
  disabled?: StackType[];

  /** Minimum confidence threshold (default: 0.5) */
  minConfidence?: number;
}

/**
 * Per-stack configuration overrides
 */
export interface StackOverrideConfig {
  /** Custom build command (overrides auto-detected) */
  buildCommand?: string;

  /** Custom test command (overrides auto-detected) */
  testCommand?: string;

  /** Custom lint command (future) */
  lintCommand?: string;

  /** Custom security command (future) */
  securityCommand?: string;

  /** Whether this stack is enabled (default: true if detected) */
  enabled?: boolean;

  /** Timeout in seconds for this stack's commands */
  timeout?: number;
}

/**
 * Stack configuration in HawkyConfig
 */
export interface StacksConfig {
  /** Which stacks to enable: 'auto' (default) or explicit list */
  enabled?: StackType[] | 'auto';

  /** Stacks to skip even if detected */
  disabled?: StackType[];

  /** Per-stack overrides */
  overrides?: Partial<Record<StackType, StackOverrideConfig>>;
}

/**
 * Result of running all stack gates
 */
export interface StackRunResult {
  /** All detected stacks */
  detected: DetectedStack[];

  /** Results from running stack gates */
  results: StackGateResult[];

  /** Overall status (fail if any stack failed) */
  status: GateStatus;

  /** Stacks that were skipped (tool not available) */
  skipped: Array<{
    stack: StackType;
    reason: string;
  }>;

  /** Total execution time */
  timeMs: number;
}
