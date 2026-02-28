/**
 * ESLint fixture with intentional violations
 * Used to test the ESLint gate detection
 */

// no-unused-vars: 'unusedVar' is defined but never used
const unusedVar = 'I am never used';

// prefer-const: 'shouldBeConst' is never reassigned
let shouldBeConst = 42;

// no-var: Unexpected var, use let or const instead
var oldStyleVar = 'using var';

// eqeqeq: Expected '===' and instead saw '=='
function compareValues(a: unknown, b: unknown): boolean {
  // eslint violations are intentional for testing
  return a == b;
}

// no-empty: Empty block statement
function emptyFunction(): void {
  // This is intentionally empty for testing
}

export { shouldBeConst, oldStyleVar, compareValues, emptyFunction };
