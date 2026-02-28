/**
 * GOOD: Using jwt.verify() for authentication
 * These patterns should NOT trigger hawky.security.jwt-* rules
 */

import jwt from 'jsonwebtoken';

interface DecodedToken {
  userId: string;
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

const JWT_SECRET = process.env.JWT_SECRET!;

// GOOD: Using jwt.verify() in auth middleware
function authMiddleware(req: { headers: { authorization?: string } }) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  // ok: hawky.security.jwt-decode-without-verify
  const decoded = jwt.verify(token!, JWT_SECRET) as DecodedToken;
  return decoded;
}

// GOOD: Using verifyToken() helper
declare function verifyToken(token: string): DecodedToken;

function getUserIdFromToken(token: string): string {
  // ok: hawky.security.jwt-decode-without-verify
  const payload = verifyToken(token);
  return payload.userId;
}

// GOOD: Verify before checking claims
function checkAdmin(token: string): boolean {
  // ok: hawky.security.jwt-decode-without-verify
  const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
  if (decoded.role === 'admin') {
    return true;
  }
  return false;
}

// GOOD: Using decode() only for non-auth purposes (e.g., logging expiry)
function getTokenExpiry(token: string): number | undefined {
  // ok: hawky.security.jwt-decode-without-verify (not in auth path)
  const payload = jwt.decode(token) as { exp?: number } | null;
  return payload?.exp;
}

// GOOD: Using decode() to check token structure before verify
function isValidTokenFormat(token: string): boolean {
  // ok: hawky.security.jwt-decode-without-verify
  try {
    const parts = token.split('.');
    return parts.length === 3;
  } catch {
    return false;
  }
}

// GOOD: Async verify with proper error handling
async function verifyAsync(token: string): Promise<DecodedToken | null> {
  try {
    // ok: hawky.security.jwt-decode-without-verify
    return jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch {
    return null;
  }
}

export {
  authMiddleware,
  getUserIdFromToken,
  checkAdmin,
  getTokenExpiry,
  isValidTokenFormat,
  verifyAsync,
};
