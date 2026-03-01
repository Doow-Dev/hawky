/**
 * Tests for Ownership Collision Detection (S040)
 */

import {
  identifyBranchDomain,
  identifyFileDomain,
  detectFileCollision,
  detectOwnershipCollisions,
  formatOwnershipCollisionWarning,
  DEFAULT_DOMAINS,
  type TeamDomain,
  type OwnershipCollisionResult,
  type OwnershipCollisionOptions,
} from '../../src/coordination/ownership-collision';

// ============================================================================
// Test Helpers
// ============================================================================

const BACKEND_DOMAIN: TeamDomain = {
  name: 'Backend',
  branchPrefixes: ['be-', 'api-'],
  ownedPaths: [/^src\/(api|services?|models?)\//i],
};

const FRONTEND_DOMAIN: TeamDomain = {
  name: 'Frontend',
  branchPrefixes: ['fe-', 'ui-'],
  ownedPaths: [/^src\/(components?|pages?|styles?)\//i],
};

const TEST_DOMAINS: TeamDomain[] = [BACKEND_DOMAIN, FRONTEND_DOMAIN];

function createDefaultOptions(
  branchName: string,
  changedFiles: string[],
  overrides: Partial<OwnershipCollisionOptions> = {}
): OwnershipCollisionOptions {
  return {
    branchName,
    changedFiles,
    domains: TEST_DOMAINS,
    ...overrides,
  };
}

// ============================================================================
// identifyBranchDomain
// ============================================================================

describe('identifyBranchDomain', () => {
  it('should identify be- branch as Backend', () => {
    const domain = identifyBranchDomain('be-add-auth', TEST_DOMAINS);
    expect(domain?.name).toBe('Backend');
  });

  it('should identify api- branch as Backend', () => {
    const domain = identifyBranchDomain('api-endpoints', TEST_DOMAINS);
    expect(domain?.name).toBe('Backend');
  });

  it('should identify fe- branch as Frontend', () => {
    const domain = identifyBranchDomain('fe-new-button', TEST_DOMAINS);
    expect(domain?.name).toBe('Frontend');
  });

  it('should identify ui- branch as Frontend', () => {
    const domain = identifyBranchDomain('ui-redesign', TEST_DOMAINS);
    expect(domain?.name).toBe('Frontend');
  });

  it('should return null for unrecognized branch prefix', () => {
    const domain = identifyBranchDomain('main', TEST_DOMAINS);
    expect(domain).toBeNull();
  });

  it('should return null for feature/ branches without domain prefix', () => {
    const domain = identifyBranchDomain('feature/add-login', TEST_DOMAINS);
    expect(domain).toBeNull();
  });

  it('should be case-insensitive for branch prefix matching', () => {
    const domain = identifyBranchDomain('BE-auth-fix', TEST_DOMAINS);
    expect(domain?.name).toBe('Backend');
  });

  it('should use default domains when none provided', () => {
    const domain = identifyBranchDomain('be-feature');
    expect(domain?.name).toBe('Backend');
  });

  it('should match first prefix found', () => {
    // be- is in Backend
    const domain = identifyBranchDomain('be-something', TEST_DOMAINS);
    expect(domain).not.toBeNull();
  });
});

// ============================================================================
// identifyFileDomain
// ============================================================================

describe('identifyFileDomain', () => {
  it('should identify src/api/ files as Backend', () => {
    const domain = identifyFileDomain('src/api/auth.ts', TEST_DOMAINS);
    expect(domain?.name).toBe('Backend');
  });

  it('should identify src/services/ files as Backend', () => {
    const domain = identifyFileDomain('src/services/user.ts', TEST_DOMAINS);
    expect(domain?.name).toBe('Backend');
  });

  it('should identify src/components/ files as Frontend', () => {
    const domain = identifyFileDomain('src/components/Button.tsx', TEST_DOMAINS);
    expect(domain?.name).toBe('Frontend');
  });

  it('should identify src/pages/ files as Frontend', () => {
    const domain = identifyFileDomain('src/pages/Home.tsx', TEST_DOMAINS);
    expect(domain?.name).toBe('Frontend');
  });

  it('should identify src/styles/ files as Frontend', () => {
    const domain = identifyFileDomain('src/styles/global.css', TEST_DOMAINS);
    expect(domain?.name).toBe('Frontend');
  });

  it('should return null for unrecognized file paths', () => {
    const domain = identifyFileDomain('README.md', TEST_DOMAINS);
    expect(domain).toBeNull();
  });

  it('should return null for package.json', () => {
    const domain = identifyFileDomain('package.json', TEST_DOMAINS);
    expect(domain).toBeNull();
  });
});

// ============================================================================
// detectFileCollision
// ============================================================================

describe('detectFileCollision', () => {
  it('should return null for files in the same domain', () => {
    const collision = detectFileCollision('src/api/auth.ts', BACKEND_DOMAIN, TEST_DOMAINS);
    expect(collision).toBeNull();
  });

  it('should return Frontend domain when backend branch touches frontend file', () => {
    const collision = detectFileCollision('src/components/Button.tsx', BACKEND_DOMAIN, TEST_DOMAINS);
    expect(collision?.name).toBe('Frontend');
  });

  it('should return Backend domain when frontend branch touches backend file', () => {
    const collision = detectFileCollision('src/services/auth.ts', FRONTEND_DOMAIN, TEST_DOMAINS);
    expect(collision?.name).toBe('Backend');
  });

  it('should return null for unowned files', () => {
    const collision = detectFileCollision('README.md', BACKEND_DOMAIN, TEST_DOMAINS);
    expect(collision).toBeNull();
  });

  it('should return null when branch domain also owns the file (overlapping ownership)', () => {
    const overlappingDomain: TeamDomain = {
      name: 'Backend',
      branchPrefixes: ['be-'],
      ownedPaths: [
        /^src\/(api|services?)\//i,
        /^src\/components\//i, // also owns frontend components
      ],
    };
    const testDomains = [overlappingDomain, FRONTEND_DOMAIN];
    // File is in src/components/ — owned by both overlappingDomain and Frontend
    // Since branch domain (overlappingDomain) also owns it — no collision
    const collision = detectFileCollision('src/components/Shared.tsx', overlappingDomain, testDomains);
    expect(collision).toBeNull();
  });
});

// ============================================================================
// detectOwnershipCollisions
// ============================================================================

describe('detectOwnershipCollisions', () => {
  it('should return no collisions for unrecognized branch', () => {
    const options = createDefaultOptions('main', ['src/components/Button.tsx']);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(false);
    expect(result.branchDomain).toBeNull();
    expect(result.message).toContain('skipped');
  });

  it('should return no collisions when backend branch touches only backend files', () => {
    const options = createDefaultOptions('be-add-auth', [
      'src/api/auth.ts',
      'src/services/token.ts',
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(false);
    expect(result.branchDomain).toBe('Backend');
    expect(result.collisions).toHaveLength(0);
  });

  it('should return no collisions when frontend branch touches only frontend files', () => {
    const options = createDefaultOptions('fe-button', [
      'src/components/Button.tsx',
      'src/styles/button.css',
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(false);
    expect(result.branchDomain).toBe('Frontend');
  });

  it('should detect collision when backend branch touches frontend files', () => {
    const options = createDefaultOptions('be-add-feature', [
      'src/api/auth.ts',
      'src/components/LoginForm.tsx', // frontend file!
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(true);
    expect(result.branchDomain).toBe('Backend');
    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0].filePath).toBe('src/components/LoginForm.tsx');
    expect(result.collisions[0].branchDomain).toBe('Backend');
    expect(result.collisions[0].fileDomain).toBe('Frontend');
  });

  it('should detect collision when frontend branch touches backend files', () => {
    const options = createDefaultOptions('fe-new-page', [
      'src/pages/Dashboard.tsx',
      'src/services/auth.ts', // backend file!
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(true);
    expect(result.branchDomain).toBe('Frontend');
    expect(result.collisions[0].fileDomain).toBe('Backend');
  });

  it('should detect multiple collisions', () => {
    const options = createDefaultOptions('be-refactor', [
      'src/api/auth.ts', // backend - fine
      'src/components/Button.tsx', // frontend - collision
      'src/pages/Home.tsx', // frontend - collision
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(true);
    expect(result.collisions).toHaveLength(2);
    expect(result.crossDomainFiles).toHaveLength(2);
  });

  it('should not flag unowned files as collisions', () => {
    const options = createDefaultOptions('be-add-auth', [
      'src/api/auth.ts',
      'README.md', // unowned — no collision
      'package.json', // unowned — no collision
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.hasCollisions).toBe(false);
  });

  it('should use default domains when none provided', () => {
    const options: OwnershipCollisionOptions = {
      branchName: 'be-add-auth',
      changedFiles: ['src/components/Button.tsx'],
    };
    const result = detectOwnershipCollisions(options);

    // With default domains, src/components/ is Frontend, be- is Backend
    expect(result.hasCollisions).toBe(true);
    expect(result.branchDomain).toBe('Backend');
  });

  it('should include domain summary in collision message', () => {
    const options = createDefaultOptions('be-refactor', [
      'src/components/Button.tsx',
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.message).toContain('Backend');
    expect(result.message).toContain('Frontend');
  });

  it('should crossDomainFiles match collision file paths', () => {
    const options = createDefaultOptions('be-large-pr', [
      'src/api/auth.ts',
      'src/components/Modal.tsx',
      'src/pages/Settings.tsx',
    ]);
    const result = detectOwnershipCollisions(options);

    expect(result.crossDomainFiles).toHaveLength(2);
    expect(result.crossDomainFiles).toContain('src/components/Modal.tsx');
    expect(result.crossDomainFiles).toContain('src/pages/Settings.tsx');
  });
});

// ============================================================================
// formatOwnershipCollisionWarning
// ============================================================================

describe('formatOwnershipCollisionWarning', () => {
  function makeResult(overrides: Partial<OwnershipCollisionResult> = {}): OwnershipCollisionResult {
    return {
      hasCollisions: true,
      collisions: [
        { filePath: 'src/components/Button.tsx', branchDomain: 'Backend', fileDomain: 'Frontend' },
        { filePath: 'src/styles/global.css', branchDomain: 'Backend', fileDomain: 'Frontend' },
      ],
      branchDomain: 'Backend',
      crossDomainFiles: ['src/components/Button.tsx', 'src/styles/global.css'],
      message: 'Backend branch touching Frontend files',
      ...overrides,
    };
  }

  it('should return empty string when no collisions', () => {
    const result = makeResult({ hasCollisions: false, collisions: [], crossDomainFiles: [] });
    expect(formatOwnershipCollisionWarning(result)).toBe('');
  });

  it('should include warning header with domain names', () => {
    const result = makeResult();
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('Ownership Collision');
    expect(output).toContain('Backend');
  });

  it('should include cross-domain file paths', () => {
    const result = makeResult();
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('src/components/Button.tsx');
    expect(output).toContain('src/styles/global.css');
  });

  it('should group files by the domain they belong to', () => {
    const result = makeResult({
      collisions: [
        { filePath: 'src/components/Button.tsx', branchDomain: 'Backend', fileDomain: 'Frontend' },
        { filePath: 'src/styles/app.css', branchDomain: 'Backend', fileDomain: 'Frontend' },
      ],
    });
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('Frontend files modified');
  });

  it('should note this is a WARN, not blocking', () => {
    const result = makeResult();
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('WARN');
    expect(output).toContain('not blocking');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include actionable checks', () => {
    const result = makeResult();
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('What to check');
  });

  it('should truncate long file lists with ellipsis', () => {
    const manyFiles = Array.from({ length: 8 }, (_, i) => ({
      filePath: `src/components/Component${i}.tsx`,
      branchDomain: 'Backend',
      fileDomain: 'Frontend',
    }));
    const result = makeResult({
      collisions: manyFiles,
      crossDomainFiles: manyFiles.map((c) => c.filePath),
    });
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('more');
  });

  it('should include collision count in summary', () => {
    const result = makeResult();
    const output = formatOwnershipCollisionWarning(result);
    expect(output).toContain('2'); // 2 collisions
  });
});
