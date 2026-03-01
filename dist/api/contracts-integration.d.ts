/**
 * DATA_CONTRACTS.md Integration
 *
 * Parses DATA_CONTRACTS.md (markdown format documenting API contracts) and
 * cross-references with OpenAPI spec to detect drift between documentation
 * and actual spec.
 */
import type { ParsedSpec, HttpMethod } from './spec-parser';
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
export type DriftKind = 'endpoint-missing-in-spec' | 'endpoint-missing-in-docs' | 'method-mismatch' | 'field-missing-in-spec' | 'field-missing-in-docs' | 'type-mismatch' | 'required-mismatch' | 'status-code-missing';
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
/**
 * Common DATA_CONTRACTS.md file locations
 */
export declare const CONTRACT_FILE_LOCATIONS: string[];
/**
 * Find DATA_CONTRACTS.md file in directory
 */
export declare function findContractsFile(rootDir: string): string | null;
/**
 * Parse DATA_CONTRACTS.md file
 */
export declare function parseContractsFile(filePath: string): ParseContractsResult;
/**
 * Parse contracts from directory (finds and parses file)
 */
export declare function parseContracts(options: ParseContractsOptions): ParseContractsResult;
/**
 * Detect drift between DATA_CONTRACTS.md and OpenAPI spec
 */
export declare function detectDrift(contracts: ParsedContracts, spec: ParsedSpec): DriftResult;
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
export declare function checkContractsIntegration(options: ContractsCheckOptions): ContractsCheckResult;
/**
 * Format drift violations as a report
 */
export declare function formatDriftReport(result: ContractsCheckResult): string;
//# sourceMappingURL=contracts-integration.d.ts.map