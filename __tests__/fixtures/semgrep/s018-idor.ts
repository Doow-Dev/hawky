/**
 * S018 Test Fixture: IDOR Patterns
 *
 * This file contains patterns that SHOULD trigger hawky-idor-user-id
 */

import express, { Request, Response } from 'express';

const router = express.Router();

// Extended request with user
interface AuthRequest extends Request {
  user: { id: string; isAdmin: boolean };
}

// Stub models
const User = { findById: async (id: string) => ({ id, email: 'test@test.com' }) };
const Account = { findOne: async (query: { _id?: string; id?: string }) => ({ id: query._id || query.id }) };
const Order = { findById: async (id: string) => ({ id, userId: '123' }) };

// SHOULD TRIGGER: Direct object reference via req.params.userId
router.get('/users/:userId', async (req, res) => {
  const user = await User.findById(req.params.userId);
  res.json(user);
});

// SHOULD TRIGGER: findOne with req.params.id
router.get('/accounts/:id', async (req, res) => {
  const account = await Account.findOne({ _id: req.params.id });
  res.json(account);
});

// SHOULD TRIGGER: No ownership check before returning
router.get('/orders/:id', async (req: Request, res: Response) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});

// SHOULD NOT TRIGGER: Ownership check present
router.get('/safe/orders/:id', async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (order.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(order);
});

// SHOULD NOT TRIGGER: Using authenticated user's ID
router.get('/me', async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// SHOULD NOT TRIGGER: Admin check before access
router.get('/admin/users/:userId', async (req: AuthRequest, res: Response) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const user = await User.findById(req.params.userId);
  res.json(user);
});

export { router };
