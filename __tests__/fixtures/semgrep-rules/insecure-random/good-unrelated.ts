/**
 * GOOD: Math.random() in non-security contexts
 * This file should NOT trigger hawky.security.math-random-in-auth
 * because it's not in an auth-related path
 */

// GOOD: Math.random() for non-security purposes
function getRandomIndex(array: unknown[]): number {
  // ok: hawky.security.math-random-in-auth
  return Math.floor(Math.random() * array.length);
}

// GOOD: Random delay for jitter
function getJitterMs(): number {
  // ok: hawky.security.math-random-in-auth
  return Math.random() * 1000;
}

// GOOD: Random UI element
function getRandomPosition(): { x: number; y: number } {
  // ok: hawky.security.math-random-in-auth
  return {
    x: Math.random() * 100,
    y: Math.random() * 100,
  };
}

// GOOD: Random sampling (non-security)
function sampleArray<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export { getRandomIndex, getJitterMs, getRandomPosition, sampleArray };
