/**
 * GOOD: Safe SQL queries using parameterized queries
 * These patterns should NOT trigger hawky.security.sql-injection-* rules
 */

// Mock database client
declare const db: {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

declare const knex: {
  raw: (sql: string, bindings?: unknown[]) => unknown;
  select: (columns: string) => unknown;
  where: (column: string, value: unknown) => unknown;
};

declare const prisma: {
  $executeRaw: (sql: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $queryRaw: (sql: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  user: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
};

// GOOD: Parameterized query with positional placeholders
async function getUserById(userId: string) {
  // ok: hawky.security.sql-injection-template-literal
  return db.execute('SELECT * FROM users WHERE id = $1', [userId]);
}

// GOOD: Parameterized INSERT
async function createUser(name: string, email: string) {
  // ok: hawky.security.sql-injection-template-literal
  return db.query('INSERT INTO users (name, email) VALUES ($1, $2)', [name, email]);
}

// GOOD: Parameterized UPDATE with named placeholders
async function updateUserEmail(userId: string, newEmail: string) {
  // ok: hawky.security.sql-injection-template-literal
  return db.execute('UPDATE users SET email = $2 WHERE id = $1', [userId, newEmail]);
}

// GOOD: Knex raw with parameterized binding
function searchUsers(searchTerm: string) {
  // ok: hawky.security.sql-injection-knex-raw
  return knex.raw('SELECT * FROM users WHERE name LIKE ?', [`%${searchTerm}%`]);
}

// GOOD: Knex query builder (no raw SQL)
function findUserByEmail(email: string) {
  // ok: hawky.security.sql-injection-knex-raw
  return knex.select('*').where('email', email);
}

// GOOD: Prisma tagged template literal (safe by design)
async function prismaTaggedQuery(userId: string) {
  // ok: hawky.security.sql-injection-template-literal
  // Prisma's tagged template literals are safe
  return prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;
}

// GOOD: Prisma ORM methods (no raw SQL)
async function prismaOrmQuery(userId: string) {
  // ok: hawky.security.sql-injection-template-literal
  return prisma.user.findUnique({ where: { id: userId } });
}

// GOOD: Static SQL without interpolation
async function getAllUsers() {
  // ok: hawky.security.sql-injection-template-literal
  return db.execute('SELECT * FROM users');
}

// GOOD: Template literal without variables (static string)
async function getActiveUsers() {
  // ok: hawky.security.sql-injection-template-literal
  return db.execute(`SELECT * FROM users WHERE active = true`);
}

export {
  getUserById,
  createUser,
  updateUserEmail,
  searchUsers,
  findUserByEmail,
  prismaTaggedQuery,
  prismaOrmQuery,
  getAllUsers,
  getActiveUsers,
};
