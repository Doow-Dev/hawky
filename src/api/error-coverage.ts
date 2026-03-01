/**
 * Error Code Coverage Check
 *
 * Compare error codes defined in OpenAPI spec vs actual implementation.
 * Detects undocumented error responses and unused documented errors.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedSpec, SpecErrorCode } from './spec-parser';

/**
 * Error code found in implementation
 */
export interface ImplementedError {
  statusCode: string;
  file: string;
  line: number;
  context?: string;
}

/**
 * Coverage analysis result
 */
export interface ErrorCoverageResult {
  /** Total documented error codes */
  documentedCount: number;

  /** Total implemented error codes */
  implementedCount: number;

  /** Error codes in spec but not found in implementation */
  undocumented: ImplementedError[];

  /** Error codes in implementation but not in spec */
  missing: SpecErrorCode[];

  /** Coverage percentage (documented / implemented) */
  coveragePercentage: number;
}

/**
 * Patterns to match error status codes in source code
 */
const ERROR_PATTERNS = [
  // res.status(4xx)
  /res\.status\s*\(\s*(\d{3})\s*\)/g,
  // res.sendStatus(4xx)
  /res\.sendStatus\s*\(\s*(\d{3})\s*\)/g,
  // throw new HttpException(..., 4xx)
  /new\s+HttpException\s*\([^,]+,\s*(\d{3})\s*\)/g,
  // throw new HttpException(..., HttpStatus.XXX)
  /HttpStatus\.([A-Z_]+)/g,
  // return { statusCode: 4xx }
  /statusCode:\s*(\d{3})/g,
  // reply.code(4xx)
  /reply\.code\s*\(\s*(\d{3})\s*\)/g,
  // ctx.status = 4xx
  /ctx\.status\s*=\s*(\d{3})/g,
  // c.status(4xx) - Hono
  /c\.status\s*\(\s*(\d{3})\s*\)/g,
];

/**
 * HTTP status name to code mapping
 */
const HTTP_STATUS_CODES: Record<string, string> = {
  BAD_REQUEST: '400',
  UNAUTHORIZED: '401',
  PAYMENT_REQUIRED: '402',
  FORBIDDEN: '403',
  NOT_FOUND: '404',
  METHOD_NOT_ALLOWED: '405',
  NOT_ACCEPTABLE: '406',
  PROXY_AUTHENTICATION_REQUIRED: '407',
  REQUEST_TIMEOUT: '408',
  CONFLICT: '409',
  GONE: '410',
  LENGTH_REQUIRED: '411',
  PRECONDITION_FAILED: '412',
  PAYLOAD_TOO_LARGE: '413',
  URI_TOO_LONG: '414',
  UNSUPPORTED_MEDIA_TYPE: '415',
  RANGE_NOT_SATISFIABLE: '416',
  EXPECTATION_FAILED: '417',
  I_AM_A_TEAPOT: '418',
  MISDIRECTED_REQUEST: '421',
  UNPROCESSABLE_ENTITY: '422',
  LOCKED: '423',
  FAILED_DEPENDENCY: '424',
  TOO_EARLY: '425',
  UPGRADE_REQUIRED: '426',
  PRECONDITION_REQUIRED: '428',
  TOO_MANY_REQUESTS: '429',
  REQUEST_HEADER_FIELDS_TOO_LARGE: '431',
  UNAVAILABLE_FOR_LEGAL_REASONS: '451',
  INTERNAL_SERVER_ERROR: '500',
  NOT_IMPLEMENTED: '501',
  BAD_GATEWAY: '502',
  SERVICE_UNAVAILABLE: '503',
  GATEWAY_TIMEOUT: '504',
  HTTP_VERSION_NOT_SUPPORTED: '505',
  VARIANT_ALSO_NEGOTIATES: '506',
  INSUFFICIENT_STORAGE: '507',
  LOOP_DETECTED: '508',
  NOT_EXTENDED: '510',
  NETWORK_AUTHENTICATION_REQUIRED: '511',
};

/**
 * Find error codes used in source files
 */
export function findImplementedErrors(
  sourceDir: string,
  extensions: string[] = ['.ts', '.js', '.tsx', '.jsx']
): ImplementedError[] {
  const errors: ImplementedError[] = [];

  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of ERROR_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(line)) !== null) {
          let statusCode = match[1];
          if (!statusCode) continue;

          // Convert HTTP status name to code
          const mappedCode = HTTP_STATUS_CODES[statusCode];
          if (mappedCode) {
            statusCode = mappedCode;
          }

          // Only track 4xx and 5xx errors
          if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
            errors.push({
              statusCode,
              file: path.relative(sourceDir, filePath).replace(/\\/g, '/'),
              line: index + 1,
              context: line.trim().substring(0, 100),
            });
          }
        }
      }
    });
  }

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, coverage, etc.
        if (!['node_modules', 'dist', 'build', 'coverage', '.git'].includes(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          scanFile(fullPath);
        }
      }
    }
  }

  scanDir(sourceDir);
  return errors;
}

/**
 * Get unique status codes from implemented errors
 */
export function getUniqueImplementedCodes(errors: ImplementedError[]): string[] {
  return [...new Set(errors.map((e) => e.statusCode))].sort();
}

/**
 * Check error code coverage between spec and implementation
 */
export function checkErrorCoverage(
  spec: ParsedSpec,
  sourceDir: string
): ErrorCoverageResult {
  // Get documented error codes from spec
  const specErrorCodes = new Set(spec.errorCodes.map((e) => e.statusCode));

  // Find implemented error codes
  const implementedErrors = findImplementedErrors(sourceDir);
  const implementedCodes = new Set(getUniqueImplementedCodes(implementedErrors));

  // Find undocumented (in implementation but not in spec)
  const undocumented = implementedErrors.filter(
    (e) => !specErrorCodes.has(e.statusCode)
  );

  // Find missing (in spec but not in implementation)
  const missing = spec.errorCodes.filter(
    (e) => !implementedCodes.has(e.statusCode)
  );

  // Calculate coverage
  const documentedCount = specErrorCodes.size;
  const implementedCount = implementedCodes.size;
  const coveragePercentage =
    implementedCount > 0
      ? Math.round((documentedCount / implementedCount) * 100)
      : 100;

  return {
    documentedCount,
    implementedCount,
    undocumented,
    missing,
    coveragePercentage,
  };
}

/**
 * Group errors by status code
 */
export function groupErrorsByCode(
  errors: ImplementedError[]
): Map<string, ImplementedError[]> {
  const grouped = new Map<string, ImplementedError[]>();

  for (const error of errors) {
    const existing = grouped.get(error.statusCode) || [];
    existing.push(error);
    grouped.set(error.statusCode, existing);
  }

  return grouped;
}

/**
 * Format coverage result as markdown
 */
export function formatCoverageReport(result: ErrorCoverageResult): string {
  const lines: string[] = [];

  lines.push('## Error Code Coverage Report');
  lines.push('');
  lines.push(`- **Documented in spec:** ${result.documentedCount} codes`);
  lines.push(`- **Found in implementation:** ${result.implementedCount} codes`);
  lines.push(`- **Coverage:** ${result.coveragePercentage}%`);
  lines.push('');

  if (result.undocumented.length > 0) {
    lines.push('### Undocumented Error Codes');
    lines.push('');
    lines.push('These error codes are used in the implementation but not documented in the spec:');
    lines.push('');

    const grouped = groupErrorsByCode(result.undocumented);
    for (const [code, errors] of grouped) {
      lines.push(`#### ${code}`);
      for (const error of errors.slice(0, 5)) {
        lines.push(`- \`${error.file}:${error.line}\`: ${error.context || ''}`);
      }
      if (errors.length > 5) {
        lines.push(`- ... and ${errors.length - 5} more`);
      }
      lines.push('');
    }
  }

  if (result.missing.length > 0) {
    lines.push('### Missing Implementation');
    lines.push('');
    lines.push('These error codes are documented in the spec but not found in the implementation:');
    lines.push('');

    for (const error of result.missing) {
      lines.push(`- **${error.statusCode}** (${error.method.toUpperCase()} ${error.path}): ${error.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
