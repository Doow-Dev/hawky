/**
 * Mock @actions/exec for testing
 *
 * Provides no-op implementations of GitHub Actions exec functions
 * so tests can run without the actual @actions/exec package.
 */

export const exec = jest.fn().mockResolvedValue(0);
export const getExecOutput = jest.fn().mockResolvedValue({
  exitCode: 0,
  stdout: '',
  stderr: '',
});

/**
 * Reset all mocks between tests
 */
export function resetMocks(): void {
  exec.mockClear();
  getExecOutput.mockClear();
}
