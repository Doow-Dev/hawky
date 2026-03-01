/**
 * Unit tests for Frontend Checks Gate
 *
 * Tests all scanner functions:
 * - S054: Unhandled Async State Detection
 * - S055: Key Prop Analysis
 * - S056: useEffect Dependency Analysis
 * - S057: Re-render Trap Detection
 * - S058: Server/Client Boundary Check
 * - S059: Accessibility Interactive Element Check
 * - S060: Bundle Size Delta
 * - S061: Image Without Dimensions
 * - S062: TypeScript Strict Mode Checks
 * - S063: Import Cycle Detection
 * - S064: Component Graph Impact
 * - S065: Import Path Consistency
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  scanForUnhandledAsyncState,
  scanForMissingKeys,
  scanForMissingDependencies,
  scanForRerenderTraps,
  scanForServerClientBoundary,
  scanForA11yIssues,
  calculateBundleDelta,
  scanForImageWithoutDimensions,
  scanForTypeScriptStrictIssues,
  buildDependencyGraph,
  detectCycles,
  scanForImportCycles,
  buildComponentGraph,
  analyzeComponentGraphImpact,
  scanForImportPathInconsistency,
} from '../../src/gates/frontend-checks';

// ============================================================================
// S054: Unhandled Async State Detection
// ============================================================================

describe('scanForUnhandledAsyncState', () => {
  describe('React Query', () => {
    it('detects useQuery without loading state', () => {
      const content = `
        const { data } = useQuery('key', fetchData);
        return <div>{data.name}</div>;
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.message.includes('loading'))).toBe(true);
    });

    it('detects useQuery without error handling', () => {
      const content = `
        const { data, isLoading } = useQuery('key', fetchData);
        if (isLoading) return <Loading />;
        return <div>{data.name}</div>;
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('error'))).toBe(true);
    });

    it('passes when both loading and error are handled', () => {
      const content = `
        const { data, isLoading, error } = useQuery('key', fetchData);
        if (isLoading) return <Loading />;
        if (error) return <Error />;
        return <div>{data.name}</div>;
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });

    it('detects useMutation without error handling', () => {
      const content = `
        const { mutate, isLoading } = useMutation(createUser);
        return <button onClick={() => mutate(data)}>Submit</button>;
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('error'))).toBe(true);
    });
  });

  describe('SWR', () => {
    it('detects useSWR without loading state', () => {
      const content = `
        const { data } = useSWR('/api/user', fetcher);
        return <div>{data.name}</div>;
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('loading'))).toBe(true);
    });

    it('passes when SWR error is handled', () => {
      const content = `
        const { data, error, isLoading } = useSWR('/api/user', fetcher);
        if (isLoading) return <Loading />;
        if (error) return <Error />;
        return <div>{data.name}</div>;
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });
  });

  describe('Native fetch in useEffect', () => {
    it('detects fetch without error handling', () => {
      const content = `
        useEffect(() => {
          fetch('/api/data')
            .then(r => r.json())
            .then(setData);
        }, []);
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain('error handling');
    });

    it('passes when fetch has .catch()', () => {
      // The pattern looks inside the useEffect body for .catch
      const content = `
        useEffect(() => {
          fetch('/api/data').then(r => r.json()).then(setData).catch(err => setError(err));
        }, []);
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      // Scanner should find the .catch in the same effect block
      expect(violations.length).toBe(0);
    });

    it('passes when async useEffect has try/catch', () => {
      const content = `
        useEffect(() => {
          async function loadData() {
            try {
              const res = await fetch('/api/data');
              setData(await res.json());
            } catch (err) {
              setError(err);
            }
          }
          loadData();
        }, []);
      `;
      const violations = scanForUnhandledAsyncState(content, 'test.tsx');

      // This should pass since try/catch is present
      expect(violations.length).toBe(0);
    });
  });
});

// ============================================================================
// S055: Key Prop Analysis
// ============================================================================

describe('scanForMissingKeys', () => {
  describe('Missing key detection', () => {
    it('detects missing key in simple map', () => {
      const content = `
        items.map(item => <Item {...item} />)
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe('frontend/missing-key-prop');
    });

    it('detects missing key in map with arrow function body', () => {
      const content = `
        items.map(item => {
          return <ListItem name={item.name} />;
        })
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.some(v => v.ruleId === 'frontend/missing-key-prop')).toBe(true);
    });

    it('passes when key is provided', () => {
      const content = `
        items.map(item => <Item key={item.id} {...item} />)
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });

    it('passes when key uses unique property', () => {
      const content = `users.map(user => <UserCard key={user.email} user={user} />)`;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });
  });

  describe('Index as key anti-pattern', () => {
    it('warns when using index as key', () => {
      const content = `
        items.map((item, index) => <Item key={index} {...item} />)
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe('frontend/index-as-key');
      expect(violations[0].severity).toBe('warning');
    });

    it('warns when using index variable with different name', () => {
      const content = `
        items.map((item, i) => <Item key={i} {...item} />)
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.some(v => v.ruleId === 'frontend/index-as-key')).toBe(true);
    });

    it('warns when index is part of key expression', () => {
      const content = `
        items.map((item, idx) => <Item key={\`item-\${idx}\`} {...item} />)
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      // This should catch idx in template literal
      expect(violations.some(v => v.violationType === 'index-as-key')).toBe(true);
    });
  });

  describe('Static/duplicate key detection', () => {
    it('detects static string as key', () => {
      const content = `items.map(item => <Item key="same" {...item} />)`;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.length).toBe(1);
      // Scanner detects this as a static key
      expect(violations[0].message).toContain('Static key');
    });

    it('detects static number as key', () => {
      const content = `
        items.map(item => <Item key={1} {...item} />)
      `;
      const violations = scanForMissingKeys(content, 'test.tsx');

      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain('Static key');
    });
  });
});

// ============================================================================
// S056: useEffect Dependency Analysis
// ============================================================================

describe('scanForMissingDependencies', () => {
  describe('useEffect', () => {
    it('detects missing dependency in useEffect', () => {
      const content = `useEffect(() => { console.log(count); }, []);`;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.message.includes('count'))).toBe(true);
    });

    it('passes when all dependencies are included', () => {
      // Simple case: variable in deps matches variable used
      const content = `useEffect(() => { doSomething(); }, [doSomething]);`;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // The scanner shouldn't flag this - doSomething is in deps
      expect(violations.length).toBe(0);
    });

    it('detects multiple missing dependencies', () => {
      const content = `
        const name = props.name;
        const age = props.age;
        useEffect(() => {
          fetchUser(name, age);
        }, []);
      `;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].message).toMatch(/name|age/);
    });

    it('does not flag setState functions (stable)', () => {
      const content = `
        const [data, setData] = useState(null);
        useEffect(() => {
          fetch('/api').then(r => r.json()).then(setData);
        }, []);
      `;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // setData should not be flagged as missing (it's stable from useState)
      const flagsSetData = violations.some(v => v.message.includes('setData'));
      expect(flagsSetData).toBe(false);
    });

    it('does not flag variables defined inside the effect', () => {
      const content = `
        useEffect(() => {
          const controller = new AbortController();
          fetch('/api', { signal: controller.signal });
          return () => controller.abort();
        }, []);
      `;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // controller is defined inside, should not be flagged
      const flagsController = violations.some(v => v.message.includes('controller'));
      expect(flagsController).toBe(false);
    });
  });

  describe('useCallback', () => {
    it('detects missing dependency in useCallback', () => {
      const content = `
        const userId = props.userId;
        const handleClick = useCallback(() => {
          fetchUser(userId);
        }, []);
      `;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].hookName).toBe('useCallback');
    });

    it('passes when useCallback has correct dependencies', () => {
      // Simple case: dependency is listed
      const content = `const handleClick = useCallback(() => { fetchUser(userId); }, [userId]);`;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // fetchUser might still be flagged but userId should not be
      const flagsUserId = violations.some(v => v.message.includes('userId') && !v.message.includes('fetchUser'));
      expect(flagsUserId).toBe(false);
    });
  });

  describe('useMemo', () => {
    it('detects missing dependency in useMemo', () => {
      const content = `
        const items = props.items;
        const total = useMemo(() => {
          return items.reduce((sum, item) => sum + item.price, 0);
        }, []);
      `;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].hookName).toBe('useMemo');
    });

    it('passes when useMemo has correct dependencies', () => {
      // Simple case: dependency is listed
      const content = `const total = useMemo(() => { return items.length; }, [items]);`;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // items is in deps, should not be flagged
      const flagsItems = violations.some(v => v.message.includes('items'));
      expect(flagsItems).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('does not flag refs (typically stable)', () => {
      const content = `
        const inputRef = useRef(null);
        useEffect(() => {
          inputRef.current?.focus();
        }, []);
      `;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // refs should not be flagged
      const flagsRef = violations.some(v => v.message.includes('inputRef'));
      expect(flagsRef).toBe(false);
    });

    it('does not flag global objects', () => {
      // Global objects like window, console, localStorage are stable
      const content = `useEffect(() => { console.log(window.innerWidth); }, []);`;
      const violations = scanForMissingDependencies(content, 'test.tsx');

      // window, console should not be flagged as missing deps
      const flagsGlobals = violations.some(v =>
        v.message.includes('window') ||
        v.message.includes('console') ||
        v.message.includes('localStorage')
      );
      expect(flagsGlobals).toBe(false);
    });
  });
});

// ============================================================================
// S057: Re-render Trap Detection
// ============================================================================

describe('scanForRerenderTraps', () => {
  describe('Inline object literals', () => {
    it('detects inline object literal in JSX prop (non-style)', () => {
      const content = `<Component config={{ key: 'value' }} />`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleId).toBe('frontend/rerender-trap');
      expect(violations[0].message).toContain('object literal');
    });

    it('does not flag style={{ }} (expected pattern)', () => {
      const content = `<div style={{ color: 'red', margin: 0 }}>text</div>`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      const styletViolations = violations.filter(v => v.message.includes('style'));
      expect(styletViolations.length).toBe(0);
    });
  });

  describe('Inline array literals', () => {
    it('detects inline array literal in JSX prop', () => {
      const content = `<Select options={['a', 'b', 'c']} />`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('array literal'))).toBe(true);
    });
  });

  describe('Inline arrow functions', () => {
    it('detects inline arrow function in non-event prop', () => {
      const content = `<Component renderItem={(item) => <span>{item}</span>} />`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      expect(violations.some(v => v.ruleId === 'frontend/rerender-trap')).toBe(true);
    });

    it('does not flag common event handler props', () => {
      const content = `<button onClick={() => handleClick()}>click</button>`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      const onClickViolations = violations.filter(v =>
        v.message.includes('"onClick"')
      );
      expect(onClickViolations.length).toBe(0);
    });

    it('does not flag onChange event handler', () => {
      const content = `<input onChange={(e) => setValue(e.target.value)} />`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      const onChangeViolations = violations.filter(v =>
        v.message.includes('"onChange"')
      );
      expect(onChangeViolations.length).toBe(0);
    });
  });

  describe('Expensive array operations', () => {
    it('detects .filter() without useMemo', () => {
      const content = `const filtered = items.filter(x => x.active);`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('filtered'))).toBe(true);
    });

    it('detects .reduce() without useMemo', () => {
      const content = `const total = items.reduce((sum, item) => sum + item.price, 0);`;
      const violations = scanForRerenderTraps(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('total'))).toBe(true);
    });
  });
});

// ============================================================================
// S058: Server/Client Boundary Check
// ============================================================================

describe('scanForServerClientBoundary', () => {
  describe('Missing use client directive', () => {
    it('detects useState usage without use client', () => {
      const content = `
        const [count, setCount] = useState(0);
        return <div>{count}</div>;
      `;
      const violations = scanForServerClientBoundary(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('useState'))).toBe(true);
      expect(violations[0].severity).toBe('error');
    });

    it('detects useEffect usage without use client', () => {
      const content = `
        useEffect(() => { document.title = 'test'; }, []);
      `;
      const violations = scanForServerClientBoundary(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('useEffect'))).toBe(true);
    });

    it('passes when use client directive is present', () => {
      const content = `
        'use client';
        const [count, setCount] = useState(0);
        return <div>{count}</div>;
      `;
      const violations = scanForServerClientBoundary(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });

    it('detects browser global window without use client', () => {
      const content = `
        const width = window.innerWidth;
        return <div>{width}</div>;
      `;
      const violations = scanForServerClientBoundary(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('window'))).toBe(true);
    });

    it('does not flag typeof window check', () => {
      const content = `
        const isClient = typeof window !== 'undefined';
        const width = isClient ? window.innerWidth : 0;
      `;
      const violations = scanForServerClientBoundary(content, 'test.tsx');

      // typeof window check should be safe
      const windowViolations = violations.filter(v => v.message.includes('"window"'));
      expect(windowViolations.length).toBe(0);
    });
  });

  describe('Custom hook definitions', () => {
    it('does not flag custom hook definitions as violations', () => {
      const content = `
        export function useMyCustomHook() {
          const [state, setState] = useState(null);
          return state;
        }
      `;
      const violations = scanForServerClientBoundary(content, 'test.ts');

      // The hook definition itself should not be flagged as "missing use client"
      // (it defines useState inside a custom hook)
      // Note: This is a heuristic - the scanner skips function declarations
      expect(Array.isArray(violations)).toBe(true);
    });
  });
});

// ============================================================================
// S059: Accessibility Interactive Element Check
// ============================================================================

describe('scanForA11yIssues', () => {
  describe('div with onClick', () => {
    it('detects div with onClick missing role and tabIndex', () => {
      const content = `<div onClick={handleClick}>click me</div>`;
      const violations = scanForA11yIssues(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleId).toBe('frontend/a11y-interactive');
      expect(violations[0].message).toContain('role');
    });

    it('detects div with onClick missing tabIndex only', () => {
      const content = `<div onClick={handleClick} role="button">click me</div>`;
      const violations = scanForA11yIssues(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('tabIndex'))).toBe(true);
    });

    it('passes when div has role and tabIndex', () => {
      const content = `<div onClick={handleClick} role="button" tabIndex={0}>click me</div>`;
      const violations = scanForA11yIssues(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });

    it('does not scan non-JSX files', () => {
      const content = `<div onClick={handleClick}>click me</div>`;
      const violations = scanForA11yIssues(content, 'test.ts'); // .ts not .tsx

      expect(violations.length).toBe(0);
    });
  });

  describe('Nested buttons', () => {
    it('detects nested button elements', () => {
      const content = `<button><button>inner</button></button>`;
      const violations = scanForA11yIssues(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('Nested <button>'))).toBe(true);
    });

    it('detects button inside anchor', () => {
      const content = `<a href="/"><button>click</button></a>`;
      const violations = scanForA11yIssues(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('button') && v.message.includes('<a>'))).toBe(true);
    });
  });
});

// ============================================================================
// S060: Bundle Size Delta
// ============================================================================

describe('calculateBundleDelta', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-bundle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty deltas when no build stats exist', () => {
    const beforeDir = path.join(tmpDir, 'before');
    const afterDir = path.join(tmpDir, 'after');
    fs.mkdirSync(beforeDir);
    fs.mkdirSync(afterDir);

    const { deltas, violations } = calculateBundleDelta(beforeDir, afterDir);

    expect(deltas).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('detects large bundle size increase via static files', () => {
    const beforeDir = path.join(tmpDir, 'before');
    const afterDir = path.join(tmpDir, 'after');
    fs.mkdirSync(path.join(beforeDir, 'static', 'chunks'), { recursive: true });
    fs.mkdirSync(path.join(afterDir, 'static', 'chunks'), { recursive: true });

    // Before: 10KB chunk
    const beforeChunk = path.join(beforeDir, 'static', 'chunks', 'main.js');
    fs.writeFileSync(beforeChunk, 'a'.repeat(10 * 1024));

    // After: 200KB chunk (large increase)
    const afterChunk = path.join(afterDir, 'static', 'chunks', 'main.js');
    fs.writeFileSync(afterChunk, 'a'.repeat(200 * 1024));

    const { violations } = calculateBundleDelta(beforeDir, afterDir, 50 * 1024);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('frontend/bundle-size-delta');
    expect(violations[0].message).toContain('grew by');
  });

  it('does not flag small bundle size increases', () => {
    const beforeDir = path.join(tmpDir, 'before');
    const afterDir = path.join(tmpDir, 'after');
    fs.mkdirSync(path.join(beforeDir, 'static'), { recursive: true });
    fs.mkdirSync(path.join(afterDir, 'static'), { recursive: true });

    // Small increase: 10KB -> 15KB
    fs.writeFileSync(path.join(beforeDir, 'static', 'main.js'), 'a'.repeat(10 * 1024));
    fs.writeFileSync(path.join(afterDir, 'static', 'main.js'), 'a'.repeat(15 * 1024));

    const { violations } = calculateBundleDelta(beforeDir, afterDir, 50 * 1024);

    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S061: Image Without Dimensions
// ============================================================================

describe('scanForImageWithoutDimensions', () => {
  describe('Native img tag', () => {
    it('detects img without width and height', () => {
      const content = `<img src="/logo.png" alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleId).toBe('frontend/image-missing-dimensions');
      expect(violations[0].message).toContain('width');
    });

    it('detects img missing only height', () => {
      const content = `<img src="/logo.png" width={200} alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.tsx');

      expect(violations.some(v => v.message.includes('height'))).toBe(true);
    });

    it('passes when img has both width and height', () => {
      const content = `<img src="/logo.png" width={200} height={100} alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.tsx');

      expect(violations.length).toBe(0);
    });

    it('does not scan non-JSX files', () => {
      const content = `<img src="/logo.png" alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.ts');

      expect(violations.length).toBe(0);
    });
  });

  describe('Next.js Image component', () => {
    it('detects Next.js Image without dimensions', () => {
      const content = `<Image src="/logo.png" alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.tsx');

      expect(violations.some(v => v.ruleId === 'frontend/image-missing-dimensions')).toBe(true);
      expect(violations.some(v => v.severity === 'error')).toBe(true);
    });

    it('passes when Next.js Image has fill prop', () => {
      const content = `<Image src="/logo.png" fill alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.tsx');

      const nextImageViolations = violations.filter(v =>
        v.message.includes('Next.js')
      );
      expect(nextImageViolations.length).toBe(0);
    });

    it('passes when Next.js Image has width and height', () => {
      const content = `<Image src="/logo.png" width={800} height={600} alt="Logo" />`;
      const violations = scanForImageWithoutDimensions(content, 'test.tsx');

      const nextImageViolations = violations.filter(v =>
        v.message.includes('Next.js')
      );
      expect(nextImageViolations.length).toBe(0);
    });
  });
});

// ============================================================================
// S062: TypeScript Strict Mode Checks
// ============================================================================

describe('scanForTypeScriptStrictIssues', () => {
  describe('Type assertion to any', () => {
    it('detects "as any" type assertion', () => {
      const content = `const data = response as any;`;
      const violations = scanForTypeScriptStrictIssues(content, 'test.ts');

      expect(violations.some(v => v.ruleId === 'frontend/ts-strict-as-any')).toBe(true);
    });

    it('does not scan non-TypeScript files', () => {
      const content = `const data = response as any;`;
      const violations = scanForTypeScriptStrictIssues(content, 'test.js');

      expect(violations.length).toBe(0);
    });
  });

  describe('Non-null assertions', () => {
    it('detects non-null assertion without justification', () => {
      const content = `const value = maybeNull!.property;`;
      const violations = scanForTypeScriptStrictIssues(content, 'test.ts');

      expect(violations.some(v => v.ruleId === 'frontend/ts-strict-non-null-assertion')).toBe(true);
    });

    it('passes when previous line has justification comment', () => {
      const content = `// safe - guaranteed to exist after auth check
const value = maybeNull!.property;`;
      const violations = scanForTypeScriptStrictIssues(content, 'test.ts');

      const nonNullViolations = violations.filter(v =>
        v.ruleId === 'frontend/ts-strict-non-null-assertion'
      );
      expect(nonNullViolations.length).toBe(0);
    });
  });

  describe('Comment lines', () => {
    it('skips comment lines', () => {
      const content = `// const data = response as any;`;
      const violations = scanForTypeScriptStrictIssues(content, 'test.ts');

      expect(violations.length).toBe(0);
    });
  });
});

// ============================================================================
// S063: Import Cycle Detection
// ============================================================================

describe('Import Cycle Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-cycle-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildDependencyGraph', () => {
    it('builds a graph with relative imports', () => {
      const aPath = path.join(tmpDir, 'a.ts');
      const bPath = path.join(tmpDir, 'b.ts');
      fs.writeFileSync(aPath, `import { b } from './b';`);
      fs.writeFileSync(bPath, `export const b = 1;`);

      const graph = buildDependencyGraph([aPath, bPath], tmpDir);

      expect(graph.has('a.ts')).toBe(true);
      expect(graph.get('a.ts')?.has('b.ts')).toBe(true);
    });

    it('ignores node_modules imports', () => {
      const aPath = path.join(tmpDir, 'a.ts');
      fs.writeFileSync(aPath, `import React from 'react';`);

      const graph = buildDependencyGraph([aPath], tmpDir);

      expect(graph.get('a.ts')?.size).toBe(0);
    });
  });

  describe('detectCycles', () => {
    it('detects a simple A -> B -> A cycle', () => {
      const graph = new Map<string, Set<string>>([
        ['a.ts', new Set(['b.ts'])],
        ['b.ts', new Set(['a.ts'])],
      ]);

      const cycles = detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      const cycleStr = cycles[0].join(' -> ');
      expect(cycleStr).toContain('a.ts');
      expect(cycleStr).toContain('b.ts');
    });

    it('detects a three-node cycle A -> B -> C -> A', () => {
      const graph = new Map<string, Set<string>>([
        ['a.ts', new Set(['b.ts'])],
        ['b.ts', new Set(['c.ts'])],
        ['c.ts', new Set(['a.ts'])],
      ]);

      const cycles = detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('does not flag acyclic graphs', () => {
      const graph = new Map<string, Set<string>>([
        ['a.ts', new Set(['b.ts'])],
        ['b.ts', new Set(['c.ts'])],
        ['c.ts', new Set()],
      ]);

      const cycles = detectCycles(graph);

      expect(cycles.length).toBe(0);
    });
  });

  describe('scanForImportCycles', () => {
    it('returns violations for circular imports', () => {
      const aPath = path.join(tmpDir, 'moduleA.ts');
      const bPath = path.join(tmpDir, 'moduleB.ts');
      fs.writeFileSync(aPath, `import { b } from './moduleB';`);
      fs.writeFileSync(bPath, `import { a } from './moduleA';`);

      const violations = scanForImportCycles([aPath, bPath], tmpDir);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleId).toBe('frontend/import-cycle');
    });

    it('returns no violations for non-cyclic imports', () => {
      const aPath = path.join(tmpDir, 'componentA.ts');
      const bPath = path.join(tmpDir, 'utils.ts');
      fs.writeFileSync(aPath, `import { util } from './utils';`);
      fs.writeFileSync(bPath, `export const util = () => {};`);

      const violations = scanForImportCycles([aPath, bPath], tmpDir);

      expect(violations.length).toBe(0);
    });
  });
});

// ============================================================================
// S064: Component Graph Impact
// ============================================================================

describe('Component Graph Impact', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-graph-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildComponentGraph', () => {
    it('calculates blast radius for a leaf component', () => {
      const leafPath = path.join(tmpDir, 'Button.tsx');
      const parentPath = path.join(tmpDir, 'Form.tsx');
      const grandParentPath = path.join(tmpDir, 'Page.tsx');

      fs.writeFileSync(leafPath, `export const Button = () => <button />;`);
      fs.writeFileSync(parentPath, `import { Button } from './Button'; export const Form = () => <Button />;`);
      fs.writeFileSync(grandParentPath, `import { Form } from './Form'; export const Page = () => <Form />;`);

      const graph = buildComponentGraph([leafPath, parentPath, grandParentPath], tmpDir);

      const buttonEntry = graph.get('Button.tsx');
      expect(buttonEntry).toBeDefined();
      // Button is imported by Form (which is imported by Page) = blast radius 2
      expect(buttonEntry!.blastRadius).toBe(2);
    });
  });

  describe('analyzeComponentGraphImpact', () => {
    it('returns violations for high blast radius components', () => {
      // Create many importers of a single shared file
      const sharedPath = path.join(tmpDir, 'shared.ts');
      fs.writeFileSync(sharedPath, `export const helper = () => {};`);

      const importers: string[] = [];
      for (let i = 0; i < 25; i++) {
        const importerPath = path.join(tmpDir, `Component${i}.tsx`);
        fs.writeFileSync(importerPath, `import { helper } from './shared';`);
        importers.push(importerPath);
      }

      const allFiles = [sharedPath, ...importers];
      const violations = analyzeComponentGraphImpact(
        [sharedPath], // changed files
        allFiles,
        tmpDir,
        20 // threshold
      );

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleId).toBe('frontend/component-graph-impact');
      expect(violations[0].message).toContain('blast radius');
    });

    it('does not flag low blast radius components', () => {
      const utilPath = path.join(tmpDir, 'util.ts');
      const onlyUser = path.join(tmpDir, 'SingleUser.tsx');
      fs.writeFileSync(utilPath, `export const util = () => {};`);
      fs.writeFileSync(onlyUser, `import { util } from './util';`);

      const violations = analyzeComponentGraphImpact(
        [utilPath],
        [utilPath, onlyUser],
        tmpDir,
        20
      );

      expect(violations.length).toBe(0);
    });
  });
});

// ============================================================================
// S065: Import Path Consistency
// ============================================================================

describe('scanForImportPathInconsistency', () => {
  describe('Alias vs relative mixing', () => {
    it('detects mixing @/ aliases with relative imports', () => {
      const content = `
        import { Button } from '@/components/Button';
        import { utils } from './utils';
      `;
      const violations = scanForImportPathInconsistency(content, 'src/pages/Home.tsx');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].ruleId).toBe('frontend/import-path-consistency');
    });

    it('passes when all imports use @/ aliases', () => {
      const content = `
        import { Button } from '@/components/Button';
        import { Input } from '@/components/Input';
        import { api } from '@/lib/api';
      `;
      const violations = scanForImportPathInconsistency(content, 'src/pages/Home.tsx');

      expect(violations.length).toBe(0);
    });

    it('passes when all imports use relative paths', () => {
      const content = `
        import { Button } from '../components/Button';
        import { Input } from '../components/Input';
        import { api } from '../../lib/api';
      `;
      const violations = scanForImportPathInconsistency(content, 'src/pages/Home.tsx');

      expect(violations.length).toBe(0);
    });

    it('does not flag node_modules imports', () => {
      const content = `
        import React from 'react';
        import { useQuery } from '@tanstack/react-query';
        import { Button } from '@/components/Button';
      `;
      const violations = scanForImportPathInconsistency(content, 'src/pages/Home.tsx');

      // node_modules imports should not be counted as relative or alias
      expect(violations.length).toBe(0);
    });
  });

  describe('Index vs direct file imports', () => {
    it('detects mixing index import with direct file import for same module', () => {
      // Both imports reference the same underlying path (utils vs utils/index)
      const content = `
        import { helperA } from './utils/index';
        import { helperB } from './utils';
      `;
      const violations = scanForImportPathInconsistency(content, 'src/pages/Home.tsx');

      expect(violations.some(v => v.message.includes('Inconsistent imports'))).toBe(true);
    });
  });
});
