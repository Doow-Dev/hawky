/**
 * S012 Test Fixture: Decode vs Verify Token
 *
 * This file contains patterns that SHOULD trigger hawky-jwt-decode-without-verify
 */

import jwt from 'jsonwebtoken';

// SHOULD TRIGGER: jwt.decode without verify
function getPayloadUnsafe(token: string) {
  const payload = jwt.decode(token);
  return payload;
}

// SHOULD TRIGGER: Using decoded payload for auth decisions
function checkRoleUnsafe(token: string): boolean {
  const payload = jwt.decode(token) as { role: string };
  return payload.role === 'admin';
}

// SHOULD NOT TRIGGER: jwt.verify used
function getPayloadSafe(token: string, secret: string) {
  const payload = jwt.verify(token, secret);
  return payload;
}

// SHOULD NOT TRIGGER: Verify then decode
function getPayloadAfterVerify(token: string, secret: string) {
  jwt.verify(token, secret);
  const payload = jwt.decode(token);
  return payload;
}

// GOOD PATTERN: Always use verify
function authenticateToken(token: string, secret: string) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}
