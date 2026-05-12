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

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

const SCANNABLE_EXTENSIONS = ['.ts'];

/** Safe array accessor — returns empty string instead of undefined */
function at(lines: string[], i: number): string {
  return lines[i] ?? '';
}

type BackendViolationType =
  | 'prisma-in-service'
  | 'prisma-service-injection'
  | 'missing-dto-validator'
  | 'unprotected-controller'
  | 'console-in-service'
  | 'silent-catch'
  | 'unbounded-find-many'
  | 'n-plus-one-query';

interface BackendViolation extends Violation {
  violationType: BackendViolationType;
  suggestion?: string;
}

// ============================================================================
// File classification helpers
// ============================================================================

function isRepositoryFile(filePath: string): boolean {
  return filePath.endsWith('.repository.ts');
}

function isSpecFile(filePath: string): boolean {
  return filePath.endsWith('.spec.ts') || filePath.endsWith('.test.ts');
}

function isServiceFile(filePath: string): boolean {
  return (
    filePath.endsWith('.service.ts') ||
    filePath.endsWith('.resolver.ts') ||
    filePath.endsWith('.handler.ts') ||
    filePath.endsWith('.scheduler.ts') ||
    filePath.endsWith('.consumer.ts') ||
    filePath.endsWith('.processor.ts')
  );
}

function isControllerFile(filePath: string): boolean {
  return filePath.endsWith('.controller.ts');
}

function isBackendSourceFile(filePath: string): boolean {
  return (
    !isSpecFile(filePath) &&
    filePath.endsWith('.ts') &&
    !filePath.includes('node_modules') &&
    !filePath.includes('dist/')
  );
}

function violationToAnnotation(v: BackendViolation): Annotation {
  const annotation: Annotation = {
    file: v.file,
    line: v.line,
    message: v.message,
    severity: v.severity === 'warning' ? 'warning' : 'error',
    ruleId: v.ruleId,
    title: v.ruleId,
  };
  if (v.column !== undefined) annotation.column = v.column;
  return annotation;
}

// ============================================================================
// S066: Repository Pattern — no Prisma calls in non-repository files
// ============================================================================

export function scanForPrismaInService(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (isRepositoryFile(filePath) || isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  // Match this.prisma. or this.prismaService. calls
  const prismaCallPattern = /this\.(prisma|prismaService)\s*\.\s*\w+/;

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);
    if (prismaCallPattern.test(line)) {
      violations.push({
        violationType: 'prisma-in-service',
        ruleId: 'backend/no-prisma-in-service',
        file: relPath,
        line: i + 1,
        column: line.search(prismaCallPattern) + 1,
        message:
          'Direct Prisma call in non-repository file. All DB access must go through the repository layer.',
        gate: 'backend-checks',
        severity: 'error',
        suggestion: 'Move this query to the appropriate repository method and inject the repository instead.',
      });
    }
  }

  return violations;
}

// ============================================================================
// S067: PrismaService injection outside repositories
// ============================================================================

export function scanForPrismaServiceInjection(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (isRepositoryFile(filePath) || isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  // Match constructor params containing PrismaService
  const constructorPattern = /constructor\s*\(/;
  const prismaServiceParam = /private\s+(?:readonly\s+)?\w+\s*:\s*PrismaService/;

  let inConstructor = false;
  let constructorDepth = 0;
  let constructorStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);

    if (constructorPattern.test(line)) {
      inConstructor = true;
      constructorStart = i;
      constructorDepth = 0;
    }

    if (inConstructor) {
      constructorDepth += (line.match(/\(/g) || []).length;
      constructorDepth -= (line.match(/\)/g) || []).length;

      if (prismaServiceParam.test(line)) {
        violations.push({
          violationType: 'prisma-service-injection',
          ruleId: 'backend/no-prisma-service-injection',
          file: relPath,
          line: i + 1,
          column: line.search(prismaServiceParam) + 1,
          message:
            'PrismaService injected in non-repository file. Only repository classes may depend on PrismaService.',
          gate: 'backend-checks',
          severity: 'error',
          suggestion: 'Inject the repository interface instead of PrismaService directly.',
        });
      }

      if (constructorDepth <= 0 && i > constructorStart) {
        inConstructor = false;
      }
    }
  }

  return violations;
}

// ============================================================================
// S068: DTO validation — @InputType fields must have class-validator decorators
// ============================================================================

const CLASS_VALIDATOR_DECORATORS = [
  '@IsString',
  '@IsNumber',
  '@IsInt',
  '@IsBoolean',
  '@IsEmail',
  '@IsEnum',
  '@IsArray',
  '@IsOptional',
  '@IsNotEmpty',
  '@IsUUID',
  '@IsDate',
  '@IsUrl',
  '@IsObject',
  '@ValidateNested',
  '@Min(',
  '@Max(',
  '@Length(',
  '@MinLength(',
  '@MaxLength(',
  '@Matches(',
  '@IsIn(',
  '@IsPositive',
  '@IsNegative',
];

export function scanForMissingDtoValidators(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (isSpecFile(filePath)) return [];
  if (!filePath.endsWith('.dto.ts') && !filePath.endsWith('.input.ts')) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  let hasInputTypeDecorator = false;
  let pendingFieldLine = -1;
  let pendingFieldCol = 0;
  let hasValidator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i).trim();

    if (line.includes('@InputType()') || line.includes('@InputType(')) {
      hasInputTypeDecorator = true;
    }

    if (!hasInputTypeDecorator) continue;

    if (line.startsWith('@Field(') || line.startsWith('@Field()')) {
      // Start of a new field block — if previous had no validator, flag it
      if (pendingFieldLine !== -1 && !hasValidator) {
        violations.push({
          violationType: 'missing-dto-validator',
          ruleId: 'backend/missing-dto-validator',
          file: relPath,
          line: pendingFieldLine,
          column: pendingFieldCol,
          message:
            '@Field decorator without a class-validator decorator. All @InputType fields must be validated.',
          gate: 'backend-checks',
          severity: 'warning',
          suggestion: 'Add @IsString(), @IsEmail(), @IsUUID() or another class-validator decorator above this @Field.',
        });
      }

      // Start tracking new field
      pendingFieldLine = i + 1;
      pendingFieldCol = at(lines, i).search(/@Field/) + 1;
      hasValidator = false;
    }

    // Check if current line has a class-validator decorator
    if (CLASS_VALIDATOR_DECORATORS.some((d) => line.startsWith(d))) {
      hasValidator = true;
    }

    // Reset on class/method boundary
    if (line.startsWith('class ') || (line.startsWith('}') && pendingFieldLine !== -1)) {
      if (pendingFieldLine !== -1 && !hasValidator && line.startsWith('class ')) {
        // New class — don't flag across class boundaries
      }
    }
  }

  // Check last pending field
  if (pendingFieldLine !== -1 && !hasValidator && hasInputTypeDecorator) {
    violations.push({
      violationType: 'missing-dto-validator',
      ruleId: 'backend/missing-dto-validator',
      file: relPath,
      line: pendingFieldLine,
      column: pendingFieldCol,
      message:
        '@Field decorator without a class-validator decorator. All @InputType fields must be validated.',
      gate: 'backend-checks',
      severity: 'warning',
      suggestion: 'Add a class-validator decorator above this @Field.',
    });
  }

  return violations;
}

// ============================================================================
// S069: Unprotected controllers — @Controller without @UseGuards
// ============================================================================

export function scanForUnprotectedControllers(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (!isControllerFile(filePath) || isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  // Check if file has any guard usage
  const hasClassLevelGuard =
    /@UseGuards\s*\(/.test(content) ||
    /@Public\s*\(\s*\)/.test(content) || // common public decorator
    /@SkipAuth\s*\(\s*\)/.test(content);

  if (hasClassLevelGuard) return [];

  // No guard found anywhere — flag the @Controller decorator
  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);
    if (/@Controller\s*\(/.test(line)) {
      violations.push({
        violationType: 'unprotected-controller',
        ruleId: 'backend/unprotected-controller',
        file: relPath,
        line: i + 1,
        column: line.search(/@Controller/) + 1,
        message:
          'Controller has no @UseGuards() decorator. Every controller must be explicitly guarded or marked @Public().',
        gate: 'backend-checks',
        severity: 'warning',
        suggestion: 'Add @UseGuards(JwtAuthGuard) at the class level, or @Public() for intentionally public endpoints.',
      });
    }
  }

  return violations;
}

// ============================================================================
// S070: Console usage in service files
// ============================================================================

export function scanForConsoleInService(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (!isServiceFile(filePath) || isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');
  const consolePattern = /\bconsole\.(log|warn|error|info|debug)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);
    // Skip commented lines
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    if (consolePattern.test(line)) {
      violations.push({
        violationType: 'console-in-service',
        ruleId: 'backend/no-console-in-service',
        file: relPath,
        line: i + 1,
        column: line.search(consolePattern) + 1,
        message:
          'console.* in service file. Use NestJS Logger for structured, level-aware logging.',
        gate: 'backend-checks',
        severity: 'warning',
        suggestion: "Replace with this.logger.log(...) / this.logger.error(...) from NestJS Logger.",
      });
    }
  }

  return violations;
}

// ============================================================================
// S071: Silent error swallowing — empty catch or catch returning null
// ============================================================================

export function scanForSilentCatch(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);

    if (/\}\s*catch\s*\(/.test(line) || /catch\s*\(/.test(line)) {
      // Look ahead for the catch body
      const catchStart = i;
      let depth = 0;
      let bodyLines: string[] = [];
      let j = i;

      // Find opening brace of catch block
      while (j < lines.length && !at(lines, j).includes('{')) j++;
      if (j >= lines.length) continue;

      // Collect body lines
      for (let k = j; k < lines.length && k < j + 10; k++) {
        const kLine = at(lines, k);
        depth += (kLine.match(/\{/g) || []).length;
        depth -= (kLine.match(/\}/g) || []).length;
        bodyLines.push(kLine.trim());
        if (depth <= 0) break;
      }

      const bodyText = bodyLines.join(' ').replace(/\s+/g, ' ');

      // Empty catch: just braces or whitespace
      const isEmpty = /^\{[\s]*\}$/.test(bodyText.trim());

      // Silent return: catch returns null/undefined/false with no logging
      const isSilentReturn =
        /\{[\s]*return\s+(null|undefined|false|0|'')[\s]*;[\s]*\}/.test(bodyText) &&
        !/logger|console|throw|Sentry|captureException/.test(bodyText);

      if (isEmpty || isSilentReturn) {
        violations.push({
          violationType: 'silent-catch',
          ruleId: 'backend/no-silent-catch',
          file: relPath,
          line: catchStart + 1,
          column: 1,
          message: isEmpty
            ? 'Empty catch block silently swallows errors. Log or rethrow.'
            : 'Catch block returns null/undefined without logging. Errors are lost silently.',
          gate: 'backend-checks',
          severity: 'warning',
          suggestion: 'Add this.logger.error(err) or throw a typed AppError before returning.',
        });
      }
    }
  }

  return violations;
}

// ============================================================================
// S072: Unbounded findMany — missing take/limit
// ============================================================================

export function scanForUnboundedFindMany(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (!isRepositoryFile(filePath) || isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);

    if (/\.findMany\s*\(/.test(line)) {
      // Look ahead up to 15 lines for take/limit/skip pattern
      const chunk = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');

      const hasTake = /\btake\s*:/.test(chunk);
      const hasLimit = /\blimit\s*:/.test(chunk);

      if (!hasTake && !hasLimit) {
        violations.push({
          violationType: 'unbounded-find-many',
          ruleId: 'backend/unbounded-find-many',
          file: relPath,
          line: i + 1,
          column: line.search(/\.findMany/) + 1,
          message:
            'findMany() without take/limit. Unbounded queries are a scale risk — they return all rows at any data volume.',
          gate: 'backend-checks',
          severity: 'warning',
          suggestion: 'Add take: N or accept a pagination input (take, skip) to bound the result set.',
        });
      }
    }
  }

  return violations;
}

// ============================================================================
// S073: N+1 query detection — DB calls inside loops
// ============================================================================

export function scanForNPlusOneQueries(
  content: string,
  filePath: string,
  relPath: string
): BackendViolation[] {
  if (isSpecFile(filePath)) return [];

  const violations: BackendViolation[] = [];
  const lines = content.split('\n');

  const loopPatterns = [
    /\.forEach\s*\(\s*(?:async\s*)?\(?\w+\)?\s*=>/,
    /\.map\s*\(\s*(?:async\s*)?\(?\w+\)?\s*=>/,
    /\.filter\s*\(\s*(?:async\s*)?\(?\w+\)?\s*=>/,
    /for\s*\(\s*(?:const|let)\s+\w+\s+of\s+/,
    /for\s*\(\s*(?:const|let)\s+\w+\s+in\s+/,
    /for\s*\(.*;\s*\w+\s*[<>]/,
    /while\s*\(/,
  ];

  const dbCallPatterns = [
    /await\s+this\.\w+Repository\./,
    /await\s+this\.\w+Repo\./,
    /await\s+this\.prisma\./,
    /\.findOne\s*\(/,
    /\.findMany\s*\(/,
    /\.findFirst\s*\(/,
    /\.create\s*\(\s*\{/,
    /\.update\s*\(\s*\{/,
    /\.upsert\s*\(/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = at(lines, i);
    const isLoopLine = loopPatterns.some((p) => p.test(line));

    if (isLoopLine) {
      // Scan the next 15 lines for a DB call inside this loop
      const lookahead = lines.slice(i + 1, Math.min(i + 16, lines.length));
      let loopDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

      for (let j = 0; j < lookahead.length; j++) {
        const innerLine = at(lookahead, j);
        loopDepth += (innerLine.match(/\{/g) || []).length;
        loopDepth -= (innerLine.match(/\}/g) || []).length;

        // Stop if we've exited the loop body
        if (loopDepth < 0) break;

        const hasDbCall = dbCallPatterns.some((p) => p.test(innerLine));
        if (hasDbCall) {
          violations.push({
            violationType: 'n-plus-one-query',
            ruleId: 'backend/no-n-plus-one-query',
            file: relPath,
            line: i + 1,
            column: 1,
            message:
              'Possible N+1 query: DB call detected inside a loop. This executes one query per iteration.',
            gate: 'backend-checks',
            severity: 'warning',
            suggestion:
              'Batch the IDs and use a single findMany({ where: { id: { in: ids } } }) outside the loop, then map results.',
          });
          break; // One violation per loop
        }
      }
    }
  }

  return violations;
}

// ============================================================================
// File scanner
// ============================================================================

function collectSourceFiles(cwd: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git' ||
          entry.name === 'coverage'
        ) {
          continue;
        }
        walk(fullPath);
      } else if (
        entry.isFile() &&
        SCANNABLE_EXTENSIONS.includes(path.extname(entry.name)) &&
        isBackendSourceFile(fullPath)
      ) {
        files.push(fullPath);
      }
    }
  }

  // Only scan src/ directory — skip root config files, migration files, etc.
  const srcDir = path.join(cwd, 'src');
  if (fs.existsSync(srcDir)) {
    walk(srcDir);
  }

  return files;
}

// ============================================================================
// Gate implementation
// ============================================================================

export const backendChecksGate: Gate = {
  name: 'backend-checks',

  displayName: 'Backend Checks',

  async canRun(cwd: string): Promise<boolean> {
    // Run if src/ exists and has .ts files
    const srcDir = path.join(cwd, 'src');
    if (!fs.existsSync(srcDir)) return false;

    // Check for NestJS signature (main.ts or app.module.ts)
    const hasNestSig =
      fs.existsSync(path.join(srcDir, 'main.ts')) ||
      fs.existsSync(path.join(srcDir, 'app.module.ts'));

    return hasNestSig;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const start = Date.now();
    const { cwd } = options;

    core.info('Scanning backend source files for convention violations...');

    const canRun = await backendChecksGate.canRun(cwd);
    if (!canRun) {
      return {
        gate: 'backend-checks',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - start,
        message: 'No NestJS project detected (src/main.ts or src/app.module.ts not found)',
      };
    }

    const sourceFiles = collectSourceFiles(cwd);
    core.info(`Scanning ${sourceFiles.length} backend source files...`);

    const allViolations: BackendViolation[] = [];

    for (const filePath of sourceFiles) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        core.debug(`Could not read ${filePath}`);
        continue;
      }

      const relPath = path.relative(cwd, filePath).replace(/\\/g, '/');

      allViolations.push(...scanForPrismaInService(content, filePath, relPath));
      allViolations.push(...scanForPrismaServiceInjection(content, filePath, relPath));
      allViolations.push(...scanForMissingDtoValidators(content, filePath, relPath));
      allViolations.push(...scanForUnprotectedControllers(content, filePath, relPath));
      allViolations.push(...scanForConsoleInService(content, filePath, relPath));
      allViolations.push(...scanForSilentCatch(content, filePath, relPath));
      allViolations.push(...scanForUnboundedFindMany(content, filePath, relPath));
      allViolations.push(...scanForNPlusOneQueries(content, filePath, relPath));
    }

    const errorViolations = allViolations.filter((v) => v.severity === 'error');
    const hasErrors = errorViolations.length > 0;

    const message =
      allViolations.length === 0
        ? 'No backend convention violations found'
        : `${allViolations.length} violation(s) found (${errorViolations.length} blocking, ${allViolations.length - errorViolations.length} warnings)`;

    core.info(message);

    if (allViolations.length > 0) {
      // Log summary by rule
      const byRule = allViolations.reduce<Record<string, number>>((acc, v) => {
        acc[v.ruleId] = (acc[v.ruleId] || 0) + 1;
        return acc;
      }, {});
      for (const [rule, count] of Object.entries(byRule)) {
        core.info(`  ${rule}: ${count}`);
      }
    }

    return {
      gate: 'backend-checks',
      status: hasErrors ? 'fail' : allViolations.length > 0 ? 'fail' : 'pass',
      totalViolations: allViolations.length,
      newViolations: allViolations.length,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: allViolations.map(violationToAnnotation),
      violations: allViolations,
      timeMs: Date.now() - start,
      message,
    };
  },
};
