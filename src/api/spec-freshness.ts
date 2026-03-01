/**
 * Spec Freshness Check
 *
 * Compare OpenAPI spec file modification time against API source files.
 * Warns if the spec appears stale compared to recent implementation changes.
 */

import * as fs from 'fs';
import * as path from 'path';
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
 * Directories typically containing API source code
 */
const API_SOURCE_DIRS = [
  'src/routes',
  'src/api',
  'src/controllers',
  'src/handlers',
  'src/resolvers',
  'routes',
  'api',
  'controllers',
  'handlers',
  'resolvers',
  'lib/routes',
  'lib/api',
  'lib/controllers',
];

/**
 * File extensions for API source files
 */
const SOURCE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx'];

/**
 * Get modification time for a file
 */
export function getFileModTime(filePath: string): Date | null {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

/**
 * Find all source files in a directory recursively
 */
export function findSourceFiles(
  dir: string,
  extensions: string[] = SOURCE_EXTENSIONS
): FileModTime[] {
  const files: FileModTime[] = [];

  function scan(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, etc.
        if (!['node_modules', 'dist', 'build', 'coverage', '.git', '__tests__', 'test', 'tests'].includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          const mtime = getFileModTime(fullPath);
          if (mtime) {
            files.push({
              file: path.relative(dir, fullPath).replace(/\\/g, '/'),
              mtime,
            });
          }
        }
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Find API source directories in a project
 */
export function findApiSourceDirs(projectRoot: string): string[] {
  const dirs: string[] = [];

  for (const relPath of API_SOURCE_DIRS) {
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      dirs.push(fullPath);
    }
  }

  return dirs;
}

/**
 * Check if spec is fresh compared to API source files
 */
export function checkSpecFreshness(
  spec: ParsedSpec,
  projectRoot: string,
  sourceDirs?: string[]
): FreshnessResult {
  // Get spec modification time
  const specModified = spec.lastModified;

  // Find API source directories
  const apiDirs = sourceDirs || findApiSourceDirs(projectRoot);

  if (apiDirs.length === 0) {
    // No API directories found, assume fresh
    return {
      isFresh: true,
      specModified,
      latestSourceModified: null,
      staleFiles: [],
      daysStale: 0,
    };
  }

  // Collect all source files with their modification times
  const allFiles: FileModTime[] = [];
  for (const dir of apiDirs) {
    allFiles.push(...findSourceFiles(dir));
  }

  if (allFiles.length === 0) {
    // No source files found, assume fresh
    return {
      isFresh: true,
      specModified,
      latestSourceModified: null,
      staleFiles: [],
      daysStale: 0,
    };
  }

  // Find files modified after the spec
  const staleFiles = allFiles
    .filter((f) => f.mtime > specModified)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Find the most recently modified source file
  const latestSourceModified = allFiles.reduce(
    (latest, file) => (file.mtime > latest ? file.mtime : latest),
    new Date(0)
  );

  // Calculate days stale
  const firstStaleFile = staleFiles[0];
  const daysStale = firstStaleFile
    ? Math.ceil((firstStaleFile.mtime.getTime() - specModified.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const isFresh = staleFiles.length === 0;
  const warningMsg = `OpenAPI spec may be stale: ${staleFiles.length} file(s) modified after spec (${daysStale} day(s) behind)`;

  if (isFresh) {
    return {
      isFresh,
      specModified,
      latestSourceModified,
      staleFiles,
      daysStale,
    };
  }

  return {
    isFresh,
    specModified,
    latestSourceModified,
    staleFiles,
    daysStale,
    warning: warningMsg,
  };
}

/**
 * Format freshness result as markdown
 */
export function formatFreshnessReport(result: FreshnessResult): string {
  const lines: string[] = [];

  lines.push('## Spec Freshness Report');
  lines.push('');

  if (result.isFresh) {
    lines.push('**Status:** Fresh');
    lines.push('');
    lines.push(`Spec last modified: ${result.specModified.toISOString()}`);
    if (result.latestSourceModified) {
      lines.push(`Latest source modification: ${result.latestSourceModified.toISOString()}`);
    }
  } else {
    lines.push(`**Status:** Stale (${result.daysStale} day(s) behind)`);
    lines.push('');
    lines.push(`Spec last modified: ${result.specModified.toISOString()}`);
    lines.push(`Latest source modification: ${result.latestSourceModified?.toISOString()}`);
    lines.push('');
    lines.push('### Files Modified After Spec');
    lines.push('');

    const filesToShow = result.staleFiles.slice(0, 10);
    for (const file of filesToShow) {
      lines.push(`- \`${file.file}\` (${file.mtime.toISOString()})`);
    }

    if (result.staleFiles.length > 10) {
      lines.push(`- ... and ${result.staleFiles.length - 10} more files`);
    }
  }

  return lines.join('\n');
}

/**
 * Get freshness status as a simple string
 */
export function getFreshnessStatus(result: FreshnessResult): 'fresh' | 'stale' | 'warning' {
  if (result.isFresh) {
    return 'fresh';
  }
  if (result.daysStale > 7) {
    return 'stale';
  }
  return 'warning';
}
