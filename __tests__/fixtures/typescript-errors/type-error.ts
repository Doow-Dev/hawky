/**
 * TypeScript fixture with intentional type errors
 * Used to test the TypeScript gate detection
 */

// TS2322: Type 'string' is not assignable to type 'number'
const count: number = 'not a number';

// TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
function addOne(n: number): number {
  return n + 1;
}
addOne('hello');

// TS2339: Property 'nonexistent' does not exist on type '{}'
const obj = {};
const value = obj.nonexistent;

// TS7006: Parameter 'x' implicitly has an 'any' type
function implicit(x) {
  return x * 2;
}

export { count, addOne, obj, implicit };
