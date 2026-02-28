/**
 * Test fixture: Bad auth handler using Math.random()
 * Path contains "auth" so hawky.security.math-random-in-auth should fire
 */

export function createSession(): string {
  // ruleid: hawky.security.math-random-in-auth
  return Math.random().toString(36).substring(2);
}

export function generateVerificationCode(): string {
  // ruleid: hawky.security.math-random-in-auth
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}
