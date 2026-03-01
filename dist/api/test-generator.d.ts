/**
 * Endpoint Test Generator
 *
 * Generates Jest test stubs from OpenAPI specifications.
 * Creates runnable test files with proper typing and structure.
 */
import type { ParsedSpec, SchemaObject } from './spec-parser';
/**
 * Options for test generation
 */
export interface TestGeneratorOptions {
    /** Output directory for generated tests (default: __generated__/api-tests) */
    outputDir?: string;
    /** Base URL for API requests (default: 'http://localhost:3000') */
    baseUrl?: string;
    /** Import path for the API client/fetch function */
    clientImport?: string;
    /** Test framework (currently only 'jest' supported) */
    framework?: 'jest';
    /** Whether to generate a single file or split by tag */
    splitByTag?: boolean;
    /** Custom header for generated files */
    fileHeader?: string;
    /** Whether to overwrite existing files (default: false) */
    overwrite?: boolean;
    /** HTTP client to use in generated tests */
    httpClient?: 'fetch' | 'axios' | 'supertest';
}
/**
 * Generated test file
 */
export interface GeneratedTestFile {
    /** Relative path within output directory */
    path: string;
    /** File content */
    content: string;
    /** Endpoints covered */
    endpoints: number;
}
/**
 * Result of test generation
 */
export interface TestGeneratorResult {
    /** Generated files */
    files: GeneratedTestFile[];
    /** Total endpoints processed */
    totalEndpoints: number;
    /** Output directory path */
    outputDir: string;
    /** Whether files were written */
    written: boolean;
}
/**
 * Generate TypeScript type from OpenAPI schema
 * Useful for generating type definitions alongside tests
 */
export declare function schemaToTypeString(schema: SchemaObject | undefined, indent?: number): string;
/**
 * Generate test files from OpenAPI spec
 */
export declare function generateTests(spec: ParsedSpec, options?: TestGeneratorOptions): TestGeneratorResult;
/**
 * Generate and write test files to disk
 */
export declare function generateAndWriteTests(spec: ParsedSpec, cwd: string, options?: TestGeneratorOptions): TestGeneratorResult;
/**
 * Format test generation result as a report
 */
export declare function formatTestGeneratorReport(result: TestGeneratorResult): string;
//# sourceMappingURL=test-generator.d.ts.map