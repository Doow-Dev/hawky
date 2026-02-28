/**
 * BAD: Using jwt.decode() without verification
 * These patterns should trigger hawky.security.jwt-* rules
 */

import jwt from 'jsonwebtoken';

// Mock functions
declare function decodeToken(token: string): { userId: string; role: string };
declare function decodeJwt(token: string): unknown;
declare function jwtDecode(token: string): unknown;

interface DecodedToken {
  userId: string;
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

// BAD: Using jwt.decode() in auth middleware
function authMiddleware(req: { headers: { authorization?: string } }) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  // ruleid: hawky.security.jwt-decode-without-verify
  const decoded = jwt.decode(token!) as DecodedToken;
  return decoded;
}

// BAD: Using decodeToken() to get user ID
function getUserIdFromToken(token: string): string {
  // ruleid: hawky.security.jwt-decode-without-verify
  const payload = decodeToken(token);
  // ruleid: hawky.security.jwt-decode-for-user-id
  return payload.userId;
}

// BAD: Using decoded claims for authorization
function checkAdmin(token: string): boolean {
  // ruleid: hawky.security.jwt-decode-without-verify
  const decoded = jwt.decode(token) as DecodedToken;
  // ruleid: hawky.security.jwt-decode-in-auth-check
  if (decoded.role === 'admin') {
    return true;
  }
  return false;
}

// BAD: Destructuring from decoded token
function extractUserInfo(token: string) {
  // ruleid: hawky.security.jwt-decode-for-user-id
  const { userId, email, role } = jwt.decode(token) as DecodedToken;
  return { userId, email, role };
}

// BAD: Using jwtDecode alias
function parseToken(token: string) {
  // ruleid: hawky.security.jwt-decode-without-verify
  return jwtDecode(token);
}

// BAD: Using conditional with decoded token
function conditionalAuth(token: string): boolean {
  // ruleid: hawky.security.jwt-decode-without-verify
  const payload = jwt.decode(token) as DecodedToken | null;
  // ruleid: hawky.security.jwt-decode-in-auth-check
  if (payload && payload.sub) {
    return true;
  }
  return false;
}

export {
  authMiddleware,
  getUserIdFromToken,
  checkAdmin,
  extractUserInfo,
  parseToken,
  conditionalAuth,
};
