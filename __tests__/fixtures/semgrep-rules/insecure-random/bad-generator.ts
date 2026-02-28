/**
 * BAD: Math.random() for security-sensitive variable generation
 * This file should trigger hawky.security.math-random-for-tokens
 */

// ruleid: hawky.security.math-random-for-tokens
const sessionToken = Math.random().toString(36);

// ruleid: hawky.security.math-random-for-tokens
let apiKey = Math.random().toString(16).slice(2);

// ruleid: hawky.security.math-random-for-tokens
var secretCode = Math.random();

function generateAccessToken(): string {
  // ruleid: hawky.security.math-random-for-tokens
  const accessToken = Math.random().toString(36).substring(2, 15);
  return accessToken;
}

function createNonce(): string {
  // ruleid: hawky.security.math-random-for-tokens
  const nonce = 'n_' + Math.random().toString(36);
  return nonce;
}

// ruleid: hawky.security.math-random-for-tokens
const verificationCode = Math.random().toString().slice(2, 8);

export { sessionToken, apiKey, secretCode, generateAccessToken, createNonce, verificationCode };
