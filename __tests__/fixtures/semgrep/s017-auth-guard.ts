/**
 * S017 Test Fixture: Auth Guard Completeness
 *
 * This file contains patterns that SHOULD trigger hawky-unprotected-route
 */

import express, { Request, Response, NextFunction } from 'express';

const router = express.Router();
const app = express();

// Auth middleware stub
const requireAuth = (_req: Request, _res: Response, next: NextFunction) => next();

// Extended request with user
interface AuthRequest extends Request {
  user: { id: string };
}

// SHOULD TRIGGER: Unprotected user route
router.get('/api/users/:id', async (req, res) => {
  const user = await getUserById(req.params.id);
  res.json(user);
});

// SHOULD TRIGGER: Unprotected admin route
router.post('/api/admin/settings', async (req, res) => {
  await updateSettings(req.body);
  res.json({ success: true });
});

// SHOULD TRIGGER: Unprotected account route
app.delete('/api/account/:id', async (req, res) => {
  await deleteAccount(req.params.id);
  res.status(204).send();
});

// SHOULD NOT TRIGGER: Protected route
router.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
  const profile = await getProfile(req.user.id);
  res.json(profile);
});

// SHOULD NOT TRIGGER: Protected with middleware
router.post('/api/dashboard/data', requireAuth, async (req: AuthRequest, res) => {
  const data = await getDashboardData(req.user.id);
  res.json(data);
});

// SHOULD NOT TRIGGER: Public route (not in sensitive path pattern)
router.get('/api/health', async (req, res) => {
  res.json({ status: 'ok' });
});

// Helper stubs
async function getUserById(_id: string) { return {}; }
async function updateSettings(_body: unknown) {}
async function deleteAccount(_id: string) {}
async function getProfile(_id: string) { return {}; }
async function getDashboardData(_id: string) { return {}; }

export { router, app };
