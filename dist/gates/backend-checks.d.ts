/**
 * Backend Checks Gate
 *
 * NestJS/backend convention enforcement:
 * 1. Repository Pattern Enforcement (S066) — no Prisma in non-repository files
 * 2. PrismaService Injection Guard (S067) — PrismaService only in repositories
 * 3. DTO Validation Coverage (S068) — @InputType fields must have validators
 * 4. Unprotected Controller Detection (S069) — @Controller without @UseGuards
 * 5. Console Usage in Services (S070) — use NestJS Logger, not console
 * 6. Silent Error Swallowing (S071) — empty or null-returning catch blocks
 * 7. Unbounded Query Detection (S072) — findMany without take/limit
 * 8. N+1 Query Detection (S073) — DB calls inside loops
 *
 * Scans .ts files in src/, skipping *.spec.ts and *.repository.ts where applicable.
 */
import type { Gate, Violation } from './types';
type BackendViolationType = 'prisma-in-service' | 'prisma-service-injection' | 'missing-dto-validator' | 'unprotected-controller' | 'console-in-service' | 'silent-catch' | 'unbounded-find-many' | 'n-plus-one-query';
interface BackendViolation extends Violation {
    violationType: BackendViolationType;
    suggestion?: string;
}
export declare function scanForPrismaInService(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForPrismaServiceInjection(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForMissingDtoValidators(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForUnprotectedControllers(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForConsoleInService(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForSilentCatch(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForUnboundedFindMany(content: string, filePath: string, relPath: string): BackendViolation[];
export declare function scanForNPlusOneQueries(content: string, filePath: string, relPath: string): BackendViolation[];
export declare const backendChecksGate: Gate;
export {};
//# sourceMappingURL=backend-checks.d.ts.map