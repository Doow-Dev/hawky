/**
 * Mock @actions/core for testing
 *
 * Provides no-op implementations of GitHub Actions core functions
 * so tests can run without the actual @actions/core package.
 */

export const info = jest.fn();
export const warning = jest.fn();
export const error = jest.fn();
export const debug = jest.fn();
export const notice = jest.fn();
export const setFailed = jest.fn();
export const setOutput = jest.fn();
export const getInput = jest.fn();
export const getBooleanInput = jest.fn();
export const startGroup = jest.fn();
export const endGroup = jest.fn();

// Step summary mock
export const summary = {
  addHeading: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  addRaw: jest.fn().mockReturnThis(),
  addDetails: jest.fn().mockReturnThis(),
  addSeparator: jest.fn().mockReturnThis(),
  addLink: jest.fn().mockReturnThis(),
  addBreak: jest.fn().mockReturnThis(),
  addList: jest.fn().mockReturnThis(),
  addCodeBlock: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockReturnThis(),
  stringify: jest.fn().mockReturnValue(''),
  emptyBuffer: jest.fn().mockReturnThis(),
  isEmptyBuffer: jest.fn().mockReturnValue(false),
};

/**
 * Reset all mocks between tests
 */
export function resetMocks(): void {
  info.mockClear();
  warning.mockClear();
  error.mockClear();
  debug.mockClear();
  notice.mockClear();
  setFailed.mockClear();
  setOutput.mockClear();
  getInput.mockClear();
  getBooleanInput.mockClear();
  startGroup.mockClear();
  endGroup.mockClear();

  // Reset summary mocks
  Object.values(summary).forEach((fn) => {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      (fn as jest.Mock).mockClear();
    }
  });
}
