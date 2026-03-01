/**
 * GOOD: Active security guards (not commented out)
 * These patterns should NOT trigger hawky.security.commented-* rules
 */

import { Controller, Get, Post, UseGuards } from 'some-framework';

// Mock decorators and functions
function Auth(): ClassDecorator & MethodDecorator {
  return () => {};
}

function Roles(...roles: string[]): MethodDecorator {
  return () => {};
}

class AuthGuard {}

declare function requireAuth(req: unknown, res: unknown, next: () => void): void;
declare function authenticate(req: unknown, res: unknown, next: () => void): void;
declare function checkPermission(user: unknown, permission: string): boolean;
declare function hasRole(user: unknown, role: string): boolean;

// GOOD: Active guard decorators
// ok: hawky.security.commented-guard-decorator
@UseGuards(AuthGuard)
@Controller('admin')
class AdminController {
  // ok: hawky.security.commented-guard-decorator
  @Auth()
  @Get('users')
  getUsers() {
    return [];
  }

  // ok: hawky.security.commented-guard-decorator
  @Roles('admin')
  @Post('delete-all')
  deleteAll() {
    return { success: true };
  }
}

// GOOD: Active middleware in routes
const router = {
  get: (path: string, ...handlers: unknown[]) => {},
  post: (path: string, ...handlers: unknown[]) => {},
};

// ok: hawky.security.commented-auth-middleware
router.get('/api/admin/stats', requireAuth, (req: unknown, res: unknown) => {
  return { stats: [] };
});

// ok: hawky.security.commented-auth-middleware
router.post('/api/users/delete', authenticate, (req: unknown, res: unknown) => {
  return { deleted: true };
});

// GOOD: Active permission checks
function handleAdminAction(user: { role: string }) {
  // ok: hawky.security.commented-permission-check
  if (!checkPermission(user, 'admin:write')) {
    throw new Error('Forbidden');
  }

  return performDangerousAction();
}

function performDangerousAction() {
  return { done: true };
}

// GOOD: Active role check
function adminOnlyAction(user: { roles: string[] }) {
  // ok: hawky.security.commented-permission-check
  if (!hasRole(user, 'admin')) {
    throw new Error('Admin required');
  }

  return { action: 'performed' };
}

// GOOD: Comment explaining the guard (not disabling it)
// This endpoint uses requireAuth to protect sensitive data
router.get('/api/protected', requireAuth, (req: unknown, res: unknown) => {
  return { protected: true };
});

export { AdminController, handleAdminAction, adminOnlyAction };
