/**
 * S010 Test Fixture: Math.random in Auth
 *
 * This file contains patterns that SHOULD trigger hawky-math-random-in-auth
 */

// SHOULD TRIGGER: Math.random in auth-related function
function generateAuthToken(): string {
  return Math.random().toString(36).substring(2);
}

// SHOULD TRIGGER: Math.random in password reset
function createPasswordResetCode(): string {
  return Math.random().toString(16).slice(2, 10);
}

// SHOULD TRIGGER: Math.random in session creation
function generateSessionId(): string {
  return 'sess_' + Math.random().toString(36);
}

// SHOULD NOT TRIGGER: Math.random in non-auth context
function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// GOOD PATTERN: Use crypto instead
import crypto from 'crypto';

function generateSecureToken(): string {
  return crypto.randomUUID();
}

function generateSecureBytes(): string {
  return crypto.randomBytes(32).toString('hex');
}
