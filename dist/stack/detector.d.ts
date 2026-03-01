/**
 * Stack Detection Engine
 *
 * S086: Detects language/technology stacks in a repository by scanning
 * for marker files. Returns all detected stacks with confidence scores.
 */
import type { DetectedStack, StackType, StackDetectionOptions } from './types';
/**
 * Marker file definition for stack detection
 */
interface MarkerFile {
    /** File path pattern (relative to root) */
    path: string;
    /** Whether to check file contents for additional markers */
    checkContents?: boolean;
    /** Content pattern to match (regex) */
    contentPattern?: RegExp;
    /** Confidence boost when this marker is found (0-1) */
    confidence: number;
    /** Whether this is a glob pattern */
    isGlob?: boolean;
}
/**
 * Stack detection configuration
 */
interface StackDetectionConfig {
    type: StackType;
    displayName: string;
    markers: MarkerFile[];
    /** Function to detect package manager */
    detectPackageManager?: (rootDir: string) => Promise<string | undefined>;
}
/**
 * Detect all stacks in a directory
 *
 * Scans for marker files and returns all detected stacks.
 * Repos can be polyglot (multiple stacks).
 *
 * @param rootDir - Root directory to scan
 * @param options - Detection options
 * @returns Array of detected stacks sorted by confidence
 */
export declare function detectStacks(rootDir: string, options?: StackDetectionOptions): Promise<DetectedStack[]>;
/**
 * Check for .tf files in directory (for Terraform detection)
 */
export declare function hasTerraformFiles(rootDir: string): Promise<boolean>;
/**
 * Check for Kubernetes manifests (yaml files with apiVersion)
 */
export declare function hasKubernetesManifests(rootDir: string): Promise<boolean>;
/**
 * Get the primary stack (highest confidence)
 */
export declare function getPrimaryStack(stacks: DetectedStack[]): DetectedStack | null;
/**
 * Get detection config for a stack type (for testing)
 */
export declare function getStackDetectionConfig(type: StackType): StackDetectionConfig | undefined;
export {};
//# sourceMappingURL=detector.d.ts.map