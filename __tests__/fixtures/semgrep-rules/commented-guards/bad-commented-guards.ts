/**
 * BAD: Commented-out security guards
 * These patterns should trigger hawky.security.commented-* rules
 */

import { Controller, Get, Post } from 'some-framework';

// BAD: Commented decorator
// ruleid: hawky.security.commented-guard-decorator
// @UseGuards(AuthGuard)
@Controller('admin')
class AdminController {
  // ruleid: hawky.security.commented-guard-decorator
  // @Auth()
  @Get('users')
  getUsers() {
    return [];
  }

  // ruleid: hawky.security.commented-guard-decorator
  // @Roles('admin')
  @Post('delete-all')
  deleteAll() {
    return { success: true };
  }
}

// BAD: Commented middleware in routes
const router = {
  get: (path: string, ...handlers: unknown[]) => {},
  post: (path: string, ...handlers: unknown[]) => {},
};

// ruleid: hawky.security.commented-auth-middleware
// requireAuth,
router.get('/api/admin/stats', (req: unknown, res: unknown) => {
  return { stats: [] };
});

// ruleid: hawky.security.commented-auth-middleware
// authenticate,
router.post('/api/users/delete', (req: unknown, res: unknown) => {
  return { deleted: true };
});

// BAD: Commented permission checks
function handleAdminAction(user: { role: string }) {
  // ruleid: hawky.security.commented-permission-check
  // checkPermission(user, 'admin:write')

  // Dangerous action without permission check
  return performDangerousAction();
}

function performDangerousAction() {
  return { done: true };
}

// BAD: Block comment around auth code
/* ruleid: hawky.security.commented-block-guard
  @UseGuards(JwtAuthGuard)
  requireAuth(req, res, next);
  checkAuth(token);
*/
function unprotectedEndpoint() {
  return { data: 'sensitive' };
}

// BAD: Commented role check
function adminOnlyAction(user: { roles: string[] }) {
  // ruleid: hawky.security.commented-permission-check
  // hasRole(user, 'admin')

  return { action: 'performed' };
}

export { AdminController, handleAdminAction, unprotectedEndpoint, adminOnlyAction };
