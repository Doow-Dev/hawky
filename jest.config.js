/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  // Mock @actions packages for testing
  moduleNameMapper: {
    '^@actions/core$': '<rootDir>/__tests__/mocks/actions-core.ts',
    '^@actions/exec$': '<rootDir>/__tests__/mocks/actions-exec.ts',
  },
};
