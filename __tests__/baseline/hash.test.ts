/**
 * Unit tests for baseline hash computation
 *
 * Tests the core hash functions used for stable violation tracking.
 */

import * as path from 'path';
import { extractContext, normalizeContext, computeHash, computeHashWithMeta } from '../../src/baseline/hash';

// Path to fixtures
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

describe('baseline/hash', () => {
  describe('extractContext', () => {
    const contextFixture = path.join(FIXTURES_DIR, 'hash-context.ts');

    it('extracts 5 lines centered on the target line', () => {
      // Line 3 should give us lines 1-5 (2 before, target, 2 after)
      const context = extractContext(contextFixture, 3);

      expect(context).not.toBeNull();
      expect(context).toHaveLength(5);
      expect(context![0]).toContain('Line 1');
      expect(context![2]).toContain('Line 3');
      expect(context![4]).toContain('Line 5');
    });

    it('handles lines near the start of file', () => {
      // Line 1 should give us lines 1-3 (no lines before, target, 2 after)
      const context = extractContext(contextFixture, 1);

      expect(context).not.toBeNull();
      expect(context!.length).toBeGreaterThanOrEqual(1);
      expect(context!.length).toBeLessThanOrEqual(3);
      expect(context![0]).toContain('Line 1');
    });

    it('handles lines near the end of file', () => {
      // Line 7 should give us lines 5-8 (2 before, target, 2 after but file ends)
      const context = extractContext(contextFixture, 7);

      expect(context).not.toBeNull();
      expect(context!.length).toBeGreaterThanOrEqual(1);
      // Line 7 should be in the context
      expect(context!.some((line) => line.includes('Line 7'))).toBe(true);
    });

    it('returns null for non-existent files', () => {
      const context = extractContext('/non/existent/file.ts', 5);
      expect(context).toBeNull();
    });
  });

  describe('normalizeContext', () => {
    it('trims whitespace from each line', () => {
      const lines = ['  hello  ', '  world  '];
      const normalized = normalizeContext(lines);
      expect(normalized).toBe('hello world');
    });

    it('collapses multiple spaces to single space', () => {
      const lines = ['hello    world', 'foo   bar'];
      const normalized = normalizeContext(lines);
      expect(normalized).toBe('hello world foo bar');
    });

    it('joins lines with single space', () => {
      const lines = ['line1', 'line2', 'line3'];
      const normalized = normalizeContext(lines);
      expect(normalized).toBe('line1 line2 line3');
    });

    it('handles empty array', () => {
      const normalized = normalizeContext([]);
      expect(normalized).toBe('');
    });

    it('handles lines with only whitespace', () => {
      const lines = ['  ', 'content', '   '];
      const normalized = normalizeContext(lines);
      expect(normalized).toBe('content');
    });
  });

  describe('computeHash', () => {
    const contextFixture = path.join(FIXTURES_DIR, 'hash-context.ts');

    it('computes consistent hash for same input', () => {
      const hash1 = computeHash('no-console', contextFixture, 3);
      const hash2 = computeHash('no-console', contextFixture, 3);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('produces different hashes for different rules', () => {
      const hash1 = computeHash('no-console', contextFixture, 3);
      const hash2 = computeHash('no-unused-vars', contextFixture, 3);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hashes for different lines', () => {
      const hash1 = computeHash('no-console', contextFixture, 3);
      const hash2 = computeHash('no-console', contextFixture, 5);

      expect(hash1).not.toBe(hash2);
    });

    it('uses fallback hash for non-existent files', () => {
      const hash = computeHash('no-console', '/non/existent/file.ts', 5);

      expect(hash).toHaveLength(64);
      // Fallback hash includes 'no-file:' prefix in the input
    });

    it('fallback hash is deterministic', () => {
      const hash1 = computeHash('no-console', '/non/existent/file.ts', 5);
      const hash2 = computeHash('no-console', '/non/existent/file.ts', 5);

      expect(hash1).toBe(hash2);
    });
  });

  describe('computeHashWithMeta', () => {
    const contextFixture = path.join(FIXTURES_DIR, 'hash-context.ts');

    it('returns metadata for existing files', () => {
      const result = computeHashWithMeta('no-console', contextFixture, 3);

      expect(result.fileExists).toBe(true);
      expect(result.contextLines).toBe(5);
      expect(result.hash).toHaveLength(64);
    });

    it('returns metadata for non-existent files', () => {
      const result = computeHashWithMeta('no-console', '/non/existent/file.ts', 5);

      expect(result.fileExists).toBe(false);
      expect(result.contextLines).toBe(0);
      expect(result.hash).toHaveLength(64);
    });

    it('hash matches computeHash output', () => {
      const withMeta = computeHashWithMeta('no-console', contextFixture, 3);
      const simple = computeHash('no-console', contextFixture, 3);

      expect(withMeta.hash).toBe(simple);
    });
  });
});
