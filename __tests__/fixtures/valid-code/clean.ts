/**
 * Valid TypeScript code fixture
 * This file should pass all gates without violations
 */

interface User {
  id: number;
  name: string;
  email: string;
}

function createUser(id: number, name: string, email: string): User {
  return { id, name, email };
}

function getUserName(user: User): string {
  return user.name;
}

const testUser = createUser(1, 'Test User', 'test@example.com');
const userName = getUserName(testUser);

export { User, createUser, getUserName, testUser, userName };
