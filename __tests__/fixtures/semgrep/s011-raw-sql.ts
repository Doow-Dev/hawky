/**
 * S011 Test Fixture: Raw SQL Unsafe
 *
 * This file contains patterns that SHOULD trigger hawky-raw-sql-injection
 */

interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
  query(config: { text: string; values: unknown[] }): Promise<unknown>;
  execute(sql: string): Promise<unknown>;
  raw(sql: string): Promise<unknown>;
}

// SHOULD TRIGGER: Template literal in query
async function getUserById(db: DatabaseClient, userId: string) {
  return db.query(`SELECT * FROM users WHERE id = ${userId}`);
}

// SHOULD TRIGGER: String concatenation in query
async function searchUsers(db: DatabaseClient, name: string) {
  const query = "SELECT * FROM users WHERE name = '" + name + "'";
  return db.execute(query);
}

// SHOULD TRIGGER: Template in raw query
async function rawQuery(db: DatabaseClient, table: string) {
  return db.raw(`SELECT * FROM ${table}`);
}

// SHOULD NOT TRIGGER: Parameterized query
async function getUserByIdSafe(db: DatabaseClient, userId: string) {
  return db.query('SELECT * FROM users WHERE id = $1', [userId]);
}

// SHOULD NOT TRIGGER: Prepared statement
async function searchUsersSafe(db: DatabaseClient, name: string) {
  return db.query({
    text: 'SELECT * FROM users WHERE name = $1',
    values: [name],
  });
}
