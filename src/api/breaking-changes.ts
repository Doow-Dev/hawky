/**
 * Breaking Change Detection
 *
 * Compares current OpenAPI spec vs previous version (from baseline or git)
 * to detect breaking changes in the API.
 *
 * Breaking changes (errors):
 * - Removed endpoints
 * - Removed required fields
 * - Type changes
 * - Added required fields to request
 *
 * Non-breaking changes (info):
 * - Added optional fields
 * - New endpoints
 * - Added optional query parameters
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { ParsedSpec, SpecEndpoint, SchemaObject, HttpMethod } from './spec-parser';
import { parseSpec, findSpecFiles } from './spec-parser';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of breaking change
 */
export type BreakingChangeKind =
  // Breaking (error)
  | 'endpoint-removed'
  | 'required-field-removed'
  | 'type-changed'
  | 'required-field-added-to-request'
  | 'parameter-removed'
  | 'required-parameter-added'
  | 'response-removed'
  // Non-breaking (info)
  | 'endpoint-added'
  | 'optional-field-added'
  | 'optional-parameter-added'
  | 'response-added'
  | 'field-made-optional';

/**
 * Severity based on change kind
 */
export type ChangeSeverity = 'error' | 'warning' | 'info';

/**
 * A detected change between spec versions
 */
export interface SpecChange {
  /** Type of change */
  kind: BreakingChangeKind;

  /** Severity level */
  severity: ChangeSeverity;

  /** Endpoint path */
  path: string;

  /** HTTP method */
  method?: HttpMethod;

  /** Field name if applicable */
  field?: string;

  /** Parameter name if applicable */
  parameter?: string;

  /** Human-readable message */
  message: string;

  /** What it was before */
  before?: string;

  /** What it is now */
  after?: string;
}

/**
 * Result of breaking change detection
 */
export interface BreakingChangeResult {
  /** All changes detected */
  changes: SpecChange[];

  /** Breaking changes count */
  breakingCount: number;

  /** Non-breaking changes count */
  nonBreakingCount: number;

  /** Whether there are any breaking changes */
  hasBreakingChanges: boolean;

  /** Human-readable summary */
  summary: string;
}

/**
 * Options for comparing specs
 */
export interface CompareOptions {
  /** Path to current (new) spec */
  currentSpecPath: string;

  /** Path to previous (baseline) spec */
  previousSpecPath?: string;

  /** Git ref to compare against (e.g., 'main', 'HEAD~1') */
  gitRef?: string;

  /** Root directory (for git operations) */
  rootDir?: string;
}

// ============================================================================
// Severity Mapping
// ============================================================================

/**
 * Get severity for a change kind
 */
function getSeverity(kind: BreakingChangeKind): ChangeSeverity {
  switch (kind) {
    // Breaking changes
    case 'endpoint-removed':
    case 'required-field-removed':
    case 'type-changed':
    case 'required-field-added-to-request':
    case 'parameter-removed':
    case 'required-parameter-added':
    case 'response-removed':
      return 'error';

    // Non-breaking changes
    case 'endpoint-added':
    case 'optional-field-added':
    case 'optional-parameter-added':
    case 'response-added':
    case 'field-made-optional':
      return 'info';

    default:
      return 'warning';
  }
}

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Get file content from a git ref
 */
function getFileFromGit(filePath: string, gitRef: string, cwd: string): string | null {
  try {
    // Get relative path from repo root
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
    }).trim();

    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

    const content = execSync(`git show ${gitRef}:${relativePath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    return content;
  } catch {
    return null;
  }
}

/**
 * Parse spec from git ref
 */
function parseSpecFromGit(
  specPath: string,
  gitRef: string,
  cwd: string
): ParsedSpec | null {
  const content = getFileFromGit(specPath, gitRef, cwd);
  if (!content) {
    return null;
  }

  // Write to temp file and parse
  const tempPath = path.join(cwd, `.hawky-temp-spec-${Date.now()}.yaml`);
  try {
    fs.writeFileSync(tempPath, content);
    const result = parseSpec(tempPath);
    return result.success ? result.spec ?? null : null;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Create endpoint key for matching
 */
function endpointKey(method: HttpMethod, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/**
 * Get property names from a schema
 */
function getSchemaProperties(schema?: SchemaObject): Map<string, SchemaObject> {
  const props = new Map<string, SchemaObject>();
  if (schema?.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      props.set(name, prop);
    }
  }
  return props;
}

/**
 * Check if a field is required in a schema
 */
function isRequired(schema: SchemaObject | undefined, fieldName: string): boolean {
  return schema?.required?.includes(fieldName) ?? false;
}

/**
 * Get a type string from a schema
 */
function schemaTypeString(schema?: SchemaObject): string {
  if (!schema) return 'unknown';

  if (schema.$ref) {
    return schema.$ref.split('/').pop() || 'ref';
  }

  if (schema.type === 'array') {
    return `${schemaTypeString(schema.items)}[]`;
  }

  if (schema.enum) {
    return `enum(${schema.enum.join('|')})`;
  }

  return schema.type || 'unknown';
}

/**
 * Compare two schemas for type changes
 */
function compareSchemaTypes(
  prevSchema: SchemaObject | undefined,
  currSchema: SchemaObject | undefined
): boolean {
  const prevType = schemaTypeString(prevSchema);
  const currType = schemaTypeString(currSchema);
  return prevType === currType;
}

/**
 * Compare endpoint parameters
 */
function compareParameters(
  prevEndpoint: SpecEndpoint,
  currEndpoint: SpecEndpoint,
  changes: SpecChange[]
): void {
  const prevParams = new Map(prevEndpoint.parameters.map((p) => [p.name, p]));
  const currParams = new Map(currEndpoint.parameters.map((p) => [p.name, p]));

  // Check for removed parameters
  for (const [name] of prevParams) {
    if (!currParams.has(name)) {
      changes.push({
        kind: 'parameter-removed',
        severity: getSeverity('parameter-removed'),
        path: prevEndpoint.path,
        method: prevEndpoint.method,
        parameter: name,
        message: `Parameter "${name}" was removed`,
      });
    }
  }

  // Check for added required parameters
  for (const [name, currParam] of currParams) {
    const prevParam = prevParams.get(name);
    if (!prevParam && currParam.required) {
      changes.push({
        kind: 'required-parameter-added',
        severity: getSeverity('required-parameter-added'),
        path: currEndpoint.path,
        method: currEndpoint.method,
        parameter: name,
        message: `Required parameter "${name}" was added`,
      });
    } else if (!prevParam && !currParam.required) {
      changes.push({
        kind: 'optional-parameter-added',
        severity: getSeverity('optional-parameter-added'),
        path: currEndpoint.path,
        method: currEndpoint.method,
        parameter: name,
        message: `Optional parameter "${name}" was added`,
      });
    }
  }
}

/**
 * Compare request body schemas
 */
function compareRequestBody(
  prevEndpoint: SpecEndpoint,
  currEndpoint: SpecEndpoint,
  changes: SpecChange[]
): void {
  const prevBody = prevEndpoint.requestBody?.schema;
  const currBody = currEndpoint.requestBody?.schema;

  if (!prevBody && !currBody) return;

  const prevProps = getSchemaProperties(prevBody);
  const currProps = getSchemaProperties(currBody);

  // Check for removed fields
  for (const [name] of prevProps) {
    if (!currProps.has(name)) {
      if (isRequired(prevBody, name)) {
        changes.push({
          kind: 'required-field-removed',
          severity: getSeverity('required-field-removed'),
          path: prevEndpoint.path,
          method: prevEndpoint.method,
          field: name,
          message: `Required request field "${name}" was removed`,
        });
      }
    }
  }

  // Check for added required fields (breaking for request body)
  for (const [name, currProp] of currProps) {
    const prevProp = prevProps.get(name);
    if (!prevProp) {
      if (isRequired(currBody, name)) {
        changes.push({
          kind: 'required-field-added-to-request',
          severity: getSeverity('required-field-added-to-request'),
          path: currEndpoint.path,
          method: currEndpoint.method,
          field: name,
          message: `Required request field "${name}" was added (breaking for existing clients)`,
        });
      } else {
        changes.push({
          kind: 'optional-field-added',
          severity: getSeverity('optional-field-added'),
          path: currEndpoint.path,
          method: currEndpoint.method,
          field: name,
          message: `Optional request field "${name}" was added`,
        });
      }
    } else {
      // Check for type changes
      if (!compareSchemaTypes(prevProp, currProp)) {
        changes.push({
          kind: 'type-changed',
          severity: getSeverity('type-changed'),
          path: currEndpoint.path,
          method: currEndpoint.method,
          field: name,
          message: `Request field "${name}" type changed`,
          before: schemaTypeString(prevProp),
          after: schemaTypeString(currProp),
        });
      }
    }
  }
}

/**
 * Compare response schemas
 */
function compareResponses(
  prevEndpoint: SpecEndpoint,
  currEndpoint: SpecEndpoint,
  changes: SpecChange[]
): void {
  const prevResponses = new Map(
    prevEndpoint.responses.map((r) => [r.statusCode, r])
  );
  const currResponses = new Map(
    currEndpoint.responses.map((r) => [r.statusCode, r])
  );

  // Check for removed responses (only 2xx are breaking)
  for (const [code] of prevResponses) {
    if (!currResponses.has(code) && code.startsWith('2')) {
      changes.push({
        kind: 'response-removed',
        severity: getSeverity('response-removed'),
        path: prevEndpoint.path,
        method: prevEndpoint.method,
        message: `Response ${code} was removed`,
      });
    }
  }

  // Check for response body changes in 2xx responses
  for (const [code, currResp] of currResponses) {
    const prevResp = prevResponses.get(code);

    if (!prevResp && code.startsWith('2')) {
      changes.push({
        kind: 'response-added',
        severity: getSeverity('response-added'),
        path: currEndpoint.path,
        method: currEndpoint.method,
        message: `Response ${code} was added`,
      });
      continue;
    }

    if (!prevResp || !code.startsWith('2')) continue;

    const prevProps = getSchemaProperties(prevResp.schema);
    const currProps = getSchemaProperties(currResp.schema);

    // Removed response fields are breaking
    for (const [name] of prevProps) {
      if (!currProps.has(name)) {
        changes.push({
          kind: 'required-field-removed',
          severity: getSeverity('required-field-removed'),
          path: prevEndpoint.path,
          method: prevEndpoint.method,
          field: name,
          message: `Response field "${name}" was removed`,
        });
      }
    }

    // Added response fields are not breaking
    for (const [name] of currProps) {
      if (!prevProps.has(name)) {
        changes.push({
          kind: 'optional-field-added',
          severity: getSeverity('optional-field-added'),
          path: currEndpoint.path,
          method: currEndpoint.method,
          field: name,
          message: `Response field "${name}" was added`,
        });
      }
    }

    // Type changes in response
    for (const [name, currProp] of currProps) {
      const prevProp = prevProps.get(name);
      if (prevProp && !compareSchemaTypes(prevProp, currProp)) {
        changes.push({
          kind: 'type-changed',
          severity: getSeverity('type-changed'),
          path: currEndpoint.path,
          method: currEndpoint.method,
          field: name,
          message: `Response field "${name}" type changed`,
          before: schemaTypeString(prevProp),
          after: schemaTypeString(currProp),
        });
      }
    }
  }
}

/**
 * Compare two endpoints for breaking changes
 */
function compareEndpoints(
  prevEndpoint: SpecEndpoint,
  currEndpoint: SpecEndpoint,
  changes: SpecChange[]
): void {
  compareParameters(prevEndpoint, currEndpoint, changes);
  compareRequestBody(prevEndpoint, currEndpoint, changes);
  compareResponses(prevEndpoint, currEndpoint, changes);
}

/**
 * Compare two OpenAPI specs
 */
export function compareSpecs(
  previous: ParsedSpec,
  current: ParsedSpec
): BreakingChangeResult {
  const changes: SpecChange[] = [];

  // Build endpoint maps
  const prevEndpoints = new Map(
    previous.endpoints.map((e) => [endpointKey(e.method, e.path), e])
  );
  const currEndpoints = new Map(
    current.endpoints.map((e) => [endpointKey(e.method, e.path), e])
  );

  // Check for removed endpoints
  for (const [key, prevEndpoint] of prevEndpoints) {
    if (!currEndpoints.has(key)) {
      changes.push({
        kind: 'endpoint-removed',
        severity: getSeverity('endpoint-removed'),
        path: prevEndpoint.path,
        method: prevEndpoint.method,
        message: `Endpoint ${prevEndpoint.method.toUpperCase()} ${prevEndpoint.path} was removed`,
      });
    }
  }

  // Check for added endpoints and compare existing
  for (const [key, currEndpoint] of currEndpoints) {
    const prevEndpoint = prevEndpoints.get(key);

    if (!prevEndpoint) {
      changes.push({
        kind: 'endpoint-added',
        severity: getSeverity('endpoint-added'),
        path: currEndpoint.path,
        method: currEndpoint.method,
        message: `Endpoint ${currEndpoint.method.toUpperCase()} ${currEndpoint.path} was added`,
      });
    } else {
      compareEndpoints(prevEndpoint, currEndpoint, changes);
    }
  }

  // Count breaking vs non-breaking
  const breakingCount = changes.filter((c) => c.severity === 'error').length;
  const nonBreakingCount = changes.filter((c) => c.severity !== 'error').length;

  return {
    changes,
    breakingCount,
    nonBreakingCount,
    hasBreakingChanges: breakingCount > 0,
    summary:
      changes.length === 0
        ? 'No changes detected.'
        : `${breakingCount} breaking changes, ${nonBreakingCount} non-breaking changes.`,
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Detect breaking changes between spec versions
 */
export function detectBreakingChanges(
  options: CompareOptions
): BreakingChangeResult {
  // Parse current spec
  const currentResult = parseSpec(options.currentSpecPath);
  if (!currentResult.success || !currentResult.spec) {
    return {
      changes: [],
      breakingCount: 0,
      nonBreakingCount: 0,
      hasBreakingChanges: false,
      summary: `Failed to parse current spec: ${currentResult.error}`,
    };
  }

  // Get previous spec
  let previousSpec: ParsedSpec | null = null;

  if (options.previousSpecPath) {
    // Use provided previous spec path
    const prevResult = parseSpec(options.previousSpecPath);
    if (prevResult.success && prevResult.spec) {
      previousSpec = prevResult.spec;
    }
  } else if (options.gitRef) {
    // Get from git
    const cwd = options.rootDir || path.dirname(options.currentSpecPath);
    previousSpec = parseSpecFromGit(options.currentSpecPath, options.gitRef, cwd);
  }

  if (!previousSpec) {
    return {
      changes: [],
      breakingCount: 0,
      nonBreakingCount: 0,
      hasBreakingChanges: false,
      summary: 'No previous spec to compare against.',
    };
  }

  return compareSpecs(previousSpec, currentResult.spec);
}

/**
 * Check for breaking changes in a directory
 */
export function checkBreakingChanges(
  rootDir: string,
  gitRef: string = 'HEAD~1'
): BreakingChangeResult {
  const specFiles = findSpecFiles(rootDir);

  if (specFiles.length === 0) {
    return {
      changes: [],
      breakingCount: 0,
      nonBreakingCount: 0,
      hasBreakingChanges: false,
      summary: 'No OpenAPI spec found.',
    };
  }

  const specPath = specFiles[0] as string;
  return detectBreakingChanges({
    currentSpecPath: specPath,
    gitRef,
    rootDir,
  });
}

/**
 * Format breaking changes as a report
 */
export function formatBreakingChangesReport(result: BreakingChangeResult): string {
  const lines: string[] = ['# Breaking Changes Report', ''];

  if (result.changes.length === 0) {
    lines.push('No changes detected.');
    return lines.join('\n');
  }

  // Breaking changes (errors)
  const breaking = result.changes.filter((c) => c.severity === 'error');
  if (breaking.length > 0) {
    lines.push('## Breaking Changes', '');
    for (const change of breaking) {
      const endpoint = change.method
        ? `${change.method.toUpperCase()} ${change.path}`
        : change.path;
      let detail = change.message;
      if (change.before && change.after) {
        detail += ` (${change.before} -> ${change.after})`;
      }
      lines.push(`- **${endpoint}**: ${detail}`);
    }
    lines.push('');
  }

  // Non-breaking changes (info)
  const nonBreaking = result.changes.filter((c) => c.severity !== 'error');
  if (nonBreaking.length > 0) {
    lines.push('## Non-Breaking Changes', '');
    for (const change of nonBreaking) {
      const endpoint = change.method
        ? `${change.method.toUpperCase()} ${change.path}`
        : change.path;
      lines.push(`- **${endpoint}**: ${change.message}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(result.summary);

  return lines.join('\n');
}
