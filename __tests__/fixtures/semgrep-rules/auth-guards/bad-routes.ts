/**
 * BAD: Routes without authentication middleware
 * These patterns should be flagged by auth-guard-completeness rules.
 *
 * NOTE: This is a test fixture for Semgrep rules. The code intentionally
 * demonstrates insecure patterns that should be detected.
 */

import express from 'express';
import { Router } from 'express';

const router = Router();
const app = express();

// BAD: Express routes without auth middleware
// ruleid: hawky.security.express-route-no-auth
router.get('/users', (req, res) => {
  res.json({ users: [] });
});

// ruleid: hawky.security.express-route-no-auth
router.post('/users', (req, res) => {
  res.json({ created: true });
});

// ruleid: hawky.security.express-route-no-auth
router.put('/users/:id', (req, res) => {
  res.json({ updated: true });
});

// ruleid: hawky.security.express-route-no-auth
router.delete('/users/:id', (req, res) => {
  res.json({ deleted: true });
});

// ruleid: hawky.security.express-route-no-auth
app.get('/admin/settings', (req, res) => {
  res.json({ settings: {} });
});

// ruleid: hawky.security.express-route-no-auth
app.post('/admin/settings', (req, res) => {
  res.json({ saved: true });
});

// Named handler reference without middleware chain
const handleUsers = (req: express.Request, res: express.Response) => {
  res.json([]);
};

// ruleid: hawky.security.express-route-no-auth
router.get('/data', handleUsers);

export { router, app };
