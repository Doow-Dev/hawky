/**
 * Response Shape Differ
 *
 * Compares OpenAPI spec response schemas against TypeScript implementation
 * to detect API contract violations. This is the core of E003 API Contract Validation.
 *
 * Strategy:
 * 1. Parse OpenAPI spec to get expected response schemas
 * 2. Parse TypeScript handlers to extract return types
 * 3. Normalize both to a common schema format
 * 4. Diff and report violations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { SchemaObject, SpecEndpoint, ParsedSpec } from './spec-parser';

// ============================================================================
// Types
// ============================================================================

/**
 * Normalized type representation for comparison
 * Both OpenAPI schemas and TypeScript types normalize to this
 */
export interface NormalizedType {
  /** Base type */
  kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'undefined'
    | 'array'
    | 'object'
    | 'union'
    | 'unknown'
    | 'any'
    | 'void'
    | 'never';

  /** For arrays: element type */
  elementType?: NormalizedType;

  /** For objects: property definitions */
  properties?: Record<string, NormalizedProperty>;

  /** For unions: member types */
  unionTypes?: NormalizedType[];

  /** Original type name (for references) */
  typeName?: string;

  /** String format (date, email, etc.) */
  format?: string;

  /** Enum values if applicable */
  enumValues?: unknown[];

  /** Whether this is nullable */
  nullable?: boolean;
}

/**
 * Property in a normalized object type
 */
export interface NormalizedProperty {
  type: NormalizedType;
  required: boolean;
  description?: string;
}

/**
 * Difference between expected and actual types
 */
export type DiffKind =
  | 'missing_field' // Field in spec but not implementation
  | 'extra_field' // Field in implementation but not spec
  | 'type_mismatch' // Different types
  | 'required_mismatch' // Required in one, optional in other
  | 'array_element_mismatch' // Array element type differs
  | 'enum_mismatch' // Enum values differ
  | 'nullable_mismatch'; // Nullable in one but not other

/**
 * A single difference found
 */
export interface SchemaDiff {
  /** Type of difference */
  kind: DiffKind;

  /** Path to the difference (e.g., "user.address.street") */
  path: string;

  /** Expected type/value from spec */
  expected: string;

  /** Actual type/value from implementation */
  actual: string;

  /** Severity: breaking changes are errors, non-breaking are warnings */
  severity: 'error' | 'warning';

  /** Human-readable message */
  message: string;
}

/**
 * Handler extracted from TypeScript source
 */
export interface ExtractedHandler {
  /** Handler function/method name */
  name: string;

  /** File path */
  file: string;

  /** Line number where handler starts */
  line: number;

  /** HTTP method (if detectable) */
  method?: string;

  /** Route path (if detectable) */
  routePath?: string;

  /** Return type as NormalizedType */
  returnType?: NormalizedType;

  /** Raw return type string for reporting */
  returnTypeString?: string;

  /** Operation ID if found in comments/decorators */
  operationId?: string;
}

/**
 * API contract violation
 */
export interface ContractViolation {
  /** Rule ID for this violation type */
  ruleId: string;

  /** File where violation occurs */
  file: string;

  /** Line number */
  line: number;

  /** Column (optional) */
  column?: number;

  /** Human-readable message */
  message: string;

  /** Severity */
  severity: 'error' | 'warning';

  /** API endpoint this relates to */
  endpoint?: {
    method: string;
    path: string;
  };

  /** Detailed diff information */
  diff?: SchemaDiff;
}

/**
 * Result of comparing spec to implementation
 */
export interface DifferResult {
  /** All violations found */
  violations: ContractViolation[];

  /** Handlers that couldn't be matched to spec endpoints */
  unmatchedHandlers: ExtractedHandler[];

  /** Spec endpoints that couldn't be matched to handlers */
  unmatchedEndpoints: SpecEndpoint[];

  /** Summary stats */
  stats: {
    totalHandlers: number;
    matchedHandlers: number;
    totalEndpoints: number;
    matchedEndpoints: number;
    violations: number;
    errors: number;
    warnings: number;
  };
}

/**
 * Options for the differ
 */
export interface DifferOptions {
  /** Treat extra fields in implementation as errors (default: false = warnings) */
  strictExtraFields?: boolean;

  /** Ignore endpoints without handlers (default: false) */
  ignoreUnmatchedEndpoints?: boolean;

  /** Ignore handlers without spec endpoints (default: false) */
  ignoreUnmatchedHandlers?: boolean;

  /** File patterns for API handlers */
  handlerPatterns?: string[];

  /** Status codes to check (default: all) */
  statusCodes?: string[];
}

// ============================================================================
// Rule IDs
// ============================================================================

const RULE_IDS = {
  MISSING_FIELD: 'api-contract/missing-field',
  EXTRA_FIELD: 'api-contract/extra-field',
  TYPE_MISMATCH: 'api-contract/type-mismatch',
  REQUIRED_MISMATCH: 'api-contract/required-mismatch',
  UNMATCHED_HANDLER: 'api-contract/unmatched-handler',
  UNMATCHED_ENDPOINT: 'api-contract/unmatched-endpoint',
  NULLABLE_MISMATCH: 'api-contract/nullable-mismatch',
  ENUM_MISMATCH: 'api-contract/enum-mismatch',
} as const;

// ============================================================================
// OpenAPI Schema Normalization
// ============================================================================

/**
 * Normalize an OpenAPI schema to our common format
 */
export function normalizeOpenApiSchema(
  schema: SchemaObject | undefined,
  components?: Record<string, SchemaObject>,
  visited = new Set<string>()
): NormalizedType {
  if (!schema) {
    return { kind: 'unknown' };
  }

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref;
    if (visited.has(refPath)) {
      // Circular reference - return unknown to avoid infinite loop
      const refName = refPath.split('/').pop();
      return refName ? { kind: 'unknown', typeName: refName } : { kind: 'unknown' };
    }
    visited.add(refPath);

    const refName = refPath.replace('#/components/schemas/', '');
    const resolved = components?.[refName];
    if (resolved) {
      const normalized = normalizeOpenApiSchema(resolved, components, visited);
      normalized.typeName = refName;
      return normalized;
    }
    return { kind: 'unknown', typeName: refName };
  }

  // Handle type
  const type = schema.type;

  if (type === 'string') {
    const result: NormalizedType = { kind: 'string' };
    if (schema.format) result.format = schema.format;
    if (schema.enum) result.enumValues = schema.enum;
    return result;
  }

  if (type === 'number' || type === 'integer') {
    const result: NormalizedType = { kind: 'number' };
    if (schema.format) result.format = schema.format;
    if (schema.enum) result.enumValues = schema.enum;
    return result;
  }

  if (type === 'boolean') {
    return { kind: 'boolean' };
  }

  if (type === 'null') {
    return { kind: 'null' };
  }

  if (type === 'array') {
    return {
      kind: 'array',
      elementType: normalizeOpenApiSchema(schema.items, components, visited),
    };
  }

  if (type === 'object' || schema.properties) {
    const properties: Record<string, NormalizedProperty> = {};
    const required = new Set(schema.required || []);

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const prop: NormalizedProperty = {
          type: normalizeOpenApiSchema(propSchema, components, visited),
          required: required.has(key),
        };
        if (propSchema.description) {
          prop.description = propSchema.description;
        }
        properties[key] = prop;
      }
    }

    return { kind: 'object', properties };
  }

  return { kind: 'unknown' };
}

// ============================================================================
// TypeScript Type Extraction
// ============================================================================

/**
 * Create a TypeScript program from source files
 */
function createProgram(files: string[], cwd: string): ts.Program {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json');
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
  };

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (!configFile.error) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      );
      compilerOptions = parsed.options;
    }
  }

  return ts.createProgram(files, compilerOptions);
}

/**
 * Normalize a TypeScript type to our common format
 */
export function normalizeTypeScriptType(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited = new Set<ts.Type>()
): NormalizedType {
  // Prevent infinite recursion
  if (visited.has(type)) {
    return { kind: 'unknown' };
  }
  visited.add(type);

  const flags = type.getFlags();

  // Primitives
  if (flags & ts.TypeFlags.String) {
    return { kind: 'string' };
  }
  if (flags & ts.TypeFlags.Number) {
    return { kind: 'number' };
  }
  if (flags & ts.TypeFlags.Boolean) {
    return { kind: 'boolean' };
  }
  if (flags & ts.TypeFlags.Null) {
    return { kind: 'null' };
  }
  if (flags & ts.TypeFlags.Undefined) {
    return { kind: 'undefined' };
  }
  if (flags & ts.TypeFlags.Void) {
    return { kind: 'void' };
  }
  if (flags & ts.TypeFlags.Never) {
    return { kind: 'never' };
  }
  if (flags & ts.TypeFlags.Any) {
    return { kind: 'any' };
  }
  if (flags & ts.TypeFlags.Unknown) {
    return { kind: 'unknown' };
  }

  // Literal types
  if (flags & ts.TypeFlags.StringLiteral) {
    const literalType = type as ts.StringLiteralType;
    return { kind: 'string', enumValues: [literalType.value] };
  }
  if (flags & ts.TypeFlags.NumberLiteral) {
    const literalType = type as ts.NumberLiteralType;
    return { kind: 'number', enumValues: [literalType.value] };
  }
  if (flags & ts.TypeFlags.BooleanLiteral) {
    return { kind: 'boolean' };
  }

  // Union types
  if (flags & ts.TypeFlags.Union) {
    const unionType = type as ts.UnionType;
    const types = unionType.types;

    // Check for nullable unions (T | null | undefined)
    const nonNullTypes = types.filter(
      (t) => !(t.getFlags() & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
    );
    const hasNull = types.some((t) => t.getFlags() & ts.TypeFlags.Null);
    const hasUndefined = types.some((t) => t.getFlags() & ts.TypeFlags.Undefined);

    if (nonNullTypes.length === 1) {
      const normalized = normalizeTypeScriptType(nonNullTypes[0]!, checker, visited);
      if (hasNull || hasUndefined) {
        normalized.nullable = true;
      }
      return normalized;
    }

    // Collect all string/number literal values for enum-like unions
    const stringLiterals: string[] = [];
    const numberLiterals: number[] = [];
    let allLiterals = true;

    for (const t of nonNullTypes) {
      if (t.getFlags() & ts.TypeFlags.StringLiteral) {
        stringLiterals.push((t as ts.StringLiteralType).value);
      } else if (t.getFlags() & ts.TypeFlags.NumberLiteral) {
        numberLiterals.push((t as ts.NumberLiteralType).value);
      } else {
        allLiterals = false;
      }
    }

    if (allLiterals && stringLiterals.length > 0) {
      return {
        kind: 'string',
        enumValues: stringLiterals,
        nullable: hasNull || hasUndefined,
      };
    }
    if (allLiterals && numberLiterals.length > 0) {
      return {
        kind: 'number',
        enumValues: numberLiterals,
        nullable: hasNull || hasUndefined,
      };
    }

    // General union
    return {
      kind: 'union',
      unionTypes: nonNullTypes.map((t) => normalizeTypeScriptType(t, checker, visited)),
      nullable: hasNull || hasUndefined,
    };
  }

  // Array types
  if (checker.isArrayType(type)) {
    const typeArgs = (type as ts.TypeReference).typeArguments;
    const elementType = typeArgs?.[0];
    return {
      kind: 'array',
      elementType: elementType
        ? normalizeTypeScriptType(elementType, checker, visited)
        : { kind: 'unknown' },
    };
  }

  // Object types
  if (flags & ts.TypeFlags.Object) {
    const symbol = type.getSymbol();

    // Check for Promise<T>
    if (symbol?.getName() === 'Promise') {
      const typeArgs = (type as ts.TypeReference).typeArguments;
      if (typeArgs?.[0]) {
        return normalizeTypeScriptType(typeArgs[0], checker, visited);
      }
    }

    // Check for common wrapper types
    const typeName = symbol?.getName();
    if (typeName === 'Response' || typeName === 'NextResponse') {
      // These need special handling - look for generic args
      const typeArgs = (type as ts.TypeReference).typeArguments;
      if (typeArgs?.[0]) {
        return normalizeTypeScriptType(typeArgs[0], checker, visited);
      }
    }

    // Regular object - extract properties
    const properties: Record<string, NormalizedProperty> = {};
    const props = type.getProperties();

    for (const prop of props) {
      // Skip internal properties
      if (prop.getName().startsWith('_')) continue;

      const propType = checker.getTypeOfSymbolAtLocation(
        prop,
        prop.valueDeclaration || prop.declarations?.[0]!
      );

      const isOptional = !!(prop.getFlags() & ts.SymbolFlags.Optional);

      properties[prop.getName()] = {
        type: normalizeTypeScriptType(propType, checker, visited),
        required: !isOptional,
      };
    }

    const result: NormalizedType = {
      kind: 'object',
      properties,
    };

    if (typeName && !['Object', '__object'].includes(typeName)) {
      result.typeName = typeName;
    }

    return result;
  }

  return { kind: 'unknown' };
}

/**
 * Extract route handlers from TypeScript files
 * Supports: Express, Fastify, NestJS patterns
 */
export function extractHandlers(files: string[], cwd: string): ExtractedHandler[] {
  const handlers: ExtractedHandler[] = [];
  const program = createProgram(files, cwd);
  const checker = program.getTypeChecker();

  for (const sourceFile of program.getSourceFiles()) {
    // Skip node_modules and declaration files
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes('node_modules')) continue;
    if (!files.some((f) => path.resolve(f) === path.resolve(sourceFile.fileName))) continue;

    const relativeFile = path.relative(cwd, sourceFile.fileName);

    ts.forEachChild(sourceFile, function visit(node) {
      // Look for Express-style handlers: app.get('/path', handler)
      if (ts.isCallExpression(node)) {
        const handler = extractExpressHandler(node, sourceFile, relativeFile, checker);
        if (handler) handlers.push(handler);
      }

      // Look for function declarations that might be handlers
      if (ts.isFunctionDeclaration(node) && node.name) {
        const handler = extractFunctionHandler(node, sourceFile, relativeFile, checker);
        if (handler) handlers.push(handler);
      }

      // Look for exported arrow functions (common in Next.js API routes)
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
            const handler = extractArrowHandler(decl, sourceFile, relativeFile, checker);
            if (handler) handlers.push(handler);
          }
        }
      }

      // Look for class methods (NestJS style)
      if (ts.isMethodDeclaration(node)) {
        const handler = extractMethodHandler(node, sourceFile, relativeFile, checker);
        if (handler) handlers.push(handler);
      }

      ts.forEachChild(node, visit);
    });
  }

  return handlers;
}

/**
 * Extract Express-style route handler
 */
function extractExpressHandler(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  relativeFile: string,
  checker: ts.TypeChecker
): ExtractedHandler | null {
  const expr = call.expression;

  // Look for app.get, router.post, etc.
  if (!ts.isPropertyAccessExpression(expr)) return null;

  const methodName = expr.name.getText().toLowerCase();
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  if (!httpMethods.includes(methodName)) return null;

  // First argument should be the path
  const pathArg = call.arguments[0];
  if (!pathArg || !ts.isStringLiteral(pathArg)) return null;

  const routePath = pathArg.text;

  // Last argument should be the handler function
  const handlerArg = call.arguments[call.arguments.length - 1];
  if (!handlerArg) return null;

  let returnType: NormalizedType | undefined;
  let returnTypeString: string | undefined;

  if (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg)) {
    const signature = checker.getSignatureFromDeclaration(handlerArg);
    if (signature) {
      const retType = checker.getReturnTypeOfSignature(signature);
      returnType = normalizeTypeScriptType(retType, checker);
      returnTypeString = checker.typeToString(retType);
    }
  }

  const pos = sourceFile.getLineAndCharacterOfPosition(call.getStart());

  const handler: ExtractedHandler = {
    name: `${methodName.toUpperCase()} ${routePath}`,
    file: relativeFile,
    line: pos.line + 1,
    method: methodName.toUpperCase(),
    routePath,
  };
  if (returnType) handler.returnType = returnType;
  if (returnTypeString) handler.returnTypeString = returnTypeString;
  return handler;
}

/**
 * Extract function declaration handler
 */
function extractFunctionHandler(
  func: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  relativeFile: string,
  checker: ts.TypeChecker
): ExtractedHandler | null {
  if (!func.name) return null;

  const name = func.name.getText();

  // Look for handler-like names or exported functions
  const isExported = func.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword
  );

  // Check for HTTP method decorators or JSDoc tags
  const operationId = extractOperationId(func, sourceFile);

  // Get return type
  let returnType: NormalizedType | undefined;
  let returnTypeString: string | undefined;

  const signature = checker.getSignatureFromDeclaration(func);
  if (signature) {
    const retType = checker.getReturnTypeOfSignature(signature);
    returnType = normalizeTypeScriptType(retType, checker);
    returnTypeString = checker.typeToString(retType);
  }

  const pos = sourceFile.getLineAndCharacterOfPosition(func.getStart());

  // Only include if it looks like a handler
  if (!isExported && !operationId) return null;

  const handler: ExtractedHandler = {
    name,
    file: relativeFile,
    line: pos.line + 1,
  };
  if (returnType) handler.returnType = returnType;
  if (returnTypeString) handler.returnTypeString = returnTypeString;
  if (operationId) handler.operationId = operationId;
  return handler;
}

/**
 * Extract arrow function handler
 */
function extractArrowHandler(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  relativeFile: string,
  checker: ts.TypeChecker
): ExtractedHandler | null {
  if (!ts.isIdentifier(decl.name)) return null;
  if (!decl.initializer || !ts.isArrowFunction(decl.initializer)) return null;

  const name = decl.name.getText();

  // Check if exported
  const statement = decl.parent.parent;
  const isExported =
    ts.isVariableStatement(statement) &&
    statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  if (!isExported) return null;

  // Get return type
  let returnType: NormalizedType | undefined;
  let returnTypeString: string | undefined;

  const signature = checker.getSignatureFromDeclaration(decl.initializer);
  if (signature) {
    const retType = checker.getReturnTypeOfSignature(signature);
    returnType = normalizeTypeScriptType(retType, checker);
    returnTypeString = checker.typeToString(retType);
  }

  const pos = sourceFile.getLineAndCharacterOfPosition(decl.getStart());

  const handler: ExtractedHandler = {
    name,
    file: relativeFile,
    line: pos.line + 1,
  };
  if (returnType) handler.returnType = returnType;
  if (returnTypeString) handler.returnTypeString = returnTypeString;
  return handler;
}

/**
 * Extract method handler (NestJS style)
 */
function extractMethodHandler(
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  relativeFile: string,
  checker: ts.TypeChecker
): ExtractedHandler | null {
  if (!ts.isIdentifier(method.name)) return null;

  const name = method.name.getText();

  // Look for HTTP method decorators
  const decorators = ts.getDecorators(method);
  let httpMethod: string | undefined;
  let routePath: string | undefined;
  let operationId: string | undefined;

  if (decorators) {
    for (const decorator of decorators) {
      if (!ts.isCallExpression(decorator.expression)) continue;

      const decoratorName = decorator.expression.expression.getText();
      const httpMethods = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'];

      if (httpMethods.includes(decoratorName)) {
        httpMethod = decoratorName.toUpperCase();
        const pathArg = decorator.expression.arguments[0];
        if (pathArg && ts.isStringLiteral(pathArg)) {
          routePath = pathArg.text;
        }
      }

      // Look for ApiOperation decorator (NestJS/Swagger)
      if (decoratorName === 'ApiOperation') {
        const objArg = decorator.expression.arguments[0];
        if (objArg && ts.isObjectLiteralExpression(objArg)) {
          for (const prop of objArg.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'operationId') {
              if (ts.isStringLiteral(prop.initializer)) {
                operationId = prop.initializer.text;
              }
            }
          }
        }
      }
    }
  }

  // Skip if no HTTP decorator found
  if (!httpMethod) return null;

  // Get return type
  let returnType: NormalizedType | undefined;
  let returnTypeString: string | undefined;

  const signature = checker.getSignatureFromDeclaration(method);
  if (signature) {
    const retType = checker.getReturnTypeOfSignature(signature);
    returnType = normalizeTypeScriptType(retType, checker);
    returnTypeString = checker.typeToString(retType);
  }

  const pos = sourceFile.getLineAndCharacterOfPosition(method.getStart());

  const handler: ExtractedHandler = {
    name,
    file: relativeFile,
    line: pos.line + 1,
    method: httpMethod,
  };
  if (routePath) handler.routePath = routePath;
  if (returnType) handler.returnType = returnType;
  if (returnTypeString) handler.returnTypeString = returnTypeString;
  if (operationId) handler.operationId = operationId;
  return handler;
}

/**
 * Extract operation ID from JSDoc comments or decorators
 */
function extractOperationId(
  node: ts.FunctionDeclaration | ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): string | null {
  // Check JSDoc
  const jsDocTags = ts.getJSDocTags(node);
  for (const tag of jsDocTags) {
    if (tag.tagName.getText() === 'operationId' && tag.comment) {
      const comment = typeof tag.comment === 'string' ? tag.comment : ts.getTextOfJSDocComment(tag.comment);
      if (comment) return comment.trim();
    }
  }

  // Check leading comments
  const fullText = sourceFile.getFullText();
  const comments = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (comments) {
    for (const range of comments) {
      const text = fullText.substring(range.pos, range.end);
      const match = text.match(/@operationId\s+(\S+)/);
      if (match) return match[1] ?? null;
    }
  }

  return null;
}

// ============================================================================
// Schema Comparison
// ============================================================================

/**
 * Compare two normalized types and find differences
 */
export function compareTypes(
  expected: NormalizedType,
  actual: NormalizedType,
  path: string,
  options: DifferOptions = {}
): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];

  // Nullable mismatch
  if (expected.nullable !== actual.nullable && !actual.nullable) {
    diffs.push({
      kind: 'nullable_mismatch',
      path,
      expected: expected.nullable ? 'nullable' : 'non-nullable',
      actual: actual.nullable ? 'nullable' : 'non-nullable',
      severity: 'warning',
      message: `Nullable mismatch at ${path}: spec is ${expected.nullable ? 'nullable' : 'required'}, implementation is ${actual.nullable ? 'nullable' : 'required'}`,
    });
  }

  // Unknown/any types pass
  if (expected.kind === 'unknown' || expected.kind === 'any') return diffs;
  if (actual.kind === 'unknown' || actual.kind === 'any') return diffs;

  // Type mismatch
  if (expected.kind !== actual.kind) {
    // Special case: number vs integer
    if (
      (expected.kind === 'number' && actual.kind === 'number') ||
      (expected.kind === 'string' && actual.kind === 'string')
    ) {
      // Same base type, check enum
    } else if (expected.kind === 'union' || actual.kind === 'union') {
      // Handle union types separately
      return compareUnionTypes(expected, actual, path, options);
    } else {
      diffs.push({
        kind: 'type_mismatch',
        path,
        expected: typeToString(expected),
        actual: typeToString(actual),
        severity: 'error',
        message: `Type mismatch at ${path}: expected ${typeToString(expected)}, got ${typeToString(actual)}`,
      });
      return diffs;
    }
  }

  // Enum mismatch
  if (expected.enumValues && actual.enumValues) {
    const expectedSet = new Set(expected.enumValues.map(String));
    const actualSet = new Set(actual.enumValues.map(String));
    const missingValues = [...expectedSet].filter((v) => !actualSet.has(v));
    const extraValues = [...actualSet].filter((v) => !expectedSet.has(v));

    if (missingValues.length > 0 || extraValues.length > 0) {
      diffs.push({
        kind: 'enum_mismatch',
        path,
        expected: `[${[...expectedSet].join(', ')}]`,
        actual: `[${[...actualSet].join(', ')}]`,
        severity: missingValues.length > 0 ? 'error' : 'warning',
        message: `Enum mismatch at ${path}: ${missingValues.length > 0 ? `missing values: ${missingValues.join(', ')}` : ''}${extraValues.length > 0 ? `extra values: ${extraValues.join(', ')}` : ''}`,
      });
    }
  }

  // Array comparison
  if (expected.kind === 'array' && actual.kind === 'array') {
    if (expected.elementType && actual.elementType) {
      diffs.push(...compareTypes(expected.elementType, actual.elementType, `${path}[]`, options));
    }
    return diffs;
  }

  // Object comparison
  if (expected.kind === 'object' && actual.kind === 'object') {
    const expectedProps = expected.properties || {};
    const actualProps = actual.properties || {};

    // Check for missing fields
    for (const [key, prop] of Object.entries(expectedProps)) {
      const actualProp = actualProps[key];
      const fieldPath = path ? `${path}.${key}` : key;

      if (!actualProp) {
        diffs.push({
          kind: 'missing_field',
          path: fieldPath,
          expected: typeToString(prop.type),
          actual: 'undefined',
          severity: prop.required ? 'error' : 'warning',
          message: `Missing ${prop.required ? 'required' : 'optional'} field at ${fieldPath}: expected ${typeToString(prop.type)}`,
        });
      } else {
        // Compare types
        diffs.push(...compareTypes(prop.type, actualProp.type, fieldPath, options));

        // Required mismatch
        if (prop.required && !actualProp.required) {
          diffs.push({
            kind: 'required_mismatch',
            path: fieldPath,
            expected: 'required',
            actual: 'optional',
            severity: 'error',
            message: `Required mismatch at ${fieldPath}: spec requires field but implementation marks it optional`,
          });
        }
      }
    }

    // Check for extra fields
    for (const key of Object.keys(actualProps)) {
      if (!expectedProps[key]) {
        const fieldPath = path ? `${path}.${key}` : key;
        diffs.push({
          kind: 'extra_field',
          path: fieldPath,
          expected: 'undefined',
          actual: typeToString(actualProps[key]!.type),
          severity: options.strictExtraFields ? 'error' : 'warning',
          message: `Extra field at ${fieldPath}: implementation has ${typeToString(actualProps[key]!.type)} but spec doesn't define it`,
        });
      }
    }
  }

  return diffs;
}

/**
 * Compare union types
 */
function compareUnionTypes(
  expected: NormalizedType,
  actual: NormalizedType,
  path: string,
  options: DifferOptions
): SchemaDiff[] {
  // If actual is a union, check if expected is compatible with any member
  if (actual.kind === 'union' && actual.unionTypes) {
    // Each expected type should match at least one actual type
    if (expected.kind === 'union' && expected.unionTypes) {
      // Compare union to union - each expected should have a match
      const diffs: SchemaDiff[] = [];
      for (const expType of expected.unionTypes) {
        const hasMatch = actual.unionTypes.some((actType) => {
          return compareTypes(expType, actType, path, options).length === 0;
        });
        if (!hasMatch) {
          diffs.push({
            kind: 'type_mismatch',
            path,
            expected: typeToString(expType),
            actual: typeToString(actual),
            severity: 'error',
            message: `Union type at ${path} is missing expected member: ${typeToString(expType)}`,
          });
        }
      }
      return diffs;
    } else {
      // Check if expected matches any union member
      const hasMatch = actual.unionTypes.some((actType) => {
        return compareTypes(expected, actType, path, options).length === 0;
      });
      if (!hasMatch) {
        return [
          {
            kind: 'type_mismatch',
            path,
            expected: typeToString(expected),
            actual: typeToString(actual),
            severity: 'error',
            message: `Type mismatch at ${path}: expected ${typeToString(expected)}, got union ${typeToString(actual)}`,
          },
        ];
      }
      return [];
    }
  }

  // If expected is a union, check if actual matches any member
  if (expected.kind === 'union' && expected.unionTypes) {
    const hasMatch = expected.unionTypes.some((expType) => {
      return compareTypes(expType, actual, path, options).length === 0;
    });
    if (!hasMatch) {
      return [
        {
          kind: 'type_mismatch',
          path,
          expected: typeToString(expected),
          actual: typeToString(actual),
          severity: 'error',
          message: `Type mismatch at ${path}: expected one of ${typeToString(expected)}, got ${typeToString(actual)}`,
        },
      ];
    }
    return [];
  }

  return [];
}

/**
 * Convert normalized type to string for display
 */
export function typeToString(type: NormalizedType): string {
  if (type.typeName) {
    return type.typeName;
  }

  switch (type.kind) {
    case 'array':
      return type.elementType ? `${typeToString(type.elementType)}[]` : 'unknown[]';
    case 'object':
      if (!type.properties || Object.keys(type.properties).length === 0) {
        return 'object';
      }
      const props = Object.entries(type.properties)
        .slice(0, 3)
        .map(([k, v]) => `${k}${v.required ? '' : '?'}: ${typeToString(v.type)}`)
        .join(', ');
      return `{ ${props}${Object.keys(type.properties).length > 3 ? ', ...' : ''} }`;
    case 'union':
      if (!type.unionTypes) return 'union';
      return type.unionTypes.map(typeToString).join(' | ');
    default:
      if (type.enumValues) {
        return type.enumValues.map((v) => JSON.stringify(v)).join(' | ');
      }
      return type.kind;
  }
}

// ============================================================================
// Handler-Endpoint Matching
// ============================================================================

/**
 * Match handlers to spec endpoints
 * Uses multiple strategies: operationId, route path, function name
 */
export function matchHandlersToEndpoints(
  handlers: ExtractedHandler[],
  endpoints: SpecEndpoint[]
): Map<ExtractedHandler, SpecEndpoint> {
  const matches = new Map<ExtractedHandler, SpecEndpoint>();
  const usedEndpoints = new Set<SpecEndpoint>();

  // Strategy 1: Match by operationId
  for (const handler of handlers) {
    if (handler.operationId) {
      const endpoint = endpoints.find(
        (e) => e.operationId === handler.operationId && !usedEndpoints.has(e)
      );
      if (endpoint) {
        matches.set(handler, endpoint);
        usedEndpoints.add(endpoint);
      }
    }
  }

  // Strategy 2: Match by route path and method
  for (const handler of handlers) {
    if (matches.has(handler)) continue;
    if (!handler.routePath || !handler.method) continue;

    const normalizedPath = normalizePath(handler.routePath);
    const endpoint = endpoints.find((e) => {
      if (usedEndpoints.has(e)) return false;
      if (e.method.toUpperCase() !== handler.method!.toUpperCase()) return false;
      return pathsMatch(normalizedPath, normalizePath(e.path));
    });

    if (endpoint) {
      matches.set(handler, endpoint);
      usedEndpoints.add(endpoint);
    }
  }

  // Strategy 3: Match by function name to operationId
  for (const handler of handlers) {
    if (matches.has(handler)) continue;

    const endpoint = endpoints.find((e) => {
      if (usedEndpoints.has(e)) return false;
      if (!e.operationId) return false;
      // camelCase/snake_case comparison
      return (
        normalizeIdentifier(handler.name) === normalizeIdentifier(e.operationId) ||
        handler.name.toLowerCase() === e.operationId.toLowerCase()
      );
    });

    if (endpoint) {
      matches.set(handler, endpoint);
      usedEndpoints.add(endpoint);
    }
  }

  return matches;
}

/**
 * Normalize a path for comparison
 */
function normalizePath(pathStr: string): string {
  return pathStr
    .replace(/\{[^}]+\}/g, ':param') // OpenAPI params
    .replace(/:[^/]+/g, ':param') // Express params
    .toLowerCase()
    .replace(/\/+/g, '/') // Multiple slashes
    .replace(/\/$/, ''); // Trailing slash
}

/**
 * Check if two paths match (accounting for params)
 */
function pathsMatch(path1: string, path2: string): boolean {
  const parts1 = path1.split('/');
  const parts2 = path2.split('/');

  if (parts1.length !== parts2.length) return false;

  return parts1.every((part, i) => {
    const other = parts2[i];
    if (part === ':param' || other === ':param') return true;
    return part === other;
  });
}

/**
 * Normalize identifier for comparison
 */
function normalizeIdentifier(name: string): string {
  return name
    .replace(/[_-]/g, '')
    .toLowerCase();
}

// ============================================================================
// Main Differ
// ============================================================================

/**
 * Find handler files in a directory
 */
export function findHandlerFiles(cwd: string, patterns?: string[]): string[] {
  const defaultPatterns = [
    'src/**/*.controller.ts',
    'src/**/*.handler.ts',
    'src/api/**/*.ts',
    'src/routes/**/*.ts',
    'src/handlers/**/*.ts',
    'pages/api/**/*.ts',
    'app/api/**/*.ts',
    'api/**/*.ts',
  ];

  const searchPatterns = patterns || defaultPatterns;
  const files: string[] = [];

  // Simple glob implementation
  for (const pattern of searchPatterns) {
    const basePath = pattern.split('*')[0]?.replace(/\/$/, '') || '.';
    const dirPath = path.join(cwd, basePath);

    if (!fs.existsSync(dirPath)) continue;

    const found = findFilesRecursive(dirPath, (f) => {
      const relative = path.relative(cwd, f);
      return matchGlob(relative, pattern);
    });

    files.push(...found);
  }

  return [...new Set(files)];
}

/**
 * Recursively find files matching a predicate
 */
function findFilesRecursive(dir: string, predicate: (file: string) => boolean): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        results.push(...findFilesRecursive(fullPath, predicate));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        if (predicate(fullPath)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore permission errors
  }

  return results;
}

/**
 * Simple glob matching
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob to regex:
  // 1. Use placeholder for ** to avoid double replacement
  // 2. Escape special regex chars except * and ?
  // 3. Replace ** (now placeholder) with .* (match any path)
  // 4. Replace * with [^/]* (match single path segment)
  const regexPattern = normalizedPattern
    .replace(/\*\*/g, '\0DOUBLESTAR\0') // Placeholder for **
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars
    .replace(/\0DOUBLESTAR\0/g, '.*') // ** matches any path
    .replace(/\*/g, '[^/]*'); // * matches single segment

  return new RegExp(`^${regexPattern}$`).test(normalizedPath);
}

/**
 * Run the response shape differ
 */
export function runDiffer(
  spec: ParsedSpec,
  cwd: string,
  options: DifferOptions = {}
): DifferResult {
  const violations: ContractViolation[] = [];

  // Find and extract handlers
  const handlerFiles = findHandlerFiles(cwd, options.handlerPatterns);
  const handlers = extractHandlers(handlerFiles, cwd);

  // Match handlers to endpoints
  const matches = matchHandlersToEndpoints(handlers, spec.endpoints);

  // Find unmatched
  const matchedHandlers = new Set(matches.keys());
  const matchedEndpoints = new Set(matches.values());

  const unmatchedHandlers = handlers.filter((h) => !matchedHandlers.has(h));
  const unmatchedEndpoints = spec.endpoints.filter((e) => !matchedEndpoints.has(e));

  // Report unmatched handlers
  if (!options.ignoreUnmatchedHandlers) {
    for (const handler of unmatchedHandlers) {
      violations.push({
        ruleId: RULE_IDS.UNMATCHED_HANDLER,
        file: handler.file,
        line: handler.line,
        message: `Handler "${handler.name}" has no matching endpoint in API spec`,
        severity: 'warning',
      });
    }
  }

  // Report unmatched endpoints
  if (!options.ignoreUnmatchedEndpoints) {
    for (const endpoint of unmatchedEndpoints) {
      violations.push({
        ruleId: RULE_IDS.UNMATCHED_ENDPOINT,
        file: spec.specPath,
        line: 1,
        message: `Endpoint ${endpoint.method.toUpperCase()} ${endpoint.path} has no matching handler`,
        severity: 'warning',
        endpoint: {
          method: endpoint.method.toUpperCase(),
          path: endpoint.path,
        },
      });
    }
  }

  // Compare matched pairs
  for (const [handler, endpoint] of matches.entries()) {
    // Filter responses by status codes if specified
    const responses = options.statusCodes
      ? endpoint.responses.filter((r) => options.statusCodes!.includes(r.statusCode))
      : endpoint.responses.filter((r) => r.statusCode.startsWith('2')); // Default: success responses

    for (const response of responses) {
      if (!response.schema || !handler.returnType) continue;

      // Normalize spec schema
      const expectedType = normalizeOpenApiSchema(response.schema);

      // Compare
      const diffs = compareTypes(expectedType, handler.returnType, '', options);

      // Convert diffs to violations
      for (const diff of diffs) {
        let ruleId: string;
        switch (diff.kind) {
          case 'missing_field':
            ruleId = RULE_IDS.MISSING_FIELD;
            break;
          case 'extra_field':
            ruleId = RULE_IDS.EXTRA_FIELD;
            break;
          case 'type_mismatch':
            ruleId = RULE_IDS.TYPE_MISMATCH;
            break;
          case 'required_mismatch':
            ruleId = RULE_IDS.REQUIRED_MISMATCH;
            break;
          case 'nullable_mismatch':
            ruleId = RULE_IDS.NULLABLE_MISMATCH;
            break;
          case 'enum_mismatch':
            ruleId = RULE_IDS.ENUM_MISMATCH;
            break;
          default:
            ruleId = 'api-contract/unknown';
        }

        violations.push({
          ruleId,
          file: handler.file,
          line: handler.line,
          message: diff.message,
          severity: diff.severity,
          endpoint: {
            method: endpoint.method.toUpperCase(),
            path: endpoint.path,
          },
          diff,
        });
      }
    }
  }

  // Calculate stats
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;

  return {
    violations,
    unmatchedHandlers,
    unmatchedEndpoints,
    stats: {
      totalHandlers: handlers.length,
      matchedHandlers: matches.size,
      totalEndpoints: spec.endpoints.length,
      matchedEndpoints: matches.size,
      violations: violations.length,
      errors,
      warnings,
    },
  };
}

/**
 * Format differ result as a report
 */
export function formatDifferReport(result: DifferResult): string {
  const lines: string[] = [];

  lines.push('# API Contract Validation Report\n');

  // Stats
  lines.push('## Summary\n');
  lines.push(`- Total handlers: ${result.stats.totalHandlers}`);
  lines.push(`- Matched handlers: ${result.stats.matchedHandlers}`);
  lines.push(`- Total endpoints: ${result.stats.totalEndpoints}`);
  lines.push(`- Matched endpoints: ${result.stats.matchedEndpoints}`);
  lines.push(`- Violations: ${result.stats.violations} (${result.stats.errors} errors, ${result.stats.warnings} warnings)`);
  lines.push('');

  // Violations by file
  if (result.violations.length > 0) {
    lines.push('## Violations\n');

    const byFile = new Map<string, ContractViolation[]>();
    for (const v of result.violations) {
      const arr = byFile.get(v.file) || [];
      arr.push(v);
      byFile.set(v.file, arr);
    }

    for (const [file, violations] of byFile.entries()) {
      lines.push(`### ${file}\n`);
      for (const v of violations) {
        const icon = v.severity === 'error' ? '❌' : '⚠️';
        const endpoint = v.endpoint ? ` (${v.endpoint.method} ${v.endpoint.path})` : '';
        lines.push(`- ${icon} Line ${v.line}: ${v.message}${endpoint}`);
      }
      lines.push('');
    }
  }

  // Unmatched
  if (result.unmatchedHandlers.length > 0) {
    lines.push('## Unmatched Handlers\n');
    for (const h of result.unmatchedHandlers) {
      lines.push(`- ${h.file}:${h.line} - ${h.name}`);
    }
    lines.push('');
  }

  if (result.unmatchedEndpoints.length > 0) {
    lines.push('## Unmatched Endpoints\n');
    for (const e of result.unmatchedEndpoints) {
      lines.push(`- ${e.method.toUpperCase()} ${e.path}${e.operationId ? ` (${e.operationId})` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
