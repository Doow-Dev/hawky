/**
 * DATA_CONTRACTS.md Integration
 *
 * Parses DATA_CONTRACTS.md (markdown format documenting API contracts) and
 * cross-references with OpenAPI spec to detect drift between documentation
 * and actual spec.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedSpec, SpecEndpoint, HttpMethod } from './spec-parser';
import { findSpecFiles, parseSpec } from './spec-parser';

// ============================================================================
// Types
// ============================================================================

/**
 * A documented endpoint from DATA_CONTRACTS.md
 */
export interface DocumentedEndpoint {
  /** HTTP method */
  method: HttpMethod;

  /** Path pattern (e.g., /api/v1/users/{id}) */
  path: string;

  /** Description from docs */
  description?: string;

  /** Request body fields documented */
  requestFields?: DocumentedField[];

  /** Response body fields documented */
  responseFields?: DocumentedField[];

  /** Documented status codes */
  statusCodes?: string[];

  /** Line number in the markdown file where this was defined */
  sourceLine: number;
}

/**
 * A documented field from DATA_CONTRACTS.md
 */
export interface DocumentedField {
  /** Field name */
  name: string;

  /** Documented type (e.g., "string", "number", "object") */
  type: string;

  /** Whether field is required */
  required: boolean;

  /** Description */
  description?: string;
}

/**
 * Parsed DATA_CONTRACTS.md document
 */
export interface ParsedContracts {
  /** All documented endpoints */
  endpoints: DocumentedEndpoint[];

  /** Path to the contracts file */
  filePath: string;

  /** Last modified time */
  lastModified: Date;

  /** Parse warnings (non-fatal) */
  warnings: string[];
}

/**
 * Type of drift between docs and spec
 */
export type DriftKind =
  | 'endpoint-missing-in-spec' // Endpoint in docs but not in spec
  | 'endpoint-missing-in-docs' // Endpoint in spec but not in docs
  | 'method-mismatch' // Same path but different methods
  | 'field-missing-in-spec' // Field documented but not in spec
  | 'field-missing-in-docs' // Field in spec but not documented
  | 'type-mismatch' // Field type differs
  | 'required-mismatch' // Field requiredness differs
  | 'status-code-missing'; // Status code in one but not other

/**
 * A drift issue between docs and spec
 */
export interface DriftViolation {
  /** Type of drift */
  kind: DriftKind;

  /** Severity level */
  severity: 'error' | 'warning';

  /** Path where drift was detected */
  path: string;

  /** Method if applicable */
  method?: HttpMethod;

  /** Field name if applicable */
  field?: string;

  /** Human-readable message */
  message: string;

  /** Line number in docs file (if from docs) */
  docsLine?: number;

  /** What was expected (from one source) */
  expected?: string;

  /** What was found (in the other source) */
  actual?: string;
}

/**
 * Result of drift detection
 */
export interface DriftResult {
  /** All drift violations found */
  violations: DriftViolation[];

  /** Number of endpoints in docs */
  docsEndpointCount: number;

  /** Number of endpoints in spec */
  specEndpointCount: number;

  /** Endpoints matched between both */
  matchedCount: number;

  /** Summary message */
  summary: string;
}

/**
 * Options for parsing DATA_CONTRACTS.md
 */
export interface ParseContractsOptions {
  /** Root directory to search in */
  rootDir: string;

  /** Custom file path (overrides search) */
  filePath?: string;
}

/**
 * Result from parsing contracts file
 */
export interface ParseContractsResult {
  success: boolean;
  contracts?: ParsedContracts;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Common DATA_CONTRACTS.md file locations
 */
export const CONTRACT_FILE_LOCATIONS = [
  'DATA_CONTRACTS.md',
  'docs/DATA_CONTRACTS.md',
  'api/DATA_CONTRACTS.md',
  'docs/api/DATA_CONTRACTS.md',
  'API_CONTRACTS.md',
  'docs/API_CONTRACTS.md',
  'CONTRACTS.md',
  'docs/CONTRACTS.md',
];

/**
 * Endpoint pattern: METHOD /path (path must start with /)
 */
const ENDPOINT_REGEX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/\S+)/i;

/**
 * Field pattern: - name (type, required/optional): description
 * or: | name | type | required | description |
 */
const FIELD_REGEX =
  /^[-*]\s*`?(\w+)`?\s*\((\w+)(?:,\s*(required|optional))?\)(?::\s*(.+))?$/i;
const TABLE_FIELD_REGEX = /^\|\s*`?(\w+)`?\s*\|\s*(\w+)\s*\|\s*(yes|no|required|optional)\s*\|(?:\s*(.+?)\s*\|)?$/i;

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Find DATA_CONTRACTS.md file in directory
 */
export function findContractsFile(rootDir: string): string | null {
  for (const location of CONTRACT_FILE_LOCATIONS) {
    const fullPath = path.join(rootDir, location);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Parse a field definition from markdown
 */
function parseField(line: string): DocumentedField | null {
  // Try bullet format: - fieldName (type, required): description
  const bulletMatch = line.match(FIELD_REGEX);
  if (bulletMatch && bulletMatch[1] && bulletMatch[2]) {
    const desc = bulletMatch[4]?.trim();
    const field: DocumentedField = {
      name: bulletMatch[1],
      type: bulletMatch[2].toLowerCase(),
      required: bulletMatch[3]?.toLowerCase() === 'required',
    };
    if (desc) {
      field.description = desc;
    }
    return field;
  }

  // Try table format: | fieldName | type | required | description |
  const tableMatch = line.match(TABLE_FIELD_REGEX);
  if (tableMatch && tableMatch[1] && tableMatch[2] && tableMatch[3]) {
    const requiredStr = tableMatch[3].toLowerCase();
    const desc = tableMatch[4]?.trim();
    const field: DocumentedField = {
      name: tableMatch[1],
      type: tableMatch[2].toLowerCase(),
      required: requiredStr === 'yes' || requiredStr === 'required',
    };
    if (desc) {
      field.description = desc;
    }
    return field;
  }

  return null;
}

/**
 * Parse status codes from a line like "Status codes: 200, 201, 400, 404, 500"
 */
function parseStatusCodes(line: string): string[] | null {
  const match = line.match(/status\s*codes?:\s*(.+)/i);
  if (!match || !match[1]) return null;

  const codes = match[1].split(/[,;\s]+/).filter((c) => /^\d{3}$/.test(c.trim()));
  return codes.length > 0 ? codes : null;
}

/**
 * Parse DATA_CONTRACTS.md file
 */
export function parseContractsFile(filePath: string): ParseContractsResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const stats = fs.statSync(filePath);

    const endpoints: DocumentedEndpoint[] = [];
    const warnings: string[] = [];

    let currentEndpoint: DocumentedEndpoint | null = null;
    let currentSection: 'request' | 'response' | null = null;

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      const line = lineContent ? lineContent.trim() : '';
      const lineNum = i + 1;

      // Skip empty lines and pure markdown decorators
      if (!line || line.startsWith('#') && !ENDPOINT_REGEX.test(line.replace(/^#+\s*/, ''))) {
        // Check for section headers
        const headerText = line.replace(/^#+\s*/, '').toLowerCase();
        if (headerText.includes('request') && !headerText.includes('response')) {
          currentSection = 'request';
        } else if (headerText.includes('response')) {
          currentSection = 'response';
        }
        continue;
      }

      // Remove heading markers for endpoint matching
      const cleanLine = line.replace(/^#+\s*/, '');

      // Check for endpoint definition
      const endpointMatch = cleanLine.match(ENDPOINT_REGEX);
      if (endpointMatch && endpointMatch[1] && endpointMatch[2]) {
        // Save previous endpoint if exists
        if (currentEndpoint) {
          endpoints.push(currentEndpoint);
        }

        currentEndpoint = {
          method: endpointMatch[1].toLowerCase() as HttpMethod,
          path: normalizePathPattern(endpointMatch[2]),
          sourceLine: lineNum,
        };
        currentSection = null;

        // Check for inline description after endpoint
        const afterPath = cleanLine.slice(endpointMatch[0].length).trim();
        if (afterPath && !afterPath.startsWith('-') && !afterPath.startsWith('|')) {
          currentEndpoint.description = afterPath;
        }
        continue;
      }

      // Check for status codes
      const statusCodes = parseStatusCodes(line);
      if (statusCodes && currentEndpoint) {
        currentEndpoint.statusCodes = statusCodes;
        continue;
      }

      // Check for field definitions
      const field = parseField(line);
      if (field && currentEndpoint) {
        if (currentSection === 'request') {
          if (!currentEndpoint.requestFields) {
            currentEndpoint.requestFields = [];
          }
          currentEndpoint.requestFields.push(field);
        } else if (currentSection === 'response') {
          if (!currentEndpoint.responseFields) {
            currentEndpoint.responseFields = [];
          }
          currentEndpoint.responseFields.push(field);
        } else {
          // Default to response fields if no section specified
          if (!currentEndpoint.responseFields) {
            currentEndpoint.responseFields = [];
          }
          currentEndpoint.responseFields.push(field);
        }
      }
    }

    // Don't forget the last endpoint
    if (currentEndpoint) {
      endpoints.push(currentEndpoint);
    }

    return {
      success: true,
      contracts: {
        endpoints,
        filePath,
        lastModified: stats.mtime,
        warnings,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to parse contracts: ${message}` };
  }
}

/**
 * Parse contracts from directory (finds and parses file)
 */
export function parseContracts(options: ParseContractsOptions): ParseContractsResult {
  const filePath = options.filePath || findContractsFile(options.rootDir);

  if (!filePath) {
    return {
      success: false,
      error: `No DATA_CONTRACTS.md found in ${options.rootDir}`,
    };
  }

  return parseContractsFile(filePath);
}

// ============================================================================
// Path Normalization
// ============================================================================

/**
 * Normalize a path pattern for comparison
 * - Converts :id to {id}
 * - Ensures leading slash
 * - Removes trailing slash
 */
function normalizePathPattern(path: string): string {
  let normalized = path
    // Convert Express :param to OpenAPI {param}
    .replace(/:(\w+)/g, '{$1}')
    // Ensure leading slash
    .replace(/^([^/])/, '/$1')
    // Remove trailing slash
    .replace(/\/$/, '');

  return normalized;
}

/**
 * Compare two paths ignoring parameter names
 * /users/{id} matches /users/{userId}
 */
function pathsMatch(path1: string, path2: string): boolean {
  const normalize = (p: string) =>
    p.replace(/\{[^}]+\}/g, '{param}').toLowerCase();
  return normalize(path1) === normalize(path2);
}

// ============================================================================
// Drift Detection
// ============================================================================

/**
 * Find spec endpoint matching a documented endpoint
 */
function findMatchingSpecEndpoint(
  doc: DocumentedEndpoint,
  specEndpoints: SpecEndpoint[]
): SpecEndpoint | undefined {
  return specEndpoints.find(
    (spec) => spec.method === doc.method && pathsMatch(spec.path, doc.path)
  );
}

/**
 * Find documented endpoint matching a spec endpoint
 */
function findMatchingDocEndpoint(
  spec: SpecEndpoint,
  docEndpoints: DocumentedEndpoint[]
): DocumentedEndpoint | undefined {
  return docEndpoints.find(
    (doc) => doc.method === spec.method && pathsMatch(doc.path, spec.path)
  );
}

/**
 * Extract response field names from spec endpoint
 */
function getSpecResponseFields(endpoint: SpecEndpoint): Set<string> {
  const fields = new Set<string>();

  // Get fields from 2xx responses
  for (const response of endpoint.responses) {
    if (response.statusCode.startsWith('2') && response.schema?.properties) {
      Object.keys(response.schema.properties).forEach((f) => fields.add(f));
    }
  }

  return fields;
}

/**
 * Extract request field names from spec endpoint
 */
function getSpecRequestFields(endpoint: SpecEndpoint): Set<string> {
  const fields = new Set<string>();

  if (endpoint.requestBody?.schema?.properties) {
    Object.keys(endpoint.requestBody.schema.properties).forEach((f) =>
      fields.add(f)
    );
  }

  return fields;
}

/**
 * Check field drift between docs and spec
 */
function checkFieldDrift(
  doc: DocumentedEndpoint,
  spec: SpecEndpoint,
  violations: DriftViolation[]
): void {
  // Check response fields
  if (doc.responseFields) {
    const specFields = getSpecResponseFields(spec);
    const docFieldNames = new Set(doc.responseFields.map((f) => f.name));

    // Fields in docs but not in spec
    for (const field of doc.responseFields) {
      if (!specFields.has(field.name)) {
        violations.push({
          kind: 'field-missing-in-spec',
          severity: 'warning',
          path: doc.path,
          method: doc.method,
          field: field.name,
          message: `Response field "${field.name}" is documented but not in OpenAPI spec`,
          docsLine: doc.sourceLine,
        });
      }
    }

    // Fields in spec but not in docs
    for (const fieldName of specFields) {
      if (!docFieldNames.has(fieldName)) {
        violations.push({
          kind: 'field-missing-in-docs',
          severity: 'warning',
          path: spec.path,
          method: spec.method,
          field: fieldName,
          message: `Response field "${fieldName}" is in spec but not documented`,
        });
      }
    }
  }

  // Check request fields
  if (doc.requestFields) {
    const specFields = getSpecRequestFields(spec);
    const docFieldNames = new Set(doc.requestFields.map((f) => f.name));

    // Fields in docs but not in spec
    for (const field of doc.requestFields) {
      if (!specFields.has(field.name)) {
        violations.push({
          kind: 'field-missing-in-spec',
          severity: 'warning',
          path: doc.path,
          method: doc.method,
          field: field.name,
          message: `Request field "${field.name}" is documented but not in OpenAPI spec`,
          docsLine: doc.sourceLine,
        });
      }
    }

    // Fields in spec but not in docs
    for (const fieldName of specFields) {
      if (!docFieldNames.has(fieldName)) {
        violations.push({
          kind: 'field-missing-in-docs',
          severity: 'warning',
          path: spec.path,
          method: spec.method,
          field: fieldName,
          message: `Request field "${fieldName}" is in spec but not documented`,
        });
      }
    }
  }
}

/**
 * Check status code drift between docs and spec
 */
function checkStatusCodeDrift(
  doc: DocumentedEndpoint,
  spec: SpecEndpoint,
  violations: DriftViolation[]
): void {
  if (!doc.statusCodes) return;

  const docCodes = new Set(doc.statusCodes);
  const specCodes = new Set(spec.responses.map((r) => r.statusCode));

  // Status codes in docs but not in spec
  for (const code of docCodes) {
    if (!specCodes.has(code)) {
      violations.push({
        kind: 'status-code-missing',
        severity: 'warning',
        path: doc.path,
        method: doc.method,
        message: `Status code ${code} is documented but not in OpenAPI spec`,
        docsLine: doc.sourceLine,
        expected: code,
      });
    }
  }

  // Status codes in spec but not in docs (only warn for non-default codes)
  for (const code of specCodes) {
    if (!docCodes.has(code) && !['200', '201', '204'].includes(code)) {
      violations.push({
        kind: 'status-code-missing',
        severity: 'warning',
        path: spec.path,
        method: spec.method,
        message: `Status code ${code} is in spec but not documented`,
        expected: code,
      });
    }
  }
}

/**
 * Detect drift between DATA_CONTRACTS.md and OpenAPI spec
 */
export function detectDrift(
  contracts: ParsedContracts,
  spec: ParsedSpec
): DriftResult {
  const violations: DriftViolation[] = [];
  let matchedCount = 0;

  // Check each documented endpoint against spec
  for (const doc of contracts.endpoints) {
    const matchingSpec = findMatchingSpecEndpoint(doc, spec.endpoints);

    if (!matchingSpec) {
      violations.push({
        kind: 'endpoint-missing-in-spec',
        severity: 'error',
        path: doc.path,
        method: doc.method,
        message: `Endpoint ${doc.method.toUpperCase()} ${doc.path} is documented but not in OpenAPI spec`,
        docsLine: doc.sourceLine,
      });
    } else {
      matchedCount++;
      checkFieldDrift(doc, matchingSpec, violations);
      checkStatusCodeDrift(doc, matchingSpec, violations);
    }
  }

  // Check each spec endpoint against docs
  for (const specEndpoint of spec.endpoints) {
    const matchingDoc = findMatchingDocEndpoint(specEndpoint, contracts.endpoints);

    if (!matchingDoc) {
      violations.push({
        kind: 'endpoint-missing-in-docs',
        severity: 'warning',
        path: specEndpoint.path,
        method: specEndpoint.method,
        message: `Endpoint ${specEndpoint.method.toUpperCase()} ${specEndpoint.path} is in spec but not documented`,
      });
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    violations,
    docsEndpointCount: contracts.endpoints.length,
    specEndpointCount: spec.endpoints.length,
    matchedCount,
    summary:
      violations.length === 0
        ? `No drift detected. ${matchedCount} endpoints matched.`
        : `Found ${violations.length} drift issues (${errorCount} errors, ${warningCount} warnings). ${matchedCount} endpoints matched.`,
  };
}

// ============================================================================
// Integration
// ============================================================================

/**
 * Options for running contracts integration check
 */
export interface ContractsCheckOptions {
  /** Root directory */
  rootDir: string;

  /** Path to contracts file (optional, will search if not provided) */
  contractsPath?: string;

  /** Path to OpenAPI spec (optional, will search if not provided) */
  specPath?: string;

  /** Treat missing contracts file as error */
  requireContracts?: boolean;
}

/**
 * Result of contracts integration check
 */
export interface ContractsCheckResult {
  /** Whether check passed */
  passed: boolean;

  /** Drift violations found */
  violations: DriftViolation[];

  /** Path to contracts file used */
  contractsPath: string | null;

  /** Path to spec file used */
  specPath: string | null;

  /** Human-readable summary */
  summary: string;
}

/**
 * Run contracts integration check
 */
export function checkContractsIntegration(
  options: ContractsCheckOptions
): ContractsCheckResult {
  // Find contracts file
  const contractsPath = options.contractsPath || findContractsFile(options.rootDir);
  if (!contractsPath) {
    if (options.requireContracts) {
      return {
        passed: false,
        violations: [],
        contractsPath: null,
        specPath: null,
        summary: 'No DATA_CONTRACTS.md found',
      };
    }
    return {
      passed: true,
      violations: [],
      contractsPath: null,
      specPath: null,
      summary: 'No DATA_CONTRACTS.md found (not required)',
    };
  }

  // Parse contracts
  const contractsResult = parseContractsFile(contractsPath);
  if (!contractsResult.success || !contractsResult.contracts) {
    return {
      passed: false,
      violations: [],
      contractsPath,
      specPath: null,
      summary: `Failed to parse contracts: ${contractsResult.error}`,
    };
  }

  // Find spec file
  const specFiles = options.specPath ? [options.specPath] : findSpecFiles(options.rootDir);
  if (specFiles.length === 0) {
    return {
      passed: false,
      violations: [],
      contractsPath: contractsPath,
      specPath: null,
      summary: 'No OpenAPI spec found to compare against',
    };
  }

  // Parse spec
  const specFilePath = specFiles[0] as string;
  const specResult = parseSpec(specFilePath);
  if (!specResult.success || !specResult.spec) {
    return {
      passed: false,
      violations: [],
      contractsPath: contractsPath,
      specPath: specFilePath,
      summary: `Failed to parse spec: ${specResult.error}`,
    };
  }

  // Detect drift
  const driftResult = detectDrift(contractsResult.contracts, specResult.spec);

  // Check passes if no errors (warnings allowed)
  const errorCount = driftResult.violations.filter((v) => v.severity === 'error').length;
  const passed = errorCount === 0;

  return {
    passed,
    violations: driftResult.violations,
    contractsPath: contractsPath,
    specPath: specFilePath,
    summary: driftResult.summary,
  };
}

/**
 * Format drift violations as a report
 */
export function formatDriftReport(result: ContractsCheckResult): string {
  const lines: string[] = ['# Contracts Integration Report', ''];

  if (result.contractsPath) {
    lines.push(`**Contracts File:** ${result.contractsPath}`);
  }
  if (result.specPath) {
    lines.push(`**OpenAPI Spec:** ${result.specPath}`);
  }
  lines.push('');

  if (result.violations.length === 0) {
    lines.push('No drift detected between documentation and spec.');
    return lines.join('\n');
  }

  // Group by kind
  const byKind = new Map<DriftKind, DriftViolation[]>();
  for (const v of result.violations) {
    const list = byKind.get(v.kind) || [];
    list.push(v);
    byKind.set(v.kind, list);
  }

  // Errors first
  const errors = result.violations.filter((v) => v.severity === 'error');
  if (errors.length > 0) {
    lines.push('## Errors', '');
    for (const v of errors) {
      lines.push(`- **${v.method?.toUpperCase() || ''} ${v.path}**: ${v.message}`);
    }
    lines.push('');
  }

  // Then warnings
  const warnings = result.violations.filter((v) => v.severity === 'warning');
  if (warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const v of warnings) {
      const fieldStr = v.field ? ` (field: ${v.field})` : '';
      lines.push(`- **${v.method?.toUpperCase() || ''} ${v.path}**${fieldStr}: ${v.message}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(result.summary);

  return lines.join('\n');
}
