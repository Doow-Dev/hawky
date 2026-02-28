/**
 * GOOD: Using crypto for secure random generation
 * This file should NOT trigger any hawky.security.math-random rules
 */

import { randomBytes, randomUUID } from 'crypto';

export class SecureService {
  // GOOD: Using crypto.randomBytes() for session ID
  generateSessionId(): string {
    // ok: hawky.security.math-random-in-auth
    return randomBytes(32).toString('hex');
  }

  // GOOD: Using crypto.randomUUID() for reset codes
  generateResetCode(): string {
    // ok: hawky.security.math-random-in-auth
    return randomUUID();
  }

  // GOOD: Using crypto for OTP generation
  generateOTP(): string {
    // ok: hawky.security.math-random-in-auth
    const bytes = randomBytes(3);
    const num = bytes.readUIntBE(0, 3) % 1000000;
    return String(num).padStart(6, '0');
  }
}

// GOOD: Non-security related random (e.g., for UI animations)
function getRandomColor(): string {
  // ok: hawky.security.math-random-for-tokens
  const colors = ['red', 'blue', 'green'];
  return colors[Math.floor(Math.random() * colors.length)];
}

export { getRandomColor };
