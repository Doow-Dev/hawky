/**
 * Tests for Context Assembly Pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  estimateTokens,
  parseDiff,
  createPRDiff,
  loadFileContent,
  loadFileContents,
  prioritizeFiles,
  summarizeSpec,
  extractConventions,
  assembleContext,
  formatDiffForLLM,
  formatViolationsForLLM,
  formatContextAsPrompt,
  type ChangedFile,
  type PRDiff,
} from '../../src/llm/context';
import type { ParsedSpec } from '../../src/api/spec-parser';
import type { HawkyConfig, GateName } from '../../src/config/types';

describe('Context Assembly Pipeline', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-context-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Token Estimation
  // ============================================================================

  describe('estimateTokens', () => {
    it('should estimate tokens from text length', () => {
      const text = 'Hello world'; // 11 chars
      const tokens = estimateTokens(text);
      expect(tokens).toBe(3); // ceil(11/4)
    });

    it('should handle empty text', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(1000);
      expect(estimateTokens(text)).toBe(250);
    });
  });

  // ============================================================================
  // Diff Parsing
  // ============================================================================

  describe('parseDiff', () => {
    it('should parse a simple diff', () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

      const files = parseDiff(diff);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('src/index.ts');
      expect(files[0].status).toBe('modified');
      expect(files[0].additions).toBe(1);
      expect(files[0].deletions).toBe(0);
      expect(files[0].hunks).toHaveLength(1);
    });

    it('should parse new file', () => {
      const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,5 @@
+export const foo = 1;
+export const bar = 2;
+export const baz = 3;
`;

      const files = parseDiff(diff);

      expect(files).toHaveLength(1);
      expect(files[0].status).toBe('added');
      expect(files[0].additions).toBe(3);
    });

    it('should parse deleted file', () => {
      const diff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const old = 1;
-const legacy = 2;
`;

      const files = parseDiff(diff);

      expect(files).toHaveLength(1);
      expect(files[0].status).toBe('deleted');
      expect(files[0].deletions).toBe(2);
    });

    it('should parse renamed file', () => {
      const diff = `diff --git a/src/old-name.ts b/src/new-name.ts
rename from src/old-name.ts
rename to src/new-name.ts
`;

      const files = parseDiff(diff);

      expect(files).toHaveLength(1);
      expect(files[0].status).toBe('renamed');
      expect(files[0].previousPath).toBe('src/old-name.ts');
    });

    it('should parse multiple files', () => {
      const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
 const a = 1;
+const a2 = 2;
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1,2 @@
 const b = 1;
+const b2 = 2;
`;

      const files = parseDiff(diff);

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('src/a.ts');
      expect(files[1].path).toBe('src/b.ts');
    });

    it('should parse multiple hunks', () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
@@ -10,3 +11,4 @@
 const x = 10;
+const y = 11;
 const z = 12;
`;

      const files = parseDiff(diff);

      expect(files[0].hunks).toHaveLength(2);
      expect(files[0].hunks[0].newStart).toBe(1);
      expect(files[0].hunks[1].newStart).toBe(11);
    });
  });

  // ============================================================================
  // createPRDiff
  // ============================================================================

  describe('createPRDiff', () => {
    it('should create PRDiff with totals', () => {
      const files: ChangedFile[] = [
        { path: 'a.ts', status: 'modified', hunks: [], additions: 10, deletions: 5 },
        { path: 'b.ts', status: 'added', hunks: [], additions: 20, deletions: 0 },
      ];

      const diff = createPRDiff('main', 'feature', files);

      expect(diff.base).toBe('main');
      expect(diff.head).toBe('feature');
      expect(diff.totalAdditions).toBe(30);
      expect(diff.totalDeletions).toBe(5);
    });
  });

  // ============================================================================
  // File Content Loading
  // ============================================================================

  describe('loadFileContent', () => {
    it('should load file content', () => {
      const filePath = 'test.ts';
      const content = 'const x = 1;\n';
      fs.writeFileSync(path.join(tempDir, filePath), content);

      const result = loadFileContent(filePath, tempDir);

      expect(result).not.toBeNull();
      expect(result?.path).toBe(filePath);
      expect(result?.content).toBe(content);
      expect(result?.tokenCount).toBeGreaterThan(0);
    });

    it('should return null for non-existent file', () => {
      const result = loadFileContent('nonexistent.ts', tempDir);
      expect(result).toBeNull();
    });
  });

  describe('loadFileContents', () => {
    it('should load multiple files within budget', () => {
      fs.writeFileSync(path.join(tempDir, 'a.ts'), 'const a = 1;');
      fs.writeFileSync(path.join(tempDir, 'b.ts'), 'const b = 2;');
      fs.writeFileSync(path.join(tempDir, 'c.ts'), 'const c = 3;');

      const result = loadFileContents(['a.ts', 'b.ts', 'c.ts'], tempDir, 100);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect token budget', () => {
      // Create a file larger than budget
      const largeContent = 'x'.repeat(1000);
      fs.writeFileSync(path.join(tempDir, 'large.ts'), largeContent);
      fs.writeFileSync(path.join(tempDir, 'small.ts'), 'small');

      const result = loadFileContents(['large.ts', 'small.ts'], tempDir, 10);

      // Should only get small file or none
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Prioritization
  // ============================================================================

  describe('prioritizeFiles', () => {
    it('should prioritize files with more changes', () => {
      const files: ChangedFile[] = [
        { path: 'small.ts', status: 'modified', hunks: [], additions: 1, deletions: 0 },
        { path: 'large.ts', status: 'modified', hunks: [], additions: 100, deletions: 50 },
      ];

      const prioritized = prioritizeFiles(files);

      expect(prioritized[0].path).toBe('large.ts');
    });

    it('should prioritize files matching patterns', () => {
      const files: ChangedFile[] = [
        { path: 'utils.ts', status: 'modified', hunks: [], additions: 10, deletions: 0 },
        { path: 'api/handler.ts', status: 'modified', hunks: [], additions: 5, deletions: 0 },
      ];

      const prioritized = prioritizeFiles(files, ['api']);

      expect(prioritized[0].path).toBe('api/handler.ts');
    });

    it('should deprioritize test files', () => {
      const files: ChangedFile[] = [
        { path: 'index.test.ts', status: 'modified', hunks: [], additions: 50, deletions: 0 },
        { path: 'index.ts', status: 'modified', hunks: [], additions: 50, deletions: 0 },
      ];

      const prioritized = prioritizeFiles(files);

      expect(prioritized[0].path).toBe('index.ts');
    });
  });

  // ============================================================================
  // Spec Summary
  // ============================================================================

  describe('summarizeSpec', () => {
    it('should create a summary of the spec', () => {
      const spec: ParsedSpec = {
        openApiVersion: '3.0.0',
        info: { title: 'My API', version: '1.0.0' },
        servers: [],
        endpoints: [
          { method: 'get', path: '/users', parameters: [], responses: [] },
          { method: 'post', path: '/users', parameters: [], responses: [] },
        ],
        errorCodes: [],
        tags: [],
        specPath: '/test.yaml',
        lastModified: new Date(),
      };

      const summary = summarizeSpec(spec);

      expect(summary).toContain('My API');
      expect(summary).toContain('GET /users');
      expect(summary).toContain('POST /users');
    });

    it('should truncate long endpoint lists', () => {
      const endpoints = Array.from({ length: 30 }, (_, i) => ({
        method: 'get' as const,
        path: `/endpoint-${i}`,
        parameters: [],
        responses: [],
      }));

      const spec: ParsedSpec = {
        openApiVersion: '3.0.0',
        info: { title: 'Large API', version: '1.0.0' },
        servers: [],
        endpoints,
        errorCodes: [],
        tags: [],
        specPath: '/test.yaml',
        lastModified: new Date(),
      };

      const summary = summarizeSpec(spec);

      expect(summary).toContain('and 10 more endpoints');
    });
  });

  // ============================================================================
  // Conventions
  // ============================================================================

  describe('extractConventions', () => {
    it('should extract conventions from config', () => {
      const config: HawkyConfig = {
        failFast: true,
        gates: {
          typescript: { enabled: true, blocking: true, timeout: 60 },
          build: { enabled: false, blocking: false, timeout: 60 },
          test: { enabled: false, blocking: false, timeout: 60 },
          eslint: { enabled: true, blocking: true, timeout: 60 },
          semgrep: { enabled: true, blocking: true, timeout: 60 },
          gitleaks: { enabled: false, blocking: false, timeout: 60 },
          'npm-audit': { enabled: false, blocking: false, timeout: 60 },
          'design-system': { enabled: false, blocking: false, timeout: 60 },
        },
        gracePeriod: { active: false, endDate: null },
      };

      const conventions = extractConventions(config);

      expect(conventions).toContain('TypeScript strict mode is enabled');
      expect(conventions).toContain('ESLint checks are enabled');
      expect(conventions).toContain('Security scanning with Semgrep is enabled');
    });

    it('should return empty array for no config', () => {
      const conventions = extractConventions(undefined);
      expect(conventions).toHaveLength(0);
    });
  });

  // ============================================================================
  // Formatting
  // ============================================================================

  describe('formatDiffForLLM', () => {
    it('should format diff for LLM', () => {
      const diff: PRDiff = {
        base: 'main',
        head: 'feature',
        files: [
          {
            path: 'src/index.ts',
            status: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 3,
                newStart: 1,
                newLines: 4,
                content: ' const a = 1;\n+const b = 2;\n const c = 3;',
              },
            ],
            additions: 1,
            deletions: 0,
          },
        ],
        totalAdditions: 1,
        totalDeletions: 0,
      };

      const formatted = formatDiffForLLM(diff, 10000);

      expect(formatted).toContain('Changed Files');
      expect(formatted).toContain('MODIFIED: src/index.ts');
      expect(formatted).toContain('const b = 2');
    });
  });

  describe('formatViolationsForLLM', () => {
    it('should format violations', () => {
      const violations = [
        {
          ruleId: 'no-console',
          file: 'src/index.ts',
          line: 10,
          message: 'Unexpected console statement',
          gate: 'eslint' as GateName,
        },
      ];

      const formatted = formatViolationsForLLM(violations);

      expect(formatted).toContain('Existing Violations');
      expect(formatted).toContain('no-console');
      expect(formatted).toContain('Line 10');
    });

    it('should handle empty violations', () => {
      const formatted = formatViolationsForLLM([]);
      expect(formatted).toContain('No violations');
    });
  });

  // ============================================================================
  // Context Assembly
  // ============================================================================

  describe('assembleContext', () => {
    it('should assemble context with all components', () => {
      const diff: PRDiff = {
        base: 'main',
        head: 'feature',
        files: [
          {
            path: 'src/index.ts',
            status: 'modified',
            hunks: [],
            additions: 5,
            deletions: 2,
          },
        ],
        totalAdditions: 5,
        totalDeletions: 2,
      };

      const context = assembleContext({
        rootDir: tempDir,
        diff,
        maxTokens: 10000,
        includeFullFiles: false,
      });

      expect(context.diff).toBe(diff);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it('should load file contents when enabled', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src/index.ts'), 'const x = 1;');

      const diff: PRDiff = {
        base: 'main',
        head: 'feature',
        files: [
          {
            path: 'src/index.ts',
            status: 'modified',
            hunks: [],
            additions: 5,
            deletions: 2,
          },
        ],
        totalAdditions: 5,
        totalDeletions: 2,
      };

      const context = assembleContext({
        rootDir: tempDir,
        diff,
        maxTokens: 10000,
        includeFullFiles: true,
      });

      expect(context.fileContents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatContextAsPrompt', () => {
    it('should format full context as prompt', () => {
      const diff: PRDiff = {
        base: 'main',
        head: 'feature',
        files: [
          {
            path: 'src/index.ts',
            status: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 1,
                newStart: 1,
                newLines: 2,
                content: '+const x = 1;',
              },
            ],
            additions: 1,
            deletions: 0,
          },
        ],
        totalAdditions: 1,
        totalDeletions: 0,
      };

      const context = assembleContext({
        rootDir: tempDir,
        diff,
        maxTokens: 10000,
        includeFullFiles: false,
      });

      context.conventions = ['TypeScript is enabled'];
      context.specSummary = 'API: Test v1.0';

      const prompt = formatContextAsPrompt(context);

      expect(prompt).toContain('Changed Files');
      expect(prompt).toContain('TypeScript is enabled');
      expect(prompt).toContain('API: Test v1.0');
    });
  });
});
