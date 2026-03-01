/**
 * GOOD: Routes with proper authentication middleware
 * These patterns should NOT be flagged by auth-guard-completeness rules.
 */

import express from 'express';
import { Router, RequestHandler } from 'express';

const router = Router();
const app = express();

// Mock auth middleware
const authenticate: RequestHandler = (req, res, next) => {
  // Authentication logic
  next();
};

const requireAdmin: RequestHandler = (req, res, next) => {
  // Admin check logic
  next();
};

const verifyToken: RequestHandler = (req, res, next) => {
  // Token verification
  next();
};

// GOOD: Routes with auth middleware
// ok: hawky.security.express-route-no-auth
router.get('/users', authenticate, (req, res) => {
  res.json({ users: [] });
});

// ok: hawky.security.express-route-no-auth
router.post('/users', authenticate, (req, res) => {
  res.json({ created: true });
});

// ok: hawky.security.express-route-no-auth
router.put('/users/:id', authenticate, requireAdmin, (req, res) => {
  res.json({ updated: true });
});

// ok: hawky.security.express-route-no-auth
router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  res.json({ deleted: true });
});

// ok: hawky.security.express-route-no-auth
app.get('/admin/settings', verifyToken, (req, res) => {
  res.json({ settings: {} });
});

// GOOD: Public endpoints that should be excluded
// ok: hawky.security.express-route-no-auth
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ok: hawky.security.express-route-no-auth
router.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// ok: hawky.security.express-route-no-auth
router.get('/ready', (req, res) => {
  res.json({ ready: true });
});

// ok: hawky.security.express-route-no-auth
router.get('/ping', (req, res) => {
  res.send('pong');
});

// ok: hawky.security.express-route-no-auth
router.get('/version', (req, res) => {
  res.json({ version: '1.0.0' });
});

// GOOD: Route-level middleware applied to entire router
const protectedRouter = Router();
protectedRouter.use(authenticate);

// These routes inherit the auth from router.use()
protectedRouter.get('/profile', (req, res) => {
  res.json({ profile: {} });
});

protectedRouter.post('/profile', (req, res) => {
  res.json({ saved: true });
});

// GOOD: Array of middleware
// ok: hawky.security.express-route-no-auth
router.get('/secure', [authenticate, requireAdmin], (req, res) => {
  res.json({ secure: true });
});

export { router, app, protectedRouter };
