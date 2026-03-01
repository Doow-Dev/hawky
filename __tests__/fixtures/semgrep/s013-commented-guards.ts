/**
 * S013 Test Fixture: Commented Guards
 *
 * This file contains patterns that SHOULD trigger hawky-commented-auth-check
 */

// SHOULD TRIGGER: Commented auth check
function handleAdminAction(user: { isAdmin: boolean }) {
  // if (!isAuthenticated(user)) return;
  performDangerousAction();
}

// SHOULD TRIGGER: Commented authorization
async function deleteUser(userId: string) {
  // await checkAuth(userId);
  // requireAuth();
  await db.delete(userId);
}

// SHOULD TRIGGER: Commented verifyToken
function processRequest(token: string) {
  // verifyToken(token);
  return 'processed';
}

// SHOULD NOT TRIGGER: Active auth check
function handleUserAction(user: { authenticated: boolean }) {
  if (!isAuthenticated(user)) return;
  performAction();
}

// SHOULD NOT TRIGGER: Regular comment
function regularFunction() {
  // This is just a regular comment
  // Nothing security related here
  return 42;
}

// Helper stubs
function isAuthenticated(_user: unknown): boolean { return true; }
function performDangerousAction() {}
function performAction() {}
const db = { delete: async (_id: string) => {} };
