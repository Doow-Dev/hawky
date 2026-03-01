/**
 * BAD: SQL injection vulnerabilities
 * These patterns should trigger hawky.security.sql-injection-* rules
 */

// Mock database client
declare const db: {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  raw: (sql: string) => Promise<unknown>;
  run: (sql: string) => Promise<unknown>;
};

declare const knex: {
  raw: (sql: string, bindings?: unknown[]) => unknown;
};

declare const prisma: {
  $executeRaw: (sql: unknown) => Promise<unknown>;
  $queryRaw: (sql: unknown) => Promise<unknown>;
};

// BAD: Template literal SQL injection
async function getUserById(userId: string) {
  // ruleid: hawky.security.sql-injection-template-literal
  return db.execute(`SELECT * FROM users WHERE id = ${userId}`);
}

// BAD: Template literal with INSERT
async function createUser(name: string, email: string) {
  // ruleid: hawky.security.sql-injection-template-literal
  return db.query(`INSERT INTO users (name, email) VALUES ('${name}', '${email}')`);
}

// BAD: Template literal with UPDATE
async function updateUserEmail(userId: string, newEmail: string) {
  // ruleid: hawky.security.sql-injection-template-literal
  return db.run(`UPDATE users SET email = '${newEmail}' WHERE id = ${userId}`);
}

// BAD: Template literal with DELETE
async function deleteUser(userId: string) {
  // ruleid: hawky.security.sql-injection-template-literal
  return db.execute(`DELETE FROM users WHERE id = ${userId}`);
}

// BAD: Knex raw with template literal
function searchUsers(searchTerm: string) {
  // ruleid: hawky.security.sql-injection-knex-raw
  return knex.raw(`SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`);
}

// BAD: Prisma raw with template literal
async function prismaRawQuery(tableName: string) {
  // ruleid: hawky.security.sql-injection-template-literal
  return prisma.$queryRaw(`SELECT * FROM ${tableName}`);
}

// BAD: String concatenation
function buildQuery(column: string, value: string) {
  // ruleid: hawky.security.sql-injection-concatenation
  const sql = 'SELECT * FROM users WHERE ' + column + " = '" + value + "'";
  return db.execute(sql);
}

export {
  getUserById,
  createUser,
  updateUserEmail,
  deleteUser,
  searchUsers,
  prismaRawQuery,
  buildQuery,
};
