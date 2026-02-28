/**
 * BAD: Math.random() in authentication code
 * This file should trigger hawky.security.math-random-in-auth
 *
 * Note: This is a test fixture placed in an auth/ subdirectory
 * to simulate real-world auth code patterns.
 */

// Simulating an auth service file path
export class BadService {
  // BAD: Using Math.random() for session ID generation
  generateSessionId(): string {
    // ruleid: hawky.security.math-random-in-auth
    return Math.random().toString(36).substring(2);
  }

  // BAD: Using Math.random() for reset codes
  generateResetCode(): string {
    // ruleid: hawky.security.math-random-in-auth
    const code = Math.random().toString(36) + Math.random().toString(36);
    return code;
  }

  // BAD: Using Math.random() for OTP
  generateOTP(): string {
    // ruleid: hawky.security.math-random-in-auth
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }
}
