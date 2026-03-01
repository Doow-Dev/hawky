/**
 * Unit tests for Frontend Checks Gate
 *
 * Tests all scanner functions:
 * - S054: Unhandled Async State Detection
 * - S055: Key Prop Analysis
 * - S056: useEffect Dependency Analysis
 */

import {
  scanForUnhandledAsyncState,
  scanForMissingKeys,
  scanForMissingDependencies,
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
