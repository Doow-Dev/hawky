/**
 * Spec Freshness Check
 *
 * Compare OpenAPI spec file modification time against API source files.
 * Warns if the spec appears stale compared to recent implementation changes.
 */
import type { ParsedSpec } from './spec-parser';
/**
 * File with modification time
 */
export interface FileModTime {
    file: string;
    mtime: Date;
}
/**
 * Freshness check result
 */
export interface FreshnessResult {
    /** Is the spec fresh (up-to-date)? */
    isFresh: boolean;
    /** Spec file modification time */
    specModified: Date;
    /** Most recent source file modification time */
    latestSourceModified: Date | null;
    /** Files modified after the spec */
    staleFiles: FileModTime[];
    /** Staleness in days (if stale) */
    daysStale: number;
    /** Warning message (if stale) */
    warning?: string;
}
/**
 * Get modification time for a file
 */
export declare function getFileModTime(filePath: string): Date | null;
/**
 * Find all source files in a directory recursively
 */
export declare function findSourceFiles(dir: string, extensions?: string[]): FileModTime[];
/**
 * Find API source directories in a project
 */
export declare function findApiSourceDirs(projectRoot: string): string[];
/**
 * Check if spec is fresh compared to API source files
 */
export declare function checkSpecFreshness(spec: ParsedSpec, projectRoot: string, sourceDirs?: string[]): FreshnessResult;
/**
 * Format freshness result as markdown
 */
export declare function formatFreshnessReport(result: FreshnessResult): string;
/**
 * Get freshness status as a simple string
 */
export declare function getFreshnessStatus(result: FreshnessResult): 'fresh' | 'stale' | 'warning';
//# sourceMappingURL=spec-freshness.d.ts.map