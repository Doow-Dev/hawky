/**
 * Advanced Design System Gate Tests
 *
 * Tests for:
 * - S030: Component Duplication Detection
 * - S031: Existing Component Suggestion
 * - S033: Design System File Blast Radius
 */

import {
  scanForComponentDuplication,
  scanForComponentSuggestions,
  analyzeTokenBlastRadius,
  scanForTokenBlastRadius,
} from '../../src/gates/design-system';

// ============================================================================
// S030: Component Duplication Detection
// ============================================================================

describe('scanForComponentDuplication', () => {
  it('detects similar JSX structures across files', () => {
    const existingStructures = new Map();

    // First file adds structures to the map
    const content1 = `
      export function Card() {
        return (
          <Card className="card" onClick={handleClick}>
            <Title className="title">Title</Title>
            <Content className="content">Content</Content>
          </Card>
        );
      }
    `;
    scanForComponentDuplication(content1, 'components/Card.tsx', existingStructures, 0.7);

    // Second file should find duplication
    const content2 = `
      export function ProductCard() {
        return (
          <Card className="card" onClick={handleProduct}>
            <Title className="title">Product</Title>
            <Content className="content">Description</Content>
          </Card>
        );
      }
    `;
    const violations = scanForComponentDuplication(content2, 'components/ProductCard.tsx', existingStructures, 0.7);

    // Should find similar structure (Card with className and onClick)
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('design-system/component-duplication');
  });

  it('ignores dissimilar structures', () => {
    const existingStructures = new Map();

    const content1 = `<Nav onClick={x}><Link>Home</Link></Nav>`;
    scanForComponentDuplication(content1, 'Header.tsx', existingStructures, 0.8);

    const content2 = `<Footer className="a"><Span>Copyright</Span></Footer>`;
    const violations = scanForComponentDuplication(content2, 'Footer.tsx', existingStructures, 0.8);

    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S031: Existing Component Suggestion
// ============================================================================

describe('scanForComponentSuggestions', () => {
  it('suggests existing component when structure matches', () => {
    const componentIndex = [
      {
        name: 'Button',
        path: '@/components/ui/Button',
        structure: 'Button[className,onClick]{}',
      },
    ];

    const content = `
      export function MyButton() {
        return <Button className="btn" onClick={handleClick}>Click</Button>;
      }
    `;

    const violations = scanForComponentSuggestions(content, 'test.tsx', componentIndex, 0.5);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toContain('Button');
  });

  it('returns empty when no matches found', () => {
    const componentIndex = [
      {
        name: 'Modal',
        path: '@/components/ui/Modal',
        structure: 'Modal[isOpen,onClose]{div[]{}}',
      },
    ];

    const content = '<Span>Hello</Span>';
    const violations = scanForComponentSuggestions(content, 'test.tsx', componentIndex, 0.8);

    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// S033: Design System File Blast Radius
// ============================================================================

describe('analyzeTokenBlastRadius', () => {
  it('tracks token usage across files', () => {
    const allFiles = new Map([
      ['tokens.css', ':root { --color-primary: #007bff; --color-secondary: #6c757d; }'],
      ['Button.tsx', '<button style={{ color: "var(--color-primary)" }}>Click</button>'],
      ['Card.tsx', '<div style={{ borderColor: "var(--color-primary)" }}>Card</div>'],
      ['Header.tsx', '<header style={{ background: "var(--color-secondary)" }}>Header</header>'],
    ]);

    const { tokenUsage } = analyzeTokenBlastRadius(
      ['tokens.css'],
      allFiles,
      ['**/tokens.css'],
      '/project'
    );

    const primaryUsage = tokenUsage.get('--color-primary');
    expect(primaryUsage).toBeDefined();
    expect(primaryUsage!.usedIn.length).toBe(2);

    const secondaryUsage = tokenUsage.get('--color-secondary');
    expect(secondaryUsage).toBeDefined();
    expect(secondaryUsage!.usedIn.length).toBe(1);
  });

  it('identifies changed tokens', () => {
    const allFiles = new Map([
      ['src/tokens.css', ':root { --color-primary: #007bff; }'],
    ]);

    const { changedTokens } = analyzeTokenBlastRadius(
      ['src/tokens.css'],
      allFiles,
      ['**/tokens.css'],
      '/project'
    );

    expect(changedTokens).toContain('--color-primary');
  });
});

describe('scanForTokenBlastRadius', () => {
  it('warns when token affects many files', () => {
    const tokenUsage = new Map([
      [
        '--color-primary',
        {
          token: '--color-primary',
          usedIn: [
            { file: 'a.tsx', line: 1 },
            { file: 'b.tsx', line: 1 },
            { file: 'c.tsx', line: 1 },
            { file: 'd.tsx', line: 1 },
            { file: 'e.tsx', line: 1 },
          ],
        },
      ],
    ]);

    const violations = scanForTokenBlastRadius(
      tokenUsage,
      ['--color-primary'],
      3, // threshold of 3
      'tokens.css'
    );

    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe('design-system/token-blast-radius');
    expect(violations[0].message).toContain('5 places');
  });

  it('does not warn below threshold', () => {
    const tokenUsage = new Map([
      [
        '--color-primary',
        {
          token: '--color-primary',
          usedIn: [{ file: 'a.tsx', line: 1 }],
        },
      ],
    ]);

    const violations = scanForTokenBlastRadius(
      tokenUsage,
      ['--color-primary'],
      5,
      'tokens.css'
    );

    expect(violations.length).toBe(0);
  });
});
